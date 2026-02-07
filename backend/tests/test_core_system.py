"""
后端核心系统组件单元测试
覆盖 deps, mounts, lifespan 等
"""

import pytest
from unittest.mock import MagicMock, AsyncMock, patch, call
from fastapi import FastAPI
from sqlalchemy.ext.asyncio import AsyncSession

from core.deps import get_async_session
from core.mounts import mount_static_resources
from core.lifespan import lifespan

class TestCoreDeps:
    """测试依赖注入"""
    
    @pytest.mark.asyncio
    async def test_get_async_session(self):
        """测试获取异步会话依赖"""
        mock_session = AsyncMock(spec=AsyncSession)
        mock_session.__aenter__.return_value = mock_session
        mock_factory = MagicMock(return_value=mock_session)
        
        with patch("core.deps.async_session", mock_factory):
            async for session in get_async_session():
                assert session is mock_session
                break
            
            mock_factory.assert_called_once()


class TestCoreMounts:
    """测试资源挂载"""
    
    def test_mount_static_resources(self):
        """测试静态资源挂载逻辑"""
        app = MagicMock(spec=FastAPI)
        
        # 模拟路径存在
        with patch("os.path.exists", return_value=True), \
             patch("os.path.isdir", return_value=True), \
             patch("os.listdir", return_value=["module1", "module2"]):
            
            mount_static_resources(app, "/fake/frontend")
            
            # 验证 app.mount 是否被调用
            assert app.mount.called
            
            # 检查是否挂载了某些关键路径
            calls = [call_args.args[0] for call_args in app.mount.call_args_list]
            assert "/static/css" in calls
            assert "/static/js" in calls
            assert "/images" in calls


class TestCoreLifespan:
    """测试生命周期管理器"""
    
    @pytest.mark.asyncio
    async def test_lifespan_structure(self):
        """测试 lifespan 的基本执行流程 (Mock 掉所有外部调用)"""
        app = MagicMock(spec=FastAPI)
        
        # Mock 所有在 lifespan 中调用的初始化函数
        with patch("core.lifespan.get_settings") as mock_settings, \
             patch("core.lifespan.init_db", new_callable=AsyncMock) as mock_init_db, \
             patch("core.lifespan.init_cache", new_callable=AsyncMock) as mock_init_cache, \
             patch("core.lifespan.get_scheduler") as mock_get_scheduler, \
             patch("core.lifespan.AuditLogger") as mock_audit, \
             patch("core.lifespan.event_bus") as mock_event_bus, \
             patch("core.lifespan.close_db", new_callable=AsyncMock) as mock_close_db, \
             patch("core.lifespan.close_cache", new_callable=AsyncMock) as mock_close_cache, \
             patch("core.lifespan.get_module_loader", return_value=None), \
             patch("core.lifespan.get_jwt_rotator"):
            
            # 设置 mock 为异步
            mock_audit.stop_auto_flush = AsyncMock()
            mock_event_bus.publish = AsyncMock()
            
            # 设置 mock 返回值
            mock_settings.return_value.app_name = "TestApp"
            mock_settings.return_value.app_version = "1.0.0"
            mock_settings.return_value.jwt_auto_rotate = False
            mock_settings.return_value.csrf_enabled = False
            mock_settings.return_value.jwt_secret = "safe-secret"
            
            scheduler = MagicMock()
            scheduler.start = MagicMock()
            scheduler.stop = AsyncMock()
            mock_get_scheduler.return_value = scheduler
            
            # 执行 lifespan
            async with lifespan(app):
                # 验证启动逻辑
                mock_init_db.assert_called_once()
                mock_init_cache.assert_called_once()
                mock_audit.start_auto_flush.assert_called_once()
                scheduler.start.assert_called_once()
            
            # 验证关闭逻辑
            scheduler.stop.assert_called_once()
            mock_audit.stop_auto_flush.assert_called_once()
            mock_close_db.assert_called_once()
            mock_close_cache.assert_called_once()
