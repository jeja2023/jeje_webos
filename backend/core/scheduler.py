"""
后台任务调度器
用于定期执行任务，如JWT密钥轮换
"""

import asyncio
import logging
from datetime import datetime, timedelta
from typing import Callable, Optional
from utils.timezone import get_beijing_time

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
        name: str = "periodic_task",
        max_retries: int = 3
    ):
        """
        调度定期任务
        
        Args:
            func: 要执行的异步函数
            interval_seconds: 执行间隔（秒）
            name: 任务名称
            max_retries: 单次执行失败时的最大重试次数
        """
        async def periodic_task():
            consecutive_failures = 0
            while self.running:
                try:
                    logger.debug(f"执行定期任务: {name}")
                    await func()
                    consecutive_failures = 0  # 成功后重置计数
                except asyncio.CancelledError:
                    break
                except Exception as e:
                    consecutive_failures += 1
                    logger.error(f"定期任务执行失败 {name}（连续第 {consecutive_failures} 次）: {e}", exc_info=True)
                    
                    # 指数退避重试
                    if consecutive_failures <= max_retries:
                        retry_delay = min(30, 2 ** consecutive_failures)
                        logger.info(f"定期任务 {name} 将在 {retry_delay}s 后重试")
                        await asyncio.sleep(retry_delay)
                        continue
                    else:
                        logger.warning(f"定期任务 {name} 连续失败 {consecutive_failures} 次，等待下次正常周期")
                        consecutive_failures = 0
                
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
                    now = get_beijing_time()
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
    
    async def stop(self, timeout: float = 10.0):
        """
        停止调度器，等待运行中的任务完成
        
        Args:
            timeout: 等待超时时间（秒），超时后强制取消
        """
        self.running = False
        if not self.tasks:
            logger.debug("任务调度器已停止（无活跃任务）")
            return
        
        # 先尝试优雅等待
        for task in self.tasks:
            task.cancel()
        
        try:
            await asyncio.wait_for(
                asyncio.gather(*self.tasks, return_exceptions=True),
                timeout=timeout
            )
        except asyncio.TimeoutError:
            logger.warning(f"调度器停止超时（{timeout}s），强制取消剩余任务")
        
        self.tasks.clear()
        logger.debug("任务调度器已停止")


# 全局调度器实例
_scheduler: Optional[Scheduler] = None


def get_scheduler() -> Scheduler:
    """获取调度器实例"""
    global _scheduler
    if _scheduler is None:
        _scheduler = Scheduler()
    return _scheduler

