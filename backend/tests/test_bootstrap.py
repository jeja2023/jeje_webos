"""
核心生命周期与引导模块测试
"""

import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from core.bootstrap import init_admin_user, ensure_default_roles
from models import User, UserGroup

# 模拟 settings
class MockSettings:
    admin_password = "TestPassword123"
    admin_phone = "13800138000"
    admin_username = "admin"
    admin_nickname = "Admin"

class TestBootstrap:
    """系统引导初始化测试"""
    
    @pytest.mark.asyncio
    async def test_init_admin_user_success(self):
        """测试成功创建管理员用户"""
        mock_db = AsyncMock()
        mock_db_ctx = AsyncMock()
        mock_db_ctx.__aenter__.return_value = mock_db
        mock_db_ctx.__aexit__.return_value = None
        
        # 模拟没有现有用户
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        
        # 模拟 UserGroup 查询 (第一次查 admin group, 返回 None 则创建)
        mock_group_result = MagicMock()
        mock_group_result.scalar_one_or_none.return_value = None 
        
        # 使用计数器控制返回值，避免 SQL 字符串匹配不稳定的问题
        class ResultSideEffect:
            def __init__(self):
                self.call_count = 0
            def __call__(self, *args, **kwargs):
                self.call_count += 1
                if self.call_count == 1:
                    return mock_result  # 第一次：查询 User
                if self.call_count == 2:
                    return mock_group_result # 第二次：查询 UserGroup
                return MagicMock()

        mock_db.execute.side_effect = ResultSideEffect()
        
        # Factory return the context manager
        mock_factory = MagicMock(return_value=mock_db_ctx)

        with patch("core.bootstrap.get_settings", return_value=MockSettings()), \
             patch("core.bootstrap.async_session", mock_factory):
            
            result = await init_admin_user()
            
            assert result["created"] is True
            assert result["username"] == "admin"
            
            # UserGroup(admin) + User(admin) = 2 adds
            assert mock_db.add.call_count >= 2 
            mock_db.commit.assert_called()

    @pytest.mark.asyncio
    async def test_init_admin_user_exists(self):
        """测试管理员已存在"""
        mock_db = AsyncMock()
        mock_db_ctx = AsyncMock()
        mock_db_ctx.__aenter__.return_value = mock_db
        mock_db_ctx.__aexit__.return_value = None
        
        existing_admin = User(username="admin", role="admin", phone="13800138000")
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [existing_admin]
        mock_db.execute.return_value = mock_result
        
        mock_factory = MagicMock(return_value=mock_db_ctx)

        with patch("core.bootstrap.get_settings", return_value=MockSettings()), \
             patch("core.bootstrap.async_session", mock_factory):
            
            result = await init_admin_user()
            
            assert result["created"] is False
            assert "已存在" in result["message"]

    @pytest.mark.asyncio
    async def test_init_admin_invalid_phone(self):
        """测试无效手机号"""
        s = MockSettings()
        s.admin_phone = "123" # invalid
        
        with patch("core.bootstrap.get_settings", return_value=s):
            result = await init_admin_user()
            assert result["created"] is False
            assert "格式不正确" in result["message"]

    @pytest.mark.asyncio
    async def test_ensure_default_roles(self):
        """测试确保默认角色"""
        mock_db = AsyncMock()
        mock_db_ctx = AsyncMock()
        mock_db_ctx.__aenter__.return_value = mock_db
        mock_db_ctx.__aexit__.return_value = None
        
        # 模拟现有角色为空
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = []
        mock_db.execute.return_value = mock_result
        
        mock_factory = MagicMock(return_value=mock_db_ctx)
        
        with patch("core.bootstrap.async_session", mock_factory):
            await ensure_default_roles()
            
            # 应该创建 4 个默认角色
            assert mock_db.add.call_count == 4
            mock_db.commit.assert_called()
