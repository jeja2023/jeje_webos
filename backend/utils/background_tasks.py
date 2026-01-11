"""
后台任务辅助工具
用于执行脱离请求上下文的长时间运行任务
"""

import logging
import traceback
from typing import Callable, Any, Coroutine
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db_session

logger = logging.getLogger(__name__)

class BackgroundTaskHelper:
    """
    后台任务辅助类
    提供在后台任务中安全获取 DB Session 的能力
    """
    
    @staticmethod
    async def run_with_db(task_func: Callable[[AsyncSession, Any], Coroutine[Any, Any, None]], *args, **kwargs):
        """
        在独立的 DB 会话中运行异步任务
        
        Args:
            task_func: 异步任务函数，第一个参数必须是 db: AsyncSession
            *args: 传递给任务的位置参数
            **kwargs: 传递给任务的关键字参数
        """
        async with get_db_session() as db:
            try:
                await task_func(db, *args, **kwargs)
            except Exception as e:
                logger.error(f"后台任务执行失败: {task_func.__name__}")
                logger.error(f"错误详情: {str(e)}")
                logger.error(traceback.format_exc())
