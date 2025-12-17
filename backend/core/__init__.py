"""
JeJe WebOS 核心模块
提供框架的基础设施和通用功能

导出列表：
- 配置管理: get_settings, Settings
- 数据库: Base, get_db, async_session
- 安全认证: get_current_user, require_permission, require_admin, require_manager
- 缓存: Cache, get_cache, set_cache, delete_cache
- 事件系统: event_bus, Events, Event
- 模块加载: init_loader, get_module_loader, ModuleManifest
- 分页工具: paginate, PageResult, PaginationParams
- 错误处理: ErrorCode, AppException, success_response, error_response
- 健康检查: health_checker
"""

# 配置管理
from .config import get_settings, Settings, reload_settings

# 数据库
from .database import Base, get_db, async_session, init_db, close_db

# 安全认证
from .security import (
    get_current_user,
    require_permission,
    require_admin,
    require_manager,
    create_token,
    decode_token,
    hash_password,
    verify_password,
    TokenData
)

# 缓存
from .cache import Cache, get_cache, set_cache, delete_cache, init_cache, close_cache

# 事件系统
from .events import event_bus, Events, Event, EventBus

# 模块加载
from .loader import (
    init_loader,
    get_module_loader,
    ModuleManifest,
    ModuleAssets,
    LoadedModule
)

# 分页工具
from .pagination import (
    paginate,
    paginate_list,
    PageResult,
    PaginationParams,
    Paginator,
    create_page_response,
    get_pagination_params
)

# 错误处理
from .errors import (
    ErrorCode,
    AppException,
    ValidationException,
    AuthException,
    NotFoundException,
    PermissionException,
    BusinessException,
    success_response,
    error_response,
    register_exception_handlers
)

# 健康检查
from .health_checker import health_checker, HealthStatus

# 速率限制
from .rate_limit import rate_limiter, limit, init_rate_limiter, RateLimitMiddleware

# 中间件
from .middleware import (
    RequestLoggingMiddleware,
    SecurityHeadersMiddleware,
    RequestContextMiddleware
)

# API 版本管理
from .versioning import (
    version_manager,
    VersionedAPIRouter,
    create_versioned_router,
    deprecated_route,
    APIVersion,
    VersionStatus
)


__all__ = [
    # 配置
    "get_settings",
    "Settings",
    "reload_settings",
    
    # 数据库
    "Base",
    "get_db",
    "async_session",
    "init_db",
    "close_db",
    
    # 安全
    "get_current_user",
    "require_permission",
    "require_admin",
    "require_manager",
    "create_token",
    "decode_token",
    "hash_password",
    "verify_password",
    "TokenData",
    
    # 缓存
    "Cache",
    "get_cache",
    "set_cache",
    "delete_cache",
    "init_cache",
    "close_cache",
    
    # 事件
    "event_bus",
    "Events",
    "Event",
    "EventBus",
    
    # 模块
    "init_loader",
    "get_module_loader",
    "ModuleManifest",
    "ModuleAssets",
    "LoadedModule",
    
    # 分页
    "paginate",
    "paginate_list",
    "PageResult",
    "PaginationParams",
    "Paginator",
    "create_page_response",
    "get_pagination_params",
    
    # 错误
    "ErrorCode",
    "AppException",
    "ValidationException",
    "AuthException",
    "NotFoundException",
    "PermissionException",
    "BusinessException",
    "success_response",
    "error_response",
    "register_exception_handlers",
    
    # 健康检查
    "health_checker",
    "HealthStatus",
    
    # 速率限制
    "rate_limiter",
    "limit",
    "init_rate_limiter",
    "RateLimitMiddleware",
    
    # 中间件
    "RequestLoggingMiddleware",
    "SecurityHeadersMiddleware",
    "RequestContextMiddleware",
    
    # 版本管理
    "version_manager",
    "VersionedAPIRouter",
    "create_versioned_router",
    "deprecated_route",
    "APIVersion",
    "VersionStatus",
]
