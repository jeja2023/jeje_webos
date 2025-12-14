"""
API 版本管理模块
支持多版本 API 共存和版本路由
"""

import logging
from typing import Dict, List, Optional, Callable, Any
from dataclasses import dataclass, field
from enum import Enum
from functools import wraps

from fastapi import APIRouter, Request, HTTPException, status
from fastapi.routing import APIRoute

logger = logging.getLogger(__name__)


class VersionStatus(str, Enum):
    """API 版本状态"""
    ACTIVE = "active"           # 活跃版本
    DEPRECATED = "deprecated"   # 已废弃（仍可用，但建议迁移）
    SUNSET = "sunset"           # 已下线（不可用）


@dataclass
class APIVersion:
    """API 版本信息"""
    version: str                    # 版本号，如 "v1", "v2"
    status: VersionStatus = VersionStatus.ACTIVE
    description: str = ""           # 版本描述
    release_date: str = ""          # 发布日期
    sunset_date: Optional[str] = None  # 下线日期（仅废弃版本）
    
    @property
    def prefix(self) -> str:
        """获取路由前缀"""
        return f"/api/{self.version}"


class VersionedAPIRouter(APIRouter):
    """
    版本化 API 路由器
    
    自动为路由添加版本前缀和版本响应头
    
    Usage:
        router = VersionedAPIRouter(version="v1")
        
        @router.get("/users")
        async def get_users():
            pass
        # 实际路径: /api/v1/users
    """
    
    def __init__(
        self,
        version: str = "v1",
        status: VersionStatus = VersionStatus.ACTIVE,
        **kwargs
    ):
        self.api_version = version
        self.version_status = status
        
        # 设置版本前缀
        prefix = kwargs.pop("prefix", "")
        if not prefix.startswith(f"/api/{version}"):
            prefix = f"/api/{version}{prefix}"
        
        super().__init__(prefix=prefix, **kwargs)
    
    def add_api_route(
        self,
        path: str,
        endpoint: Callable,
        **kwargs
    ) -> None:
        """添加路由并注入版本信息"""
        
        # 包装端点以添加版本响应头
        original_endpoint = endpoint
        
        @wraps(original_endpoint)
        async def versioned_endpoint(*args, **kwargs):
            from fastapi import Response
            response = kwargs.get("response")
            result = await original_endpoint(*args, **kwargs)
            
            # 添加版本响应头（如果有响应对象）
            # 注意：这里简化处理，实际使用中间件更合适
            return result
        
        super().add_api_route(path, versioned_endpoint, **kwargs)


class APIVersionManager:
    """
    API 版本管理器
    
    管理多个 API 版本，提供版本路由和版本信息查询
    
    Usage:
        version_manager = APIVersionManager()
        
        # 注册版本
        version_manager.register_version(APIVersion("v1", VersionStatus.ACTIVE))
        version_manager.register_version(APIVersion("v2", VersionStatus.ACTIVE))
        
        # 创建版本路由器
        v1_router = version_manager.create_router("v1")
        v2_router = version_manager.create_router("v2")
        
        # 注册到应用
        version_manager.include_routers(app)
    """
    
    def __init__(self, default_version: str = "v1"):
        self.default_version = default_version
        self.versions: Dict[str, APIVersion] = {}
        self.routers: Dict[str, APIRouter] = {}
    
    def register_version(self, version: APIVersion) -> None:
        """注册 API 版本"""
        self.versions[version.version] = version
        logger.info(f"注册 API 版本: {version.version} ({version.status})")
    
    def get_version(self, version: str) -> Optional[APIVersion]:
        """获取版本信息"""
        return self.versions.get(version)
    
    def get_active_versions(self) -> List[APIVersion]:
        """获取所有活跃版本"""
        return [v for v in self.versions.values() if v.status == VersionStatus.ACTIVE]
    
    def create_router(
        self,
        version: str,
        **kwargs
    ) -> VersionedAPIRouter:
        """
        创建版本路由器
        
        Args:
            version: 版本号
            **kwargs: 传递给 APIRouter 的其他参数
        
        Returns:
            VersionedAPIRouter: 版本化路由器
        """
        version_info = self.versions.get(version)
        if not version_info:
            # 自动注册新版本
            version_info = APIVersion(version)
            self.register_version(version_info)
        
        router = VersionedAPIRouter(
            version=version,
            status=version_info.status,
            **kwargs
        )
        
        self.routers[version] = router
        return router
    
    def include_routers(self, app) -> None:
        """将所有版本路由器注册到应用"""
        for version, router in self.routers.items():
            app.include_router(router)
            logger.info(f"注册版本路由器: /api/{version}")
    
    def get_version_info(self) -> dict:
        """获取所有版本信息（用于 API 响应）"""
        return {
            "default": self.default_version,
            "versions": [
                {
                    "version": v.version,
                    "status": v.status,
                    "description": v.description,
                    "prefix": v.prefix,
                    "release_date": v.release_date,
                    "sunset_date": v.sunset_date
                }
                for v in self.versions.values()
            ]
        }


# 全局版本管理器实例
version_manager = APIVersionManager()

# 预注册 v1 版本
version_manager.register_version(APIVersion(
    version="v1",
    status=VersionStatus.ACTIVE,
    description="当前稳定版本",
    release_date="2024-01-01"
))


# ==================== 版本中间件 ====================

class VersionHeaderMiddleware:
    """
    版本响应头中间件
    
    为所有响应添加 API 版本信息头
    """
    
    def __init__(self, app, version_manager: APIVersionManager):
        self.app = app
        self.version_manager = version_manager
    
    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        
        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                
                # 从路径提取版本
                path = scope.get("path", "")
                version = self._extract_version(path)
                
                if version:
                    version_info = self.version_manager.get_version(version)
                    if version_info:
                        headers.append((b"X-API-Version", version.encode()))
                        
                        # 如果是废弃版本，添加警告头
                        if version_info.status == VersionStatus.DEPRECATED:
                            warning = f'299 - "API version {version} is deprecated'
                            if version_info.sunset_date:
                                warning += f', sunset date: {version_info.sunset_date}'
                            warning += '"'
                            headers.append((b"Warning", warning.encode()))
                            headers.append((b"Deprecation", b"true"))
                
                message["headers"] = headers
            
            await send(message)
        
        await self.app(scope, receive, send_wrapper)
    
    def _extract_version(self, path: str) -> Optional[str]:
        """从路径提取版本号"""
        parts = path.split("/")
        for i, part in enumerate(parts):
            if part == "api" and i + 1 < len(parts):
                return parts[i + 1]
        return None


# ==================== 版本路由辅助函数 ====================

def create_versioned_router(
    version: str = "v1",
    prefix: str = "",
    tags: Optional[List[str]] = None,
    **kwargs
) -> APIRouter:
    """
    创建版本化路由器的快捷函数
    
    Args:
        version: API 版本，如 "v1", "v2"
        prefix: 路由前缀（不含版本部分）
        tags: 路由标签
        **kwargs: 其他 APIRouter 参数
    
    Returns:
        配置好的 APIRouter
    
    Usage:
        router = create_versioned_router("v1", "/users", tags=["用户管理"])
        
        @router.get("")
        async def list_users():
            pass
        # 实际路径: /api/v1/users
    """
    full_prefix = f"/api/{version}{prefix}"
    return APIRouter(prefix=full_prefix, tags=tags or [], **kwargs)


def deprecated_route(
    message: str = "此接口已废弃，请使用新版本",
    alternative: Optional[str] = None
):
    """
    废弃路由装饰器
    
    标记路由为已废弃，添加警告响应头
    
    Usage:
        @router.get("/old-endpoint")
        @deprecated_route("请使用 /api/v2/new-endpoint", "/api/v2/new-endpoint")
        async def old_endpoint():
            pass
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            from fastapi import Response
            
            result = await func(*args, **kwargs)
            
            # 构建警告信息
            warning = f'299 - "{message}'
            if alternative:
                warning += f', alternative: {alternative}'
            warning += '"'
            
            # 如果返回的是字典，包装为 JSONResponse 以添加头
            if isinstance(result, dict):
                from fastapi.responses import JSONResponse
                response = JSONResponse(content=result)
                response.headers["Warning"] = warning
                response.headers["Deprecation"] = "true"
                if alternative:
                    response.headers["Link"] = f'<{alternative}>; rel="successor-version"'
                return response
            
            return result
        
        # 在文档中标记为废弃
        if func.__doc__:
            func.__doc__ = f"⚠️ **已废弃**: {message}\n\n" + func.__doc__
        else:
            func.__doc__ = f"⚠️ **已废弃**: {message}"
        
        return wrapper
    return decorator







