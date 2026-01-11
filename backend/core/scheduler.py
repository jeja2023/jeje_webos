"""
后台任务调度器
用于定期执行任务，如JWT密钥轮换
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Callable, Optional

logger = logging.getLogger(__name__)


class Scheduler:
    """简单任务调度器"""
    
    def __init__(self):
        self.tasks: list[asyncio.Task] = []
        self.running = False
    
    async def schedule_periodic(
        self,
        func: Callable,
        interval_seconds: int,
        name: str = "periodic_task"
    ):
        """
        调度定期任务
        
        Args:
            func: 要执行的异步函数
            interval_seconds: 执行间隔（秒）
            name: 任务名称
        """
        async def periodic_task():
            while self.running:
                try:
                    # 使用 DEBUG 级别，避免频繁任务日志刷屏
                    logger.debug(f"执行定期任务: {name}")
                    await func()
                except Exception as e:
                    logger.error(f"定期任务执行失败 {name}: {e}", exc_info=True)
                
                await asyncio.sleep(interval_seconds)
        
        task = asyncio.create_task(periodic_task())
        self.tasks.append(task)
        logger.debug(f"已调度定期任务: {name}, 间隔: {interval_seconds}秒")
    
    async def schedule_daily(
        self,
        func: Callable,
        hour: int = 0,
        minute: int = 0,
        name: str = "daily_task"
    ):
        """
        调度每日任务
        
        Args:
            func: 要执行的异步函数
            hour: 执行小时（0-23）
            minute: 执行分钟（0-59）
            name: 任务名称
        """
        async def daily_task():
            while self.running:
                try:
                    now = datetime.now()
                    target_time = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
                    
                    # 如果目标时间已过，设置为明天
                    if target_time <= now:
                        target_time += timedelta(days=1)
                    
                    # 计算等待时间
                    wait_seconds = (target_time - now).total_seconds()
                    logger.debug(f"每日任务 {name} 将在 {target_time.strftime('%Y-%m-%d %H:%M:%S')} 执行")
                    
                    await asyncio.sleep(wait_seconds)
                    
                    if not self.running:
                        break
                    
                    logger.info(f"执行每日任务: {name}")
                    await func()
                    
                    # 执行完成后，循环会重新计算下一天的等待时间
                    # 短暂休眠避免在同一秒内重复执行
                    await asyncio.sleep(60)
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    logger.error(f"每日任务执行失败 {name}: {e}", exc_info=True)
                    # 出错后等待1小时再重试
                    await asyncio.sleep(3600)
        
        task = asyncio.create_task(daily_task())
        self.tasks.append(task)
        logger.debug(f"已调度每日任务: {name}, 执行时间: {hour:02d}:{minute:02d}")
    
    def start(self):
        """启动调度器"""
        self.running = True
        logger.debug("任务调度器已启动")
    
    async def stop(self):
        """停止调度器"""
        self.running = False
        for task in self.tasks:
            task.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True)
        logger.debug("任务调度器已停止")


# 全局调度器实例
_scheduler: Optional[Scheduler] = None


def get_scheduler() -> Scheduler:
    """获取调度器实例"""
    global _scheduler
    if _scheduler is None:
        _scheduler = Scheduler()
    return _scheduler

