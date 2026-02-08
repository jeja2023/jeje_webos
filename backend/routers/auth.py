"""
认证路由
用户登录、注册、令牌管理

安全增强：
- 登录接口：5次/分钟（防止暴力破解）
- 注册接口：3次/分钟（防止批量注册）
- 修改密码：3次/分钟
"""

import logging
from typing import Optional
from utils.timezone import get_beijing_time
from fastapi import APIRouter, Body, Depends, HTTPException, status, Request
from fastapi.responses import ORJSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.database import get_db
from core.security import (
    hash_password,
    verify_password,
    create_token_pair,
    decode_token,
    TokenData,
    get_current_user,
    COOKIE_ACCESS_TOKEN,
    COOKIE_REFRESH_TOKEN,
)
from core.events import event_bus, Events
from core.config import get_settings
from core.rate_limit import rate_limiter
from models import User, SystemLog, UserGroup
from schemas import UserCreate, UserLogin, PasswordChange, success
from pydantic import BaseModel

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/auth", tags=["认证"])

# 配置认证相关接口的速率限制
rate_limiter.configure_route("/api/v1/auth/login", requests=30, window=60, block_duration=300)  # 30次/分钟，防暴力破解依然有效
rate_limiter.configure_route("/api/v1/auth/register", requests=10, window=60, block_duration=600)  # 10次/分钟
rate_limiter.configure_route("/api/v1/auth/password", requests=10, window=60, block_duration=300)  # 10次/分钟


async def resolve_user_permissions(user: User, db: AsyncSession) -> list[str]:
    """获取用户最终权限：汇总直接权限与所属角色的全部权限（实现自动增减同步）。"""
    # 汇总直接权限
    perms = list(user.permissions or [])
    
    # 汇总角色关联的权限
    role_ids = user.role_ids or []
    if role_ids:
        role_result = await db.execute(select(UserGroup).where(UserGroup.id.in_(role_ids)))
        roles = role_result.scalars().all()
        for r in roles:
            if r.permissions:
                perms.extend(r.permissions)
    
    # 去重
    return list(set(perms))


@router.post("/register")
async def register(data: UserCreate, db: AsyncSession = Depends(get_db)):
    """用户注册"""
    # 检查用户名是否存在
    result = await db.execute(select(User).where(User.username == data.username))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="用户名已存在")
    
    # 检查手机号是否存在（手机号唯一）
    result = await db.execute(select(User).where(User.phone == data.phone))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="该手机号已被注册")
    
    # 获取 guest 用户组（用于默认分配）
    guest_group_id = None
    guest_res = await db.execute(select(UserGroup).where(UserGroup.name == "guest"))
    guest_group = guest_res.scalar_one_or_none()
    if guest_group:
        guest_group_id = guest_group.id

    # 创建用户（默认需要审核，is_active=False，角色=guest）
    user = User(
        username=data.username,
        password_hash=hash_password(data.password),
        phone=data.phone,
        nickname=data.nickname or data.username,
        role="guest",
        permissions=[],
        role_ids=[guest_group_id] if guest_group_id else [],
        is_active=False  # 新注册用户需要管理员审核
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    # 发布注册事件
    event_bus.emit(Events.USER_REGISTER, "auth", {"user_id": user.id})
    
    return success({"id": user.id}, "注册成功，请等待管理员审核")


@router.post("/login")
async def login(data: UserLogin, request: Request, db: AsyncSession = Depends(get_db)):
    """用户登录"""
    client_ip = request.client.host if request.client else "unknown"
    
    # 查找用户
    result = await db.execute(select(User).where(User.username == data.username))
    user = result.scalar_one_or_none()
    
    # 登录失败：统一返回“用户名或密码错误”，不区分用户是否存在，防止用户名枚举（安全最佳实践）
    if not user or not verify_password(data.password, user.password_hash):
        # 记录失败日志（安全审计）
        fail_log = SystemLog(
            level="WARNING",
            module="auth",
            action="login_failed",
            message=f"登录失败: 用户名或密码错误 (username: {data.username})",
            ip_address=client_ip
        )
        db.add(fail_log)
        await db.commit()
        logger.warning(f"登录失败 - IP: {client_ip}, 用户名: {data.username}")
        raise HTTPException(status_code=401, detail="用户名或密码错误")
    
    # 登录失败 - 账户未激活
    if not user.is_active:
        fail_log = SystemLog(
            level="WARNING",
            module="auth",
            action="login_blocked",
            message=f"登录被阻止: 账户未激活 (user_id: {user.id})",
            user_id=user.id,
            ip_address=client_ip
        )
        db.add(fail_log)
        await db.commit()
        logger.warning(f"登录被阻止 - IP: {client_ip}, 用户ID: {user.id}, 原因: 账户未激活")
        raise HTTPException(status_code=403, detail="账户尚未激活，请等待管理员审核")
    
    # 更新最后登录时间
    user.last_login = get_beijing_time()
    await db.commit()
    
    # 获取全量权限（直接权限 + 角色权限）
    permissions = await resolve_user_permissions(user, db)
    
    # 生成令牌对（访问令牌 + 刷新令牌）
    token_data = TokenData(
        user_id=user.id,
        username=user.username,
        role=user.role,
        permissions=permissions
    )
    access_token, refresh_token = create_token_pair(token_data)
    
    # 发布登录事件
    event_bus.emit(Events.USER_LOGIN, "auth", {"user_id": user.id})

    # 审计日志
    log = SystemLog(
        level="INFO",
        module="auth",
        action="login",
        message="用户登录成功",
        user_id=user.id,
        ip_address=request.client.host if request.client else None
    )
    db.add(log)
    await db.commit()
    
    settings = get_settings()
    body = success({
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
        "expires_in": settings.jwt_expire_minutes * 60,
        "refresh_expires_in": 30 * 24 * 60 * 60,  # 30天（秒）
        "use_http_only_cookie": settings.auth_use_httponly_cookie,
        "user": {
            "id": user.id,
            "username": user.username,
            "nickname": user.nickname,
            "avatar": user.avatar,
            "role": user.role,
            "permissions": user.permissions or [],
            "role_ids": user.role_ids or [],
            "settings": user.settings or {}
        }
    })
    if settings.auth_use_httponly_cookie:
        response = ORJSONResponse(content=body)
        access_max_age = settings.jwt_expire_minutes * 60
        refresh_max_age = 30 * 24 * 60 * 60
        response.set_cookie(
            COOKIE_ACCESS_TOKEN, access_token, max_age=access_max_age,
            httponly=True, secure=not settings.debug, samesite="lax", path="/"
        )
        response.set_cookie(
            COOKIE_REFRESH_TOKEN, refresh_token, max_age=refresh_max_age,
            httponly=True, secure=not settings.debug, samesite="lax", path="/"
        )
        return response
    return body


@router.get("/me")
async def get_me(
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取当前用户信息"""
    result = await db.execute(select(User).where(User.id == current_user.user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    return success({
        "id": user.id,
        "username": user.username,
        "phone": user.phone,
        "nickname": user.nickname,
        "avatar": user.avatar,
        "role": user.role,
        "permissions": user.permissions or [],
        "role_ids": user.role_ids or [],
        "is_active": user.is_active,
        "settings": user.settings or {},
        "created_at": user.created_at.isoformat() if user.created_at else None,
        "last_login": user.last_login.isoformat() if user.last_login else None
    })


@router.put("/password")
async def change_password(
    data: PasswordChange,
    request: Request,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """修改密码"""
    client_ip = request.client.host if request.client else "unknown"
    
    result = await db.execute(select(User).where(User.id == current_user.user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    if not verify_password(data.old_password, user.password_hash):
        # 记录密码修改失败日志
        fail_log = SystemLog(
            level="WARNING",
            module="auth",
            action="password_change_failed",
            message="密码修改失败: 原密码错误",
            user_id=current_user.user_id,
            ip_address=client_ip
        )
        db.add(fail_log)
        await db.commit()
        logger.warning(f"密码修改失败 - IP: {client_ip}, 用户ID: {current_user.user_id}, 原因: 原密码错误")
        raise HTTPException(status_code=400, detail="原密码错误")
    
    user.password_hash = hash_password(data.new_password)
    
    # 记录密码修改成功日志
    success_log = SystemLog(
        level="INFO",
        module="auth",
        action="password_change",
        message="密码修改成功",
        user_id=current_user.user_id,
        ip_address=client_ip
    )
    db.add(success_log)
    await db.commit()
    
    logger.info(f"密码修改成功 - 用户ID: {current_user.user_id}")
    return success(message="密码修改成功")


class RefreshTokenRequest(BaseModel):
    """刷新令牌请求（body 可选；HttpOnly Cookie 模式下可从 Cookie 读取）"""
    refresh_token: Optional[str] = None


@router.post("/refresh")
async def refresh_token(
    request: Request,
    data: RefreshTokenRequest = Body(default=RefreshTokenRequest()),
    db: AsyncSession = Depends(get_db)
):
    """
    刷新访问令牌
    使用刷新令牌获取新的访问令牌和刷新令牌；HttpOnly Cookie 模式下可从 Cookie 读取 refresh_token
    """
    settings = get_settings()
    refresh_token_str = None
    if data and data.refresh_token:
        refresh_token_str = data.refresh_token
    if not refresh_token_str and settings.auth_use_httponly_cookie:
        refresh_token_str = request.cookies.get(COOKIE_REFRESH_TOKEN)
    if not refresh_token_str:
        raise HTTPException(status_code=401, detail="无效的刷新令牌")

    token_data = decode_token(refresh_token_str, expected_type="refresh")
    if not token_data:
        raise HTTPException(status_code=401, detail="无效的刷新令牌")

    result = await db.execute(select(User).where(User.id == token_data.user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="用户不存在或已被禁用")

    permissions = await resolve_user_permissions(user, db)
    new_token_data = TokenData(
        user_id=user.id,
        username=user.username,
        role=user.role,
        permissions=permissions
    )
    new_access_token, new_refresh_token = create_token_pair(new_token_data)

    body = success({
        "access_token": new_access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer",
        "expires_in": settings.jwt_expire_minutes * 60,
        "refresh_expires_in": 30 * 24 * 60 * 60
    })
    if settings.auth_use_httponly_cookie:
        response = ORJSONResponse(content=body)
        response.set_cookie(
            COOKIE_ACCESS_TOKEN, new_access_token,
            max_age=settings.jwt_expire_minutes * 60,
            httponly=True, secure=not settings.debug, samesite="lax", path="/"
        )
        response.set_cookie(
            COOKIE_REFRESH_TOKEN, new_refresh_token,
            max_age=30 * 24 * 60 * 60,
            httponly=True, secure=not settings.debug, samesite="lax", path="/"
        )
        return response
    return body


@router.post("/logout")
async def logout(current_user: TokenData = Depends(get_current_user)):
    """登出（HttpOnly Cookie 模式下会清除 Cookie；否则客户端需自行清除令牌）"""
    event_bus.emit(Events.USER_LOGOUT, "auth", {"user_id": current_user.user_id})
    if get_settings().auth_use_httponly_cookie:
        response = ORJSONResponse(content=success(message="登出成功"))
        response.delete_cookie(COOKIE_ACCESS_TOKEN, path="/")
        response.delete_cookie(COOKIE_REFRESH_TOKEN, path="/")
        return response
    return success(message="登出成功")
