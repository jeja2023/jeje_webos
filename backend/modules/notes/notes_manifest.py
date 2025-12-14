"""
笔记模块清单
定义模块元信息、路由入口、权限声明等
"""

from core.loader import ModuleManifest

manifest = ModuleManifest(
    id="notes",
    name="笔记",
    version="1.0.0",
    description="支持无限层级目录的个人笔记管理",
    icon="📒",
    author="JeJe",
    
    router_prefix="/api/v1/notes",
    
    menu={
        "title": "笔记",
        "icon": "📒",
        "path": "/notes",
        "order": 2,
        "children": [
            {"title": "所有笔记", "path": "/notes/list", "icon": "📋"},
            {"title": "我的收藏", "path": "/notes/starred", "icon": "⭐"},
            {"title": "标签管理", "path": "/notes/tags", "icon": "🏷️"}
        ]
    },
    
    permissions=[
        "notes.read",
        "notes.create",
        "notes.update",
        "notes.delete"
    ],
    
    enabled=True
)


