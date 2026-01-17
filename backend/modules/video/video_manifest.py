"""
视频模块清单
定义模块元信息、路由入口、权限声明等
"""

from core.loader import ModuleManifest, ModuleAssets

manifest = ModuleManifest(
    id="video",
    name="视频",
    version="1.0.0",
    description="个人视频管理，支持视频集分类和视频上传播放",
    icon="🎬",
    author="JeJe WebOS",
    
    router_prefix="/api/v1/video",
    
    menu={
        "title": "视频",
        "icon": "🎬",
        "path": "/video",
        "order": 16,
        "children": [
            {"title": "我的视频", "path": "/video", "icon": "📹"}
        ]
    },
    
    # 前端资源
    assets=ModuleAssets(
        css=[],
        js=[]
    ),
    
    permissions=[
        "video.read",
        "video.create",
        "video.update",
        "video.delete"
    ],
    
    dependencies=[],
    
    enabled=False,
)
