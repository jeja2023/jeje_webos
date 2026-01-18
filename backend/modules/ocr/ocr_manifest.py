# -*- coding: utf-8 -*-
"""
OCR 图文识别模块清单
"""

from core.loader import ModuleManifest, ModuleAssets
from .ocr_router import router

manifest = ModuleManifest(
    # 基本信息
    id="ocr",
    name="图文识别",
    version="1.0.0",
    description="基于 RapidOCR 的离线图文识别功能，支持图片和 PDF 文字提取",
    icon="📷",
    author="JeJe WebOS",
    
    # 路由配置
    router_prefix="/api/v1/ocr",
    router=router,
    
    # 菜单配置
    menu={
        "title": "图文识别",
        "icon": "📷",
        "path": "/ocr",
        "order": 15,
        "children": [
            {"title": "识别图片", "path": "/ocr/recognize", "icon": "🔍"},
        ]
    },
    
    # 前端资源
    assets=ModuleAssets(
        css=[],
        js=[]
    ),
    
    # 权限声明
    permissions=[
        "ocr.use",
        "ocr.admin"
    ],
    
    # 模块依赖
    dependencies=[],
    
    # 内核版本要求
    kernel_version=">=1.0.0",
    
    # 是否启用
    enabled=False,
)
