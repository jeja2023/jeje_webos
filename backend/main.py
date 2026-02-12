"""
JeJe WebOS - 主入口
基于 FastAPI 的微内核架构生态系统

功能特性：
- 模块化生命周期管理
- 标准化中间件栈（速率限制、日志、安全头等）
- 统一的异常处理机制
- 动态配置与静态资源服务
- 自动化任务调度
"""

import os
import logging
import traceback
import warnings
import uvicorn
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, ORJSONResponse
from fastapi.exceptions import HTTPException as StarletteHTTPException

from core.errors import NotFoundException
from sqlalchemy.exc import SAWarning

# ==================== 核心模块导入 ====================
from core.config import get_settings
from core.lifespan import lifespan
from core.loader import init_loader, get_module_loader
from core.mounts import mount_static_resources

# ==================== 中间件与组件导入 ====================
from core.static_files import GzipMiddleware
from core.rate_limit import RateLimitMiddleware
from core.middleware import (
    RequestLoggingMiddleware, 
    SecurityHeadersMiddleware, 
    AuditMiddleware, 
    StreamingPathMiddleware
)
from core.errors import register_exception_handlers
from core.health_checker import router as health_router

# ==================== 路由导入 ====================
from routers import (
    auth, boot, user, system_settings, audit, roles,
    storage, backup, monitor, notification, websocket,
    import_export, announcement, market
)

# CSRF 中间件按需导入
if get_settings().csrf_enabled:
    from core.csrf import CSRFMiddleware

# ==================== 全局配置与初始化 ====================

# 1. 配置基础日志格式
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# 2. 调整第三方库日志级别
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
logging.getLogger("uvicorn.error").setLevel(logging.WARNING)
logging.getLogger("watchfiles.main").setLevel(logging.WARNING)
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

# 3. 忽略 SQLAlchemy 的特定警告
warnings.filterwarnings("ignore", category=SAWarning)

# 4. 获取应用配置
settings = get_settings()

# 5. 定义常量
FRONTEND_PATH = os.environ.get("FRONTEND_PATH", os.path.join(os.path.dirname(__file__), "..", "frontend"))

# ==================== 应用初始化 ====================
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="基于微内核架构的个人平台系统",
    lifespan=lifespan,
    default_response_class=ORJSONResponse,
    docs_url="/api/docs" if settings.debug else None,
    redoc_url="/api/redoc" if settings.debug else None,
    openapi_url="/api/openapi.json" if settings.debug else None
)

# ==================== 中间件注册 ====================
# 注意：中间件按"后进先出"顺序执行，最后注册的中间件最先接收请求

# 1. 跨域与压缩 (最底层/通用)
# 安全措施：当 allow_origins=["*"] 时禁用 allow_credentials，防止任意网站劫持用户会话
_cors_credentials = settings.allow_origins != ["*"]
# 注意：CORS 配置警告在 lifespan 中输出（避免 reload 模式下重复打印）
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allow_origins, 
    allow_credentials=_cors_credentials,
    allow_methods=["*"],
    allow_headers=["*"]
)
app.add_middleware(GzipMiddleware, minimum_size=500, compresslevel=6)

# 2. 安全与日志
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    RequestLoggingMiddleware,
    skip_paths=["/health", "/api/docs", "/api/redoc", "/api/openapi.json", "/static/"],
    slow_request_threshold=1.0
)

# 3. 业务防护
if settings.rate_limit_enabled:
    app.add_middleware(RateLimitMiddleware)

app.add_middleware(
    AuditMiddleware,
    audit_all_methods=settings.audit_all_operations
)

if settings.csrf_enabled:
    app.add_middleware(CSRFMiddleware)

# 4. 特殊路径处理 (必须放在最后以优先执行)
# 用于处理流式响应请求（如 AI 聊天），规避 BaseHTTPMiddleware 限制
app.add_middleware(StreamingPathMiddleware)


# ==================== 异常处理 ====================
register_exception_handlers(app)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """全局未捕获异常处理"""
    # 让 FastAPI 原生处理 HTTPException
    if isinstance(exc, StarletteHTTPException):
        raise exc
    
    # 处理客户端在流式响应中途中断连接导致的错误
    if isinstance(exc, RuntimeError) and "No response returned" in str(exc):
        path = request.url.path
        log_msg = f"[客户端断开] {request.method} {path} (GlobalExceptionHandler)"
        if path.startswith("/api/v1/ai/chat"):
            logger.debug(log_msg)
        else:
            logger.info(log_msg)
        return Response(status_code=499)  # 客户端已关闭请求
    
    logger.error(f"未处理异常: {exc}\n路径: {request.url.path}\n方法: {request.method}\n{traceback.format_exc()}")
    return JSONResponse(
        status_code=500,
        content={
            "code": 1000,
            "message": "服务器内部错误，请稍后重试",
            "data": None
        }
    )

# ==================== 路由注册 ====================
# 1. 模块加载器路由 (自动加载所有模块的路由)
_module_loader = init_loader(app)
_module_results = _module_loader.load_all()

# 2. 系统核心路由
system_routers = [
    auth.router, boot.router, user.router, 
    system_settings.router, audit.router, roles.router
]
for router in system_routers:
    app.include_router(router)

# 3. 核心功能路由
feature_routers = [
    storage.router, backup.router, monitor.router,
    notification.router, websocket.router, import_export.router,
    announcement.router, market.router
]
for router in feature_routers:
    app.include_router(router)

# 4. 健康检查
app.include_router(health_router)


# ==================== 静态资源服务 ====================
mount_static_resources(app, FRONTEND_PATH)


# ==================== 辅助端点 ====================
@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    """Favicon 图标服务"""
    favicon_path = os.path.join(FRONTEND_PATH, "favicon.ico")
    if os.path.exists(favicon_path):
        return FileResponse(favicon_path)
    
    logo_path = os.path.join(FRONTEND_PATH, "images/logo.ico")
    if os.path.exists(logo_path):
        return FileResponse(logo_path)
    raise NotFoundException("资源")

@app.get("/manifest.json", include_in_schema=False)
async def manifest():
    """PWA Manifest"""
    path = os.path.join(FRONTEND_PATH, "manifest.json")
    if os.path.exists(path):
        return FileResponse(path, media_type="application/json")
    raise NotFoundException("资源")

@app.get("/sw.js", include_in_schema=False)
async def service_worker():
    """PWA Service Worker"""
    path = os.path.join(FRONTEND_PATH, "sw.js")
    if os.path.exists(path):
        # 从根目录提供 Service Worker 时，作用域自动为根路径
        return FileResponse(path, media_type="application/javascript")
    raise NotFoundException("资源")

@app.get("/", include_in_schema=False)
async def root():
    """入口页: 返回前端 Index 页面"""
    index_path = os.path.join(FRONTEND_PATH, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {
        "message": f"Welcome to {settings.app_name}",
        "version": settings.app_version,
        "docs": "/api/docs"
    }

@app.get("/api", include_in_schema=False)
async def api_info():
    """API 概览信息"""
    loader = get_module_loader()
    modules = loader.get_module_info_for_frontend() if loader else []
    
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "docs": "/api/docs",
        "health": "/health",
        "modules": [
            {"id": m["id"], "name": m["name"], "version": m["version"]}
            for m in modules
        ]
    }


# ==================== SPA 前端路由回退 ====================
async def spa_history_fallback(full_path: str):
    """
    SPA 路由回退处理 (History Mode Support)
    任何未匹配的后端路由都将返回前端 index.html，交由前端路由处理
    """
    # 忽略明显的后端或静态资源路径
    ignore_prefixes = ("api/", "static/", "health", "favicon.ico", "robots.txt")
    if full_path.startswith(ignore_prefixes):
        raise NotFoundException("资源")
    
    index_path_local = os.path.join(FRONTEND_PATH, "index.html")
    if os.path.exists(index_path_local):
        return FileResponse(index_path_local)
    raise NotFoundException("资源")

app.add_api_route(
    "/{full_path:path}",
    spa_history_fallback,
    include_in_schema=False
)


# ==================== 程序入口 ====================
if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        reload_dirs=["backend"]
    )
