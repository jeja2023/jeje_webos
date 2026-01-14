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


# 模块启用时注册定时任务
async def on_enable():
    """模块启用钩子，注册定时清理任务"""
    import asyncio
    import logging
    from core.database import get_db_session
    from .office_services import OfficeService
    
    logger = logging.getLogger(__name__)
    
    async def cleanup_task():
        """定期清理不活跃的编辑会话"""
        while True:
            try:
                await asyncio.sleep(300)  # 每5分钟检查一次
                async with get_db_session() as db:
                    count = await OfficeService.cleanup_inactive_sessions(db, timeout_minutes=10)
                    if count > 0:
                        await db.commit()
            except Exception as e:
                logger.debug(f"编辑会话清理任务执行失败: {e}")
    
    # 创建后台任务
    asyncio.create_task(cleanup_task())
    logger.debug("协同办公模块定时清理任务已启动")


# 绑定钩子
manifest.on_enable = on_enable
