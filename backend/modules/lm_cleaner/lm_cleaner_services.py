"""
NotebookLM水印清除模块业务逻辑
实现具体的业务操作
"""

import logging
import os
import uuid
import base64
from io import BytesIO
from typing import Optional, List, Tuple, Dict, Any
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
import fitz  # PyMuPDF

from pathlib import Path

from .lm_cleaner_models import LmCleaner
from .lm_cleaner_schemas import LmCleanerCreate, LmCleanerUpdate
from core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class LmCleanerService:
    """
    NotebookLM水印清除服务类
    
    提供文件处理、水印清除、OCR文字识别和图片文字编辑功能
    """
    
    BASE_STORAGE_DIR = Path(settings.upload_dir) / "modules" / "lm_cleaner"

    @classmethod
    def _get_user_dir(cls, user_id: int, sub_dir: str = "outputs") -> Path:
        """获取用户专属目录"""
        path = cls.BASE_STORAGE_DIR / sub_dir / f"user_{user_id}"
        if not path.exists():
            path.mkdir(parents=True, exist_ok=True)
        return path

    @staticmethod
    async def process_file(
        input_path: str,
        filename: str,
        user_id: int
    ) -> str:
        """处理文件，覆盖右下角水印"""
        ext = os.path.splitext(filename)[1].lower()
        output_filename = f"cleaned_{uuid.uuid4().hex[:8]}{ext}"
        user_dir = LmCleanerService._get_user_dir(user_id, "outputs")
        output_path = user_dir / output_filename
        
        try:
            if ext == '.pdf':
                await LmCleanerService._clean_pdf(input_path, str(output_path))
            elif ext in ['.png', '.jpg', '.jpeg', '.webp']:
                await LmCleanerService._clean_image(input_path, str(output_path))
            else:
                raise ValueError(f"不支持的文件格式: {ext}")
                
            return str(output_path)
        except Exception as e:
            logger.error(f"处理文件失败: {str(e)}")
            raise e
    


    @staticmethod
    async def _clean_pdf(input_path: str, output_path: str):
        """
        清除PDF右下角水印（高级模式）
        原理：PDF -> 图片 -> OpenCV Inpainting -> PDF
        """
        doc = fitz.open(input_path)
        output_doc = fitz.open()
        temp_files = []
        
        try:
            for page_index, page in enumerate(doc):
                # 1. 将页面渲染为高清图片 (300 DPI)
                zoom = 300 / 72
                mat = fitz.Matrix(zoom, zoom)
                pix = page.get_pixmap(matrix=mat)
                
                # 2. 保存为临时图片
                temp_img_path = f"{output_path}_temp_{page_index}.png"
                pix.save(temp_img_path)
                temp_files.append(temp_img_path)
                
                # 3. 调用图像去水印（Inpainting）
                await LmCleanerService._clean_image(temp_img_path, temp_img_path)
                
                # 4. 将处理后的图片转回 PDF 页面
                img_doc = fitz.open(temp_img_path)
                pdf_bytes = img_doc.convert_to_pdf()
                img_pdf = fitz.open("pdf", pdf_bytes)
                output_doc.insert_pdf(img_pdf)
                img_doc.close()
                img_pdf.close()
                
            # 保存最终 PDF
            output_doc.save(output_path)
            
        finally:
            doc.close()
            output_doc.close()
            # 清理临时文件
            for f in temp_files:
                try:
                    if os.path.exists(f):
                        os.remove(f)
                except Exception as e:
                    logger.debug(f"清理临时文件失败（可忽略）: {f}, 原因: {e}")

    @staticmethod
    async def _clean_image(input_path: str, output_path: str):
        """
        清除图片右下角水印
        优化策略：
        1. 优先检测右下角背景是否为纯色（如白底），若是则直接填充颜色，效果最完美且无模糊。
        2. 若为复杂背景，则使用 Inpainting 算法修复，并缩小 Mask 范围以减少对周边文字的干扰。
        """
        try:
            import cv2
            import numpy as np
        except ImportError:
            # 如果没安装，回退到Pillow简单处理，这里重新抛出异常提示安装
            logger.error("缺少 opencv-python-headless 依赖，无法执行高级去水印")
            raise ImportError("请先安装 opencv-python-headless 以启用高级去水印功能")

        # 使用 OpenCV 读取图片
        # 注意：cv2.imread 不支持中文路径，需要用 numpy 读取
        try:
            img_array = np.fromfile(input_path, dtype=np.uint8)
            img = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
        except Exception as e:
            logger.error(f"读取图片失败: {e}")
            raise ValueError(f"无法读取图片文件: {input_path}")
        
        if img is None:
            raise ValueError("无法解码图片文件")
            
        height, width = img.shape[:2]
        
        # 1. 定义水印区域 Mask
        # NotebookLM 水印位于右下角，通过精细化尺寸避免误伤文字
        # 根据分辨率分档处理
        if width > 3000: # 4K / 高清 PDF
            target_w, target_h = 550, 100
        elif width > 1500: # 1080p - 2K (常见尺寸)
            target_w, target_h = 320, 80
        else: # 低分图
            target_w, target_h = 240, 60

        # 安全限制：不超过宽度的 40%，高度的 15%
        mask_w = min(target_w, int(width * 0.4)) 
        mask_h = min(target_h, int(height * 0.15))
        
        # 坐标定义 (x1,y1) -> (x2,y2) 为右下角矩形
        x1 = width - mask_w
        y1 = height - mask_h
        x2 = width
        y2 = height
        
        # 2. 智能背景检测
        # 采样区域：紧贴 Mask 的左侧和上方边缘的一圈像素
        # 如果这些像素颜色方差极小，说明背景是纯色
        sample_margin = 10
        sx_start = max(0, x1 - sample_margin)
        sy_start = max(0, y1 - sample_margin)
        
        # 提取采样点
        samples = []
        
        # 上边缘采样 (Taking a strip above the watermark)
        if sy_start < y1:
            top_strip = img[sy_start:y1, sx_start:width]
            if top_strip.size > 0:
                samples.append(top_strip.reshape(-1, 3))
                
        # 左边缘采样 (Taking a strip left of the watermark)
        if sx_start < x1:
            left_strip = img[sy_start:height, sx_start:x1] # extends to bottom
            if left_strip.size > 0:
                samples.append(left_strip.reshape(-1, 3))
        
        is_solid_bg = False
        fill_color = None
        current_std_dev = 999
        
        if samples:
            # 合并所有采样像素
            all_pixels = np.vstack(samples)
            # 计算标准差和均值
            std_dev = np.std(all_pixels, axis=0)
            mean_color = np.mean(all_pixels, axis=0)
            current_std_dev = np.max(std_dev)
            
            # 判断逻辑：BGR 三个通道的标准差都小于阈值 (如 15.0)
            # 且像素数量足够
            if current_std_dev < 15.0 and len(all_pixels) > 50:
                is_solid_bg = True
                fill_color = mean_color
        
        # 3. 执行去除
        if is_solid_bg and fill_color is not None:
            # 策略 A: 纯色填充 (完美效果，无模糊)
            # logger.info(f"使用纯色填充背景: color={fill_color}, std={current_std_dev}")
            color_int = (int(fill_color[0]), int(fill_color[1]), int(fill_color[2]))
            cv2.rectangle(img, (x1, y1), (x2, y2), color_int, thickness=-1)
        else:
            # 策略 B: Inpainting (复杂背景)
            # logger.info(f"使用 Inpainting 修复背景 (std={current_std_dev})")
            mask = np.zeros(img.shape[:2], np.uint8)
            # 稍微扩大一点 Mask 区域以覆盖边界效应
            pad = 2
            mx1 = max(0, x1 - pad)
            my1 = max(0, y1 - pad)
            cv2.rectangle(mask, (mx1, my1), (x2, y2), (255), thickness=-1)
            
            # 使用 Telea 算法，半径减小以减少涂抹感
            img = cv2.inpaint(img, mask, 3, cv2.INPAINT_TELEA)

        # 4. 保存结果
        # cv2.imwrite 同样不支持中文路径，使用 imencode + tofile
        ext = os.path.splitext(output_path)[1]
        is_success, buffer = cv2.imencode(ext, img)
        if is_success:
            buffer.tofile(output_path)
        else:
            raise ValueError("保存图片失败")

    @staticmethod
    async def create(db: AsyncSession, user_id: int, data: LmCleanerCreate) -> LmCleaner:
        item = LmCleaner(user_id=user_id, **data.model_dump())
        db.add(item)
        await db.flush()
        await db.refresh(item)
        return item
    
    @staticmethod
    async def get_by_id(db: AsyncSession, item_id: int, user_id: Optional[int] = None) -> Optional[LmCleaner]:
        query = select(LmCleaner).where(LmCleaner.id == item_id)
        if user_id is not None:
            query = query.where(LmCleaner.user_id == user_id)
        result = await db.execute(query)
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_list(db: AsyncSession, user_id: Optional[int] = None, page: int = 1, page_size: int = 20, keyword: Optional[str] = None) -> Tuple[List[LmCleaner], int]:
        conditions = []
        if user_id is not None:
            conditions.append(LmCleaner.user_id == user_id)
        if keyword:
            conditions.append(LmCleaner.title.ilike(f"%{keyword}%"))
        
        count_query = select(func.count(LmCleaner.id))
        if conditions:
            count_query = count_query.where(and_(*conditions))
        total_result = await db.execute(count_query)
        total = total_result.scalar() or 0
        
        query = select(LmCleaner).where(and_(*conditions)) if conditions else select(LmCleaner)
        query = query.order_by(LmCleaner.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
        result = await db.execute(query)
        return list(result.scalars().all()), total
    
    @staticmethod
    async def delete(db: AsyncSession, item_id: int, user_id: Optional[int] = None) -> bool:
        item = await LmCleanerService.get_by_id(db, item_id, user_id)
        if not item: return False
        # 清理产出文件
        if item.content:
            path = Path(item.content)
            if path.exists():
                try:
                    os.remove(path)
                except Exception as e:
                    logger.debug(f"删除产出文件失败（可忽略）: {path}, 原因: {e}")
        # 清理源文件
        if item.source_file:
            source_path = Path(item.source_file)
            if source_path.exists():
                try:
                    os.remove(source_path)
                except Exception as e:
                    logger.debug(f"删除源文件失败（可忽略）: {source_path}, 原因: {e}")
        await db.delete(item)
        await db.flush()
        return True
