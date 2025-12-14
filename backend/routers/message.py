"""
信息系统路由
处理系统信息的创建、查询、标记已读等
"""

from typing import Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, and_, or_

from core.database import get_db
from core.security import get_current_user, require_admin, TokenData
from models.message import Message
from models.account import User
from schemas.message import (
    MessageInfo, MessageCreate, MessageUpdate, MessageListResponse
)
from schemas.response import success

router = APIRouter(prefix="/api/v1/message", tags=["信息系统"])


@router.post("")
async def create_message(
    data: MessageCreate,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    创建信息
    
    - 管理员可发送广播 (user_id=0)
    - 用户可通过 receiver_username 发送给特定用户
    """
    target_user_id = data.user_id

    # 通过用户名查找接收者
    if data.receiver_username:
        result = await db.execute(select(User).where(User.username == data.receiver_username))
        target_user = result.scalar_one_or_none()
        if not target_user:
            raise HTTPException(status_code=404, detail="接收用户不存在")
        target_user_id = target_user.id

    if target_user_id is None:
        raise HTTPException(status_code=400, detail="必须指定接收用户ID或用户名")

    if target_user_id == 0:
        # 发送给所有用户 (仅管理员)
        if current_user.role != 'admin':
            raise HTTPException(status_code=403, detail="权限不足")
            
        result = await db.execute(select(User.id))
        user_ids = [row[0] for row in result.all()]
        
        messages = []
        for uid in user_ids:
            # 不发给自己? admin发广播通常也发给自己以便确认
            message = Message(
                user_id=uid,
                sender_id=current_user.user_id,
                title=data.title,
                content=data.content,
                type=data.type,
                action_url=data.action_url
            )
            messages.append(message)
        
        db.add_all(messages)
        await db.commit()
        
        return success({"count": len(messages)}, f"已向 {len(messages)} 个用户发送信息")
    else:
        # 发送给指定用户
        # 允许发送给自己
        message = Message(
            user_id=target_user_id,
            sender_id=current_user.user_id,
            title=data.title,
            content=data.content,
            type=data.type,
            action_url=data.action_url
        )
        db.add(message)
        await db.commit()
        await db.refresh(message)
        
        return success(MessageInfo.model_validate(message).model_dump(), "信息已发送")


@router.get("")
async def list_messages(
    page: int = 1,
    size: int = 20,
    is_read: Optional[bool] = None,
    type: Optional[str] = None,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    获取当前用户的信息列表
    """
    # 构建查询
    query = select(Message).where(Message.user_id == current_user.user_id)
    
    if is_read is not None:
        query = query.where(Message.is_read == is_read)
    
    if type:
        query = query.where(Message.type == type)
    
    # 未读数量
    unread_query = select(func.count()).where(
        and_(
            Message.user_id == current_user.user_id,
            Message.is_read == False
        )
    )
    unread_result = await db.execute(unread_query)
    unread_count = unread_result.scalar_one()
    
    # 总数查询
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()
    
    # 分页查询
    query = query.order_by(desc(Message.created_at))
    query = query.offset((page - 1) * size).limit(size)
    
    result = await db.execute(query)
    messages = result.scalars().unique().all()
    
    items = []
    for msg in messages:
        item = MessageInfo.model_validate(msg)
        if msg.sender:
            item.sender_name = msg.sender.nickname or msg.sender.username
        else:
            item.sender_name = "系统通知"
        items.append(item)

    return success(
        MessageListResponse(
            items=items,
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
    获取未读信息数量
    """
    result = await db.execute(
        select(func.count()).where(
            and_(
                Message.user_id == current_user.user_id,
                Message.is_read == False
            )
        )
    )
    count = result.scalar_one()
    
    return success({"count": count})


@router.put("/{message_id}/read")
async def mark_as_read(
    message_id: int,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    标记信息为已读
    """
    result = await db.execute(
        select(Message).where(
            and_(
                Message.id == message_id,
                Message.user_id == current_user.user_id
            )
        )
    )
    message = result.scalar_one_or_none()
    
    if not message:
        raise HTTPException(status_code=404, detail="信息不存在")
    
    if not message.is_read:
        message.is_read = True
        message.read_at = datetime.now(timezone.utc)
        await db.commit()
    
    return success(MessageInfo.model_validate(message).model_dump(), "已标记为已读")


@router.put("/read-all")
async def mark_all_as_read(
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    标记所有信息为已读
    """
    result = await db.execute(
        select(Message).where(
            and_(
                Message.user_id == current_user.user_id,
                Message.is_read == False
            )
        )
    )
    messages = result.scalars().all()
    
    now = datetime.now(timezone.utc)
    for message in messages:
        message.is_read = True
        message.read_at = now
    
    await db.commit()
    
    return success({"count": len(messages)}, f"已标记 {len(messages)} 条信息为已读")


@router.delete("/{message_id}")
async def delete_message(
    message_id: int,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    删除信息
    """
    result = await db.execute(
        select(Message).where(
            and_(
                Message.id == message_id,
                Message.user_id == current_user.user_id
            )
        )
    )
    message = result.scalar_one_or_none()
    
    if not message:
        raise HTTPException(status_code=404, detail="信息不存在")
    
    await db.delete(message)
    await db.commit()
    
    return success(message="信息已删除")


@router.delete("")
async def delete_all_messages(
    is_read: Optional[bool] = None,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    删除所有信息（可筛选已读/未读）
    """
    query = select(Message).where(Message.user_id == current_user.user_id)
    
    if is_read is not None:
        query = query.where(Message.is_read == is_read)
    
    result = await db.execute(query)
    messages = result.scalars().all()
    
    for message in messages:
        await db.delete(message)
    
    await db.commit()
    
    return success({"count": len(messages)}, f"已删除 {len(messages)} 条信息")





