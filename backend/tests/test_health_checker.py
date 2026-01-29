"""
健康检查模块测试
"""

import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from core.health_checker import HealthChecker, HealthStatus

class TestHealthChecker:
    """健康检查功能测试"""
    
    @pytest.mark.asyncio
    async def test_check_database_healthy(self):
        """测试数据库健康"""
        checker = HealthChecker()
        
        mock_session = AsyncMock()
        mock_ctx = AsyncMock()
        mock_ctx.__aenter__.return_value = mock_session
        mock_ctx.__aexit__.return_value = None
        
        # Factory that returns the context manager
        mock_factory = MagicMock(return_value=mock_ctx)
        
        with patch("core.health_checker.async_session", mock_factory):
            health = await checker.check_database()
            assert health.status == HealthStatus.HEALTHY
            assert health.name == "database"

    @pytest.mark.asyncio
    async def test_check_database_unhealthy(self):
        """测试数据库异常"""
        checker = HealthChecker()
        
        # 模拟异常
        mock_ctx = AsyncMock()
        mock_ctx.__aenter__.side_effect = Exception("DB Down")
        
        # Factory that returns the context manager
        mock_factory = MagicMock(return_value=mock_ctx)
        
        with patch("core.health_checker.async_session", mock_factory):
            health = await checker.check_database()
            assert health.status == HealthStatus.UNHEALTHY
            assert "DB Down" in health.message

    @pytest.mark.asyncio
    async def test_check_redis_healthy(self):
        """测试 Redis 健康"""
        checker = HealthChecker()
        
        mock_redis = AsyncMock()
        mock_redis.ping.return_value = True
        
        with patch("core.cache._redis_client", mock_redis):
            health = await checker.check_redis()
            assert health.status == HealthStatus.HEALTHY

    @pytest.mark.asyncio
    async def test_check_system_resources(self):
        """测试系统资源检查（磁盘/内存）"""
        checker = HealthChecker()
        
        # Mock shutil.disk_usage
        with patch("shutil.disk_usage", return_value=(100, 50, 50)), \
             patch("psutil.virtual_memory") as mock_mem:
            
            mock_mem.return_value.percent = 40
            mock_mem.return_value.total = 100
            mock_mem.return_value.available = 60
            
            # Mock storage manager root_dir
            with patch("utils.storage.get_storage_manager") as mock_sm:
                mock_sm.return_value.root_dir.exists.return_value = True
                
                disk = await checker.check_disk()
                assert disk.status == HealthStatus.HEALTHY
                
                mem = await checker.check_memory()
                assert mem.status == HealthStatus.HEALTHY

    @pytest.mark.asyncio
    async def test_get_full_health(self):
        """测试完整健康报告"""
        checker = HealthChecker()
        
        # Mock all checks
        with patch.object(HealthChecker, "check_database", return_value=MagicMock(status=HealthStatus.HEALTHY)), \
             patch.object(HealthChecker, "check_redis", return_value=MagicMock(status=HealthStatus.HEALTHY)), \
             patch.object(HealthChecker, "check_disk", return_value=MagicMock(status=HealthStatus.HEALTHY)), \
             patch.object(HealthChecker, "check_memory", return_value=MagicMock(status=HealthStatus.HEALTHY)):
            
            report = await checker.get_full_health()
            assert report["status"] == HealthStatus.HEALTHY
            assert "components" in report

    @pytest.mark.asyncio
    async def test_overall_status_degraded(self):
        """测试整体降级状态"""
        checker = HealthChecker()
        
        with patch.object(HealthChecker, "check_database", return_value=MagicMock(status=HealthStatus.HEALTHY)), \
             patch.object(HealthChecker, "check_redis", return_value=MagicMock(status=HealthStatus.DEGRADED)), \
             patch.object(HealthChecker, "check_disk", return_value=MagicMock(status=HealthStatus.HEALTHY)), \
             patch.object(HealthChecker, "check_memory", return_value=MagicMock(status=HealthStatus.HEALTHY)):
            
            report = await checker.get_full_health()
            assert report["status"] == HealthStatus.DEGRADED
