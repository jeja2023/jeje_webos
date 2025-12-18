"""
中间件单元测试
测试缓存控制、安全响应头和审计日志记录
"""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
class TestMiddleware:
    """中间件测试"""

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
        assert "1; mode=block" in response.headers.get("X-XSS-Protection", "")
        assert "strict-origin-when-cross-origin" in response.headers.get("Referrer-Policy", "")

    async def test_non_api_no_cache_control(self, client: AsyncClient):
        """测试非 API 路径不受强制禁用缓存影响"""
        # /health 路径不在中间件的 /api/ 过滤范围内（或者在 skip_paths 中）
        response = await client.get("/health")
        
        cc = response.headers.get("Cache-Control", "")
        # 健康检查不应该被强制设置 no-cache (除非业务逻辑本身需要)
        assert "no-store" not in cc
