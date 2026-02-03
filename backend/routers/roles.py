"""
用户组（权限模板）管理
"""
import json
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, func, update as sql_update
from sqlalchemy.orm.attributes import flag_modified

from core.database import get_db
from core.security import require_permission, require_admin, require_manager, TokenData
from models import UserGroup, User
from schemas import UserGroupCreate, UserGroupUpdate, UserGroupInfo, success

router = APIRouter(prefix="/api/v1/roles", tags=["用户组"])  # 保持路径兼容


@router.get("")
async def list_roles(
    current_user: TokenData = Depends(require_manager()),
    db: AsyncSession = Depends(get_db)
):
    """
    获取所有用户组及其成员数
    性能优化：批量查询所有组的成员数，避免 N+1 查询
    """
    # 获取所有组
    result = await db.execute(select(UserGroup).order_by(UserGroup.id))
    roles = result.scalars().all()
    
    if not roles:
        return success([])
    
    # 批量统计所有组的成员数（一次查询）
    # 构建一个字典：role_id -> count
    role_ids = [r.id for r in roles]
    count_map = {rid: 0 for rid in role_ids}
    
    # 查询所有用户的 role_ids
    users_result = await db.execute(select(User.role_ids).where(User.role_ids.isnot(None)))
    for (user_role_ids,) in users_result.all():
        if user_role_ids:
            for rid in user_role_ids:
                if rid in count_map:
                    count_map[rid] += 1
    
    role_list = []
    for r in roles:
        data = UserGroupInfo.model_validate(r).model_dump()
        data["user_count"] = count_map.get(r.id, 0)
        role_list.append(data)

    return success(role_list)


@router.post("")
async def create_role(
    data: UserGroupCreate,
    current_user: TokenData = Depends(require_admin()),
    db: AsyncSession = Depends(get_db)
):
    # 重名检查
    exist = await db.execute(select(UserGroup).where(UserGroup.name == data.name))
    if exist.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="角色名称已存在")
    
    # admin 和 manager 用户组自动拥有所有权限
    permissions = data.permissions
    if data.name in ("admin", "manager"):
        permissions = ["*"]
    
    role = UserGroup(name=data.name, permissions=permissions)
    db.add(role)
    await db.commit()
    await db.refresh(role)
    return success(UserGroupInfo.model_validate(role).model_dump(), "创建成功")


@router.put("/{role_id}")
async def update_role(
    role_id: int,
    data: UserGroupUpdate,
    current_user: TokenData = Depends(require_admin()),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(UserGroup).where(UserGroup.id == role_id))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="角色不存在")
    
    # admin 和 manager 用户组始终拥有所有权限，不允许修改
    if role.name in ("admin", "manager"):
        if data.permissions is not None and data.permissions != ["*"]:
            # 强制设置为全权限
            role.permissions = ["*"]
    else:
        if data.name is not None:
            role.name = data.name
        if data.permissions is not None:
            role.permissions = data.permissions
    
    await db.commit()
    await db.refresh(role)
    return success(UserGroupInfo.model_validate(role).model_dump(), "更新成功")


@router.get("/{role_id}/users")
async def list_role_users(
    role_id: int,
    current_user: TokenData = Depends(require_manager()),
    db: AsyncSession = Depends(get_db)
):
    """获取属于某用户组的用户列表（已优化：使用数据库过滤）"""
    from sqlalchemy import func
    
    result = await db.execute(select(UserGroup).where(UserGroup.id == role_id))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="用户组不存在")

    # 使用数据库层面过滤 JSON 字段
    users_res = await db.execute(
        select(User)
        .where(func.json_contains(User.role_ids, str(role_id)))
        .order_by(User.created_at.desc())
    )
    
    users = []
    for u in users_res.scalars().all():
        users.append({
            "id": u.id,
            "username": u.username,
            "nickname": u.nickname,
            "role": u.role,
            "is_active": u.is_active,
            "created_at": u.created_at,
        })
    return success(users)


@router.delete("/{role_id}")
async def delete_role(
    role_id: int,
    current_user: TokenData = Depends(require_admin()),
    db: AsyncSession = Depends(get_db)
):
    """删除用户组，同时清理关联用户的 role_ids"""
    result = await db.execute(select(UserGroup).where(UserGroup.id == role_id))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="角色不存在")
    
    # 禁止删除系统内置组
    if role.name in ("admin", "manager", "user", "guest"):
        raise HTTPException(status_code=400, detail="不能删除系统内置用户组")
    
    # 清理关联用户的 role_ids（移除该组 ID）
    users_res = await db.execute(
        select(User).where(func.json_contains(User.role_ids, str(role_id)))
    )
    for user in users_res.scalars().all():
        if user.role_ids and role_id in user.role_ids:
            user.role_ids = [rid for rid in user.role_ids if rid != role_id]
            flag_modified(user, "role_ids")
    
    await db.execute(delete(UserGroup).where(UserGroup.id == role_id))
    await db.commit()
    return success(message="删除成功")


