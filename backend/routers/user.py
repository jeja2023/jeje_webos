"""
用户管理路由
用户列表、审核、管理
"""

import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func, and_

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


@router.get("/search")
async def search_users(
    query: str = Query(..., min_length=1, description="搜索关键词"),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user)
):
    """
    公共用户搜索接口
    允许登录用户通过用户名或昵称搜索其他激活用户
    返回精简的公开信息
    """
    stmt = select(User).where(
        and_(
            User.is_active == True,
            or_(
                User.username.like(f"%{query}%"),
                User.nickname.like(f"%{query}%"),
                User.phone.like(f"%{query}%")
            )
        )
    ).limit(20)
    
    result = await db.execute(stmt)
    users = result.scalars().all()
    
    # 限制返回的数据，保护隐私
    items = [
        {
            "id": u.id,
            "username": u.username,
            "nickname": u.nickname,
            "avatar": u.avatar
        }
        for u in users
    ]
    
    from schemas.response import success as _success
    return _success(items)


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
    
    角色和权限的关系：
    - admin: 系统管理员，自动拥有 ["*"] 权限，权限不可被收紧
    - manager: 业务管理员，默认拥有 ["*"] 权限，但权限可以被收紧
    - user: 普通用户，权限由 permissions 字段决定
    - guest: 访客，默认无权限，权限由 permissions 字段决定
    
    注意：
    - 设置为 admin/manager 会同时赋予权限 ["*"]
    - 降级时保留已有权限（可再通过权限接口收紧）
    - 如果从 admin/manager 降级，建议通过权限接口重新分配权限
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
    # 设置 admin/manager 时，赋予所有权限
    # manager 的权限可以被收紧，但 admin 的权限在权限检查时始终通过
    if role in ("admin", "manager"):
        user.permissions = ["*"]
    # 降级为 user/guest 时，保留当前权限（可通过权限接口收紧）
    
    await db.commit()
    return success({
        "id": user.id, 
        "role": user.role, 
        "permissions": user.permissions or []
    }, "角色已更新")


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
    
    权限设计说明：
    - role 字段：快速标识用户类型（admin/manager/user/guest），用于权限检查的快速判断
    - permissions 字段：实际权限列表，支持通配符（*、module.*）和细粒度权限
    - role_ids 字段：关联的用户组ID，用于权限模板和权限上限
    
    权限分配规则：
    1. 选择用户组时：用户组提供权限上限，可以在此范围内收紧权限
    2. 不选择用户组时：可以直接设置权限（用于权限收紧），但必须基于用户当前权限或用户组权限
    3. admin/manager 角色：自动拥有 ["*"] 权限，但可以通过权限收紧限制
    
    payload: {
        "module_access": ["blog","notes"],   # 勾选的模块可用范围（在用户组权限内收紧）
        "role_ids": [1],                      # 选择的用户组（权限模板，只能选一个）
        "specific_perms": ["notes.update"]   # 细粒度权限（在用户组允许范围内收紧）
        "direct_permissions": ["blog.*"]     # 直接设置权限（用于权限收紧，可选）
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
    direct_permissions = payload.get("direct_permissions")  # 直接设置权限（用于权限收紧）

    # 仅允许选择一个用户组（或不选）
    if len(role_ids) > 1:
        raise HTTPException(status_code=400, detail="用户组只能选择一个")

    # 拉取用户组（角色模板）
    groups = []
    if role_ids:
        res = await db.execute(select(Role).where(Role.id.in_(role_ids)))
        groups = res.scalars().all()
        if not groups:
            raise HTTPException(status_code=404, detail="用户组不存在")

    group = groups[0] if groups else None
    group_name = group.name.lower() if group else None
    is_admin_group = group_name == "admin"
    is_manager_group = group_name == "manager"

    # 如果直接设置权限，优先使用直接权限（用于权限收紧）
    if direct_permissions is not None:
        # 验证直接权限是否合理
        direct_perms = set(direct_permissions)
        
        # 如果用户当前有用户组，验证直接权限是否在用户组权限范围内
        if group:
            allowed_perms = set(group.permissions)
            wildcard = "*" in allowed_perms
            
            if wildcard:
                # 用户组有通配符，允许任何权限收紧
                pass
            else:
                # 验证直接权限是否在用户组权限范围内
                allowed_modules = set()
                allowed_specific = set()
                for p in allowed_perms:
                    if p.endswith(".*"):
                        allowed_modules.add(p.split(".")[0])
                    elif "." in p:
                        allowed_modules.add(p.split(".")[0])
                        allowed_specific.add(p)
                
                # 检查直接权限是否超出用户组范围
                invalid_perms = []
                for perm in direct_perms:
                    if perm == "*":
                        # 通配符权限需要用户组也有通配符
                        if not wildcard:
                            invalid_perms.append(perm)
                    elif perm.endswith(".*"):
                        module = perm.split(".")[0]
                        if module not in allowed_modules and not wildcard:
                            invalid_perms.append(perm)
                    elif "." in perm:
                        if perm not in allowed_specific and not wildcard:
                            module = perm.split(".")[0]
                            if module not in allowed_modules:
                                invalid_perms.append(perm)
                
                if invalid_perms:
                    raise HTTPException(
                        status_code=400, 
                        detail=f"直接权限超出用户组权限范围: {', '.join(invalid_perms)}"
                    )
        
        # 使用直接权限
        perms = list(direct_perms)
    else:
        # 使用用户组权限模板
        if not group:
            raise HTTPException(status_code=400, detail="请选择用户组或提供直接权限")

        # 汇总用户组的权限上限
        allowed_perms = set(group.permissions)
        wildcard = "*" in allowed_perms
        
        allowed_modules = set()
        allowed_specific = set()
        if wildcard:
            # 通配符权限，获取所有已安装的模块
            allowed_modules = set(m.module_id for m in (await db.execute(select(ModuleConfig))).scalars().all())
        else:
            for p in allowed_perms:
                if p.endswith(".*"):
                    allowed_modules.add(p.split(".")[0])
                elif "." in p:
                    # 细粒度权限也开放对应模块
                    allowed_modules.add(p.split(".")[0])
                    allowed_specific.add(p)

        # 校验用户勾选的模块是否在用户组允许范围内
        if module_access and not wildcard:
            invalid = [m for m in module_access if m not in allowed_modules]
            if invalid:
                raise HTTPException(status_code=400, detail=f"超出用户组权限的模块: {', '.join(invalid)}")

        # 校验细粒度权限（如 notes.update），仅允许用户组选定范围
        selected_specific = allowed_specific.copy()
        if specific_perms is not None:
            specific_perms = set(specific_perms)
            # 对于 wildcard，可以允许在已声明的 specific 范围内收紧
            invalid_specific = specific_perms - (allowed_specific if allowed_specific else specific_perms if wildcard else set())
            if not wildcard and invalid_specific:
                raise HTTPException(status_code=400, detail=f"超出用户组权限的功能点: {', '.join(invalid_specific)}")
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

    # 根据用户组和权限同步 role 字段，确保一致性
    # 规则：
    # 1. admin 组 -> role="admin", permissions=["*"]（不可收紧）
    # 2. manager 组 -> role="manager", permissions 可收紧
    # 3. 如果权限是 ["*"]，且 role 不是 admin，则保持当前 role（可能是 manager）
    # 4. 其他情况根据用户组设置 role
    if is_admin_group:
        # admin 组强制拥有所有权限
        user.role = "admin"
        user.permissions = ["*"]
    elif is_manager_group:
        # manager 组可以收紧权限
        user.role = "manager"
        user.permissions = perms
    elif group:
        # 其他用户组
        if group_name == "user":
            user.role = "user"
        elif group_name == "guest":
            user.role = "guest"
        else:
            # 自定义用户组，保持原角色或降为 user
            if user.role in ("manager", "admin"):
                user.role = "user"
        user.permissions = perms
    else:
        # 未选择用户组，直接设置权限（权限收紧）
        # 保持当前 role，只更新 permissions
        user.permissions = perms
        # 如果权限被收紧为空或非通配符，且当前是管理角色，需要降级
        if user.role in ("admin", "manager") and "*" not in perms:
            # 权限被收紧，但保持 role（允许 manager 被收紧权限）
            pass

    user.role_ids = role_ids

    await db.commit()
    return success({
        "id": user.id, 
        "role": user.role,
        "permissions": user.permissions,
        "role_ids": user.role_ids
    }, "权限已更新")


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
