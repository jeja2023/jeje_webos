"""
调度器核心模块单元测试
"""

import pytest
import asyncio
from unittest.mock import AsyncMock, patch
from core.scheduler import Scheduler, get_scheduler

class TestScheduler:
    """任务调度器测试"""
    
    @pytest.mark.asyncio
    async def test_schedule_periodic(self):
        """测试周期性任务调度"""
        scheduler = Scheduler()
        scheduler.start()
        
        mock_func = AsyncMock()
        # 设置一个短间隔进行测试
        await scheduler.schedule_periodic(mock_func, 0.1, name="test_task")
        
        # 等待任务执行几次
        await asyncio.sleep(0.35)
        
        await scheduler.stop()
        
        # 验证是否至少执行了 2 次 (0s, 0.1s, 0.2s, 0.3s)
        assert mock_func.call_count >= 2

    @pytest.mark.asyncio
    async def test_scheduler_stop(self):
        """测试调度器停止"""
        scheduler = Scheduler()
        scheduler.start()
        
        mock_func = AsyncMock()
        await scheduler.schedule_periodic(mock_func, 10, name="test_long_task")
        
        assert len(scheduler.tasks) == 1
        assert scheduler.running is True
        
        await scheduler.stop()
        
        assert scheduler.running is False
        for task in scheduler.tasks:
            assert task.cancelled() or task.done()

    def test_get_scheduler_singleton(self):
        """测试获取调度器单例"""
        s1 = get_scheduler()
        s2 = get_scheduler()
        assert s1 is s2
