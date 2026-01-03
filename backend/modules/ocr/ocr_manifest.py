# -*- coding: utf-8 -*-
"""
OCR 图文识别模块清单
"""

from core.loader import ModuleManifest
from .ocr_router import router

manifest = ModuleManifest(
    id="ocr",
    name="图文识别",
    version="1.0.0",
    description="基于 PaddleOCR 的离线图文识别功能，支持图片和 PDF 文字提取",
    icon="📷",
    author="JeJe",
    
    router_prefix="/api/v1/ocr",
    router=router,
    
    menu={
        "title": "图文识别",
        "icon": "📷",
        "path": "/ocr",
        "order": 15,
        "children": [
            {"title": "识别图片", "path": "/ocr/recognize", "icon": "🔍"},
        ]
    },
    
    permissions=[
        "ocr.use",
        "ocr.admin"
    ],
    
    enabled=True
)
