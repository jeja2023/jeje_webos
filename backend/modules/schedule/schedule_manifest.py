# -*- coding: utf-8 -*-
"""
日程管理模块清单
"""

from core.loader import ModuleManifest
from .schedule_router import router

manifest = ModuleManifest(
    id="schedule",
    name="日程管理",
    version="1.0.0",
    description="日程管理与提醒，支持日历视图、事件分类和提醒通知",
    icon="📅",
    author="JeJe",
    
    router_prefix="/api/v1/schedule",
    router=router,
    
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
    
    permissions=[
        "schedule.view",
        "schedule.create",
        "schedule.edit",
        "schedule.delete"
    ],
    
    enabled=True
)
