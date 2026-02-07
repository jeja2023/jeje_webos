"""
API 版本管理模块测试
"""

import pytest
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport
from core.versioning import APIVersionManager, APIVersion, VersionStatus, VersionHeaderMiddleware

class TestVersioning:
    """版本管理功能测试"""
    
    def test_register_and_get_version(self):
        """测试注册和获取版本"""
        manager = APIVersionManager()
        ver = APIVersion("v1")
        manager.register_version(ver)
        
        assert manager.get_version("v1") == ver
        assert len(manager.get_active_versions()) == 1
        
    def test_create_router(self):
        """测试创建版本路由"""
        manager = APIVersionManager()
        router = manager.create_router("v1")
        
        assert "v1" in manager.routers
        assert manager.get_version("v1") is not None
        
    def test_extract_version(self):
        """测试从路径提取版本号"""
        app = FastAPI()
        manager = APIVersionManager()
        middleware = VersionHeaderMiddleware(app, manager)
        
        assert middleware._extract_version("/api/v1/users") == "v1"
        assert middleware._extract_version("/api/v2/posts") == "v2"
        assert middleware._extract_version("/health") is None
        # 简单的实现只返回 'api' 之后的段，所以这里返回 'users'
        # assert middleware._extract_version("/api/users") == "users" 

    @pytest.mark.asyncio
    async def test_middleware_functional(self):
        """测试中间件功能（集成测试）"""
        app = FastAPI()
        manager = APIVersionManager()
        manager.register_version(APIVersion("v1"))
        
        # 手动添加中间件，因为我们正在构建 app
        app.add_middleware(VersionHeaderMiddleware, version_manager=manager)
        
        @app.get("/api/v1/test")
        async def test_endpoint():
            return {"ok": True}
            
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/v1/test")
            assert response.status_code == 200
            # httpx 中的 header 键对大小写不敏感，但如果可能的话检查精确的 header 或小写
            # FastAPI/Starlette 会将 header 转换为小写？
            assert "x-api-version" in response.headers
            assert response.headers["x-api-version"] == "v1"

    @pytest.mark.asyncio
    async def test_middleware_deprecated(self):
        """测试废弃版本警告头"""
        app = FastAPI()
        manager = APIVersionManager()
        manager.register_version(APIVersion("v1", status=VersionStatus.DEPRECATED, sunset_date="2025-01-01"))
        
        app.add_middleware(VersionHeaderMiddleware, version_manager=manager)
        
        @app.get("/api/v1/old")
        async def old_endpoint():
            return {"old": True}
            
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.get("/api/v1/old")
            assert response.status_code == 200
            assert "warning" in response.headers
            assert "deprecated" in response.headers["warning"]
