# -*- coding: utf-8 -*-
"""
OCR 模块核心服务
基于 RapidOCR 的离线图文识别
支持中文、英文、西班牙语（拉丁语系）
"""

import os
import time
import logging
import base64
import hashlib
from io import BytesIO
from typing import List, Dict, Any, Optional
from pathlib import Path

from utils.storage import get_storage_manager

logger = logging.getLogger(__name__)
storage_manager = get_storage_manager()


class OCRService:
    """OCR 识别服务（基于 RapidOCR）"""
    
    _ocr_instances = {}  # 按语言缓存实例
    _initialized = False
    _cache = {}          # 识别结果缓存 {md5: result}
    _max_cache_size = 50 # 最大缓存数量
    _max_image_size = 4000  # 图片最大边长（超过则压缩）
    
    # 语言与对应识别模型的映射
    LANG_MODEL_MAP = {
        "ch": "ch_PP-OCRv4_rec_infer.onnx",
        "mixed": "ch_PP-OCRv4_rec_infer.onnx",
        "en": "en_PP-OCRv3_rec_infer.onnx",
    }
    
    @classmethod
    def get_models_dir(cls) -> Path:
        """获取模型存储目录"""
        return storage_manager.get_module_dir("ocr", "ocr_models")
    
    @classmethod
    def _get_ocr(cls, language: str = "ch"):
        """
        获取或初始化 RapidOCR 实例
        首次调用时会自动下载对应语言的模型到 storage/modules/ocr/ocr_models/
        """
        if language not in cls.LANG_MODEL_MAP:
            logger.warning(f"不支持的语言: {language}, 回退到中文模式")
            language = "ch"
            
        if language not in cls._ocr_instances:
            try:
                from rapidocr_onnxruntime import RapidOCR
                
                models_dir = cls.get_models_dir()
                models_dir.mkdir(parents=True, exist_ok=True)
                
                # 模型路径定义
                det_model = models_dir / "ch_PP-OCRv4_det_infer.onnx"
                rec_model_name = cls.LANG_MODEL_MAP[language]
                rec_model = models_dir / rec_model_name
                cls_model = models_dir / "ch_ppocr_mobile_v2.0_cls_infer.onnx"
                
                # 检查并下载缺失的模型
                needed_models = []
                if not det_model.exists(): needed_models.append("det")
                if not rec_model.exists(): needed_models.append(language)
                if not cls_model.exists(): needed_models.append("cls")
                
                if needed_models:
                    logger.info(f"模型文件不完整 ({needed_models})，正在下载到项目目录...")
                    cls._download_models(models_dir, needed_models)
                
                # 初始化 RapidOCR
                logger.info(f"正在初始化 RapidOCR ({language})...")
                cls._ocr_instances[language] = RapidOCR(
                    det_model_path=str(det_model),
                    rec_model_path=str(rec_model),
                    cls_model_path=str(cls_model) if cls_model.exists() else None
                )
                
                cls._initialized = True
                logger.info(f"RapidOCR ({language}) 初始化完成")
                
            except ImportError as e:
                logger.error(f"RapidOCR 未安装: {e}")
                raise RuntimeError("RapidOCR 模块未安装，请运行: pip install rapidocr-onnxruntime")
            except Exception as e:
                logger.error(f"RapidOCR ({language}) 初始化失败: {e}")
                raise
        
        return cls._ocr_instances[language]
    
    @classmethod
    def _download_models(cls, target_dir: Path, languages: List[str]):
        """下载指定语言所需的模型到项目目录"""
        import requests
        from tqdm import tqdm
        
        # 基础模型 URL (Hugging Face)
        BASE_URL = "https://huggingface.co/SWHL/RapidOCR/resolve/main"
        
        # 模型文件与 URL 的映射
        MODEL_URL_MAP = {
            "det": f"{BASE_URL}/PP-OCRv4/ch_PP-OCRv4_det_infer.onnx",
            "cls": f"{BASE_URL}/PP-OCRv1/ch_ppocr_mobile_v2.0_cls_infer.onnx",
            "ch": f"{BASE_URL}/PP-OCRv4/ch_PP-OCRv4_rec_infer.onnx",
            "en": f"{BASE_URL}/PP-OCRv3/en_PP-OCRv3_rec_infer.onnx",
        }
        
        # 备份 URL (如果主链接失效)
        BACKUP_URL_MAP = {}
        
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
        
        for key in languages:
            filename = cls.LANG_MODEL_MAP.get(key)
            if key == "det": filename = "ch_PP-OCRv4_det_infer.onnx"
            if key == "cls": filename = "ch_ppocr_mobile_v2.0_cls_infer.onnx"
            
            if not filename: continue
            
            target_path = target_dir / filename
            if target_path.exists():
                continue
                
            logger.info(f"正在下载 {filename}...")
            
            # 尝试下载
            success = False
            urls_to_try = [MODEL_URL_MAP.get(key)]
            if key in BACKUP_URL_MAP:
                urls_to_try.append(BACKUP_URL_MAP[key])
                
            for url in urls_to_try:
                if not url: continue
                try:
                    response = requests.get(url, headers=headers, stream=True, timeout=60, allow_redirects=True)
                    if response.status_code == 404:
                        continue
                        
                    response.raise_for_status()
                    total_size = int(response.headers.get('content-length', 0))
                    
                    with open(target_path, 'wb') as f, tqdm(
                        desc=filename,
                        total=total_size,
                        unit='iB',
                        unit_scale=True,
                        unit_divisor=1024,
                    ) as bar:
                        for data in response.iter_content(chunk_size=8192):
                            size = f.write(data)
                            bar.update(size)
                    
                    success = True
                    logger.info(f"{filename} 下载完成")
                    break
                except Exception as e:
                    logger.warning(f"尝试从 {url} 下载失败: {e}")
                    if target_path.exists(): target_path.unlink()
            
            if not success:
                logger.error(f"模型 {filename} 下载失败，所有镜像地址均不可用")
                raise RuntimeError(f"无法下载 OCR 模型文件: {filename}")
    
    @classmethod
    def is_available(cls) -> bool:
        """检查 OCR 服务是否可用"""
        try:
            from rapidocr_onnxruntime import RapidOCR
            return True
        except ImportError:
            return False
    
    @classmethod
    def recognize_image(
        cls,
        image_data: bytes,
        detect_direction: bool = False,
        language: str = "ch"
    ) -> Dict[str, Any]:
        """
        识别图片或 PDF 中的文字
        支持缓存和大图压缩
        """
        # 自动识别是否为 PDF
        if image_data.startswith(b"%PDF"):
            return cls.recognize_pdf(image_data, detect_direction, language)
        
        # 计算图片 MD5 用于缓存
        cache_key = hashlib.md5(image_data + language.encode()).hexdigest()
        
        # 检查缓存
        if cache_key in cls._cache:
            logger.info(f"命中缓存 ({language})")
            cached = cls._cache[cache_key].copy()
            cached["from_cache"] = True
            return cached
            
        import numpy as np
        from PIL import Image
        
        start_time = time.time()
        
        # 预处理图片
        image = Image.open(BytesIO(image_data))
        if image.mode != 'RGB':
            image = image.convert('RGB')
        
        # 大图压缩（超过 4000px 自动缩放）
        max_size = cls._max_image_size
        if image.width > max_size or image.height > max_size:
            ratio = min(max_size / image.width, max_size / image.height)
            new_size = (int(image.width * ratio), int(image.height * ratio))
            image = image.resize(new_size, Image.Resampling.LANCZOS)
            logger.info(f"大图压缩: 原尺寸 {image.width}x{image.height} -> {new_size}")
        
        img_array = np.array(image)
        
        # 获取对应语言的 OCR 实例
        ocr = cls._get_ocr(language)
        
        try:
            # 执行识别
            result, elapse = ocr(img_array)
        except Exception as e:
            logger.error(f"RapidOCR ({language}) 识别异常: {e}")
            raise RuntimeError(f"OCR识别引擎错误: {str(e)}")
        
        processing_time = time.time() - start_time
        
        # 解析结果
        boxes = []
        all_text = []
        total_confidence = 0.0
        
        if result:
            for item in result:
                # item: [box, text, score]
                if len(item) >= 3:
                    box_coords = item[0]
                    text = str(item[1])
                    confidence = float(item[2]) if item[2] else 0.0
                    
                    boxes.append({
                        "text": text,
                        "confidence": confidence,
                        "box": [[int(p[0]), int(p[1])] for p in box_coords]
                    })
                    all_text.append(text)
                    total_confidence += confidence
        
        avg_confidence = total_confidence / len(boxes) if boxes else 0.0
        
        result_data = {
            "text": "\n".join(all_text),
            "boxes": boxes,
            "confidence": round(avg_confidence, 4),
            "processing_time": round(processing_time, 3)
        }
        
        # 保存到缓存
        if len(cls._cache) >= cls._max_cache_size:
            # 移除最早的缓存
            oldest_key = next(iter(cls._cache))
            del cls._cache[oldest_key]
        cls._cache[cache_key] = result_data.copy()
        
        return result_data

    @classmethod
    def recognize_pdf(
        cls,
        pdf_data: bytes,
        detect_direction: bool = False,
        language: str = "ch"
    ) -> Dict[str, Any]:
        """
        识别 PDF 中的文字（将页面转为图片识别）
        """
        try:
            import fitz  # PyMuPDF
            import numpy as np
            from PIL import Image
        except ImportError:
            raise RuntimeError("PDF 识别需要安装 pymupdf 库: pip install pymupdf")

        start_time = time.time()
        
        all_text = []
        all_boxes = []
        total_confidence = 0.0
        box_count = 0
        
        try:
            doc = fitz.open(stream=pdf_data, filetype="pdf")
            
            # 为了性能和效果平衡，使用 2.0 倍率 (约 144 DPI)
            zoom = 2.0
            mat = fitz.Matrix(zoom, zoom)
            
            # 获取对应语言的 OCR 实例
            ocr = cls._get_ocr(language)
            
            for page_index in range(len(doc)):
                page = doc.load_page(page_index)
                pix = page.get_pixmap(matrix=mat)
                
                # 转为 Image -> Numpy
                img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                img_array = np.array(img)
                
                # 识别当前页
                result, _ = ocr(img_array)
                
                if result:
                    page_text = []
                    for item in result:
                        if len(item) >= 3:
                            text = str(item[1])
                            conf = float(item[2])
                            
                            page_text.append(text)
                            all_boxes.append({
                                "page": page_index + 1,
                                "text": text,
                                "confidence": conf,
                                "box": [[int(p[0]), int(p[1])] for p in item[0]]
                            })
                            total_confidence += conf
                            box_count += 1
                    
                    all_text.append(f"--- 第 {page_index + 1} 页 ---\n" + "\n".join(page_text))
            
            doc.close()
            
        except Exception as e:
            logger.error(f"PDF OCR 识别异常: {e}")
            raise RuntimeError(f"PDF识别错误: {str(e)}")
            
        processing_time = time.time() - start_time
        avg_confidence = total_confidence / box_count if box_count > 0 else 0.0
        
        return {
            "text": "\n\n".join(all_text),
            "boxes": all_boxes,
            "confidence": round(avg_confidence, 4),
            "processing_time": round(processing_time, 3),
            "pages": len(all_text)
        }
    
    @classmethod
    def recognize_from_base64(
        cls,
        base64_data: str,
        detect_direction: bool = False,
        language: str = "ch"
    ) -> Dict[str, Any]:
        if "," in base64_data:
            base64_data = base64_data.split(",", 1)[1]
        
        image_data = base64.b64decode(base64_data)
        return cls.recognize_image(image_data, detect_direction, language)
    
    @classmethod
    def recognize_from_file(
        cls,
        file_path: str,
        detect_direction: bool = False,
        language: str = "ch"
    ) -> Dict[str, Any]:
        with open(file_path, "rb") as f:
            image_data = f.read()
        return cls.recognize_image(image_data, detect_direction, language)
    
    @classmethod
    def get_status(cls) -> Dict[str, Any]:
        """获取 OCR 服务状态"""
        models_dir = cls.get_models_dir()
        
        # 查看已下载的模型文件
        downloaded = {}
        for lang, model_file in cls.LANG_MODEL_MAP.items():
            downloaded[lang] = (models_dir / model_file).exists()
            
        downloaded["detection"] = (models_dir / "ch_PP-OCRv4_det_infer.onnx").exists()
        downloaded["classification"] = (models_dir / "ch_ppocr_mobile_v2.0_cls_infer.onnx").exists()
        
        return {
            "available": cls.is_available(),
            "initialized": cls._initialized,
            "models_dir": str(models_dir),
            "models_downloaded": downloaded,
            "engine": "RapidOCR",
            "supported_languages": list(cls.LANG_MODEL_MAP.keys())
        }
