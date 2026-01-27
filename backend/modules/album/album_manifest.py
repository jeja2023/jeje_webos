"""
相册模块清单
定义模块元信息、路由入口、权限声明等
"""

from core.loader import ModuleManifest, ModuleAssets
import logging

logger = logging.getLogger(__name__)


async def on_enable():
    pass  # logger.info("相册模块已启用")


manifest = ModuleManifest(
    id="album",
    name="相册",
    version="1.0.0",
    description="个人相册管理，支持相册分类和照片上传预览",
    icon="📷",
    author="JeJe WebOS",
    
    router_prefix="/api/v1/album",
    
    menu={
        "title": "相册",
        "icon": "📷",
        "path": "/album",
        "order": 15,
        "children": [
            {"title": "我的相册", "path": "/album", "icon": "🖼️"}
        ]
    },
    
    # 前端资源
    assets=ModuleAssets(
        css=[],
        js=[]
    ),
    
    permissions=[
        "album.read",
        "album.create",
        "album.update",
        "album.delete"
    ],
    
    dependencies=[],
    
    enabled=True,
    
    on_enable=on_enable,
)

