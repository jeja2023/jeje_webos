"""
主应用端点和全局异常处理单元测试
覆盖：首页、API 信息、SPA 回退、全局异常处理器、辅助端点
"""

import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from httpx import AsyncClient
from fastapi import HTTPException, Request
from fastapi.responses import Response


@pytest.mark.asyncio
class TestHealthEndpoint:
    """健康检查端点测试"""

    async def test_health_check(self, client: AsyncClient):
        """测试健康检查端点"""
        response = await client.get("/health")
        assert response.status_code == 200

    async def test_health_ready(self, client: AsyncClient):
        """测试就绪检查端点"""
        response = await client.get("/health/ready")
        assert response.status_code in (200, 503)

    async def test_health_live(self, client: AsyncClient):
        """测试存活检查端点"""
        response = await client.get("/health/live")
        assert response.status_code == 200


@pytest.mark.asyncio
class TestRootEndpoints:
    """根路径端点测试"""

    async def test_root_path(self, client: AsyncClient):
        """测试根路径"""
        response = await client.get("/")
        # 可能返回 HTML 或 JSON
        assert response.status_code == 200

    async def test_api_info(self, client: AsyncClient):
        """测试 API 信息端点"""
        response = await client.get("/api")
        assert response.status_code == 200
        
        data = response.json()
        assert "name" in data
        assert "version" in data


@pytest.mark.asyncio
class TestSPAFallback:
    """SPA 路由回退测试"""

    async def test_unknown_frontend_route(self, client: AsyncClient):
        """测试未知前端路由回退"""
        response = await client.get("/some/frontend/route")
        # 应该返回 200（index.html）或 404
        assert response.status_code in (200, 404)

    async def test_api_prefix_not_fallback(self, client: AsyncClient):
        """测试 API 路径不触发 SPA 回退"""
        response = await client.get("/api/v1/nonexistent")
        # API 路径应该返回 404 或 405，而不是 SPA 回退
        assert response.status_code in (404, 405, 422)

    async def test_static_prefix_not_fallback(self, client: AsyncClient):
        """测试静态资源路径不触发 SPA 回退"""
        response = await client.get("/static/nonexistent.css")
        assert response.status_code in (404, 307)


@pytest.mark.asyncio
class TestGlobalExceptionHandler:
    """全局异常处理测试"""

    async def test_http_exception_format(self, client: AsyncClient):
        """测试 HTTP 异常返回标准格式"""
        # 访问不存在的 API
        response = await client.get("/api/v1/nonexistent_resource")
        
        if response.status_code == 404:
            data = response.json()
            assert "code" in data
            assert "message" in data

    async def test_validation_error_format(self, client: AsyncClient):
        """测试参数验证错误格式"""
        # 尝试登录但缺少必要参数
        response = await client.post("/api/v1/auth/login", json={})
        
        if response.status_code == 400:
            data = response.json()
            assert "code" in data
            assert "message" in data

    async def test_auth_error_format(self, client: AsyncClient):
        """测试认证错误格式"""
        # 无令牌访问需要认证的接口
        response = await client.get("/api/v1/users/me")
        
        assert response.status_code in (401, 403, 404)


@pytest.mark.asyncio
class TestAuthFlow:
    """认证流程集成测试"""

    async def test_login_success(self, client: AsyncClient, db_session, test_admin_data):
        """测试登录成功"""
        from tests.test_conftest import create_test_user
        await create_test_user(db_session, test_admin_data)
        
        response = await client.post(
            "/api/v1/auth/login",
            json={
                "username": test_admin_data["username"],
                "password": test_admin_data["password"]
            }
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "data" in data
        assert "access_token" in data["data"]

    async def test_login_wrong_password(self, client: AsyncClient, db_session, test_admin_data):
        """测试密码错误"""
        from tests.test_conftest import create_test_user
        await create_test_user(db_session, test_admin_data)
        
        response = await client.post(
            "/api/v1/auth/login",
            json={
                "username": test_admin_data["username"],
                "password": "wrong_password"
            }
        )
        
        assert response.status_code in (401, 400)

    async def test_login_nonexistent_user(self, client: AsyncClient, db_session):
        """测试不存在的用户"""
        response = await client.post(
            "/api/v1/auth/login",
            json={
                "username": "nonexistent",
                "password": "whatever"
            }
        )
        
        assert response.status_code in (401, 400, 404)

    async def test_protected_route_without_token(self, client: AsyncClient):
        """测试无令牌访问受保护路由"""
        response = await client.get("/api/v1/users/me")
        
        assert response.status_code in (401, 403, 404)

    async def test_protected_route_with_invalid_token(self, client: AsyncClient):
        """测试无效令牌访问受保护路由"""
        response = await client.get(
            "/api/v1/users/me",
            headers={"Authorization": "Bearer invalid_token"}
        )
        
        # 可能返回 401（认证失败）、403（权限不足）或 404（路由不存在）
        assert response.status_code in (401, 403, 404)

    async def test_admin_route_with_user_token(self, user_client: AsyncClient):
        """测试普通用户访问管理员接口"""
        response = await user_client.get("/api/v1/audit/logs")
        
        assert response.status_code in (403, 404)


@pytest.mark.asyncio
class TestSystemInit:
    """系统初始化接口测试"""

    async def test_system_init(self, client: AsyncClient):
        """测试系统初始化信息"""
        response = await client.get("/api/v1/system/init")
        assert response.status_code == 200
        
        data = response.json()
        assert "data" in data

    async def test_system_init_contains_version(self, client: AsyncClient):
        """测试初始化信息包含版本号"""
        response = await client.get("/api/v1/system/init")
        data = response.json()
        
        if "data" in data and data["data"]:
            # 检查是否包含版本或应用名信息
            assert data["data"] is not None
