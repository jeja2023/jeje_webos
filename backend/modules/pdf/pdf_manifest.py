"""
PDF工具模块清单
定义模块元信息、路由入口、权限声明等
"""

from core.loader import ModuleManifest, ModuleAssets
import logging

logger = logging.getLogger(__name__)


async def on_enable():
    pass  # logger.info("PDF 工具箱模块已启用")


manifest = ModuleManifest(
    id="pdf",
    name="PDF 工具箱",
    version="1.0.0",
    description="提供 PDF 阅读、合并、拆分及文本提取等全方位处理功能",
    icon="ri-file-pdf-2-fill",
    author="JeJe WebOS",
    
    router_prefix="/api/v1/pdf",
    
    menu={
        "title": "PDF工具",
        "icon": "ri-file-pdf-2-fill",
        "path": "/pdf",
        "order": 50,
        "children": [
            {"title": "工具箱", "path": "/pdf/list", "icon": "ri-apps-2-line"},
            {"title": "历史记录", "path": "/pdf/history", "icon": "ri-history-line"}
        ]
    },
    
    permissions=[
        {"code": "pdf.read", "name": "阅读PDF", "desc": "允许查看PDF内容"},
        {"code": "pdf.create", "name": "处理PDF", "desc": "允许合并、拆分等修改操作"},
        {"code": "pdf.delete", "name": "删除历史", "desc": "允许删除操作历史记录"}
    ],
    
    dependencies=[],  # 移除 filemanager 依赖，模块现在完全独立
    
    enabled=True,
    
    on_enable=on_enable,
)

