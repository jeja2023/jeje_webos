# -*- coding: utf-8 -*-
"""
OCR 模块核心服务
基于 PaddleOCR 的离线图文识别
"""

import os
import time
import logging
import base64
from io import BytesIO
from typing import List, Dict, Any, Optional
from pathlib import Path

from utils.storage import get_storage_manager

logger = logging.getLogger(__name__)
storage_manager = get_storage_manager()


class OCRService:
    """OCR 识别服务（懒加载 PaddleOCR）"""
    
    _ocr_instance = None
    _initialized = False
    
    @classmethod
    def get_models_dir(cls) -> Path:
        """获取模型存储目录"""
        return storage_manager.get_module_dir("ocr", "ocr_models")
    
    @classmethod
    def _get_ocr(cls, language: str = "ch"):
        """
        获取或初始化 PaddleOCR 实例
        首次调用时会下载模型到 storage/modules/ocr/ocr_models/
        """
        if cls._ocr_instance is None:
            try:
                from paddleocr import PaddleOCR
                
                models_dir = cls.get_models_dir()
                logger.info(f"正在初始化 PaddleOCR，模型目录: {models_dir}")
                
                # 初始化 PaddleOCR
                # use_angle_cls: 是否使用方向分类器
                # use_gpu: 是否使用 GPU（默认可用时自动使用）
                # det_model_dir/rec_model_dir: 自定义模型路径
                cls._ocr_instance = PaddleOCR(
                    use_angle_cls=True,
                    lang=language,
                    use_gpu=False,  # 默认使用 CPU，GPU 需要额外配置
                    show_log=False,
                    det_model_dir=str(models_dir / "det"),
                    rec_model_dir=str(models_dir / "rec"),
                    cls_model_dir=str(models_dir / "cls"),
                )
                cls._initialized = True
                logger.info("PaddleOCR 初始化完成")
                
            except ImportError as e:
                logger.error(f"PaddleOCR 未安装: {e}")
                raise RuntimeError("PaddleOCR 模块未安装，请运行: pip install paddlepaddle paddleocr")
            except Exception as e:
                logger.error(f"PaddleOCR 初始化失败: {e}")
                raise
        
        return cls._ocr_instance
    
    @classmethod
    def is_available(cls) -> bool:
        """检查 OCR 服务是否可用"""
        try:
            from paddleocr import PaddleOCR
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
        识别图片中的文字
        
        参数:
            image_data: 图片二进制数据
            detect_direction: 是否检测文字方向
            language: 识别语言
            
        返回:
            {
                "text": "识别的全部文字",
                "boxes": [{"text": "...", "confidence": 0.95, "box": [[x1,y1],...]}],
                "confidence": 0.92,
                "processing_time": 1.23
            }
        """
        import numpy as np
        from PIL import Image
        
        start_time = time.time()
        
        # 将二进制转换为 numpy 数组
        image = Image.open(BytesIO(image_data))
        if image.mode != 'RGB':
            image = image.convert('RGB')
        img_array = np.array(image)
        
        # 执行 OCR 识别
        ocr = cls._get_ocr(language)
        result = ocr.ocr(img_array, cls=detect_direction)
        
        processing_time = time.time() - start_time
        
        # 解析结果
        boxes = []
        all_text = []
        total_confidence = 0.0
        
        if result and result[0]:
            for line in result[0]:
                box_coords = line[0]  # [[x1,y1], [x2,y2], [x3,y3], [x4,y4]]
                text_info = line[1]   # (text, confidence)
                
                text = text_info[0]
                confidence = float(text_info[1])
                
                boxes.append({
                    "text": text,
                    "confidence": confidence,
                    "box": [[int(p[0]), int(p[1])] for p in box_coords]
                })
                all_text.append(text)
                total_confidence += confidence
        
        avg_confidence = total_confidence / len(boxes) if boxes else 0.0
        
        return {
            "text": "\n".join(all_text),
            "boxes": boxes,
            "confidence": round(avg_confidence, 4),
            "processing_time": round(processing_time, 3)
        }
    
    @classmethod
    def recognize_from_base64(
        cls,
        base64_data: str,
        detect_direction: bool = False,
        language: str = "ch"
    ) -> Dict[str, Any]:
        """
        从 Base64 数据识别文字
        """
        # 移除可能的 data URI 前缀
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
        """
        从文件路径识别文字
        """
        with open(file_path, "rb") as f:
            image_data = f.read()
        return cls.recognize_image(image_data, detect_direction, language)
    
    @classmethod
    def get_status(cls) -> Dict[str, Any]:
        """获取 OCR 服务状态"""
        models_dir = cls.get_models_dir()
        
        # 检查模型是否已下载
        det_exists = (models_dir / "det").exists()
        rec_exists = (models_dir / "rec").exists()
        cls_exists = (models_dir / "cls").exists()
        
        return {
            "available": cls.is_available(),
            "initialized": cls._initialized,
            "models_dir": str(models_dir),
            "models_downloaded": {
                "detection": det_exists,
                "recognition": rec_exists,
                "classification": cls_exists
            },
            "engine": "PaddleOCR"
        }
