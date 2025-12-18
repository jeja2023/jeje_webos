"""
用户管理路由
用户列表、审核、管理
"""

import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func

from core.database import get_db
from core.security import get_current_user, TokenData, require_admin, require_manager
from models import User
from schemas import UserAudit, UserListItem, UserUpdate, success, paginate
from schemas import success as _success
from models import Role, ModuleConfig
from core.security import require_permission

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/users", tags=["用户管理"])


@router.put("/profile")
async def update_profile(
    data: dict,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    更新当前用户的个人资料
    普通用户只能修改自己的昵称和手机号
    """
    result = await db.execute(select(User).where(User.id == current_user.user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    # 只允许修改昵称和手机号
    if "nickname" in data and data["nickname"]:
        user.nickname = data["nickname"]
        
    if "avatar" in data:
        user.avatar = data["avatar"]
    
    if "phone" in data:
        # 检查手机号是否被其他用户占用
        if data["phone"]:
            existing = await db.execute(
                select(User).where(User.phone == data["phone"], User.id != user.id)
            )
            if existing.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="该手机号已被其他用户使用")
        user.phone = data["phone"] or None

    if "settings" in data:
        # 合并更新用户设置
        # 确保 user.settings 是字典
        if user.settings is None:
            user.settings = {}
            
        if isinstance(data["settings"], dict):
            # 将新设置合并到旧设置
            new_settings = user.settings.copy()
            new_settings.update(data["settings"])
            user.settings = new_settings
            # 显式标记 JSON 字段为已修改，确保 SQLAlchemy 能够检测到变更
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(user, "settings")

    await db.commit()
    await db.refresh(user)
    
    return success({
        "id": user.id,
        "username": user.username,
        "nickname": user.nickname,
        "avatar": user.avatar,
        "phone": user.phone,
        "role": user.role,
        "settings": user.settings,
        "is_active": user.is_active
    }, "资料更新成功")


@router.get("")
async def list_users(
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=2000),
    role: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    keyword: Optional[str] = Query(None),
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    获取用户列表（管理员）
    支持分页、角色筛选、状态筛选、关键词搜索
    系统管理员可查看所有用户，业务管理员仅可查看非管理员用户
    """
    # 业务管理员只能查看普通用户和访客
    if current_user.role == "manager":
        # 业务管理员不能查看其他管理员
        query = select(User).where(User.role.not_in(["manager", "admin"]))
    elif current_user.role == "admin":
        # 系统管理员可以查看所有用户
        query = select(User)
    else:
        raise HTTPException(status_code=403, detail="仅管理员可访问")
    
    # 角色筛选
    if role:
        query = query.where(User.role == role)
    
    # 状态筛选
    if is_active is not None:
        query = query.where(User.is_active == is_active)
    
    # 关键词搜索（用户名、手机号）
    if keyword:
        keyword_filter = or_(
            User.username.like(f"%{keyword}%"),
            User.phone.like(f"%{keyword}%"),
            User.nickname.like(f"%{keyword}%")
        )
        query = query.where(keyword_filter)
    
    # 总数
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar()
    
    # 分页
    offset = (page - 1) * size
    query = query.order_by(User.created_at.desc()).offset(offset).limit(size)
    
    # 执行查询
    result = await db.execute(query)
    users = result.scalars().all()
    
    # 转换为响应格式
    items = [
        UserListItem(
            id=u.id,
            username=u.username,
            phone=u.phone,
            nickname=u.nickname,
            avatar=u.avatar,
            role=u.role,
            role_ids=u.role_ids or [],
            permissions=u.permissions or [],
            storage_quota=u.storage_quota,
            is_active=u.is_active,
            last_login=u.last_login,
            created_at=u.created_at
        )
        for u in users
    ]
    
    return paginate(items, total, page, size)


@router.get("/pending")
async def list_pending_users(
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    获取待审核用户列表（is_active=False）
    管理员可访问
    """
    # 检查是否为管理员
    if current_user.role not in ("manager", "admin"):
        raise HTTPException(status_code=403, detail="仅管理员可访问")
    result = await db.execute(
        select(User)
        .where(User.is_active == False)
        .order_by(User.created_at.asc())
    )
    users = result.scalars().all()
    
    items = [
        UserListItem(
            id=u.id,
            username=u.username,
            phone=u.phone,
            nickname=u.nickname,
            avatar=u.avatar,
            role=u.role,
            storage_quota=u.storage_quota,
            is_active=u.is_active,
            last_login=u.last_login,
            created_at=u.created_at
        )
        for u in users
    ]
    
    return success(items)


@router.put("/{user_id}/audit")
async def audit_user(
    user_id: int,
    data: UserAudit,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    审核用户（通过/拒绝）
    管理员可执行
    """
    # 检查是否为管理员
    if current_user.role not in ("manager", "admin"):
        raise HTTPException(status_code=403, detail="仅管理员可执行此操作")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    # 更新状态
    user.is_active = data.is_active
    
    await db.commit()
    await db.refresh(user)
    
    action = "通过" if data.is_active else "拒绝"
    message = f"用户审核{action}成功"
    if data.reason:
        message += f"，备注：{data.reason}"
    
    return success({
        "id": user.id,
        "username": user.username,
        "is_active": user.is_active
    }, message)


@router.put("/{user_id}/status")
async def toggle_user_status(
    user_id: int,
    is_active: bool,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    启用/禁用用户
    管理员可执行，但业务管理员不能操作其他管理员
    """
    # 检查是否为管理员
    if current_user.role not in ("manager", "admin"):
        raise HTTPException(status_code=403, detail="仅管理员可执行此操作")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    # 不能禁用自己
    if user.id == current_user.user_id:
        raise HTTPException(status_code=400, detail="不能禁用自己的账户")
    
    # 业务管理员不能操作其他管理员
    if current_user.role == "manager" and user.role in ("manager", "admin"):
        raise HTTPException(status_code=403, detail="业务管理员不能操作其他管理员账户")
    
    # 系统管理员也不能禁用其他系统管理员（保护机制）
    if user.role == "admin" and current_user.role != "admin":
        raise HTTPException(status_code=403, detail="不能禁用系统管理员账户")
    
    user.is_active = is_active
    await db.commit()
    
    action = "启用" if is_active else "禁用"
    return success({
        "id": user.id,
        "username": user.username,
        "is_active": user.is_active
    }, f"用户已{action}")


@router.put("/{user_id}/role")
async def update_role(
    user_id: int,
    role: str,
    current_user: TokenData = Depends(require_admin()),
    db: AsyncSession = Depends(get_db)
):
    """
    仅系统管理员可修改用户的基础角色字段。
    - 设置为 admin/manager 会同时赋予权限 ["*"]
    - 降级时保留已有权限（可再通过权限接口收紧）
    """
    if role not in ("admin", "manager", "user", "guest"):
        raise HTTPException(status_code=400, detail="角色无效")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    # 禁止修改自己为 guest
    if user.id == current_user.user_id and role == "guest":
        raise HTTPException(status_code=400, detail="不能将自身降级为访客")

    user.role = role
    if role in ("admin", "manager"):
        user.permissions = ["*"]
    await db.commit()
    return success({"id": user.id, "role": user.role, "permissions": user.permissions or []}, "角色已更新")


@router.delete("/{user_id}")
async def delete_user(
    user_id: int,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    删除用户
    """
    # 检查是否为系统管理员
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="仅系统管理员可执行此操作")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    # 不能删除自己
    if user.id == current_user.user_id:
        raise HTTPException(status_code=400, detail="不能删除自己的账户")
    
    # 不能删除系统管理员和业务管理员
    if user.role in ("admin", "manager"):
        raise HTTPException(status_code=400, detail="不能删除管理员账户")
    
    await db.delete(user)
    await db.commit()
    
    return success(message="用户已删除")


@router.put("/{user_id}/permissions")
async def update_permissions(
    user_id: int,
    payload: dict,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user)
):
    """
    更新用户权限（管理员）
    系统管理员可操作所有用户，业务管理员只能操作普通用户
    payload: {
        "module_access": ["blog","notes"],   # 勾选的模块可用范围（只能在用户组权限内收紧）
        "role_ids": [1,2],                   # 选择的用户组（权限模板）
        "specific_perms": ["notes.edit"]     # 细粒度权限（必须在用户组允许范围内，可用于收紧）
    }
    """
    # 检查是否为管理员
    if current_user.role not in ("manager", "admin"):
        raise HTTPException(status_code=403, detail="仅管理员可执行此操作")
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    # 业务管理员不能操作其他管理员
    if current_user.role == "manager" and user.role in ("manager", "admin"):
        raise HTTPException(status_code=403, detail="业务管理员不能操作其他管理员账户")

    module_access = payload.get("module_access") or []
    role_ids = payload.get("role_ids") or []
    specific_perms = payload.get("specific_perms")

    # 仅允许选择一个用户组（或不选）
    if len(role_ids) > 1:
        raise HTTPException(status_code=400, detail="用户组只能选择一个")

    # 拉取用户组（角色模板）
    groups = []
    if role_ids:
        res = await db.execute(select(Role).where(Role.id.in_(role_ids)))
        groups = res.scalars().all()

    # 汇总用户组的权限上限
    allowed_perms = set()
    group = groups[0] if groups else None
    if group and group.permissions:
        allowed_perms.update(group.permissions)
    group_name = group.name.lower() if group else None
    is_admin_group = group_name == "admin"
    is_manager_group = group_name == "manager"

    wildcard = "*" in allowed_perms
    allowed_modules = set()
    allowed_specific = set()
    if wildcard:
        allowed_modules = set(m.module_id for m in (await db.execute(select(ModuleConfig))).scalars().all())
    else:
        for p in allowed_perms:
            if p.endswith(".*"):
                allowed_modules.add(p.split(".")[0])
            elif "." in p:
                # 细粒度权限也开放对应模块
                allowed_modules.add(p.split(".")[0])
                allowed_specific.add(p)

    # 未选用户组时不允许直接赋予模块权限
    if not groups and module_access:
        raise HTTPException(status_code=400, detail="请先为用户选择用户组，再分配模块权限")

    # 校验用户勾选的模块是否在用户组允许范围内
    if module_access and not wildcard:
        invalid = [m for m in module_access if m not in allowed_modules]
        if invalid:
            raise HTTPException(status_code=400, detail=f"超出用户组权限的模块: {', '.join(invalid)}")

    # 校验细粒度权限（如 notes.edit），仅允许用户组选定范围
    selected_specific = allowed_specific.copy()
    if specific_perms is not None:
        specific_perms = set(specific_perms)
        # 对于 wildcard，可以允许在已声明的 specific 范围内收紧
        invalid_specific = specific_perms - (allowed_specific if allowed_specific else specific_perms if wildcard else set())
        if not wildcard and invalid_specific:
            raise HTTPException(status_code=400, detail=f"超出用户组权限的功能点: {', '.join(invalid_specific)}")
        # 如果是 wildcard 但未声明 specific，则允许选择空/任意（视为收紧到给定 specific）
        selected_specific = specific_perms

    # 选中的模块（默认勾选全部允许的模块，便于快速分配）
    selected_modules = module_access or (list(allowed_modules) if not wildcard else [])

    # 构建最终权限：模块权限（收紧后）+ 细粒度权限（可收紧）
    perms = []
    if wildcard and not selected_modules:
        perms.append("*")
    else:
        perms.extend([f"{m}.*" for m in selected_modules])

    if wildcard:
        # wildcard 时，如果未提供 specific_perms，则保留 allowed_specific；若提供，则按用户选择（收紧）
        if selected_specific:
            perms.extend(selected_specific)
    else:
        perms.extend(selected_specific)

    # 去重
    perms = list(dict.fromkeys(perms))

    user.permissions = perms
    user.role_ids = role_ids

    # 根据所选用户组同步基础角色：
    # admin 组 -> 系统管理员 (admin)
    # manager 组 -> 业务管理员 (manager)
    # user 组 -> 普通用户 (user)
    # guest 组 -> 访客 (guest)
    # 其他未知组 -> 保持原角色或降为 user
    if is_admin_group:
        user.role = "admin"
        user.permissions = ["*"]
    elif is_manager_group:
        user.role = "manager"
    elif group_name == "user":
        user.role = "user"
    elif group_name == "guest":
        user.role = "guest"
    else:
        # 未知用户组或未选择用户组，且原角色为管理级，则降为 user
        if user.role in ("manager", "admin"):
            user.role = "user"

    await db.commit()
    return success({"id": user.id, "permissions": perms}, "权限已更新")


@router.put("/{user_id}")
async def update_user(
    user_id: int,
    data: UserUpdate,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    更新用户信息（管理员）
    可以修改用户的昵称、手机号、头像、存储配额等
    """
    # 检查是否为管理员
    if current_user.role not in ("manager", "admin"):
        raise HTTPException(status_code=403, detail="仅管理员可执行此操作")
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    # 业务管理员不能操作其他管理员
    if current_user.role == "manager" and user.role in ("manager", "admin"):
        raise HTTPException(status_code=403, detail="业务管理员不能操作其他管理员账户")
    
    # 更新字段
    if data.nickname is not None:
        user.nickname = data.nickname
    
    if data.phone is not None:
        # 检查手机号是否被其他用户占用
        if data.phone:
            existing = await db.execute(
                select(User).where(User.phone == data.phone, User.id != user.id)
            )
            if existing.scalar_one_or_none():
                raise HTTPException(status_code=400, detail="该手机号已被其他用户使用")
        user.phone = data.phone
    
    if data.avatar is not None:
        user.avatar = data.avatar
    
    if data.storage_quota is not None:
        user.storage_quota = data.storage_quota
    
    await db.commit()
    await db.refresh(user)
    
    return success({
        "id": user.id,
        "username": user.username,
        "nickname": user.nickname,
        "phone": user.phone,
        "avatar": user.avatar,
        "storage_quota": user.storage_quota,
        "role": user.role,
        "is_active": user.is_active
    }, "用户信息已更新")


@router.post("")
async def create_user(
    data: dict,
    current_user: TokenData = Depends(require_admin()),
    db: AsyncSession = Depends(get_db)
):
    """
    管理员快速创建用户
    无需注册审核流程，直接创建已激活的用户
    """
    from core.security import hash_password
    import re
    
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()
    phone = data.get("phone", "").strip() or None
    nickname = data.get("nickname", "").strip() or username
    role = data.get("role", "user")
    
    # 参数验证
    if not username or len(username) < 3:
        raise HTTPException(status_code=400, detail="用户名至少3个字符")
    
    if not re.match(r'^[a-zA-Z][a-zA-Z0-9_]{2,19}$', username):
        raise HTTPException(status_code=400, detail="用户名只能包含字母、数字和下划线，且以字母开头")
    
    if not password or len(password) < 6:
        raise HTTPException(status_code=400, detail="密码至少6个字符")
    
    if role not in ("admin", "manager", "user", "guest"):
        raise HTTPException(status_code=400, detail="无效的角色")
    
    # 检查用户名是否已存在
    existing = await db.execute(select(User).where(User.username == username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="用户名已存在")
    
    # 检查手机号是否已存在
    if phone:
        existing_phone = await db.execute(select(User).where(User.phone == phone))
        if existing_phone.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="手机号已被使用")
    
    # 创建用户
    user = User(
        username=username,
        password_hash=hash_password(password),
        phone=phone,
        nickname=nickname,
        role=role,
        is_active=True,  # 管理员创建的用户直接激活
        permissions=["*"] if role in ("admin", "manager") else []
    )
    
    db.add(user)
    await db.commit()
    await db.refresh(user)
    
    return success({
        "id": user.id,
        "username": user.username,
        "nickname": user.nickname,
        "role": user.role,
        "is_active": user.is_active
    }, "用户创建成功")


@router.put("/{user_id}/password")
async def reset_password(
    user_id: int,
    data: dict,
    current_user: TokenData = Depends(require_admin()),
    db: AsyncSession = Depends(get_db)
):
    """
    管理员重置用户密码
    仅系统管理员可执行
    """
    from core.security import hash_password
    
    new_password = data.get("password", "").strip()
    
    if not new_password or len(new_password) < 6:
        raise HTTPException(status_code=400, detail="新密码至少6个字符")
    
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    
    # 不能重置超级管理员的密码（除非是自己）
    if user.role == "admin" and user.id != current_user.user_id:
        # 检查是否只有一个管理员（保护最后一个管理员）
        admin_count = await db.execute(
            select(func.count()).select_from(User).where(User.role == "admin")
        )
        if admin_count.scalar() <= 1:
            raise HTTPException(status_code=400, detail="不能重置唯一系统管理员的密码")
    
    user.password_hash = hash_password(new_password)
    await db.commit()
    
    return success({
        "id": user.id,
        "username": user.username
    }, f"用户 {user.username} 的密码已重置")
