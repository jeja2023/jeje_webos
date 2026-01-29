# -*- coding: utf-8 -*-
"""
日程管理模块清单
"""

from core.loader import ModuleManifest, ModuleAssets
from .schedule_router import router

manifest = ModuleManifest(
    # 基本信息
    id="schedule",
    name="日程管理",
    version="1.0.0",
    description="日程管理与提醒，支持日历视图、事件分类和提醒通知",
    icon="📅",
    author="JeJe WebOS",
    
    # 路由配置
    router_prefix="/api/v1/schedule",
    router=router,
    
    # 菜单配置
    menu={
        "title": "日程管理",
        "icon": "📅",
        "path": "/schedule",
        "order": 13,
        "children": [
            {"title": "日历视图", "path": "/schedule/calendar", "icon": "📆"},
            {"title": "我的日程", "path": "/schedule/list", "icon": "📋"},
            {"title": "提醒中心", "path": "/schedule/reminders", "icon": "🔔"}
        ]
    },
    
    # 前端资源
    assets=ModuleAssets(
        css=[],
        js=[]
    ),
    
    # 权限声明
    permissions=[
        "schedule.view",
        "schedule.create",
        "schedule.edit",
        "schedule.delete"
    ],
    
    # 模块依赖
    dependencies=[],
    
    # 内核版本要求
    kernel_version=">=1.0.0",
    
    # 是否启用
    enabled=True,
)
