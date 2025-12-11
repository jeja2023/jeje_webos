"""
通知系统路由
处理系统通知的创建、查询、标记已读等
"""

from typing import Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, and_, or_

from core.database import get_db
from core.security import get_current_user, require_admin, TokenData
from models.notification import Notification
from models.account import User
from schemas.notification import (
    NotificationInfo, NotificationCreate, NotificationUpdate, NotificationListResponse
)
from schemas.response import success

router = APIRouter(prefix="/api/v1/notifications", tags=["通知系统"])


@router.post("")
async def create_notification(
    data: NotificationCreate,
    current_user: TokenData = Depends(require_admin()),
    db: AsyncSession = Depends(get_db)
):
    """
    创建通知
    
    仅系统管理员可执行
    如果 user_id 为 0，则发送给所有用户
    """
    if data.user_id == 0:
        # 发送给所有用户
        result = await db.execute(select(User.id))
        user_ids = [row[0] for row in result.all()]
        
        notifications = []
        for user_id in user_ids:
            notification = Notification(
                user_id=user_id,
                title=data.title,
                content=data.content,
                type=data.type,
                action_url=data.action_url
            )
            notifications.append(notification)
        
        db.add_all(notifications)
        await db.commit()
        
        return success({"count": len(notifications)}, f"已向 {len(notifications)} 个用户发送通知")
    else:
        # 发送给指定用户
        notification = Notification(
            user_id=data.user_id,
            title=data.title,
            content=data.content,
            type=data.type,
            action_url=data.action_url
        )
        db.add(notification)
        await db.commit()
        await db.refresh(notification)
        
        return success(NotificationInfo.model_validate(notification).model_dump(), "通知已创建")


@router.get("")
async def list_notifications(
    page: int = 1,
    size: int = 20,
    is_read: Optional[bool] = None,
    type: Optional[str] = None,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    获取当前用户的通知列表
    """
    # 构建查询
    query = select(Notification).where(Notification.user_id == current_user.user_id)
    
    if is_read is not None:
        query = query.where(Notification.is_read == is_read)
    
    if type:
        query = query.where(Notification.type == type)
    
    # 未读数量
    unread_query = select(func.count()).where(
        and_(
            Notification.user_id == current_user.user_id,
            Notification.is_read == False
        )
    )
    unread_result = await db.execute(unread_query)
    unread_count = unread_result.scalar_one()
    
    # 总数查询
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()
    
    # 分页查询
    query = query.order_by(desc(Notification.created_at))
    query = query.offset((page - 1) * size).limit(size)
    
    result = await db.execute(query)
    notifications = result.scalars().all()
    
    return success(
        NotificationListResponse(
            items=[NotificationInfo.model_validate(n) for n in notifications],
            total=total,
            unread_count=unread_count,
            page=page,
            size=size
        ).model_dump()
    )


@router.get("/unread-count")
async def get_unread_count(
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    获取未读通知数量
    """
    result = await db.execute(
        select(func.count()).where(
            and_(
                Notification.user_id == current_user.user_id,
                Notification.is_read == False
            )
        )
    )
    count = result.scalar_one()
    
    return success({"count": count})


@router.put("/{notification_id}/read")
async def mark_as_read(
    notification_id: int,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    标记通知为已读
    """
    result = await db.execute(
        select(Notification).where(
            and_(
                Notification.id == notification_id,
                Notification.user_id == current_user.user_id
            )
        )
    )
    notification = result.scalar_one_or_none()
    
    if not notification:
        raise HTTPException(status_code=404, detail="通知不存在")
    
    if not notification.is_read:
        notification.is_read = True
        notification.read_at = datetime.now(timezone.utc)
        await db.commit()
    
    return success(NotificationInfo.model_validate(notification).model_dump(), "已标记为已读")


@router.put("/read-all")
async def mark_all_as_read(
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    标记所有通知为已读
    """
    result = await db.execute(
        select(Notification).where(
            and_(
                Notification.user_id == current_user.user_id,
                Notification.is_read == False
            )
        )
    )
    notifications = result.scalars().all()
    
    now = datetime.now(timezone.utc)
    for notification in notifications:
        notification.is_read = True
        notification.read_at = now
    
    await db.commit()
    
    return success({"count": len(notifications)}, f"已标记 {len(notifications)} 条通知为已读")


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: int,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    删除通知
    """
    result = await db.execute(
        select(Notification).where(
            and_(
                Notification.id == notification_id,
                Notification.user_id == current_user.user_id
            )
        )
    )
    notification = result.scalar_one_or_none()
    
    if not notification:
        raise HTTPException(status_code=404, detail="通知不存在")
    
    await db.delete(notification)
    await db.commit()
    
    return success(message="通知已删除")


@router.delete("")
async def delete_all_notifications(
    is_read: Optional[bool] = None,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    删除所有通知（可筛选已读/未读）
    """
    query = select(Notification).where(Notification.user_id == current_user.user_id)
    
    if is_read is not None:
        query = query.where(Notification.is_read == is_read)
    
    result = await db.execute(query)
    notifications = result.scalars().all()
    
    for notification in notifications:
        await db.delete(notification)
    
    await db.commit()
    
    return success({"count": len(notifications)}, f"已删除 {len(notifications)} 条通知")





