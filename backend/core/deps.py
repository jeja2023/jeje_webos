"""
依赖注入
提供全局可复用的依赖项
"""

from typing import AsyncGenerator, Optional
from sqlalchemy.ext.asyncio import AsyncSession

from .database import get_db, async_session
from .security import get_current_user, TokenData, require_permission
from .events import event_bus
from .config import get_settings, Settings, reload_settings


# 重新导出常用依赖
__all__ = [
    "get_db",
    "get_current_user",
    "require_permission",
    "event_bus",
    "get_settings",
    "get_async_session"
]


async def get_async_session() -> AsyncGenerator[AsyncSession, None]:
    """获取异步数据库会话"""
    async with async_session() as session:
        yield session

