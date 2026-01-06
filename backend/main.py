"""
JeJe WebOS - 主入口
基于FastAPI的微内核架构生态系统

增强功能：
- 速率限制中间件
- 请求日志中间件
- 安全响应头中间件
- 健康检查端点
- 标准化错误处理
- 模块生命周期管理
"""

import os
import logging
import traceback
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse

# 导入静态文件服务
from core.static_files import CachedStaticFiles, GzipMiddleware
from core.config import get_settings
from core.database import init_db, close_db
from core.bootstrap import init_admin_user
from core.loader import init_loader, get_module_loader
from core.events import event_bus, Events, Event
from core.cache import init_cache, close_cache

# 导入核心模块
from core.rate_limit import RateLimitMiddleware, init_rate_limiter
from core.middleware import RequestLoggingMiddleware, SecurityHeadersMiddleware
from core.errors import register_exception_handlers

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

# 减少第三方库的日志输出
logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
logging.getLogger("uvicorn.error").setLevel(logging.WARNING)
logging.getLogger("watchfiles.main").setLevel(logging.WARNING)
logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)

# 禁用 SQLAlchemy 警告（模型重复定义等）
import warnings
from sqlalchemy.exc import SAWarning
warnings.filterwarnings("ignore", category=SAWarning)

settings = get_settings()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    # ==================== 启动阶段 ====================
    # 获取最新配置（支持动态重载）
    current_settings = get_settings()
    logger.info(f"🚀 正在启动 {current_settings.app_name} v{current_settings.app_version}...")
    
    # 记录已加载的模块数量（模块已在应用创建后注册）
    from core.loader import get_module_loader
    loader = get_module_loader()
    if loader:
        loaded_count = len(loader.modules)
        logger.info(f"📦 已加载 {loaded_count} 个模块")


    
    # 0. 检查并自动生成 JWT 密钥（如果使用默认密钥）
    try:
        from utils.jwt_rotate import get_jwt_rotator
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
                    logger.info(f"   密钥已保存到配置文件，下次轮换: {result.get('next_rotate_time', 'N/A')}")
                    # 重新加载配置以使用新密钥
                    from core.config import reload_settings
                    reload_settings()
                    # 获取最新配置
                    current_settings = get_settings()
                else:
                    logger.warning(f"⚠️  密钥生成失败: {result.get('reason', '未知原因')}")
            except Exception as e:
                logger.error(f"❌ 自动生成 JWT 密钥失败: {e}")
                logger.error("   请检查配置文件权限或手动设置 JWT_SECRET")
    except Exception as e:
        logger.warning(f"⚠️  JWT 密钥自动生成检查失败: {e}")
    
    # 1. 初始化速率限制器
    init_rate_limiter()
    if current_settings.rate_limit_enabled:
        logger.info("✅ 速率限制中间件已启用")
    else:
        logger.info("ℹ️ 速率限制中间件已禁用")
    
    if current_settings.csrf_enabled:
        logger.info("✅ CSRF 防护中间件已启用")
    
    # 3. 初始化数据库
    await init_db()
    
    # 3.1 加载动态系统设置（覆盖默认配置）
    try:
        from routers.system_settings import load_settings_on_startup
        await load_settings_on_startup()
    except Exception as e:
        logger.warning(f"动态设置加载跳过: {e}")
    
    # 4. 运行模块安装钩子
    try:
        module_loader = get_module_loader()
        if module_loader:
            await module_loader.run_install_hooks()
    except Exception as e:
        logger.error(f"❌ 模块钩子执行失败: {e}")
    
    # 5. 初始化 Redis 缓存
    cache_ok = await init_cache()
    if not cache_ok:
        logger.warning("⚠️ Redis 缓存未启用")
    
    # 6. 初始化默认管理员账户（首次启动时）
    try:
        admin_result = await init_admin_user()
        if admin_result.get("created"):
            logger.warning(f"⚠️ 已创建默认管理员: {admin_result['username']} / {admin_result['password']}")
            logger.warning("   请尽快登录并修改密码！")
    except Exception as e:
        logger.error(f"❌ 初始化管理员失败: {e}")

    # 7. 初始化默认角色模板
    try:
        from core.bootstrap import ensure_default_roles
        await ensure_default_roles()
    except Exception as e:
        logger.error(f"❌ 初始化角色失败: {e}")
    
    # 8. 启动审计日志自动刷新任务
    from core.audit_utils import AuditLogger
    AuditLogger.start_auto_flush()
    logger.info("✅ 审计日志批量写入已启用")
    
    # 9. 初始化任务调度器
    from core.scheduler import get_scheduler
    from utils.jwt_rotate import get_jwt_rotator
    
    scheduler = get_scheduler()
    scheduler.start()
    
    # 9. 调度JWT密钥自动轮换（如果启用）
    current_settings = get_settings()  # 获取最新配置
    if current_settings.jwt_auto_rotate:
        async def check_jwt_rotation():
            """检查并执行JWT密钥轮换"""
            try:
                rotator = get_jwt_rotator()
                if rotator.should_rotate():
                    result = rotator.rotate_secret()
                    if result.get("rotated"):
                        logger.info(f"🔑 JWT密钥已自动轮换")
                        logger.info(f"   新密钥长度: {result.get('new_secret_length')} 字符")
                        logger.info(f"   下次轮换: {result.get('next_rotate_time', 'N/A')}")
                    else:
                        logger.debug(f"JWT密钥轮换检查: {result.get('reason', '无需轮换')}")
            except Exception as e:
                logger.error(f"❌ JWT密钥轮换失败: {e}")
        
        await scheduler.schedule_daily(
            check_jwt_rotation,
            hour=current_settings.jwt_rotate_check_hour,
            minute=current_settings.jwt_rotate_check_minute,
            name="JWT密钥轮换检查"
        )
        
        # 10. 调度JWT旧密钥自动清理（在轮换检查后1小时执行）
        async def check_jwt_cleanup():
            """检查并清理过期的旧JWT密钥"""
            try:
                rotator = get_jwt_rotator()
                if rotator.should_cleanup():
                    result = rotator.cleanup_old_secret()
                    if result.get("cleaned"):
                        logger.info(f"🧹 旧JWT密钥已自动清理")
                    else:
                        logger.debug(f"旧密钥清理检查: {result.get('reason', '无需清理')}")
            except Exception as e:
                logger.error(f"❌ 旧JWT密钥清理失败: {e}")
        
        # 清理任务在轮换检查后1小时执行
        cleanup_hour = (current_settings.jwt_rotate_check_hour + 1) % 24
        await scheduler.schedule_daily(
            check_jwt_cleanup,
            hour=cleanup_hour,
            minute=current_settings.jwt_rotate_check_minute,
            name="JWT旧密钥清理检查"
        )
        
        logger.info(f"✅ JWT密钥自动轮换已启用（检查时间: {current_settings.jwt_rotate_check_hour:02d}:{current_settings.jwt_rotate_check_minute:02d}）")
        logger.info(f"✅ JWT旧密钥自动清理已启用（检查时间: {cleanup_hour:02d}:{current_settings.jwt_rotate_check_minute:02d}）")
    
    # 10. 发布启动事件
    # 注册智能报告临时文件清理任务（每天凌晨2点执行）
    try:
        from modules.analysis.analysis_smart_report_service import SmartReportService
        async def cleanup_report_temp_files():
            """清理智能报告临时文件"""
            SmartReportService.cleanup_old_temp_files(days=7)
        
        await scheduler.schedule_daily(
            cleanup_report_temp_files,
            hour=2,
            minute=0,
            name="清理智能报告临时文件"
        )
        logger.info("✅ 已注册智能报告临时文件清理任务（每天 02:00 执行）")
    except Exception as e:
        logger.warning(f"⚠️  注册智能报告清理任务失败: {e}")
    
    # 11. 日程提醒推送任务（每分钟检查一次）
    try:
        from core.database import get_db_session
        from modules.schedule.schedule_services import ReminderService
        
        async def check_schedule_reminders():
            """检查并推送日程提醒"""
            try:
                async with get_db_session() as db:
                    # 获取待发送的提醒
                    reminders = await ReminderService.get_pending_reminders(db)
                    
                    for reminder in reminders:
                        try:
                            # 获取关联的日程信息
                            from modules.schedule.schedule_models import ScheduleEvent
                            from sqlalchemy import select
                            stmt = select(ScheduleEvent).where(ScheduleEvent.id == reminder.event_id)
                            result = await db.execute(stmt)
                            event = result.scalar_one_or_none()
                            
                            if event and not event.is_deleted:
                                # 构建提醒消息
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
                                
                                # 通过 WebSocket 推送给用户
                                from core.ws_manager import manager as ws_manager
                                await ws_manager.send_personal_message(message, event.user_id)
                                logger.debug(f"📅 已推送日程提醒: {event.title} -> 用户 {event.user_id}")
                            
                            # 标记提醒已发送
                            await ReminderService.mark_reminder_sent(db, reminder.id)
                        except Exception as e:
                            logger.error(f"推送单个提醒失败: {e}")
                            
            except Exception as e:
                logger.error(f"检查日程提醒失败: {e}")
        
        await scheduler.schedule_periodic(
            check_schedule_reminders,
            interval_seconds=60,  # 每分钟检查一次
            name="日程提醒推送"
        )
        logger.info("✅ 已注册日程提醒推送任务（每 60 秒检查）")
    except Exception as e:
        logger.warning(f"⚠️  注册日程提醒任务失败: {e}")
    
    await event_bus.publish(Event(name=Events.SYSTEM_STARTUP, source="kernel"))
    
    logger.info(f"🎉 {current_settings.app_name} 启动完成! 访问: http://localhost:8000")
    
    yield

    # ==================== 关闭阶段 ====================
    logger.info("🛑 系统关闭中...")
    await scheduler.stop()
    
    # 停止审计日志自动刷新并写入剩余日志
    from core.audit_utils import AuditLogger
    await AuditLogger.stop_auto_flush()
    
    await event_bus.publish(Event(name=Events.SYSTEM_SHUTDOWN, source="kernel"))
    await close_cache()
    await close_db()
    logger.info("👋 系统已关闭")


# ==================== 创建应用 ====================
app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="基于微内核架构的个人平台系统",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json"
)


# ==================== 中间件配置（顺序重要，后添加的先执行） ====================

# 1. CORS 跨域配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境应限制为具体域名
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

# 1.5 Gzip 压缩中间件
app.add_middleware(GzipMiddleware, minimum_size=500, compresslevel=6)


# 2. 安全响应头中间件
app.add_middleware(SecurityHeadersMiddleware)

# 3. 请求日志中间件
app.add_middleware(
    RequestLoggingMiddleware,
    skip_paths=["/health", "/api/docs", "/api/redoc", "/api/openapi.json", "/static/"],
    slow_request_threshold=1.0  # 超过1秒的请求记录为慢请求
)

# 4. 速率限制中间件（可配置关闭）
if settings.rate_limit_enabled:
    app.add_middleware(RateLimitMiddleware)

# 5. 审计日志中间件（自动记录用户操作）
from core.middleware import AuditMiddleware
app.add_middleware(
    AuditMiddleware,
    audit_all_methods=settings.audit_all_operations  # 记录所有操作（包括查看）
)

# 6. CSRF 防护中间件（可选，默认关闭）
if settings.csrf_enabled:
    from core.csrf import CSRFMiddleware
    app.add_middleware(CSRFMiddleware)

# 7. 流式响应路径中间件（纯 ASGI 中间件，必须最后添加以最先执行）
# 这个中间件会捕获流式响应路径（如 AI 聊天），避免 BaseHTTPMiddleware 的兼容性问题
from core.middleware import StreamingPathMiddleware
app.add_middleware(StreamingPathMiddleware)


# ==================== 异常处理器 ====================
register_exception_handlers(app)

from fastapi.exceptions import HTTPException as StarletteHTTPException

# 全局未捕获异常处理
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """全局异常捕获"""
    # 如果是 HTTPException，不在这里处理，让 FastAPI 默认处理器处理
    if isinstance(exc, StarletteHTTPException):
        raise exc
    
    # 处理 "No response returned" 运行时错误
    # 这通常发生在流式响应（如 AI chat）时客户端断开连接
    if isinstance(exc, RuntimeError) and str(exc) == "No response returned.":
        path = request.url.path
        if path.startswith("/api/v1/ai/chat"):
            logger.debug(f"[客户端断开] {request.method} {path} (GlobalExceptionHandler)")
        else:
            logger.info(f"[客户端断开] {request.method} {path} (GlobalExceptionHandler)")
        from fastapi import Response
        return Response(status_code=499)
    
    logger.error(f"未处理异常: {exc}\n路径: {request.url.path}\n方法: {request.method}\n{traceback.format_exc()}")
    return JSONResponse(
        status_code=500,
        content={
            "code": 1000,
            "message": "服务器内部错误，请稍后重试",
            "data": None
        }
    )



# ==================== 加载模块路由 ====================
from core.loader import init_loader

# 初始化加载器并加载所有模块
# 这里的 load_all 会注册所有路由和模型
_module_loader = init_loader(app)
_module_results = _module_loader.load_all()

# ==================== 注册系统路由 ====================
from routers import (
    auth, boot, user, system_settings, audit, roles,
    storage, backup, monitor, notification, websocket,
    import_export, announcement, market
)

# 核心业务模块已由 loader.py 自动加载

# 系统核心路由
app.include_router(auth.router)
app.include_router(boot.router)
app.include_router(user.router)
app.include_router(system_settings.router)
app.include_router(audit.router)
app.include_router(roles.router)

# 功能路由
app.include_router(storage.router)
app.include_router(backup.router)
app.include_router(monitor.router)
app.include_router(notification.router)
app.include_router(websocket.router)
app.include_router(import_export.router)
app.include_router(announcement.router)
app.include_router(market.router)

# 健康检查路由
from core.health_checker import router as health_router
app.include_router(health_router)


# 前端路径配置
FRONTEND_PATH = os.environ.get("FRONTEND_PATH", os.path.join(os.path.dirname(__file__), "..", "frontend"))

def _mount_static_resources(app: FastAPI):
    """挂载静态资源逻辑函数"""
    if os.path.exists(FRONTEND_PATH):
        # 挂载 CSS（带缓存控制）
        css_path = os.path.join(FRONTEND_PATH, "css")
        if os.path.exists(css_path):
            app.mount("/static/css", CachedStaticFiles(directory=css_path), name="css")
        
        # 挂载 JS（带缓存控制）
        js_path = os.path.join(FRONTEND_PATH, "js")
        if os.path.exists(js_path):
            app.mount("/static/js", CachedStaticFiles(directory=js_path), name="js")
        
        # 挂载 images（带缓存控制）
        images_path = os.path.join(FRONTEND_PATH, "images")
        if os.path.exists(images_path):
            app.mount("/static/images", CachedStaticFiles(directory=images_path), name="images")
            # 同时也挂载到 /images 以兼容前端请求
            app.mount("/images", CachedStaticFiles(directory=images_path), name="root_images")
        
        # 挂载 fonts（带缓存控制）
        fonts_path = os.path.join(FRONTEND_PATH, "fonts")
        if os.path.exists(fonts_path):
            app.mount("/static/fonts", CachedStaticFiles(directory=fonts_path), name="fonts")
        
        # 挂载 libs（第三方库：CKEditor、ECharts 等）
        libs_path = os.path.join(FRONTEND_PATH, "libs")
        if os.path.exists(libs_path):
            app.mount("/static/libs", CachedStaticFiles(directory=libs_path), name="libs")

    # 模块静态资源（挂载到 /static/{module_name}/）
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
    
    # 挂载公共存储目录 (用于离线地图瓦片等)
    storage_root = os.environ.get("STORAGE_PATH", os.path.join(os.path.dirname(__file__), "..", "storage"))
    if os.path.exists(storage_root):
        app.mount("/static/storage", CachedStaticFiles(directory=storage_root), name="static_storage")

# 挂载静态资源（必须在 SPA 回退路由之前）
_mount_static_resources(app)


# ==================== 根路由 ====================
@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    """浏览器自动请求的图标处理"""
    favicon_path = os.path.join(FRONTEND_PATH, "favicon.ico")
    if os.path.exists(favicon_path):
        return FileResponse(favicon_path)
    
    # 如果根目录没有，尝试使用 images 下的 logo
    logo_path = os.path.join(FRONTEND_PATH, "images/logo.jpg")
    if os.path.exists(logo_path):
        return FileResponse(logo_path)
        
    return HTTPException(status_code=404)


@app.get("/api/v1/map/tile-proxy", include_in_schema=False)
async def map_tile_proxy(url: str):
    """底图反向代理，解决前端网络拦截问题"""
    import httpx
    from fastapi import Response
    async with httpx.AsyncClient(follow_redirects=True) as client:
        try:
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
            logger.error(f"❌ 地图代理底层连接失败: {str(e)}, URL: {url}")
            return Response(status_code=502, content=f"Proxy Error: {str(e)}")

@app.get("/", include_in_schema=False)
async def root():
    """根路径返回前端页面"""
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
    """API 信息"""
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


# ==================== 注册前端 History 回退路由（必须放在所有业务路由之后） ====================
async def spa_history_fallback(full_path: str):
    """
    前端 History 路由回退：
    - 排除 /api 和 /static 等后端路径
    - 其他路径统一返回前端 index.html
    """
    ignore_prefixes = ("api/", "static/", "health", "favicon.ico", "robots.txt")
    if full_path.startswith(ignore_prefixes):
        raise HTTPException(status_code=404, detail="Not Found")
    
    index_path_local = os.path.join(FRONTEND_PATH, "index.html")
    if os.path.exists(index_path_local):
        return FileResponse(index_path_local)
    raise HTTPException(status_code=404, detail="Not Found")

app.add_api_route(
    "/{full_path:path}",
    spa_history_fallback,
    include_in_schema=False
)


# ==================== 启动入口 ====================
if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        reload_dirs=["backend"]
    )
