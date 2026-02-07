"""
系统引导路由
系统初始化、模块管理、系统信息
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text

from core.database import get_db
from core.security import get_current_user, get_optional_user, TokenData, require_admin, require_manager, decode_token
from core.config import get_settings, reload_settings
from core.loader import get_module_loader, CORE_MODULES
from core.rate_limit import get_rate_limiter
from core.csrf import generate_csrf_token
from core.changelog import get_changelog, get_latest_version, get_version_changes
from models import User, ModuleConfig, SystemLog, UserModule, UserGroup
from schemas import ModuleToggle, success
from utils.jwt_rotate import get_jwt_rotator
import logging

router = APIRouter(prefix="/api/v1/system", tags=["系统"])
logger = logging.getLogger(__name__)


@router.get("/init")
async def system_init(
    current_user: Optional[TokenData] = Depends(get_optional_user),
    db: AsyncSession = Depends(get_db)
):
    """
    系统初始化接口
    返回应用名称、版本、已安装模块列表和菜单结构
    前端启动时调用此接口
    """
    # 尝试解析用户
    user_info = None
    if current_user:
        result = await db.execute(select(User).where(User.id == current_user.user_id))
        user = result.scalar_one_or_none()
        if user and user.is_active:
            # 汇总权限：直接权限 + 角色权限（并集，实现自动增减同步）
            all_perms = list(user.permissions or [])
            if user.role_ids:
                role_result = await db.execute(select(UserGroup).where(UserGroup.id.in_(user.role_ids)))
                roles = role_result.scalars().all()
                for r in roles:
                    if r.permissions:
                        all_perms.extend(r.permissions)
            all_perms = list(set(all_perms))

            user_info = {
                "id": user.id,
                "username": user.username,
                "nickname": user.nickname,
                "avatar": user.avatar,
                "role": user.role,
                "permissions": all_perms,  # 返回最终确定的全量权限
                "role_ids": user.role_ids or [],
                "settings": user.settings or {}
            }
    
    # 获取已加载模块
    modules = []
    menus = []
    module_assets = []  # 模块前端资源
    loader = get_module_loader()
    
    # 获取用户的模块配置（普通用户使用）
    user_modules = {}
    if user_info and user_info.get("role") != "admin":
        user_id = user_info.get("id")
        
        # 1. 获取个性化模块安装状态
        if user_id:
            result = await db.execute(
                select(UserModule).where(
                    UserModule.user_id == user_id,
                    UserModule.installed == True
                )
            )
            user_modules = {um.module_id: um for um in result.scalars().all()}
    
    if loader:
        # perms 已经在 user_info["permissions"] 中汇总过一次，由于 system_init 内部 fetch 了 DB，这里直接用最新的
        perms = user_info.get("permissions") if user_info else []
        is_admin = bool(user_info and user_info.get("role") == "admin")
        for manifest in loader.get_loaded_modules():
            # 获取正确的启用状态（优先使用 state.enabled）
            state = loader.get_module_state(manifest.id)
            is_enabled = state.enabled if state else manifest.enabled
            
            # 权限判定：管理员全量；普通用户需模块权限且模块启用
            # 兼容性修复：确保权限列表中包含精确匹配的 module_id (例如 "im")
            has_perm = is_admin or ("*" in (perms or [])) or any(
                p == manifest.id or p.startswith(manifest.id + ".") for p in (perms or [])
            )
            
            # 用户级模块过滤（普通用户）
            # 逻辑：
            # 1. 如果是核心模块，始终可见
            # 2. 如果用户没有任何配置记录（新用户），则显示所有系统启用的模块
            # 3. 如果用户有配置记录，则遵从用户个人的安装/启用状态
            user_module_ok = True
            user_installed = True  # 默认为 True (针对新用户)
            user_enabled = True    # 默认为 True (针对新用户)
            
            is_core = manifest.id in CORE_MODULES or manifest.id in ['market', 'apps']
            
            if not is_admin and user_modules:
                user_mod = user_modules.get(manifest.id)
                if user_mod:
                    user_module_ok = user_mod.installed and user_mod.enabled
                    user_installed = user_mod.installed
                    user_enabled = user_mod.enabled
                else:
                    # 如果不是核心模块且用户未安装，则不显示
                    if not is_core:
                        user_module_ok = False
                        user_installed = False
                        user_enabled = False
            
            # 实际可见性判定条件
            visible_condition = is_admin or (has_perm and is_enabled and (user_module_ok or is_core))
            
            # 模块列表：普通用户只返回有权限且启用且用户已安装的模块；管理员返回全部
            if is_admin or (has_perm and is_enabled and (user_module_ok or is_core)):
                modules.append({
                    "id": manifest.id,
                    "name": manifest.name,
                    "version": manifest.version,
                    "description": manifest.description,
                    "icon": manifest.icon,
                    "enabled": is_enabled,       # 系统启用状态
                    "user_installed": user_installed, # 用户安装状态
                    "user_enabled": user_enabled,     # 用户启用状态
                    "router_prefix": manifest.router_prefix,
                    "menu": manifest.menu,
                    "visible": True,  # 标记可见
                    "assets": {
                        "css": manifest.assets.css if hasattr(manifest, 'assets') else [],
                        "js": manifest.assets.js if hasattr(manifest, 'assets') else []
                    }
                })
                # 收集需要加载的模块资源
                if is_enabled and hasattr(manifest, 'assets'):
                    if manifest.assets.css or manifest.assets.js:
                        module_assets.append({
                            "module_id": manifest.id,
                            "css": manifest.assets.css,
                            "js": manifest.assets.js
                        })
            else:
                # 普通用户无权限时不返回；管理员禁用模块仍返回以便管理
                if is_admin:
                    modules.append({
                        "id": manifest.id,
                        "name": manifest.name,
                        "version": manifest.version,
                        "description": manifest.description,
                        "icon": manifest.icon,
                        "enabled": is_enabled,
                        "user_installed": user_installed,
                        "user_enabled": user_enabled,
                        "router_prefix": manifest.router_prefix,
                        "menu": manifest.menu,
                        "visible": False,
                        "assets": {
                            "css": manifest.assets.css if hasattr(manifest, 'assets') else [],
                            "js": manifest.assets.js if hasattr(manifest, 'assets') else []
                        }
                    })
                # 非管理员且无权限 -> 完全不返回
            
            # 菜单：仅启用且有权限且用户已安装
            if is_enabled and manifest.menu and has_perm and user_module_ok:
                menus.append({
                    "module": manifest.id,
                    **manifest.menu
                })
    
    settings = get_settings()
    
    # 生成 CSRF Token（用于状态变更操作）
    csrf_token = await generate_csrf_token()
    
    # 获取版本更新信息
    from core.changelog import get_version_changes, get_latest_version
    latest_version_info = get_latest_version()
    version_changes = get_version_changes(settings.app_version)
    
    return success({
        "app_name": settings.app_name,
        "version": settings.app_version,
        "user": user_info,
        "modules": modules,
        "menus": menus,
        "module_assets": module_assets,  # 模块前端资源（CSS/JS）
        "csrf_token": csrf_token,  # CSRF Token（前端需要在请求头中携带）
        "version_info": {
            "current": settings.app_version,
            "latest": latest_version_info.get("version") if latest_version_info else settings.app_version,
            "has_updates": version_changes.get("has_updates", False),
            "changes": version_changes.get("changes", {})
        }
    })


@router.get("/modules")
async def list_modules(
    current_user: TokenData = Depends(require_manager())
):
    """获取所有已安装模块列表（管理员和业务管理员）"""
    loader = get_module_loader()
    if not loader:
        return success([])
    
    modules = []
    
    # 遍历所有已安装模块的状态
    for module_id in list(loader._states.keys()):
        state = loader._states[module_id]
        
        # 尝试从已加载的模块获取清单
        loaded = loader.modules.get(module_id)
        if loaded:
            manifest = loaded.manifest
        else:
            # 如果未加载，则读取清单文件
            manifest = loader.load_manifest(module_id)
            if not manifest:
                continue
        
        # 过滤核心模块
        if module_id in CORE_MODULES:
            continue
        
        modules.append({
            "id": module_id,
            "name": manifest.name,
            "version": manifest.version,
            "description": manifest.description,
            "icon": manifest.icon,
            "author": manifest.author,
            "enabled": state.enabled,
            "router_prefix": manifest.router_prefix,
            "menu": manifest.menu,
            "permissions": manifest.permissions,
            "health": "unknown"
        })
    
    return success(modules)


@router.get("/modules/{module_id}/health")
async def module_health(
    module_id: str,
    current_user: TokenData = Depends(require_admin()),
    db: AsyncSession = Depends(get_db)
):
    """模块健康检查（简单探测对应表是否可访问）"""
    loader = get_module_loader()
    if not loader:
        raise HTTPException(status_code=404, detail="模块未加载")
    manifest = next((m for m in loader.get_loaded_modules() if m.id == module_id), None)
    if not manifest:
        raise HTTPException(status_code=404, detail="模块不存在")

    status = "unknown"
    detail = ""
    try:
        if module_id == "blog":
            await db.execute(text("SELECT 1 FROM blog_posts LIMIT 1"))
            status = "ok"
        elif module_id == "notes":
            await db.execute(text("SELECT 1 FROM notes_notes LIMIT 1"))
            status = "ok"
        else:
            # 对未知模块，只返回启用状态
            status = "ok" if manifest.enabled else "disabled"
        detail = "probe success"
    except Exception as e:
        status = "error"
        detail = str(e)

    # 审计日志
    log = SystemLog(
        level="INFO" if status == "ok" else "ERROR",
        module="system",
        action="module.health_check",
        message=f"{module_id} health: {status} ({detail[:180]})",
        user_id=current_user.user_id
    )
    db.add(log)
    await db.commit()

    return success({"module_id": module_id, "enabled": manifest.enabled, "health": status, "detail": detail})


@router.put("/modules/{module_id}")
async def toggle_module(
    module_id: str,
    data: ModuleToggle,
    current_user: TokenData = Depends(require_admin()),
    db: AsyncSession = Depends(get_db)
):
    """启用/禁用模块"""
    # 更新数据库配置
    result = await db.execute(
        select(ModuleConfig).where(ModuleConfig.module_id == module_id)
    )
    config = result.scalar_one_or_none()
    
    if config:
        config.enabled = data.enabled
    else:
        config = ModuleConfig(module_id=module_id, enabled=data.enabled)
        db.add(config)
    
    # 同步更新 loader 状态
    # 同步更新 loader 状态
    loader = get_module_loader()
    if loader:
        if data.enabled:
            # 启用流程
            # 1. 先更新状态为启用 (否则 load_module 会因为 state.enabled=False 而拒绝加载)
            loader.set_module_enabled(module_id, True)
            
            # 2. 如果尚未加载到内存，先尝试加载
            if module_id not in loader.modules:
                if not loader.load_module(module_id):
                    # 如果加载失败，需要回滚状态
                    loader.set_module_enabled(module_id, False)
                    raise HTTPException(status_code=500, detail="加载模块代码失败")
            
            # 3. 更新已加载的 manifest 状态
            loaded = loader.modules.get(module_id)
            if loaded:
                loaded.manifest.enabled = True
                # 4. 调用 on_enable 钩子
                if loaded.manifest.on_enable:
                    try:
                        await loaded.manifest.on_enable()
                    except Exception as e:
                        logger.error(f"模块 {module_id} 启用钩子执行失败: {e}")
        else:
            # 禁用流程 (直接调用 loader 的 disable_module，它会处理钩子和状态)
            await loader.disable_module(module_id)

    # 记录审计日志
    log = SystemLog(
        level="INFO",
        module="system",
        action="module.toggle",
        message=f"模块 {module_id} -> {'已启用' if data.enabled else '已禁用'}",
        user_id=current_user.user_id,
    )
    db.add(log)

    await db.commit()
    
    logger.info(f"管理员 {current_user.username} {'启用' if data.enabled else '禁用'}系统模块 {module_id}")
    return success({
        "module_id": module_id,
        "enabled": data.enabled,
        "message": "已更新模块状态"
    })


@router.get("/stats")
async def system_stats(
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """系统统计信息（仪表盘用）"""
    from sqlalchemy import func
    
    # 用户数量（使用 COUNT 而不是加载所有用户到内存）
    result = await db.execute(select(func.count()).select_from(User))
    users = result.scalar() or 0
    
    # 模块数量
    loader = get_module_loader()
    module_count = len(loader.modules) if loader else 0
    
    settings = get_settings()
    
    # 基础统计（所有用户可见）
    stats = {
        "users": users,
        "modules": module_count,
        "version": settings.app_version
    }
    
    # 管理员额外统计
    if current_user.role in ["admin", "manager"]:
        # 待审核用户数
        pending_result = await db.execute(
            select(func.count()).select_from(User).where(User.is_active == False)
        )
        pending_users = pending_result.scalar() or 0
        stats["pending_users"] = pending_users
        
        # 待处理反馈数（如果反馈模块可用）
        try:
            from sqlalchemy import text
            feedback_result = await db.execute(
                text("SELECT COUNT(*) FROM feedback_feedback WHERE status = 'pending'")
            )
            pending_feedback = feedback_result.scalar() or 0
            stats["pending_feedback"] = pending_feedback
        except Exception:
            stats["pending_feedback"] = 0
        
        # 系统健康状态
        db_url_scheme = settings.db_url.split("://")[0] if "://" in settings.db_url else "sqlite"
        db_type = "SQLite"
        if "mysql" in db_url_scheme:
            db_type = "MySQL"
        elif "postgres" in db_url_scheme:
            db_type = "PostgreSQL"
            
        health = {
            "database": "ok",
            "db_type": db_type,
            "redis": "unknown"
        }
        
        # 检查 Redis
        try:
            from core.cache import _redis_client
            if _redis_client:
                await _redis_client.ping()
                health["redis"] = "ok"
            else:
                health["redis"] = "disabled"
        except Exception:
            health["redis"] = "error"
        
        stats["health"] = health
    
    # 普通用户统计（所有已登录用户可见）
    else:
        user_stats = {}
        
        # 笔记数量
        try:
            from sqlalchemy import text
            notes_result = await db.execute(
                text("SELECT COUNT(*) FROM notes_notes WHERE user_id = :uid"),
                {"uid": current_user.user_id}
            )
            user_stats["notes_count"] = notes_result.scalar() or 0
        except Exception:
            user_stats["notes_count"] = 0
        
        # 博客数量（如果博客模块可用）
        try:
            blogs_result = await db.execute(
                text("SELECT COUNT(*) FROM blog_posts WHERE author_id = :uid"),
                {"uid": current_user.user_id}
            )
            user_stats["blogs_count"] = blogs_result.scalar() or 0
        except Exception:
            user_stats["blogs_count"] = 0
        
        # 最近收藏的笔记
        try:
            starred_result = await db.execute(
                text("""
                    SELECT id, title, updated_at 
                    FROM notes_notes 
                    WHERE user_id = :uid AND is_starred = 1 
                    ORDER BY updated_at DESC 
                    LIMIT 5
                """),
                {"uid": current_user.user_id}
            )
            user_stats["recent_starred"] = [
                {"id": row[0], "title": row[1], "updated_at": row[2].isoformat() if row[2] else None}
                for row in starred_result.fetchall()
            ]
        except Exception:
            user_stats["recent_starred"] = []
        
        # 最近浏览的内容（基于笔记更新时间，因为没有单独的浏览记录表）
        try:
            recent_result = await db.execute(
                text("""
                    SELECT id, title, updated_at 
                    FROM notes_notes 
                    WHERE user_id = :uid 
                    ORDER BY updated_at DESC 
                    LIMIT 5
                """),
                {"uid": current_user.user_id}
            )
            user_stats["recent_notes"] = [
                {"id": row[0], "title": row[1], "updated_at": row[2].isoformat() if row[2] else None}
                for row in recent_result.fetchall()
            ]
        except Exception:
            user_stats["recent_notes"] = []
        
        stats["user_stats"] = user_stats
    
    return success(stats)


@router.get("/health")
async def health_check():
    """健康检查"""
    return {"status": "ok"}


@router.post("/jwt/rotate")
async def rotate_jwt_secret(
    current_user: TokenData = Depends(get_current_user),
    force: bool = False
):
    """
    手动轮换JWT密钥（无需重启服务）
    
    流程：
    1. 将当前密钥设为旧密钥
    2. 生成新密钥
    3. 重新加载配置
    4. 新旧密钥同时有效，旧Token仍可使用
    5. 新签发的Token使用新密钥
    6. 等待所有旧Token过期后，可移除旧密钥
    
    Args:
        force: 是否强制轮换（即使存在旧密钥）
    """
    # 检查是否为系统管理员
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="仅系统管理员可执行此操作")
    
    try:
        rotator = get_jwt_rotator()
        result = rotator.rotate_secret(force=force)
        
        if not result.get("rotated"):
            return success(result, "密钥无需轮换")
        
        return success(result, "密钥轮换成功")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"密钥轮换失败: {str(e)}")


@router.post("/jwt/cleanup")
async def cleanup_old_jwt_secret(
    current_user: TokenData = Depends(get_current_user)
):
    """
    清理旧JWT密钥（过渡期结束后）
    
    清理后旧Token将无法验证，请确保所有旧Token已过期
    """
    # 检查是否为系统管理员
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="仅系统管理员可执行此操作")
    
    try:
        rotator = get_jwt_rotator()
        result = rotator.cleanup_old_secret()
        return success(result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"清理失败: {str(e)}")
@router.post("/modules")
async def create_new_module(
    data: dict,
    current_user: TokenData = Depends(require_admin())
):
    """
    创建新模块（仅管理员）
    
    Args:
        data: {
            "id": "module_id",
            "name": "模块名称",
            "author": "作者"
        }
    """
    module_id = data.get("id")
    name = data.get("name")
    author = data.get("author", "JeJe WebOS")
    
    if not module_id or not name:
        raise HTTPException(status_code=400, detail="模块ID和名称不能为空")
    
    # 导入脚本函数
    try:
        from scripts.create_module import create_module
    except ImportError:
        raise HTTPException(status_code=500, detail="无法加载创建脚本")
    
    try:
        # 运行创建函数
        result = create_module(module_id, name, author=author, create_frontend=True, force=True)
        if result:
            return success(None, "模块创建成功，请重启后端服务以生效")
        else:
            raise HTTPException(status_code=500, detail="模块创建失败，请查看服务器日志")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"创建异常: {str(e)}")


@router.delete("/modules/{module_id}")
async def delete_existing_module(
    module_id: str,
    delete_db: bool = False,
    backup_db: bool = True,
    current_user: TokenData = Depends(require_admin())
):
    """
    删除模块（仅管理员）
    
    Args:
        module_id: 模块ID
        delete_db: 是否删除关联数据库表
        backup_db: 是否备份数据库表（仅在 delete_db=True 时有效）
    
    安全规则：
        - 核心模块不可删除
        - 已安装且启用的模块不可删除（必须先禁用并卸载）
    """
    if module_id in ["system", "user", "auth", "boot"]:
        raise HTTPException(status_code=400, detail="核心模块不可删除")
    
    # 安全检查：已安装的模块不能删除（无论启用还是禁用）
    loader = get_module_loader()
    if loader:
        state = loader.get_module_state(module_id)
        if state:
            raise HTTPException(
                status_code=400, 
                detail="该模块已安装，请先在「应用市场」中卸载后再删除"
            )
        
    try:
        from scripts.delete_module import delete_module_steps
    except ImportError:
        raise HTTPException(status_code=500, detail="无法加载删除脚本")
    
    try:
        # 运行删除函数
        result = delete_module_steps(
            module_id, 
            confirm=False, 
            delete_db=delete_db, 
            backup_db=backup_db
        )
        if result:
            msg = "模块删除成功，请重启后端服务"
            if delete_db:
                msg += " (关联数据表已清理)"
            return success(None, msg)
        else:
            raise HTTPException(status_code=500, detail="模块删除失败，请查看服务器日志")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"删除异常: {str(e)}")


@router.get("/rate-limit/stats")
async def get_rate_limit_stats(
    current_user: TokenData = Depends(require_admin())
):
    """
    获取速率限制统计信息
    
    仅系统管理员可访问
    """
    limiter = get_rate_limiter()
    stats = limiter.get_stats()
    blocked_ips = limiter.get_blocked_ips()
    
    return success({
        **stats,
        "blocked_ips": blocked_ips
    })


@router.post("/rate-limit/unblock/{ip}")
async def unblock_ip(
    ip: str,
    current_user: TokenData = Depends(require_admin()),
    db: AsyncSession = Depends(get_db)
):
    """
    解除指定IP的封禁状态
    
    仅系统管理员可访问
    """
    limiter = get_rate_limiter()
    success_flag = limiter.unblock_ip(ip)
    
    if success_flag:
        # 记录审计日志
        log = SystemLog(
            level="INFO",
            module="system",
            action="rate_limit.unblock",
            message=f"已解除IP {ip} 的封禁状态",
            user_id=current_user.user_id
        )
        db.add(log)
        await db.commit()
        
        return success({"ip": ip}, "已解除封禁")
    else:
        raise HTTPException(status_code=404, detail="该IP未被封禁或封禁已过期")


@router.post("/rate-limit/unblock-all")
async def unblock_all_ips(
    current_user: TokenData = Depends(require_admin()),
    db: AsyncSession = Depends(get_db)
):
    """
    解除所有IP的封禁状态
    
    仅系统管理员可访问
    """
    limiter = get_rate_limiter()
    count = limiter.unblock_all()
    
    # 记录审计日志
    log = SystemLog(
        level="INFO",
        module="system",
        action="rate_limit.unblock_all",
        message=f"已解除 {count} 个IP的封禁状态",
        user_id=current_user.user_id
    )
    db.add(log)
    await db.commit()
    
    return success({"count": count}, f"已解除 {count} 个IP的封禁状态")


@router.get("/changelog")
async def get_changelog_api(
    version: Optional[str] = None
):
    """
    获取版本更新日志
    
    Args:
        version: 指定版本号，如果为 None 则返回所有版本
    """
    changelog = get_changelog(version)
    return success(changelog)


@router.get("/changelog/latest")
async def get_latest_changelog():
    """获取最新版本信息和更新提示"""
    latest = get_latest_version()
    if not latest:
        return success(None)
    
    settings = get_settings()
    changes = get_version_changes(settings.app_version)
    
    return success({
        "latest": latest,
        "current": settings.app_version,
        "has_updates": changes.get("has_updates", False),
        "changes": changes.get("changes", {})
    })


