"""
即时通讯WebSocket消息处理
集成到现有的WebSocket路由中
"""

import json
import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import WebSocket
from sqlalchemy.ext.asyncio import AsyncSession

from core.ws_manager import manager
from core.database import get_db
from .im_services import IMService
from .im_schemas import MessageCreate

logger = logging.getLogger(__name__)


async def handle_im_message(
    websocket: WebSocket,
    user_id: int,
    message_type: str,
    data: dict
):
    """
    处理即时通讯相关的WebSocket消息
    
    消息类型：
    - im_send: 发送消息
    - im_read: 标记消息已读
    - im_typing: 输入状态
    - im_recall: 撤回消息
    """
    from core.database import async_session_maker
    
    async with async_session_maker() as db:
        service = IMService(db)
        
        try:
            if message_type == "im_send":
                # 发送消息
                message_data = MessageCreate(
                    conversation_id=data.get("conversation_id"),
                    type=data.get("type", "text"),
                    content=data.get("content", ""),
                    reply_to_id=data.get("reply_to_id")
                )
                
                message = await service.send_message(user_id, message_data)
                
                # 获取会话成员
                from .im_models import IMConversationMember
                from sqlalchemy import select
                
                stmt = select(IMConversationMember).where(
                    IMConversationMember.conversation_id == message.conversation_id
                )
                result = await db.execute(stmt)
                members = result.scalars().all()
                
                # 解密消息内容
                from .im_services import get_encryption
                encryption = get_encryption()
                try:
                    decrypted_content = encryption.decrypt(message.content)
                except:
                    decrypted_content = "[消息解密失败]"
                
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
                    "created_at": message.created_at.isoformat()
                }
                
                # 发送给会话所有成员（除了发送者）
                for member in members:
                    if member.user_id != user_id:
                        await manager.send_personal_message({
                            "type": "im_message_new",
                            "data": message_response,
                            "timestamp": datetime.now(timezone.utc).isoformat()
                        }, member.user_id)
                
                # 发送确认给发送者
                await websocket.send_text(json.dumps({
                    "type": "im_message_sent",
                    "data": message_response,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }, ensure_ascii=False))
            
            elif message_type == "im_read":
                # 标记消息已读
                conversation_id = data.get("conversation_id")
                message_ids = data.get("message_ids")
                last_message_id = data.get("last_message_id")
                
                success = await service.mark_messages_read(
                    conversation_id,
                    user_id,
                    message_ids,
                    last_message_id
                )
                
                if success:
                    # 通知会话其他成员（可选）
                    from .im_models import IMConversationMember
                    from sqlalchemy import select
                    
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
                                    "last_read_message_id": last_message_id or message_ids[-1] if message_ids else None
                                },
                                "timestamp": datetime.now(timezone.utc).isoformat()
                            }, member.user_id)
                    
                    await websocket.send_text(json.dumps({
                        "type": "im_message_read_success",
                        "data": {"conversation_id": conversation_id},
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    }, ensure_ascii=False))
            
            elif message_type == "im_typing":
                # 输入状态
                conversation_id = data.get("conversation_id")
                is_typing = data.get("is_typing", True)
                
                # 通知会话其他成员
                from .im_models import IMConversationMember
                from sqlalchemy import select
                
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
                            "timestamp": datetime.now(timezone.utc).isoformat()
                        }, member.user_id)
            
            elif message_type == "im_recall":
                # 撤回消息
                message_id = data.get("message_id")
                
                success = await service.recall_message(message_id, user_id)
                
                if success:
                    # 获取消息的会话ID
                    from .im_models import IMMessage
                    from sqlalchemy import select
                    
                    stmt = select(IMMessage).where(IMMessage.id == message_id)
                    result = await db.execute(stmt)
                    message = result.scalar_one_or_none()
                    
                    if message:
                        # 通知会话所有成员
                        from .im_models import IMConversationMember
                        
                        stmt = select(IMConversationMember).where(
                            IMConversationMember.conversation_id == message.conversation_id
                        )
                        result = await db.execute(stmt)
                        members = result.scalars().all()
                        
                        for member in members:
                            await manager.send_personal_message({
                                "type": "im_message_recalled",
                                "data": {
                                    "message_id": message_id,
                                    "conversation_id": message.conversation_id,
                                    "recalled_by": user_id
                                },
                                "timestamp": datetime.now(timezone.utc).isoformat()
                            }, member.user_id)
                    
                    await websocket.send_text(json.dumps({
                        "type": "im_message_recall_success",
                        "data": {"message_id": message_id},
                        "timestamp": datetime.now(timezone.utc).isoformat()
                    }, ensure_ascii=False))
        
        except Exception as e:
            logger.error(f"处理IM消息失败: {e}", exc_info=True)
            await websocket.send_text(json.dumps({
                "type": "im_error",
                "data": {"message": str(e)},
                "timestamp": datetime.now(timezone.utc).isoformat()
            }, ensure_ascii=False))






