"""
中间件单元测试
覆盖：缓存控制、安全响应头、敏感数据脱敏、请求统计、审计中间件路径解析
"""

import pytest
import time
from unittest.mock import MagicMock, patch

from httpx import AsyncClient

from core.middleware import (
    mask_sensitive_data,
    _handle_no_response_error,
    RequestStats,
    AuditMiddleware,
    STREAMING_PATHS,
)


# ==================== 集成测试 ====================

@pytest.mark.asyncio
class TestMiddlewareIntegration:
    """中间件集成测试"""

    async def test_api_cache_control_headers(self, client: AsyncClient):
        """测试 API 路径是否禁用了浏览器缓存"""
        response = await client.get("/api/v1/system/init")
        assert response.status_code == 200
        
        # 验证缓存控制头
        cc = response.headers.get("Cache-Control", "")
        assert "no-cache" in cc
        assert "no-store" in cc
        assert "must-revalidate" in cc
        assert response.headers.get("Pragma") == "no-cache"
        assert response.headers.get("Expires") == "0"

    async def test_security_headers(self, client: AsyncClient):
        """测试安全响应头是否正确添加"""
        response = await client.get("/api/v1/system/init")
        
        assert response.headers.get("X-Content-Type-Options") == "nosniff"
        assert response.headers.get("X-Frame-Options") == "DENY"
        assert "strict-origin-when-cross-origin" in response.headers.get("Referrer-Policy", "")

    async def test_non_api_no_cache_control(self, client: AsyncClient):
        """测试非 API 路径不受强制禁用缓存影响"""
        response = await client.get("/health")
        
        cc = response.headers.get("Cache-Control", "")
        assert "no-store" not in cc

    async def test_hsts_header(self, client: AsyncClient):
        """测试 HSTS 头存在"""
        response = await client.get("/api/v1/system/init")
        hsts = response.headers.get("Strict-Transport-Security", "")
        assert "max-age=" in hsts

    async def test_csp_header(self, client: AsyncClient):
        """测试 Content-Security-Policy 头存在"""
        response = await client.get("/api/v1/system/init")
        csp = response.headers.get("Content-Security-Policy", "")
        assert "default-src" in csp
        assert "script-src" in csp

    async def test_response_time_header(self, client: AsyncClient):
        """测试响应时间头"""
        response = await client.get("/api/v1/system/init")
        response_time = response.headers.get("X-Response-Time", "")
        # 可能不在所有路径都出现，但如果出现应包含 ms
        if response_time:
            assert "ms" in response_time


# ==================== 敏感数据脱敏测试 ====================

class TestMaskSensitiveData:
    """敏感数据脱敏功能测试"""

    def test_mask_password_field(self):
        """测试密码字段脱敏"""
        data = {"username": "admin", "password": "secret123"}
        result = mask_sensitive_data(data)
        
        assert result["username"] == "admin"
        assert result["password"] == "******"

    def test_mask_token_field(self):
        """测试令牌字段脱敏"""
        data = {"access_token": "jwt_token_value", "data": "ok"}
        result = mask_sensitive_data(data)
        
        assert result["access_token"] == "******"
        assert result["data"] == "ok"

    def test_mask_secret_field(self):
        """测试密钥字段脱敏"""
        data = {"api_secret": "very_secret", "name": "test"}
        result = mask_sensitive_data(data)
        
        assert result["api_secret"] == "******"
        assert result["name"] == "test"

    def test_mask_credential_field(self):
        """测试凭证字段脱敏"""
        data = {"user_credential": "cred123"}
        result = mask_sensitive_data(data)
        
        assert result["user_credential"] == "******"

    def test_mask_auth_field(self):
        """测试认证字段脱敏"""
        data = {"authorization": "Bearer xxx"}
        result = mask_sensitive_data(data)
        
        assert result["authorization"] == "******"

    def test_mask_nested_dict(self):
        """测试嵌套字典脱敏"""
        data = {
            "user": {
                "name": "test",
                "password": "secret"
            }
        }
        result = mask_sensitive_data(data)
        
        assert result["user"]["name"] == "test"
        assert result["user"]["password"] == "******"

    def test_mask_list_data(self):
        """测试列表数据脱敏"""
        data = [
            {"password": "secret1"},
            {"password": "secret2"}
        ]
        result = mask_sensitive_data(data)
        
        assert result[0]["password"] == "******"
        assert result[1]["password"] == "******"

    def test_mask_non_sensitive_data(self):
        """测试非敏感数据不受影响"""
        data = {"name": "test", "email": "test@example.com", "age": 25}
        result = mask_sensitive_data(data)
        
        assert result == data

    def test_mask_primitive_data(self):
        """测试原始数据类型不受影响"""
        assert mask_sensitive_data("hello") == "hello"
        assert mask_sensitive_data(42) == 42
        assert mask_sensitive_data(None) is None

    def test_mask_deep_nesting_limit(self):
        """测试深层嵌套限制（防止栈溢出）"""
        # 构造超过 20 层嵌套
        data = {"key": "value"}
        for _ in range(25):
            data = {"nested": data}
        
        result = mask_sensitive_data(data)
        # 应该不会栈溢出，深层数据会被截断
        assert result is not None

    def test_mask_case_insensitive(self):
        """测试大小写不敏感匹配"""
        data = {"Password": "secret", "TOKEN": "abc", "Secret_Key": "key123"}
        result = mask_sensitive_data(data)
        
        assert result["Password"] == "******"
        assert result["TOKEN"] == "******"
        assert result["Secret_Key"] == "******"


# ==================== 请求统计测试 ====================

class TestRequestStats:
    """请求统计功能测试"""

    def test_initial_state(self):
        """测试初始状态"""
        stats = RequestStats()
        
        assert stats.total_requests == 0
        assert stats.success_requests == 0
        assert stats.error_requests == 0
        assert stats.total_duration == 0.0

    def test_record_success_request(self):
        """测试记录成功请求"""
        stats = RequestStats()
        stats.record("/api/test", "GET", 200, 0.05)
        
        assert stats.total_requests == 1
        assert stats.success_requests == 1
        assert stats.error_requests == 0

    def test_record_error_request(self):
        """测试记录错误请求"""
        stats = RequestStats()
        stats.record("/api/test", "GET", 500, 0.1)
        
        assert stats.total_requests == 1
        assert stats.success_requests == 0
        assert stats.error_requests == 1

    def test_record_multiple_requests(self):
        """测试记录多个请求"""
        stats = RequestStats()
        stats.record("/api/a", "GET", 200, 0.05)
        stats.record("/api/b", "POST", 201, 0.1)
        stats.record("/api/c", "GET", 404, 0.02)
        stats.record("/api/d", "DELETE", 500, 0.5)
        
        assert stats.total_requests == 4
        assert stats.success_requests == 2  # 200, 201
        assert stats.error_requests == 2    # 404, 500

    def test_path_stats(self):
        """测试路径统计"""
        stats = RequestStats()
        stats.record("/api/test", "GET", 200, 0.05)
        stats.record("/api/test", "GET", 200, 0.1)
        stats.record("/api/test", "GET", 500, 0.2)
        
        path_key = "GET /api/test"
        assert path_key in stats.path_stats
        assert stats.path_stats[path_key]["count"] == 3
        assert stats.path_stats[path_key]["errors"] == 1

    def test_status_stats(self):
        """测试状态码统计"""
        stats = RequestStats()
        stats.record("/api/a", "GET", 200, 0.05)
        stats.record("/api/b", "GET", 200, 0.05)
        stats.record("/api/c", "GET", 404, 0.05)
        
        assert stats.status_stats["200"] == 2
        assert stats.status_stats["404"] == 1

    def test_get_summary(self):
        """测试获取摘要"""
        stats = RequestStats()
        stats.record("/api/a", "GET", 200, 0.05)
        stats.record("/api/b", "POST", 500, 0.2)
        
        summary = stats.get_summary()
        
        assert summary["total_requests"] == 2
        assert summary["success_requests"] == 1
        assert summary["error_requests"] == 1
        assert summary["success_rate"] == 50.0
        assert summary["avg_response_time_ms"] > 0
        assert "slowest_endpoints" in summary
        assert "status_distribution" in summary

    def test_get_summary_empty(self):
        """测试空统计摘要"""
        stats = RequestStats()
        summary = stats.get_summary()
        
        assert summary["total_requests"] == 0
        assert summary["success_rate"] == 100  # 无请求时默认 100%

    def test_reset(self):
        """测试重置统计"""
        stats = RequestStats()
        stats.record("/api/a", "GET", 200, 0.05)
        stats.record("/api/b", "POST", 500, 0.1)
        
        stats.reset()
        
        assert stats.total_requests == 0
        assert stats.success_requests == 0
        assert stats.error_requests == 0
        assert stats.path_stats == {}
        assert stats.status_stats == {}

    def test_max_path_entries_limit(self):
        """测试路径条目上限保护"""
        stats = RequestStats()
        
        # 添加超过上限的路径
        for i in range(RequestStats.MAX_PATH_ENTRIES + 10):
            stats.record(f"/api/path_{i}", "GET", 200, 0.01)
        
        # 路径统计数不应超过上限
        assert len(stats.path_stats) <= RequestStats.MAX_PATH_ENTRIES

    def test_slowest_endpoints_in_summary(self):
        """测试摘要中的最慢端点排序"""
        stats = RequestStats()
        stats.record("/api/slow", "GET", 200, 1.0)
        stats.record("/api/fast", "GET", 200, 0.01)
        stats.record("/api/medium", "GET", 200, 0.5)
        
        summary = stats.get_summary()
        endpoints = summary["slowest_endpoints"]
        
        assert len(endpoints) == 3
        # 第一个应该是最慢的
        assert endpoints[0]["path"] == "GET /api/slow"


# ==================== 审计中间件测试 ====================

class TestAuditMiddleware:
    """审计中间件逻辑测试"""

    def _create_middleware(self, audit_all_methods=False):
        """创建测试用中间件实例"""
        mock_app = MagicMock()
        return AuditMiddleware(mock_app, audit_all_methods=audit_all_methods)

    def test_should_skip_static_paths(self):
        """测试跳过静态路径"""
        mw = self._create_middleware()
        
        assert mw._should_skip("/static/css/style.css", "GET") is True
        assert mw._should_skip("/health", "GET") is True
        assert mw._should_skip("/api/docs", "GET") is True
        assert mw._should_skip("/favicon.ico", "GET") is True
        assert mw._should_skip("/ws", "GET") is True

    def test_should_skip_get_by_default(self):
        """测试默认跳过 GET 请求"""
        mw = self._create_middleware(audit_all_methods=False)
        
        assert mw._should_skip("/api/v1/users", "GET") is True
        assert mw._should_skip("/api/v1/users", "POST") is False
        assert mw._should_skip("/api/v1/users", "PUT") is False
        assert mw._should_skip("/api/v1/users", "DELETE") is False

    def test_should_not_skip_get_when_audit_all(self):
        """测试 audit_all_methods=True 时不跳过 GET"""
        mw = self._create_middleware(audit_all_methods=True)
        
        assert mw._should_skip("/api/v1/users", "GET") is False
        assert mw._should_skip("/api/v1/users", "POST") is False

    def test_parse_path_exact_match(self):
        """测试路径精确匹配"""
        mw = self._create_middleware()
        
        module, action, desc = mw._parse_path("/api/v1/auth/login", "POST")
        assert module == "auth"
        assert action == "login"

    def test_parse_path_prefix_match(self):
        """测试路径前缀匹配"""
        mw = self._create_middleware()
        
        module, action, desc = mw._parse_path("/api/v1/storage/upload", "POST")
        assert module == "storage"

    def test_parse_path_default_fallback(self):
        """测试路径默认回退"""
        mw = self._create_middleware()
        
        module, action, desc = mw._parse_path("/api/v1/custom_module/action", "POST")
        assert module == "custom_module"
        assert action == "create"

    def test_parse_path_method_action_mapping(self):
        """测试 HTTP 方法到操作映射"""
        mw = self._create_middleware()
        
        _, action_post, _ = mw._parse_path("/api/v1/unknown/test", "POST")
        _, action_put, _ = mw._parse_path("/api/v1/unknown/test", "PUT")
        _, action_delete, _ = mw._parse_path("/api/v1/unknown/test", "DELETE")
        _, action_get, _ = mw._parse_path("/api/v1/unknown/test", "GET")
        
        assert action_post == "create"
        assert action_put == "update"
        assert action_delete == "delete"
        assert action_get == "operation"

    def test_parse_path_short_path(self):
        """测试短路径回退"""
        mw = self._create_middleware()
        
        module, action, desc = mw._parse_path("/api", "GET")
        assert module == "unknown"


# ==================== 流式路径配置测试 ====================

class TestStreamingPaths:
    """流式响应路径配置测试"""

    def test_streaming_paths_defined(self):
        """测试流式路径已定义"""
        assert len(STREAMING_PATHS) > 0

    def test_ai_chat_is_streaming(self):
        """测试 AI 聊天路径在流式列表中"""
        assert "/api/v1/ai/chat" in STREAMING_PATHS

    def test_video_is_streaming(self):
        """测试视频路径在流式列表中"""
        assert any("/api/v1/video" in p for p in STREAMING_PATHS)


# ==================== 错误处理工具测试 ====================

class TestHandleNoResponseError:
    """No Response 错误处理测试"""

    def test_returns_499_status(self):
        """测试返回 499 状态码"""
        mock_request = MagicMock()
        mock_request.url.path = "/api/v1/test"
        mock_request.method = "GET"
        
        response = _handle_no_response_error(mock_request)
        assert response.status_code == 499

    def test_with_middleware_name(self):
        """测试带中间件名称"""
        mock_request = MagicMock()
        mock_request.url.path = "/api/v1/test"
        mock_request.method = "POST"
        
        response = _handle_no_response_error(mock_request, "TestMiddleware")
        assert response.status_code == 499
