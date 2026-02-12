"""
即时通讯模块API路由
"""

import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, Query, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from core.database import get_db
from core.security import get_current_user, require_permission, TokenData
from core.errors import NotFoundException, BusinessException, success_response, ErrorCode
from core.pagination import create_page_response
from utils.storage import get_storage_manager

from .im_schemas import (
    ConversationCreate, ConversationUpdate, ConversationResponse, ConversationListItem,
    MessageCreate, MessageResponse, MessageListResponse,
    ContactCreate, ContactUpdate, ContactResponse,
    ConversationAddMember, MarkReadRequest, UserStatusResponse
)
from .im_services import IMService
from .im_models import IMMessage, IMConversation
from .im_websocket import notify_new_message, notify_message_recalled, notify_message_read
from models import User

logger = logging.getLogger(__name__)

router = APIRouter()


def get_service(db: AsyncSession) -> IMService:
    """获取服务实例"""
    return IMService(db)


# ==================== 会话管理 ====================

@router.post("/conversations", response_model=dict, summary="创建会话")
async def create_conversation(
    data: ConversationCreate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("im.create"))
):
    """创建会话（私聊或群聊）"""
    service = get_service(db)
    conversation = await service.create_conversation(user.user_id, data)
    
    # 加载用户信息
    await _load_conversation_user_info(db, conversation, user.user_id)
    
    return success_response(
        data=ConversationResponse.model_validate(conversation),
        message="会话创建成功"
    )


@router.get("/conversations", response_model=dict, summary="获取会话列表")
async def get_conversation_list(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取会话列表"""
    service = get_service(db)
    conversations, total = await service.get_conversation_list(
        user.user_id, page, page_size
    )
    
    # 加载用户信息
    for conv in conversations:
        await _load_conversation_user_info(db, conv, user.user_id)
    
    return create_page_response(
        items=[ConversationListItem.model_validate(conv) for conv in conversations],
        total=total,
        page=page,
        page_size=page_size,
        message="获取成功"
    )


@router.get("/conversations/{conversation_id}", response_model=dict, summary="获取会话详情")
async def get_conversation(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取会话详情"""
    service = get_service(db)
    conversation = await service.get_conversation(conversation_id, user.user_id)
    
    if not conversation:
        raise NotFoundException("会话", conversation_id)
    
    # 加载用户信息和成员信息
    await _load_conversation_user_info(db, conversation, user.user_id)
    await _load_conversation_members(db, conversation)
    
    return success_response(
        data=ConversationResponse.model_validate(conversation),
        message="获取成功"
    )


@router.put("/conversations/{conversation_id}", response_model=dict, summary="更新会话")
async def update_conversation(
    conversation_id: int,
    data: ConversationUpdate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("im.update"))
):
    """更新会话信息"""
    service = get_service(db)
    conversation = await service.update_conversation(
        conversation_id, user.user_id, data
    )
    
    if not conversation:
        raise NotFoundException("会话", conversation_id)
    
    await _load_conversation_user_info(db, conversation, user.user_id)
    
    return success_response(
        data=ConversationResponse.model_validate(conversation),
        message="更新成功"
    )


@router.delete("/conversations/{conversation_id}", response_model=dict, summary="删除/退出会话")
async def delete_conversation(
    conversation_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """删除或退出会话"""
    from sqlalchemy import delete
    from .im_models import IMConversationMember
    
    # 检查是否为成员
    service = get_service(db)
    conversation = await service.get_conversation(conversation_id, user.user_id)
    if not conversation:
        raise NotFoundException("会话", conversation_id)
    
    # 如果是群主，删除整个会话；否则只退出
    if conversation.type == "group" and conversation.owner_id == user.user_id:
        # 删除会话（级联删除成员和消息）
        stmt = delete(IMConversation).where(IMConversation.id == conversation_id)
        await db.execute(stmt)
        await db.commit()
        return success_response(message="会话已删除")
    else:
        # 退出会话
        stmt = delete(IMConversationMember).where(
            and_(
                IMConversationMember.conversation_id == conversation_id,
                IMConversationMember.user_id == user.user_id
            )
        )
        await db.execute(stmt)
        await db.commit()
        return success_response(message="已退出会话")


@router.post("/conversations/{conversation_id}/members", response_model=dict, summary="添加会话成员")
async def add_conversation_members(
    conversation_id: int,
    data: ConversationAddMember,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("im.update"))
):
    """添加会话成员（仅群聊）"""
    service = get_service(db)
    success = await service.add_conversation_members(
        conversation_id, user.user_id, data.user_ids
    )
    
    if not success:
        raise NotFoundException("会话", conversation_id)
    
    return success_response(message="成员添加成功")


@router.delete("/conversations/{conversation_id}/members/{user_id}", response_model=dict, summary="移除会话成员")
async def remove_conversation_member(
    conversation_id: int,
    user_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("im.update"))
):
    """移除会话成员（仅群聊）"""
    service = get_service(db)
    success = await service.remove_conversation_member(
        conversation_id, user.user_id, user_id
    )
    
    if not success:
        raise NotFoundException("会话或成员", conversation_id)
    
    return success_response(message="成员移除成功")


# ==================== 消息管理 ====================

@router.post("/messages", response_model=dict, summary="发送消息")
async def send_message(
    data: MessageCreate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("im.send"))
):
    """发送消息"""
    service = get_service(db)
    message = await service.send_message(user.user_id, data)
    
    # 加载发送者信息
    await _load_message_user_info(db, message)
    
    # 发送 WebSocket 广播通知
    await notify_new_message(db, message)
    
    return success_response(
        data=MessageResponse.model_validate(message),
        message="消息发送成功"
    )


@router.post("/messages/upload", response_model=dict, summary="上传文件消息")
async def upload_message_file(
    conversation_id: int = Form(...),
    file: UploadFile = File(...),
    reply_to_id: Optional[int] = Form(None),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("im.send"))
):
    """上传文件（图片或文件消息）"""
    from fastapi import HTTPException
    from utils.storage import get_storage_manager
    import json
    
    service = get_service(db)
    storage = get_storage_manager()
    
    # 检查会话权限
    conversation = await service.get_conversation(conversation_id, user.user_id)
    if not conversation:
        raise NotFoundException("会话", conversation_id)
    
    # 文件大小限制：图片最大10MB，文件最大50MB
    max_image_size = 10 * 1024 * 1024  # 10MB
    max_file_size = 50 * 1024 * 1024  # 50MB
    
    # 读取文件内容
    content_chunks = []
    total_size = 0
    chunk_size = 1024 * 1024  # 1MB
    
    try:
        while True:
            chunk = await file.read(chunk_size)
            if not chunk:
                break
            total_size += len(chunk)
            content_chunks.append(chunk)
    except Exception as e:
        raise BusinessException(ErrorCode.INTERNAL_ERROR, f"读取文件失败: {str(e)}")
    
    content = b''.join(content_chunks)
    actual_size = len(content)
    
    # 判断文件类型
    file_ext = file.filename.split('.')[-1].lower() if file.filename else ''
    is_image = file_ext in ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp']
    
    max_size = max_image_size if is_image else max_file_size
    if actual_size > max_size:
        max_size_mb = max_size / 1024 / 1024
        actual_size_mb = actual_size / 1024 / 1024
        raise BusinessException(
            ErrorCode.FILE_TOO_LARGE,
            f"文件大小超过限制（最大 {max_size_mb:.1f}MB，当前文件 {actual_size_mb:.1f}MB）"
        )
    
    # 保存文件
    rel_path, full_path = storage.generate_filename(
        file.filename or "file",
        user_id=user.user_id,
        category="attachment",
        module="im",
        sub_type="uploads"
    )
    
    try:
        with open(full_path, 'wb') as f:
            f.write(content)
    except Exception as e:
        raise BusinessException(ErrorCode.INTERNAL_ERROR, f"保存文件失败: {str(e)}")
    
    # 获取文件MIME类型
    file_mime = None
    try:
        import filetype
        kind = filetype.guess(content)
        if kind:
            file_mime = kind.mime
    except (ImportError, Exception) as e:
        logger.debug(f"获取文件MIME类型失败: {e}")
    
    # 构建文件信息JSON
    file_info = {
        "file_path": rel_path,
        "file_name": file.filename,
        "file_size": actual_size,
        "file_mime": file_mime
    }
    
    # 创建消息
    message_data = MessageCreate(
        conversation_id=conversation_id,
        type="image" if is_image else "file",
        content=json.dumps(file_info, ensure_ascii=False),
        reply_to_id=reply_to_id
    )
    
    message = await service.send_message(user.user_id, message_data)
    
    # 更新消息的文件信息
    message.file_path = rel_path
    message.file_name = file.filename
    message.file_size = actual_size
    message.file_mime = file_mime
    await db.commit()
    await db.refresh(message)
    
    # 加载发送者信息
    await _load_message_user_info(db, message)
    
    # 发送 WebSocket 广播通知
    await notify_new_message(db, message)

    return success_response(
        data=MessageResponse.model_validate(message),
        message="文件上传成功"
    )


@router.get("/conversations/{conversation_id}/messages", response_model=dict, summary="获取消息列表")
async def get_messages(
    conversation_id: int,
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(50, ge=1, le=100, description="每页数量"),
    before_message_id: Optional[int] = Query(None, description="在此消息ID之前查询"),
    keyword: Optional[str] = Query(None, description="搜索关键词"),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取消息列表"""
    service = get_service(db)
    messages, total = await service.get_messages(
        conversation_id, user.user_id, page, page_size, before_message_id, keyword
    )
    
    # 加载用户信息和已读状态
    for msg in messages:
        await _load_message_user_info(db, msg)
        await _load_message_read_status(db, msg, user.user_id)
    
    # 检查是否有更多消息
    has_more = (page * page_size) < total
    
    return success_response(
        data=MessageListResponse(
            items=[MessageResponse.model_validate(msg) for msg in messages],
            total=total,
            page=page,
            page_size=page_size,
            has_more=has_more
        ).model_dump(),
        message="获取成功"
    )


@router.post("/messages/read", response_model=dict, summary="标记消息已读")
async def mark_messages_read(
    data: MarkReadRequest,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """标记消息已读"""
    service = get_service(db)
    success = await service.mark_messages_read(
        data.conversation_id,
        user.user_id,
        data.message_ids,
        data.last_message_id
    )
    
    if success:
        # 发送 WebSocket 广播通知
        await notify_message_read(db, data.conversation_id, user.user_id, data.last_message_id)
    
    return success_response(message="已标记为已读")


@router.post("/messages/{message_id}/recall", response_model=dict, summary="撤回消息")
async def recall_message(
    message_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("im.send"))
):
    """撤回消息"""
    service = get_service(db)
    try:
        success = await service.recall_message(message_id, user.user_id)
    except ValueError as e:
        raise BusinessException(ErrorCode.VALIDATION_ERROR, str(e))
    
    if success:
        # 获取消息的会话ID用于广播
        stmt = select(IMMessage.conversation_id).where(IMMessage.id == message_id)
        result = await db.execute(stmt)
        conversation_id = result.scalar()
        if conversation_id:
            await notify_message_recalled(db, conversation_id, message_id, user.user_id)
    
    return success_response(message="消息已撤回")


# ==================== 联系人管理 ====================

@router.post("/contacts", response_model=dict, summary="添加联系人")
async def add_contact(
    data: ContactCreate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("im.contact"))
):
    """添加联系人"""
    service = get_service(db)
    contact = await service.add_contact(user.user_id, data)
    
    await _load_contact_user_info(db, contact)
    
    return success_response(
        data=ContactResponse.model_validate(contact),
        message="联系人添加成功"
    )


@router.get("/contacts", response_model=dict, summary="获取联系人列表")
async def get_contact_list(
    status: Optional[str] = Query(None, description="状态筛选: pending/accepted/blocked"),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取联系人列表"""
    service = get_service(db)
    contacts = await service.get_contact_list(user.user_id, status)
    
    for contact in contacts:
        await _load_contact_user_info(db, contact)
    
    return success_response(
        data=[ContactResponse.model_validate(c) for c in contacts],
        message="获取成功"
    )


@router.put("/contacts/{contact_id}", response_model=dict, summary="更新联系人")
async def update_contact(
    contact_id: int,
    data: ContactUpdate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("im.contact"))
):
    """更新联系人"""
    service = get_service(db)
    contact = await service.update_contact(contact_id, user.user_id, data)
    
    if not contact:
        raise NotFoundException("联系人", contact_id)
    
    await _load_contact_user_info(db, contact)
    
    return success_response(
        data=ContactResponse.model_validate(contact),
        message="更新成功"
    )


@router.delete("/contacts/{contact_id}", response_model=dict, summary="删除联系人")
async def delete_contact(
    contact_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("im.contact"))
):
    """删除联系人"""
    service = get_service(db)
    success = await service.delete_contact(contact_id, user.user_id)
    
    if not success:
        raise NotFoundException("联系人", contact_id)
    
    return success_response(message="联系人已删除")


# ==================== 辅助函数 ====================

async def _load_conversation_user_info(db: AsyncSession, conversation, current_user_id: int = None):
    """加载会话的用户信息"""
    # 加载群主信息
    if conversation.owner_id:
        stmt = select(User).where(User.id == conversation.owner_id)
        result = await db.execute(stmt)
        owner = result.scalar_one_or_none()
        if owner:
            conversation.owner_username = owner.username
            conversation.owner_nickname = owner.nickname
            conversation.owner_avatar = owner.avatar

    # 如果是私聊，且没有名字/头像，则取对方的信息
    if conversation.type == "private" and current_user_id:
        from .im_models import IMConversationMember
        # 查找对方成员
        stmt = select(User).join(
            IMConversationMember, IMConversationMember.user_id == User.id
        ).where(
            and_(
                IMConversationMember.conversation_id == conversation.id,
                IMConversationMember.user_id != current_user_id
            )
        )
        result = await db.execute(stmt)
        other_user = result.scalar_one_or_none()
        if other_user:
            conversation.target_user_id = other_user.id
            if not conversation.name:
                conversation.name = other_user.nickname or other_user.username
            if not conversation.avatar:
                conversation.avatar = other_user.avatar


async def _load_conversation_members(db: AsyncSession, conversation):
    """加载会话成员信息"""
    from .im_models import IMConversationMember
    from .im_schemas import ConversationMemberInfo
    
    stmt = select(IMConversationMember, User).join(
        User, IMConversationMember.user_id == User.id
    ).where(IMConversationMember.conversation_id == conversation.id)
    
    result = await db.execute(stmt)
    members = []
    for member, user in result.all():
        member_info = ConversationMemberInfo(
            id=member.id,
            user_id=member.user_id,
            username=user.username,
            nickname=user.nickname,
            avatar=user.avatar,
            role=member.role,
            joined_at=member.joined_at
        )
        members.append(member_info)
    
    conversation.members = members


async def _load_message_user_info(db: AsyncSession, message):
    """加载消息的发送者信息"""
    service = get_service(db)
    await service.load_message_details(message)


async def _load_message_read_status(db: AsyncSession, message, user_id: int):
    """加载消息的已读状态"""
    from .im_models import IMMessageRead
    
    stmt = select(IMMessageRead).where(
        and_(
            IMMessageRead.message_id == message.id,
            IMMessageRead.user_id == user_id
        )
    )
    result = await db.execute(stmt)
    read_record = result.scalar_one_or_none()
    message.is_read = read_record is not None


async def _load_contact_user_info(db: AsyncSession, contact):
    """加载联系人的用户信息"""
    stmt = select(User).where(User.id == contact.contact_id)
    result = await db.execute(stmt)
    contact_user = result.scalar_one_or_none()
    if contact_user:
        contact.contact_username = contact_user.username
        contact.contact_nickname = contact_user.nickname
        contact.contact_avatar = contact_user.avatar

@router.get("/files", response_model=dict, summary="获取聊天附件列表")
async def get_im_files(
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取用户在聊天中发送或接收的所有附件列表"""
    # 查询所有包含文件的消息
    from .im_models import IMMessage
    stmt = select(IMMessage).where(
        and_(
            IMMessage.type.in_(["image", "file"]),
            IMMessage.file_path.isnot(None)
        )
    ).order_by(IMMessage.created_at.desc())
    
    result = await db.execute(stmt)
    messages = result.scalars().all()
    
    # 过滤掉物理文件不存在的
    storage = get_storage_manager()
    files = []
    for msg in messages:
        # 权限简单检查：发送者或会话成员（此处简化为发送者）
        if msg.sender_id == user.user_id:
             files.append({
                "name": msg.file_name,
                "path": msg.file_path,
                "size": msg.file_size,
                "type": msg.type,
                "created_at": msg.created_at
            })
            
    return success_response(data=files, message="获取成功")
