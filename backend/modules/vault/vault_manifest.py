# -*- coding: utf-8 -*-
"""
密码保险箱模块清单
定义模块元信息、路由入口、权限声明等
"""

from core.loader import ModuleManifest
import logging

logger = logging.getLogger(__name__)


async def on_enable():
    """模块启用时执行"""
    logger.debug("密码箱模块已启用")


manifest = ModuleManifest(
    id="vault",
    name="密码箱",
    version="1.0.0",
    description="安全存储和管理您的账户密码，支持AES加密",
    icon="🔐",
    author="JeJe WebOS",
    
    router_prefix="/api/v1/vault",
    
    menu={
        "title": "密码箱",
        "icon": "🔐",
        "path": "/vault",
        "order": 15,
        "children": [
            {"title": "我的密码", "path": "/vault/list", "icon": "🔑"},
            {"title": "分类管理", "path": "/vault/categories", "icon": "📁"}
        ]
    },
    
    permissions=[
        "vault.read",
        "vault.create",
        "vault.update",
        "vault.delete"
    ],
    
    on_enable=on_enable,
    enabled=False
)
