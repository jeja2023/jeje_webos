"""
即时通讯WebSocket消息处理
集成到现有的WebSocket路由中
"""

import json
import logging
from utils.timezone import get_beijing_time
from typing import Optional, List
from fastapi import WebSocket
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.ws_manager import manager
from core.database import get_db, async_session
from .im_services import IMService, get_encryption
from .im_schemas import MessageCreate
from .im_models import IMMessage, IMConversationMember

logger = logging.getLogger(__name__)


async def notify_new_message(db: AsyncSession, message: IMMessage):
    """通知会话成员收到新消息"""
    # 获取会话成员
    stmt = select(IMConversationMember).where(
        IMConversationMember.conversation_id == message.conversation_id
    )
    result = await db.execute(stmt)
    members = result.scalars().all()
    
    # 解密消息内容
    encryption = get_encryption()
    try:
        decrypted_content = encryption.decrypt(message.content)
    except Exception as e:
        logger.warning(f"WebSocket消息解密失败 (MsgID: {message.id}): {e}")
        decrypted_content = "[消息内容]"
    
    # 构建消息响应
    message_response = {
        "id": message.id,
        "conversation_id": message.conversation_id,
        "sender_id": message.sender_id,
        "type": message.type,
        "content": decrypted_content,
        "file_path": message.file_path,
        "file_name": message.file_name,
        "file_size": message.file_size,
        "file_mime": message.file_mime,
        "reply_to_id": message.reply_to_id,
        "is_recalled": message.is_recalled,
        "created_at": message.created_at.isoformat() if hasattr(message.created_at, 'isoformat') else str(message.created_at)
    }
    
    # 需要获取发送者信息（如果可能）
    # 注意：在 notify 逻辑中，我们假设 message 已经被加载了基本信息，或者前端会自行处理
    
    # 发送给会话所有成员（包括发送者，以便多端同步）
    for member in members:
        await manager.send_personal_message({
            "type": "im_message_new",
            "data": message_response,
            "timestamp": get_beijing_time().isoformat()
        }, member.user_id)


async def notify_message_recalled(db: AsyncSession, conversation_id: int, message_id: int, user_id: int):
    """通知撤回消息"""
    stmt = select(IMConversationMember).where(
        IMConversationMember.conversation_id == conversation_id
    )
    result = await db.execute(stmt)
    members = result.scalars().all()
    
    for member in members:
        await manager.send_personal_message({
            "type": "im_message_recalled",
            "data": {
                "message_id": message_id,
                "conversation_id": conversation_id,
                "recalled_by": user_id
            },
            "timestamp": get_beijing_time().isoformat()
        }, member.user_id)


async def notify_message_read(db: AsyncSession, conversation_id: int, user_id: int, last_message_id: int):
    """通知消息已读"""
    stmt = select(IMConversationMember).where(
        IMConversationMember.conversation_id == conversation_id
    )
    result = await db.execute(stmt)
    members = result.scalars().all()
    
    for member in members:
        if member.user_id != user_id:
            await manager.send_personal_message({
                "type": "im_message_read_notify",
                "data": {
                    "conversation_id": conversation_id,
                    "user_id": user_id,
                    "last_read_message_id": last_message_id
                },
                "timestamp": get_beijing_time().isoformat()
            }, member.user_id)


async def handle_im_message(
    websocket: WebSocket,
    user_id: int,
    message_type: str,
    data: dict
):
    """
    处理实时IM消息（主要用于输入状态提示和简单的WS发送）
    """
    async with async_session() as db:
        service = IMService(db)
        
        try:
            if message_type == "im_send":
                message_data = MessageCreate(
                    conversation_id=data.get("conversation_id"),
                    type=data.get("type", "text"),
                    content=data.get("content", ""),
                    reply_to_id=data.get("reply_to_id")
                )
                message = await service.send_message(user_id, message_data)
                await notify_new_message(db, message)
            
            elif message_type == "im_typing":
                conversation_id = data.get("conversation_id")
                is_typing = data.get("is_typing", True)
                
                # 通知会话其他成员
                stmt = select(IMConversationMember).where(
                    IMConversationMember.conversation_id == conversation_id
                )
                result = await db.execute(stmt)
                members = result.scalars().all()
                
                for member in members:
                    if member.user_id != user_id:
                        await manager.send_personal_message({
                            "type": "im_typing",
                            "data": {
                                "conversation_id": conversation_id,
                                "user_id": user_id,
                                "is_typing": is_typing
                            },
                            "timestamp": get_beijing_time().isoformat()
                        }, member.user_id)
            
            # 其他消息类型（im_read, im_recall 等）建议走 HTTP 保证可靠性，然后再由服务器路由到 WS 广播
            # 如果前端已经发了 WS 消息，也可以在这里处理
            elif message_type == "im_read":
                conversation_id = data.get("conversation_id")
                last_message_id = data.get("last_message_id")
                message_ids = data.get("message_ids")
                
                await service.mark_messages_read(conversation_id, user_id, message_ids, last_message_id)
                await notify_message_read(db, conversation_id, user_id, last_message_id or (message_ids[-1] if message_ids else 0))

        except Exception as e:
            logger.error(f"处理实时IM消息失败: {e}", exc_info=True)
            try:
                await websocket.send_text(json.dumps({
                    "type": "im_error",
                    "data": {"message": str(e)},
                    "timestamp": get_beijing_time().isoformat()
                }, ensure_ascii=False))
            except Exception as e:
                logger.debug(f"发送IM错误响应失败: {e}")

