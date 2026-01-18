"""
博客模块清单
定义模块元信息、路由入口、权限声明等
"""

from core.loader import ModuleManifest, ModuleAssets

manifest = ModuleManifest(
    # 基本信息
    id="blog",
    name="博客",
    version="1.0.0",
    description="文章发布与管理系统",
    icon="📝",
    author="JeJe WebOS",
    
    # 路由配置
    router_prefix="/api/v1/blog",
    
    # 菜单配置
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
    
    # 前端资源
    assets=ModuleAssets(
        css=[],
        js=[]
    ),
    
    # 权限声明
    permissions=[
        "blog.read",
        "blog.create",
        "blog.update",
        "blog.delete"
    ],
    
    # 模块依赖
    dependencies=[],
    
    # 内核版本要求
    kernel_version=">=1.0.0",
    
    # 是否启用
    enabled=True,
)
