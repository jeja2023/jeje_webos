"""
API 认证端点集成测试
"""

import pytest
from httpx import AsyncClient


class TestAuthAPI:
    """认证 API 测试"""
    
    @pytest.mark.asyncio
    async def test_login_invalid_credentials(self, client: AsyncClient):
        """测试登录失败 - 无效凭据"""
        response = await client.post(
            "/api/v1/auth/login",
            json={
                "username": "nonexistent",
                "password": "wrongpassword"
            }
        )
        
        # 登录失败返回 401
        assert response.status_code == 401
    
    @pytest.mark.asyncio
    async def test_login_missing_fields(self, client: AsyncClient):
        """测试登录失败 - 缺少字段"""
        response = await client.post(
            "/api/v1/auth/login",
            json={"username": "testuser"}
        )
        
        # 验证错误返回 400 或 422
        assert response.status_code in [400, 422]
    
    @pytest.mark.asyncio
    async def test_me_without_token(self, client: AsyncClient):
        """测试获取当前用户 - 无令牌"""
        response = await client.get("/api/v1/auth/me")
        
        # 无令牌返回 401 或 403
        assert response.status_code in [401, 403]
    
    @pytest.mark.asyncio
    async def test_me_invalid_token(self, client: AsyncClient):
        """测试获取当前用户 - 无效令牌"""
        response = await client.get(
            "/api/v1/auth/me",
            headers={"Authorization": "Bearer invalid_token"}
        )
        
        # 无效令牌返回 401
        assert response.status_code == 401


class TestSystemAPI:
    """系统 API 测试"""
    
    @pytest.mark.asyncio
    async def test_system_init(self, client: AsyncClient):
        """测试系统初始化接口"""
        response = await client.get("/api/v1/system/init")
        
        assert response.status_code == 200
        data = response.json()
        # 检查响应格式
        assert "code" in data or "data" in data
        if "data" in data:
            assert "app_name" in data["data"]
    
    @pytest.mark.asyncio
    async def test_system_modules_without_auth(self, client: AsyncClient):
        """测试获取模块列表 - 需要管理员权限"""
        response = await client.get("/api/v1/system/modules")
        
        # 未授权返回 401 或 403
        assert response.status_code in [401, 403]


class TestHealthAPI:
    """健康检查 API 测试"""
    
    @pytest.mark.asyncio
    async def test_health_check(self, client: AsyncClient):
        """测试健康检查端点"""
        response = await client.get("/health")
        
        assert response.status_code == 200
        data = response.json()
        # 检查有状态字段
        assert "status" in data
    
    @pytest.mark.asyncio
    async def test_health_live(self, client: AsyncClient):
        """测试存活检查端点"""
        response = await client.get("/health/live")
        
        assert response.status_code == 200
        data = response.json()
        assert "status" in data
    
    @pytest.mark.asyncio
    async def test_health_ready(self, client: AsyncClient):
        """测试就绪检查端点"""
        response = await client.get("/health/ready")
        
        # 可能返回 200 或 503（取决于数据库连接状态）
        assert response.status_code in [200, 503]


class TestAPIResponse:
    """API 响应格式测试"""
    
    @pytest.mark.asyncio
    async def test_response_format(self, client: AsyncClient):
        """测试响应格式规范"""
        response = await client.get("/api/v1/system/init")
        
        data = response.json()
        
        # 检查标准响应格式
        assert "code" in data or "data" in data
    
    @pytest.mark.asyncio
    async def test_error_response(self, client: AsyncClient):
        """测试错误响应"""
        response = await client.get("/api/v1/nonexistent")
        
        # 不存在的路由返回 404
        assert response.status_code == 404
