"""
认证辅助工具单元测试
覆盖：从 Cookie/Query 获取令牌、管理员权限验证
"""

import pytest
from unittest.mock import MagicMock, patch

from core.security import TokenData, create_token
from core.errors import AuthException, PermissionException
from utils.auth_helpers import get_user_from_token, get_admin_from_token


class TestGetUserFromToken:
    """从令牌获取用户测试"""

    def _make_request(self, cookies=None):
        """创建模拟请求"""
        request = MagicMock()
        request.cookies = cookies or {}
        return request

    def test_token_from_query(self):
        """测试从 Query 参数获取令牌"""
        token_data = TokenData(user_id=1, username="testuser", role="user")
        token = create_token(token_data)
        request = self._make_request()
        
        mock_settings = MagicMock()
        mock_settings.auth_use_httponly_cookie = False
        
        with patch("utils.auth_helpers.get_settings", return_value=mock_settings):
            result = get_user_from_token(request, token=token)
            assert result.user_id == 1
            assert result.username == "testuser"

    def test_token_from_cookie(self):
        """测试从 Cookie 获取令牌"""
        token_data = TokenData(user_id=2, username="cookieuser", role="admin")
        token = create_token(token_data)
        request = self._make_request(cookies={"access_token": token})
        
        mock_settings = MagicMock()
        mock_settings.auth_use_httponly_cookie = True
        
        with patch("utils.auth_helpers.get_settings", return_value=mock_settings):
            result = get_user_from_token(request)
            assert result.user_id == 2
            assert result.username == "cookieuser"

    def test_no_token_raises_401(self):
        """测试无令牌抛出 401"""
        request = self._make_request()
        
        mock_settings = MagicMock()
        mock_settings.auth_use_httponly_cookie = False
        
        with patch("utils.auth_helpers.get_settings", return_value=mock_settings):
            with pytest.raises(AuthException):
                get_user_from_token(request, token=None)

    def test_invalid_token_raises_401(self):
        """测试无效令牌抛出 401 (AuthException)"""
        request = self._make_request()
        
        mock_settings = MagicMock()
        mock_settings.auth_use_httponly_cookie = False
        
        with patch("utils.auth_helpers.get_settings", return_value=mock_settings):
            with pytest.raises(AuthException):
                get_user_from_token(request, token="invalid_token")

    def test_cookie_priority_over_query(self):
        """测试 Cookie 优先于 Query"""
        admin_data = TokenData(user_id=1, username="admin", role="admin")
        user_data = TokenData(user_id=2, username="user", role="user")
        
        cookie_token = create_token(admin_data)
        query_token = create_token(user_data)
        
        request = self._make_request(cookies={"access_token": cookie_token})
        
        mock_settings = MagicMock()
        mock_settings.auth_use_httponly_cookie = True
        
        with patch("utils.auth_helpers.get_settings", return_value=mock_settings):
            result = get_user_from_token(request, token=query_token)
            # 应该使用 Cookie 中的令牌
            assert result.user_id == 1
            assert result.role == "admin"


class TestGetAdminFromToken:
    """管理员令牌验证测试"""

    def _make_request(self, cookies=None):
        """创建模拟请求"""
        request = MagicMock()
        request.cookies = cookies or {}
        return request

    def test_admin_token_passes(self):
        """测试管理员令牌通过"""
        token_data = TokenData(user_id=1, username="admin", role="admin")
        token = create_token(token_data)
        request = self._make_request()
        
        mock_settings = MagicMock()
        mock_settings.auth_use_httponly_cookie = False
        
        with patch("utils.auth_helpers.get_settings", return_value=mock_settings):
            result = get_admin_from_token(request, token=token)
            assert result.role == "admin"

    def test_non_admin_raises_403(self):
        """测试非管理员抛出 403"""
        token_data = TokenData(user_id=2, username="user", role="user")
        token = create_token(token_data)
        request = self._make_request()
        
        mock_settings = MagicMock()
        mock_settings.auth_use_httponly_cookie = False
        
        with patch("utils.auth_helpers.get_settings", return_value=mock_settings):
            with pytest.raises(PermissionException):
                get_admin_from_token(request, token=token)

    def test_manager_raises_403(self):
        """测试业务管理员也抛出 403 (PermissionException)"""
        token_data = TokenData(user_id=3, username="manager", role="manager")
        token = create_token(token_data)
        request = self._make_request()
        
        mock_settings = MagicMock()
        mock_settings.auth_use_httponly_cookie = False
        
        with patch("utils.auth_helpers.get_settings", return_value=mock_settings):
            with pytest.raises(PermissionException):
                get_admin_from_token(request, token=token)

    def test_no_token_raises_401(self):
        """测试无令牌抛出 401 (AuthException)"""
        request = self._make_request()
        
        mock_settings = MagicMock()
        mock_settings.auth_use_httponly_cookie = False
        
        with patch("utils.auth_helpers.get_settings", return_value=mock_settings):
            with pytest.raises(AuthException):
                get_admin_from_token(request, token=None)
