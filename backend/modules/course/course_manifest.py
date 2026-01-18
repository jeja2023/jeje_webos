# -*- coding: utf-8 -*-
"""
课程学习模块清单
"""

from core.loader import ModuleManifest, ModuleAssets
from .course_router import router

manifest = ModuleManifest(
    # 基本信息
    id="course",
    name="课程学习",
    version="1.0.0",
    description="在线课程学习平台，支持课程创建、章节管理和学习进度追踪",
    icon="📚",
    author="JeJe WebOS",
    
    # 路由配置
    router_prefix="/api/v1/course",
    router=router,
    
    # 菜单配置
    menu={
        "title": "课程学习",
        "icon": "📚",
        "path": "/course",
        "order": 12,
        "children": [
            {"title": "课程中心", "path": "/course/list", "icon": "📖"},
            {"title": "我的学习", "path": "/course/learning", "icon": "🎓"},
            {"title": "课程管理", "path": "/course/manage", "icon": "⚙️"}
        ]
    },
    
    # 前端资源
    assets=ModuleAssets(
        css=[],
        js=[]
    ),
    
    # 权限声明
    permissions=[
        "course.view",
        "course.create",
        "course.edit",
        "course.delete",
        "course.learn"
    ],
    
    # 模块依赖
    dependencies=[],
    
    # 内核版本要求
    kernel_version=">=1.0.0",
    
    # 是否启用
    enabled=False,
)
