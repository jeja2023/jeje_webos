"""
应用生命周期管理
处理系统启动初始化（数据库、缓存、任务）和关闭时的资源清理
"""

import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI

from core.config import get_settings, reload_settings
from core.database import init_db, close_db, get_db_session
from core.cache import init_cache, close_cache, Cache
from core.bootstrap import init_admin_user, ensure_default_roles
from core.loader import get_module_loader
from core.events import event_bus, Events, Event
from core.scheduler import get_scheduler
from core.ws_manager import manager as ws_manager
from core.audit_utils import AuditLogger
from core.rate_limit import init_rate_limiter
from utils.jwt_rotate import get_jwt_rotator

logger = logging.getLogger(__name__)


async def warm_cache():
    """
    缓存预热：在启动时预加载热门数据到 Redis
    
    预热内容：
    - 系统设置
    - 角色权限列表
    - 近期公告（最近10条）
    """
    from models import UserGroup, SystemSetting
    from sqlalchemy import select
    
    async with get_db_session() as db:
        # 1. 预热角色权限
        roles_result = await db.execute(select(UserGroup))
        roles = roles_result.scalars().all()
        for role in roles:
            cache_key = f"role:permissions:{role.id}"
            await Cache.set(cache_key, role.permissions or [], expire=3600)
        logger.debug(f"预热角色权限: {len(roles)} 个")
        
        # 2. 预热系统设置
        settings_result = await db.execute(select(SystemSetting))
        settings = settings_result.scalars().all()
        settings_dict = {s.key: s.value for s in settings}
        await Cache.set("system:settings", settings_dict, expire=3600)
        logger.debug(f"预热系统设置: {len(settings)} 项")
        
        # 3. 预热近期公告
        try:
            from models import Announcement
            announcements_result = await db.execute(
                select(Announcement)
                .where(Announcement.is_published.is_(True))
                .order_by(Announcement.created_at.desc())
                .limit(10)
            )
            announcements = announcements_result.scalars().all()
            await Cache.set("announcements:recent", [
                {"id": a.id, "title": a.title, "priority": a.priority}
                for a in announcements
            ], expire=600)
            logger.debug(f"预热公告: {len(announcements)} 条")
        except Exception:
            # 公告模块可能未安装
            pass


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
    
    # CORS 安全配置检查（仅在 lifespan 中输出一次，避免 reload 模式重复）
    if current_settings.allow_origins == ["*"] and current_settings.auth_use_httponly_cookie:
        logger.warning(
            "⚠️ CORS allow_origins=['*'] 与 HttpOnly Cookie 认证不兼容，已自动禁用 allow_credentials。"
            "请在 .env 中设置 ALLOW_ORIGINS 为具体前端域名列表以启用 Cookie 认证。"
        )

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
    except FileNotFoundError:
        # Docker 环境中配置通过环境变量注入，不存在 .env 文件，密钥轮换不适用
        logger.debug("JWT 密钥轮换跳过: Docker 环境中无 .env 文件（密钥已通过环境变量配置）")
    except Exception as e:
        logger.warning(f"⚠️  JWT 密钥自动生成检查失败: {e}")
    
    # 3. 初始化基础设施
    init_rate_limiter()
    if current_settings.csrf_enabled:
        logger.info("✅ CSRF 防护中间件已启用")
        
    await init_db()
    
    # 3.1 加载动态系统设置
    try:
        # 延迟导入以避免循环依赖
        from routers.system_settings import load_settings_on_startup
        await load_settings_on_startup()
    except Exception as e:
        logger.warning(f"动态设置加载跳过: {e}")
    
    # 4. 执行模块安装钩子
    try:
        if loader:
            await loader.run_install_hooks()
            
        # 5. 注册事件处理器
        from core.event_handlers import register_event_handlers
        register_event_handlers()
        
    except Exception as e:
        logger.error(f"❌ 启动过程执行失败: {e}", exc_info=True)
    
    # 5. 初始化缓存
    if not await init_cache():
        # init_cache 内部已有详细日志，此处不再重复警告
        pass
    else:
        # 5.1 可选的缓存预热（通过环境变量控制）
        import os
        if os.environ.get("CACHE_WARM_ON_STARTUP", "").lower() in ("true", "1", "yes"):
            try:
                await warm_cache()
                logger.info("✅ 缓存预热完成")
            except Exception as e:
                logger.warning(f"⚠️ 缓存预热失败（已忽略）: {e}")
    
    # 6. 初始化默认数据（管理员与角色）
    try:
        admin_result = await init_admin_user()
        if admin_result.get("created"):
            logger.warning(f"⚠️ 已创建默认管理员: {admin_result['username']}（密码请查看 .env 中的 ADMIN_PASSWORD 配置）")
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
            from sqlalchemy import select as sa_select
            try:
                async with get_db_session() as db:
                    reminders = await ReminderService.get_pending_reminders(db)
                    for reminder in reminders:
                        try:
                            stmt = sa_select(ScheduleEvent).where(ScheduleEvent.id == reminder.event_id)
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
    
    # 8.3 自动备份调度任务
    try:
        # 延迟导入，避免循环依赖
        from utils.backup_executor import process_schedule_backups
        
        await scheduler.schedule_periodic(
            process_schedule_backups,
            interval_seconds=60, # 每分钟检查一次
            name="自动备份调度检查"
        )
        logger.info("✅ 自动备份调度任务已就绪")
    except Exception as e:
        logger.warning(f"⚠️ 注册自动备份任务失败: {e}")
    
    # 9. 发送启动完成事件
    await event_bus.publish(Event(name=Events.SYSTEM_STARTUP, source="kernel"))

    try:
        from utils.backup_executor import set_backup_notification_loop
        set_backup_notification_loop()
    except Exception as e:
        logger.debug(f"无法注册备份通知事件循环: {e}")
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
