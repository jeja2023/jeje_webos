"""
用户组（权限模板）管理
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

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
    # 取出所有用户，用于计算各组成员数
    users_res = await db.execute(select(User.id, User.role_ids))
    user_rows = users_res.all()

    result = await db.execute(select(UserGroup))
    roles = result.scalars().all()

    role_list = []
    for r in roles:
        count = 0
        for uid, role_ids in user_rows:
            if role_ids and r.id in role_ids:
                count += 1
        data = UserGroupInfo.model_validate(r).model_dump()
        data["user_count"] = count
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
    """获取属于某用户组的用户列表"""
    result = await db.execute(select(UserGroup).where(UserGroup.id == role_id))
    group = result.scalar_one_or_none()
    if not group:
        raise HTTPException(status_code=404, detail="用户组不存在")

    users_res = await db.execute(select(User).order_by(User.created_at.desc()))
    users = []
    for u in users_res.scalars().all():
        if u.role_ids and role_id in u.role_ids:
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
    result = await db.execute(select(UserGroup).where(UserGroup.id == role_id))
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="角色不存在")
    await db.execute(delete(UserGroup).where(UserGroup.id == role_id))
    await db.flush()
    await db.commit()
    return success(message="删除成功")


