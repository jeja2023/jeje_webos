"""
即时通讯服务层
包含消息加密/解密功能
"""

import json
import logging
from typing import List, Optional, Tuple
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, and_, or_, update
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.backends import default_backend
import base64
import os

from .im_models import (
    IMConversation, IMConversationMember, IMMessage, IMMessageRead, IMContact
)
from .im_schemas import (
    ConversationCreate, ConversationUpdate, MessageCreate,
    ContactCreate, ContactUpdate
)
from models import User
from utils.storage import get_storage_manager

logger = logging.getLogger(__name__)


class MessageEncryption:
    """消息加密工具类"""
    
    def __init__(self):
        # 从环境变量或配置获取加密密钥
        # 如果没有设置，则使用默认密钥（生产环境必须设置）
        encryption_key = os.environ.get("IM_ENCRYPTION_KEY")
        if not encryption_key:
            # 使用JWT密钥派生加密密钥（兼容现有配置）
            from core.config import get_settings
            settings = get_settings()
            # 使用JWT密钥作为种子生成加密密钥
            seed = settings.jwt_secret.encode()
            kdf = PBKDF2HMAC(
                algorithm=hashes.SHA256(),
                length=32,
                salt=b'im_message_encryption_salt',  # 固定盐值
                iterations=100000,
                backend=default_backend()
            )
            key = base64.urlsafe_b64encode(kdf.derive(seed))
            self.cipher = Fernet(key)
        else:
            # 使用环境变量中的密钥
            key = encryption_key.encode()
            if len(key) != 44:  # Fernet密钥长度检查
                # 如果不是标准Fernet密钥，则派生
                kdf = PBKDF2HMAC(
                    algorithm=hashes.SHA256(),
                    length=32,
                    salt=b'im_message_encryption_salt',
                    iterations=100000,
                    backend=default_backend()
                )
                key = base64.urlsafe_b64encode(kdf.derive(key))
            self.cipher = Fernet(key)
    
    def encrypt(self, plaintext: str) -> str:
        """加密消息"""
        try:
            encrypted = self.cipher.encrypt(plaintext.encode('utf-8'))
            return base64.urlsafe_b64encode(encrypted).decode('utf-8')
        except Exception as e:
            logger.error(f"消息加密失败: {e}")
            raise ValueError(f"消息加密失败: {str(e)}")
    
    def decrypt(self, ciphertext: str) -> str:
        """解密消息"""
        try:
            encrypted_bytes = base64.urlsafe_b64decode(ciphertext.encode('utf-8'))
            decrypted = self.cipher.decrypt(encrypted_bytes)
            return decrypted.decode('utf-8')
        except Exception as e:
            logger.error(f"消息解密失败: {e}")
            raise ValueError(f"消息解密失败: {str(e)}")


# 全局加密实例
_encryption = None

def get_encryption() -> MessageEncryption:
    """获取加密实例"""
    global _encryption
    if _encryption is None:
        _encryption = MessageEncryption()
    return _encryption


class IMService:
    """即时通讯服务"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
        self.encryption = get_encryption()
        self.storage = get_storage_manager()
    
    # ==================== 会话管理 ====================
    
    async def create_conversation(
        self,
        user_id: int,
        data: ConversationCreate
    ) -> IMConversation:
        """创建会话"""
        # 检查是否为私聊
        if data.type == "private":
            if len(data.member_ids) != 1:
                raise ValueError("私聊会话只能有一个成员")
            
            contact_id = data.member_ids[0]
            if contact_id == user_id:
                raise ValueError("不能与自己创建私聊")
            
            # 检查是否已存在私聊会话
            existing = await self._find_private_conversation(user_id, contact_id)
            if existing:
                return existing
            
            # 创建新会话
            conversation = IMConversation(
                type="private",
                name=None,
                avatar=None,
                owner_id=None
            )
            self.db.add(conversation)
            await self.db.flush()
            
            # 添加成员
            members = [
                IMConversationMember(
                    conversation_id=conversation.id,
                    user_id=user_id,
                    role="member"
                ),
                IMConversationMember(
                    conversation_id=conversation.id,
                    user_id=contact_id,
                    role="member"
                )
            ]
            self.db.add_all(members)
            await self.db.commit()
            await self.db.refresh(conversation)
            return conversation
        
        elif data.type == "group":
            if not data.name:
                raise ValueError("群聊会话必须提供名称")
            
            if len(data.member_ids) < 1:
                raise ValueError("群聊至少需要一个成员")
            
            # 创建群聊会话
            conversation = IMConversation(
                type="group",
                name=data.name,
                avatar=data.avatar,
                owner_id=user_id
            )
            self.db.add(conversation)
            await self.db.flush()
            
            # 添加成员（创建者为群主）
            members = [
                IMConversationMember(
                    conversation_id=conversation.id,
                    user_id=user_id,
                    role="owner"
                )
            ]
            for member_id in data.member_ids:
                if member_id != user_id:
                    members.append(IMConversationMember(
                        conversation_id=conversation.id,
                        user_id=member_id,
                        role="member"
                    ))
            
            self.db.add_all(members)
            await self.db.commit()
            await self.db.refresh(conversation)
            return conversation
        
        else:
            raise ValueError(f"不支持的会话类型: {data.type}")
    
    async def _find_private_conversation(
        self,
        user_id1: int,
        user_id2: int
    ) -> Optional[IMConversation]:
        """查找已存在的私聊会话"""
        # 查找包含这两个用户的私聊会话
        stmt = select(IMConversation).join(IMConversationMember).where(
            and_(
                IMConversation.type == "private",
                IMConversationMember.user_id == user_id1
            )
        ).join(
            IMConversationMember,
            and_(
                IMConversationMember.conversation_id == IMConversation.id,
                IMConversationMember.user_id == user_id2
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def get_conversation(
        self,
        conversation_id: int,
        user_id: int
    ) -> Optional[IMConversation]:
        """获取会话详情（检查用户是否为成员）"""
        stmt = select(IMConversation).join(IMConversationMember).where(
            and_(
                IMConversation.id == conversation_id,
                IMConversationMember.user_id == user_id
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def get_conversation_list(
        self,
        user_id: int,
        page: int = 1,
        page_size: int = 20
    ) -> Tuple[List[IMConversation], int]:
        """获取会话列表"""
        # 查询用户参与的所有会话
        stmt = select(IMConversation).join(IMConversationMember).where(
            IMConversationMember.user_id == user_id
        ).order_by(desc(IMConversation.updated_at))
        
        # 总数
        count_stmt = select(func.count()).select_from(IMConversation).join(IMConversationMember).where(
            IMConversationMember.user_id == user_id
        )
        total_result = await self.db.execute(count_stmt)
        total = total_result.scalar() or 0
        
        # 分页
        stmt = stmt.offset((page - 1) * page_size).limit(page_size)
        result = await self.db.execute(stmt)
        conversations = result.scalars().all()
        
        # 为每个会话加载成员信息和未读数
        for conv in conversations:
            await self._load_conversation_extra(conv, user_id)
        
        return list(conversations), total
    
    async def _load_conversation_extra(
        self,
        conversation: IMConversation,
        user_id: int
    ):
        """加载会话的额外信息（未读数、置顶等）"""
        stmt = select(IMConversationMember).where(
            and_(
                IMConversationMember.conversation_id == conversation.id,
                IMConversationMember.user_id == user_id
            )
        )
        result = await self.db.execute(stmt)
        member = result.scalar_one_or_none()
        if member:
            conversation.unread_count = member.unread_count
            conversation.is_pinned = member.is_pinned
            conversation.is_muted = member.is_muted
            conversation.last_read_message_id = member.last_read_message_id
    
    async def update_conversation(
        self,
        conversation_id: int,
        user_id: int,
        data: ConversationUpdate
    ) -> Optional[IMConversation]:
        """更新会话"""
        conversation = await self.get_conversation(conversation_id, user_id)
        if not conversation:
            return None
        
        # 检查权限（只有群主或管理员可以修改群聊）
        if conversation.type == "group":
            stmt = select(IMConversationMember).where(
                and_(
                    IMConversationMember.conversation_id == conversation_id,
                    IMConversationMember.user_id == user_id
                )
            )
            result = await self.db.execute(stmt)
            member = result.scalar_one_or_none()
            if not member or member.role not in ("owner", "admin"):
                raise ValueError("只有群主或管理员可以修改群聊信息")
        
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(conversation, key, value)
        
        await self.db.commit()
        await self.db.refresh(conversation)
        return conversation
    
    async def add_conversation_members(
        self,
        conversation_id: int,
        user_id: int,
        member_ids: List[int]
    ) -> bool:
        """添加会话成员"""
        conversation = await self.get_conversation(conversation_id, user_id)
        if not conversation:
            return False
        
        if conversation.type != "group":
            raise ValueError("只有群聊可以添加成员")
        
        # 检查权限
        stmt = select(IMConversationMember).where(
            and_(
                IMConversationMember.conversation_id == conversation_id,
                IMConversationMember.user_id == user_id
            )
        )
        result = await self.db.execute(stmt)
        member = result.scalar_one_or_none()
        if not member or member.role not in ("owner", "admin"):
            raise ValueError("只有群主或管理员可以添加成员")
        
        # 添加新成员
        existing_member_ids = set()
        existing_stmt = select(IMConversationMember.user_id).where(
            IMConversationMember.conversation_id == conversation_id
        )
        existing_result = await self.db.execute(existing_stmt)
        existing_member_ids = set(existing_result.scalars().all())
        
        new_members = []
        for member_id in member_ids:
            if member_id not in existing_member_ids:
                new_members.append(IMConversationMember(
                    conversation_id=conversation_id,
                    user_id=member_id,
                    role="member"
                ))
        
        if new_members:
            self.db.add_all(new_members)
            await self.db.commit()
        
        return True
    
    async def remove_conversation_member(
        self,
        conversation_id: int,
        user_id: int,
        target_user_id: int
    ) -> bool:
        """移除会话成员"""
        conversation = await self.get_conversation(conversation_id, user_id)
        if not conversation:
            return False
        
        # 检查权限
        stmt = select(IMConversationMember).where(
            and_(
                IMConversationMember.conversation_id == conversation_id,
                IMConversationMember.user_id == user_id
            )
        )
        result = await self.db.execute(stmt)
        member = result.scalar_one_or_none()
        if not member or member.role not in ("owner", "admin"):
            raise ValueError("只有群主或管理员可以移除成员")
        
        # 不能移除群主
        if target_user_id == conversation.owner_id:
            raise ValueError("不能移除群主")
        
        # 移除成员
        stmt = select(IMConversationMember).where(
            and_(
                IMConversationMember.conversation_id == conversation_id,
                IMConversationMember.user_id == target_user_id
            )
        )
        result = await self.db.execute(stmt)
        target_member = result.scalar_one_or_none()
        if target_member:
            await self.db.delete(target_member)
            await self.db.commit()
            return True
        
        return False
    
    # ==================== 消息管理 ====================
    
    async def send_message(
        self,
        user_id: int,
        data: MessageCreate
    ) -> IMMessage:
        """发送消息"""
        # 检查会话权限
        conversation = await self.get_conversation(data.conversation_id, user_id)
        if not conversation:
            raise ValueError("会话不存在或无权限")
        
        # 加密消息内容
        encrypted_content = self.encryption.encrypt(data.content)
        
        # 创建消息
        message = IMMessage(
            conversation_id=data.conversation_id,
            sender_id=user_id,
            type=data.type,
            content=encrypted_content,
            reply_to_id=data.reply_to_id
        )
        self.db.add(message)
        await self.db.flush()
        
        # 更新会话最后消息
        conversation.last_message_id = message.id
        conversation.last_message_time = datetime.now(timezone.utc)
        
        # 更新所有成员的未读数（除了发送者）
        stmt = update(IMConversationMember).where(
            and_(
                IMConversationMember.conversation_id == data.conversation_id,
                IMConversationMember.user_id != user_id
            )
        ).values(unread_count=IMConversationMember.unread_count + 1)
        await self.db.execute(stmt)
        
        await self.db.commit()
        await self.db.refresh(message)
        return message
    
    async def get_messages(
        self,
        conversation_id: int,
        user_id: int,
        page: int = 1,
        page_size: int = 50,
        before_message_id: Optional[int] = None
    ) -> Tuple[List[IMMessage], int]:
        """获取消息列表"""
        # 检查会话权限
        conversation = await self.get_conversation(conversation_id, user_id)
        if not conversation:
            raise ValueError("会话不存在或无权限")
        
        # 构建查询
        stmt = select(IMMessage).where(
            IMMessage.conversation_id == conversation_id
        )
        
        if before_message_id:
            stmt = stmt.where(IMMessage.id < before_message_id)
        
        # 总数
        count_stmt = select(func.count()).where(
            IMMessage.conversation_id == conversation_id
        )
        if before_message_id:
            count_stmt = count_stmt.where(IMMessage.id < before_message_id)
        total_result = await self.db.execute(count_stmt)
        total = total_result.scalar() or 0
        
        # 分页（按时间倒序，最新的在前）
        stmt = stmt.order_by(desc(IMMessage.created_at))
        stmt = stmt.offset((page - 1) * page_size).limit(page_size)
        result = await self.db.execute(stmt)
        messages = result.scalars().all()
        
        # 解密消息内容（在Service层不直接修改，由Router层处理）
        return list(reversed(messages)), total  # 反转列表，使最旧的在前面
    
    async def mark_messages_read(
        self,
        conversation_id: int,
        user_id: int,
        message_ids: Optional[List[int]] = None,
        last_message_id: Optional[int] = None
    ) -> bool:
        """标记消息已读"""
        # 检查会话权限
        conversation = await self.get_conversation(conversation_id, user_id)
        if not conversation:
            return False
        
        if message_ids:
            # 标记指定消息已读
            for msg_id in message_ids:
                # 检查是否已存在记录
                stmt = select(IMMessageRead).where(
                    and_(
                        IMMessageRead.message_id == msg_id,
                        IMMessageRead.user_id == user_id
                    )
                )
                result = await self.db.execute(stmt)
                if not result.scalar_one_or_none():
                    read_record = IMMessageRead(
                        message_id=msg_id,
                        user_id=user_id,
                        conversation_id=conversation_id
                    )
                    self.db.add(read_record)
        elif last_message_id:
            # 标记该消息及之前的所有消息已读
            stmt = select(IMMessage.id).where(
                and_(
                    IMMessage.conversation_id == conversation_id,
                    IMMessage.id <= last_message_id
                )
            )
            result = await self.db.execute(stmt)
            message_ids_to_mark = [row[0] for row in result.all()]
            
            # 批量插入已读记录（忽略已存在的）
            for msg_id in message_ids_to_mark:
                check_stmt = select(IMMessageRead).where(
                    and_(
                        IMMessageRead.message_id == msg_id,
                        IMMessageRead.user_id == user_id
                    )
                )
                check_result = await self.db.execute(check_stmt)
                if not check_result.scalar_one_or_none():
                    read_record = IMMessageRead(
                        message_id=msg_id,
                        user_id=user_id,
                        conversation_id=conversation_id
                    )
                    self.db.add(read_record)
        else:
            # 标记会话所有消息已读
            stmt = select(IMMessage.id).where(
                IMMessage.conversation_id == conversation_id
            )
            result = await self.db.execute(stmt)
            message_ids_to_mark = [row[0] for row in result.all()]
            
            for msg_id in message_ids_to_mark:
                check_stmt = select(IMMessageRead).where(
                    and_(
                        IMMessageRead.message_id == msg_id,
                        IMMessageRead.user_id == user_id
                    )
                )
                check_result = await self.db.execute(check_stmt)
                if not check_result.scalar_one_or_none():
                    read_record = IMMessageRead(
                        message_id=msg_id,
                        user_id=user_id,
                        conversation_id=conversation_id
                    )
                    self.db.add(read_record)
        
        # 更新成员的未读数和最后已读消息ID
        stmt = update(IMConversationMember).where(
            and_(
                IMConversationMember.conversation_id == conversation_id,
                IMConversationMember.user_id == user_id
            )
        ).values(
            unread_count=0,
            last_read_message_id=last_message_id or conversation.last_message_id
        )
        await self.db.execute(stmt)
        
        await self.db.commit()
        return True
    
    async def recall_message(
        self,
        message_id: int,
        user_id: int
    ) -> bool:
        """撤回消息"""
        stmt = select(IMMessage).where(IMMessage.id == message_id)
        result = await self.db.execute(stmt)
        message = result.scalar_one_or_none()
        
        if not message:
            return False
        
        # 检查权限（只能撤回自己发送的消息）
        if message.sender_id != user_id:
            raise ValueError("只能撤回自己发送的消息")
        
        # 检查时间限制（5分钟内可以撤回）
        time_diff = (datetime.now(timezone.utc) - message.created_at).total_seconds()
        if time_diff > 300:  # 5分钟
            raise ValueError("消息发送超过5分钟，无法撤回")
        
        message.is_recalled = True
        await self.db.commit()
        return True
    
    # ==================== 联系人管理 ====================
    
    async def add_contact(
        self,
        user_id: int,
        data: ContactCreate
    ) -> IMContact:
        """添加联系人"""
        if data.contact_id == user_id:
            raise ValueError("不能添加自己为联系人")
        
        # 检查是否已存在
        stmt = select(IMContact).where(
            and_(
                IMContact.user_id == user_id,
                IMContact.contact_id == data.contact_id
            )
        )
        result = await self.db.execute(stmt)
        existing = result.scalar_one_or_none()
        
        if existing:
            # 更新备注
            if data.alias:
                existing.alias = data.alias
                await self.db.commit()
                await self.db.refresh(existing)
            return existing
        
        # 创建新联系人
        contact = IMContact(
            user_id=user_id,
            contact_id=data.contact_id,
            alias=data.alias,
            status="pending"
        )
        self.db.add(contact)
        await self.db.commit()
        await self.db.refresh(contact)
        return contact
    
    async def get_contact_list(
        self,
        user_id: int,
        status: Optional[str] = None
    ) -> List[IMContact]:
        """获取联系人列表"""
        stmt = select(IMContact).where(IMContact.user_id == user_id)
        if status:
            stmt = stmt.where(IMContact.status == status)
        stmt = stmt.order_by(IMContact.created_at)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())
    
    async def update_contact(
        self,
        contact_id: int,
        user_id: int,
        data: ContactUpdate
    ) -> Optional[IMContact]:
        """更新联系人"""
        stmt = select(IMContact).where(
            and_(
                IMContact.id == contact_id,
                IMContact.user_id == user_id
            )
        )
        result = await self.db.execute(stmt)
        contact = result.scalar_one_or_none()
        
        if not contact:
            return None
        
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(contact, key, value)
        
        await self.db.commit()
        await self.db.refresh(contact)
        return contact
    
    async def delete_contact(
        self,
        contact_id: int,
        user_id: int
    ) -> bool:
        """删除联系人"""
        stmt = select(IMContact).where(
            and_(
                IMContact.id == contact_id,
                IMContact.user_id == user_id
            )
        )
        result = await self.db.execute(stmt)
        contact = result.scalar_one_or_none()
        
        if not contact:
            return False
        
        await self.db.delete(contact)
        await self.db.commit()
        return True

