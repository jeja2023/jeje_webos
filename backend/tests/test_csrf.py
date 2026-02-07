"""
CSRF 防护模块测试
"""
import pytest
import time
from unittest.mock import MagicMock, patch
from core.csrf import (
    generate_csrf_token,
    verify_csrf_token,
    mark_token_used,
    _cleanup_expired_tokens,
    get_csrf_token_from_request,
    _csrf_tokens,
    TOKEN_EXPIRE_SECONDS
)

@pytest.mark.asyncio
class TestCSRF:
    """CSRF 防护测试"""
    
    def setup_method(self):
        _csrf_tokens.clear()
        
    async def test_token_lifecycle(self):
        """测试Token生成和验证"""
        token = await generate_csrf_token()
        assert token in _csrf_tokens
        assert await verify_csrf_token(token) is True
        
        # 测试不存在的 Token
        assert await verify_csrf_token("invalid") is False
        
    async def test_token_expiration(self):
        """测试Token过期"""
        token = await generate_csrf_token()
        
        # 模拟时间使其过期
        with patch("time.time", return_value=time.time() + TOKEN_EXPIRE_SECONDS + 1):
            assert await verify_csrf_token(token) is False
            assert token not in _csrf_tokens # 校验时应该被删除
            
    def test_cleanup(self):
        """测试清理逻辑"""
        # 注入旧 Token
        old_token = "old_token"
        _csrf_tokens[old_token] = {
            "created_at": time.time() - TOKEN_EXPIRE_SECONDS - 10,
            "used": False
        }
        
        # 注入新 Token
        new_token = "new_token"
        _csrf_tokens[new_token] = {
            "created_at": time.time(),
            "used": False
        }
        
        _cleanup_expired_tokens()
        
        assert old_token not in _csrf_tokens
        assert new_token in _csrf_tokens

    def test_get_token_from_request(self):
        """测试从请求获取Token"""
        # 从 Header 获取
        req = MagicMock()
        req.headers = {"X-CSRF-Token": "t1"}
        assert get_csrf_token_from_request(req) == "t1"
        
        # 从查询参数获取
        req.headers = {}
        req.query_params = {"csrf_token": "t2"}
        assert get_csrf_token_from_request(req) == "t2"
        
