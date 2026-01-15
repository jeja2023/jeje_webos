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
from contextlib import asynccontextmanager

import uvicorn
import httpx
from fastapi import FastAPI, Request, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from fastapi.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy.exc import SAWarning
from sqlalchemy import select

# ==================== 核心模块导入 ====================
from core.config import get_settings, reload_settings
from core.database import init_db, close_db, get_db_session
from core.cache import init_cache, close_cache
from core.bootstrap import init_admin_user, ensure_default_roles
from core.loader import init_loader, get_module_loader
from core.events import event_bus, Events, Event
from core.scheduler import get_scheduler
from core.ws_manager import manager as ws_manager
from core.audit_utils import AuditLogger

# ==================== 中间件与组件导入 ====================
from core.static_files import CachedStaticFiles, GzipMiddleware
from core.rate_limit import RateLimitMiddleware, init_rate_limiter
from core.middleware import (
    RequestLoggingMiddleware, 
    SecurityHeadersMiddleware, 
    AuditMiddleware, 
    StreamingPathMiddleware
)
if get_settings().csrf_enabled:
    from core.csrf import CSRFMiddleware
    
from core.errors import register_exception_handlers
from core.health_checker import router as health_router

# ==================== 路由导入 ====================
from routers import (
    auth, boot, user, system_settings, audit, roles,
    storage, backup, monitor, notification, websocket,
    import_export, announcement, market
)
from utils.jwt_rotate import get_jwt_rotator

# ==================== 日志与配置初始化 ====================
# 配置基础日志格式
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# 调整第三方库日志级别，减少干扰
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
logging.getLogger("uvicorn.error").setLevel(logging.WARNING)
logging.getLogger("watchfiles.main").setLevel(logging.WARNING)
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

# 忽略 SQLAlchemy 的特定警告
warnings.filterwarnings("ignore", category=SAWarning)

# 获取应用配置
settings = get_settings()

# ==================== 生命周期管理 ====================
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    应用生命周期管理器
    负责应用启动时的初始化任务和关闭时的资源清理
    """
    # -------------------- [启动阶段] --------------------
    # 1. 加载配置与模块信息
    current_settings = get_settings()
    logger.info(f"🚀 正在启动 {current_settings.app_name} v{current_settings.app_version}...")
    
    loader = get_module_loader()
    if loader:
        logger.info(f"📦 已加载 {len(loader.modules)} 个模块")

    # 2. JWT 密钥安全检查与自动轮换
    try:
        rotator = get_jwt_rotator()
        default_secrets = [
            "your-secret-key-change-in-production",
            "your-super-secret-key-change-this"
        ]
        if current_settings.jwt_secret in default_secrets:
            logger.warning("⚠️  检测到默认 JWT 密钥，正在自动生成强随机密钥...")
            try:
                result = rotator.rotate_secret(force=True, auto_generate=True)
                if result.get("rotated"):
                    logger.info(f"✅ JWT 密钥已自动生成（长度: {result.get('new_secret_length')} 字符）")
                    logger.info(f"   密钥已保存至配置文件，下次轮换: {result.get('next_rotate_time', 'N/A')}")
                    reload_settings() # 重新加载以应用新密钥
                    current_settings = get_settings()
                else:
                    logger.warning(f"⚠️  密钥生成失败: {result.get('reason', '未知原因')}")
            except Exception as e:
                logger.error(f"❌ 自动生成 JWT 密钥失败: {e}")
                logger.error("   请检查配置文件权限或手动设置 JWT_SECRET")
    except Exception as e:
        logger.warning(f"⚠️  JWT 密钥自动生成检查失败: {e}")
    
    # 3. 初始化基础设施
    init_rate_limiter()
    if current_settings.csrf_enabled:
        logger.info("✅ CSRF 防护中间件已启用")
        
    await init_db()
    
    # 3.1 加载动态系统设置
    try:
        from routers.system_settings import load_settings_on_startup
        await load_settings_on_startup()
    except Exception as e:
        logger.warning(f"动态设置加载跳过: {e}")
    
    # 4. 执行模块安装钩子
    try:
        if loader:
            await loader.run_install_hooks()
    except Exception as e:
        logger.error(f"❌ 模块钩子执行失败: {e}")
    
    # 5. 初始化缓存
    if not await init_cache():
        logger.warning("⚠️ Redis 缓存未启用")
    
    # 6. 初始化默认数据（管理员与角色）
    try:
        admin_result = await init_admin_user()
        if admin_result.get("created"):
            logger.warning(f"⚠️ 已创建默认管理员: {admin_result['username']} / {admin_result['password']}")
            logger.warning("   请务必尽快登录修改密码！")
    except Exception as e:
        logger.error(f"❌ 初始化管理员失败: {e}")

    try:
        await ensure_default_roles()
    except Exception as e:
        logger.error(f"❌ 初始化角色失败: {e}")
    
    # 7. 启动后台服务（审计日志、任务调度）
    AuditLogger.start_auto_flush()
    logger.info("✅ 审计日志批量写入已启用")
    
    scheduler = get_scheduler()
    scheduler.start()
    
    # 8. 注册周期性任务
    # 8.1 JWT 密钥自动轮换与清理
    if current_settings.jwt_auto_rotate:
        async def check_jwt_rotation():
            """任务：检查并执行JWT密钥轮换"""
            try:
                rotator_task = get_jwt_rotator()
                if rotator_task.should_rotate():
                    res = rotator_task.rotate_secret()
                    if res.get("rotated"):
                        logger.info(f"🔑 JWT密钥已自动轮换 (新长度: {res.get('new_secret_length')})")
                        logger.info(f"   下次轮换: {res.get('next_rotate_time', 'N/A')}")
                    else:
                        logger.debug(f"JWT轮换检查: {res.get('reason', '无需轮换')}")
            except Exception as e:
                logger.error(f"❌ JWT密钥轮换失败: {e}")
        
        await scheduler.schedule_daily(
            check_jwt_rotation,
            hour=current_settings.jwt_rotate_check_hour,
            minute=current_settings.jwt_rotate_check_minute,
            name="JWT密钥轮换检查"
        )
        
        async def check_jwt_cleanup():
            """任务：检查并清理旧JWT密钥"""
            try:
                rotator_task = get_jwt_rotator()
                if rotator_task.should_cleanup():
                    res = rotator_task.cleanup_old_secret()
                    if res.get("cleaned"):
                        logger.info(f"🧹 旧JWT密钥已自动清理")
            except Exception as e:
                logger.error(f"❌ 旧JWT密钥清理失败: {e}")
        
        # 清理任务安排在轮换检查后1小时
        cleanup_hour = (current_settings.jwt_rotate_check_hour + 1) % 24
        await scheduler.schedule_daily(
            check_jwt_cleanup,
            hour=cleanup_hour,
            minute=current_settings.jwt_rotate_check_minute,
            name="JWT旧密钥清理检查"
        )
        logger.info(f"✅ JWT密钥自动管理已启用 (轮换检查: {current_settings.jwt_rotate_check_hour:02d}:{current_settings.jwt_rotate_check_minute:02d})")
    
    # 8.2 日程提醒推送
    try:
        from modules.schedule.schedule_services import ReminderService
        from modules.schedule.schedule_models import ScheduleEvent
        
        async def check_schedule_reminders():
            """任务：检查并推送日程提醒"""
            try:
                async with get_db_session() as db:
                    reminders = await ReminderService.get_pending_reminders(db)
                    for reminder in reminders:
                        try:
                            stmt = select(ScheduleEvent).where(ScheduleEvent.id == reminder.event_id)
                            event = (await db.execute(stmt)).scalar_one_or_none()
                            
                            if event and not event.is_deleted:
                                message = {
                                    "type": "schedule_reminder",
                                    "data": {
                                        "event_id": event.id,
                                        "title": event.title,
                                        "start_date": event.start_date.isoformat() if event.start_date else None,
                                        "start_time": event.start_time.isoformat() if event.start_time else None,
                                        "location": event.location,
                                        "is_all_day": event.is_all_day,
                                        "remind_before_minutes": reminder.remind_before_minutes
                                    }
                                }
                                await ws_manager.send_personal_message(message, event.user_id)
                                logger.debug(f"📅 已推送提醒: {event.title} -> 用户 {event.user_id}")
                            
                            await ReminderService.mark_reminder_sent(db, reminder.id)
                        except Exception as inner_e:
                            logger.error(f"推送单个提醒失败: {inner_e}")
            except Exception as task_e:
                logger.error(f"检查日程提醒失败: {task_e}")
        
        await scheduler.schedule_periodic(
            check_schedule_reminders,
            interval_seconds=60,
            name="日程提醒推送"
        )
        logger.info("✅ 日程提醒任务已就绪")
    except Exception as e:
        logger.warning(f"⚠️ 注册日程提醒任务失败: {e}")
    
    # 9. 发送启动完成事件
    await event_bus.publish(Event(name=Events.SYSTEM_STARTUP, source="kernel"))
    logger.info(f"🎉 {current_settings.app_name} 启动完成! 访问: http://localhost:8000")
    
    yield
    
    # -------------------- [关闭阶段] --------------------
    logger.info("🛑 系统正在关闭...")
    await scheduler.stop()
    await AuditLogger.stop_auto_flush()
    await event_bus.publish(Event(name=Events.SYSTEM_SHUTDOWN, source="kernel"))
    await close_cache()
    await close_db()
    logger.info("👋 系统已安全关闭")


# ==================== 应用初始化 ====================
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="基于微内核架构的个人平台系统",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json"
)

# ==================== 中间件注册 ====================
# 注意：中间件按"后进先出"顺序执行，最后注册的中间件最先接收请求

# 1. 跨域与压缩 (最底层/通用)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 警告：生产环境应配置为具体域名
    allow_credentials=True,
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
    if isinstance(exc, RuntimeError) and str(exc) == "No response returned.":
        path = request.url.path
        log_msg = f"[客户端断开] {request.method} {path} (GlobalExceptionHandler)"
        if path.startswith("/api/v1/ai/chat"):
            logger.debug(log_msg)
        else:
            logger.info(log_msg)
        return Response(status_code=499) # Client Closed Request
    
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
FRONTEND_PATH = os.environ.get("FRONTEND_PATH", os.path.join(os.path.dirname(__file__), "..", "frontend"))

def _mount_static_resources(app: FastAPI):
    """配置并挂载静态资源目录"""
    if os.path.exists(FRONTEND_PATH):
        # 基础静态资源 (CSS, JS, Images, Fonts, Libs)
        # 统一设置缓存策略以提升性能
        static_dirs = {
            "css": "/static/css",
            "js": "/static/js",
            "images": "/static/images",
            "fonts": "/static/fonts",
            "libs": "/static/libs"
        }
        
        for dir_name, mount_path in static_dirs.items():
            dir_path = os.path.join(FRONTEND_PATH, dir_name)
            if os.path.exists(dir_path):
                app.mount(mount_path, CachedStaticFiles(directory=dir_path), name=dir_name)
        
        # 兼容性挂载: /images -> /static/images
        images_path = os.path.join(FRONTEND_PATH, "images")
        if os.path.exists(images_path):
            app.mount("/images", CachedStaticFiles(directory=images_path), name="root_images")
            
    # 模块化静态资源: /static/{module}/
    modules_path = os.path.join(os.path.dirname(__file__), "modules")
    if os.path.exists(modules_path):
        for module_name in os.listdir(modules_path):
            if module_name.startswith("_"):
                continue
            module_static = os.path.join(modules_path, module_name, "static")
            if os.path.isdir(module_static):
                app.mount(
                    f"/static/{module_name}",
                    CachedStaticFiles(directory=module_static),
                    name=f"static_{module_name}"
                )
    
    # 公共存储目录: /static/storage
    storage_root = os.environ.get("STORAGE_PATH", os.path.join(os.path.dirname(__file__), "..", "storage"))
    if os.path.exists(storage_root):
        app.mount("/static/storage", CachedStaticFiles(directory=storage_root), name="static_storage")

_mount_static_resources(app)


# ==================== 辅助端点 ====================
@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    """Favicon 图标服务"""
    favicon_path = os.path.join(FRONTEND_PATH, "favicon.ico")
    if os.path.exists(favicon_path):
        return FileResponse(favicon_path)
    
    logo_path = os.path.join(FRONTEND_PATH, "images/logo.jpg")
    if os.path.exists(logo_path):
        return FileResponse(logo_path)
    return HTTPException(status_code=404)

@app.get("/api/v1/map/tile-proxy", include_in_schema=False)
async def map_tile_proxy(url: str):
    """
    地图瓦片反向代理
    解决前端跨域或 HTTP/HTTPS 混合加载限制
    """
    # 这里的 httpx 导入在此处是为了按需加载
    async with httpx.AsyncClient(follow_redirects=True) as client:
        try:
            # 模拟浏览器 UA
            headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"}
            resp = await client.get(url, timeout=10.0, headers=headers)
            if resp.status_code != 200:
                logger.error(f"⚠️ 地图瓦片抓取异常: HTTP {resp.status_code}, URL: {url}")
            return Response(
                content=resp.content,
                status_code=resp.status_code,
                media_type="image/png"
            )
        except Exception as e:
            logger.error(f"❌ 地图代理连接失败: {str(e)}, URL: {url}")
            return Response(status_code=502, content=f"Proxy Error: {str(e)}")

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
        raise HTTPException(status_code=404, detail="资源不存在")
    
    index_path_local = os.path.join(FRONTEND_PATH, "index.html")
    if os.path.exists(index_path_local):
        return FileResponse(index_path_local)
    raise HTTPException(status_code=404, detail="资源不存在")

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
