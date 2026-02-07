# -*- coding: utf-8 -*-
"""
Markdown 编辑器模块清单
定义模块元信息、路由入口、权限声明等
"""

from core.loader import ModuleManifest, ModuleAssets

manifest = ModuleManifest(
    # 基本信息
    id="markdown",
    name="Markdown 编辑器",
    version="1.0.0",
    description="专业的 Markdown 文档编辑与预览工具",
    icon="📝",
    author="JeJe WebOS",

    # 路由配置
    router_prefix="/api/v1/markdown",

    # 前端资源
    assets=ModuleAssets(
        css=[],
        js=[]
    ),

    # 菜单配置
    menu={
        "title": "Markdown",
        "icon": "📝",
        "path": "/markdown",
        "items": [
            {"title": "新建文档", "path": "/markdown/edit", "icon": "✏️"},
            {"title": "文档列表", "path": "/markdown", "icon": "📜"}
        ]
    },

    # 权限声明
    permissions=[
        "markdown.read",
        "markdown.create",
        "markdown.update",
        "markdown.delete"
    ],

    # 模块依赖
    dependencies=[],

    # 内核版本要求
    kernel_version=">=1.0.0",

    # 是否启用
    enabled=True,

    # 生命周期钩子
    on_enable=lambda: None,
)

async def on_enable():
    """模块启用时的回调"""
    pass

async def on_disable():
    """模块禁用时的回调"""
    pass

# 注入生命周期钩子
manifest.on_enable = on_enable
manifest.on_disable = on_disable
