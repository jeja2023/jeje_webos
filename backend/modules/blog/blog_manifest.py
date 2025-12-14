"""
博客模块清单
定义模块元信息、路由入口、权限声明等
"""

from core.loader import ModuleManifest

manifest = ModuleManifest(
    id="blog",
    name="博客",
    version="1.0.0",
    description="文章发布与管理系统",
    icon="📝",
    author="JeJe",
    
    router_prefix="/api/v1/blog",
    
    menu={
        "title": "博客",
        "icon": "📝",
        "path": "/blog",
        "order": 1,
        "children": [
            {"title": "文章列表", "path": "/blog/list", "icon": "📄"},
            {"title": "发布文章", "path": "/blog/edit", "icon": "✏️"},
            {"title": "分类管理", "path": "/blog/category", "icon": "📁"}
        ]
    },
    
    permissions=[
        "blog.read",
        "blog.create",
        "blog.update",
        "blog.delete"
    ],
    
    enabled=True
)


