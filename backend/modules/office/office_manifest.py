# -*- coding: utf-8 -*-
"""
协同办公模块清单
定义模块元信息、路由入口、权限声明等
"""

from core.loader import ModuleManifest


manifest = ModuleManifest(
    # 基本信息
    id="office",
    name="协同办公",
    version="1.0.0",
    description="在线Word文档和Excel表格协同编辑",
    icon="📄",
    author="JeJe",
    
    # 路由配置
    router_prefix="/api/v1/office",
    
    # 菜单配置
    menu={
        "title": "协同办公",
        "icon": "📄",
        "path": "/office",
        "order": 4,
        "children": [
            {"title": "文档列表", "path": "/office/list", "icon": "📋"},
            {"title": "新建文档", "path": "/office/doc/new", "icon": "📝"},
            {"title": "新建表格", "path": "/office/sheet/new", "icon": "📊"},
        ]
    },
    
    # 权限声明
    permissions=[
        "office.read",
        "office.create",
        "office.update",
        "office.delete",
        "office.share"
    ],
    
    # 模块依赖
    dependencies=[],
    
    # 是否启用
    enabled=True
)
