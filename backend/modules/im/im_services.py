"""
即时通讯服务层
包含消息加密/解密功能
"""

import json
import logging
from typing import List, Optional, Tuple
from datetime import datetime, timezone, timedelta
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
            # Fernet.encrypt 返回的是已 base64url 编码的 bytes
            return self.cipher.encrypt(plaintext.encode('utf-8')).decode('utf-8')
        except Exception as e:
            logger.error(f"消息加密失败: {e}")
            raise ValueError(f"消息加密失败: {str(e)}")
    
    def decrypt(self, ciphertext: str) -> str:
        """解密消息"""
        if not ciphertext:
            return ""
        try:
            # 1. 尝试直接解密 (标准 Fernet 令牌)
            return self.cipher.decrypt(ciphertext.encode('utf-8')).decode('utf-8')
        except Exception:
            try:
                # 2. 尝试处理之前的双重编码错误 (base64url(Fernet token))
                decoded = base64.urlsafe_b64decode(ciphertext.encode('utf-8'))
                return self.cipher.decrypt(decoded).decode('utf-8')
            except Exception:
                # 3. 依然失败，可能是历史明文消息或密钥不匹配
                # 如果以 gAAAA 开头通常是密文，否则可能是明文
                if not ciphertext.startswith("gAAAA"):
                    return ciphertext
                
                logger.warning(f"消息解密失败: {ciphertext[:20]}...")
                return "[加密消息]"


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
        # 使用别名区分两次 JOIN 同一个表
        from sqlalchemy.orm import aliased
        
        member1 = aliased(IMConversationMember)
        member2 = aliased(IMConversationMember)
        
        # 查找包含这两个用户的私聊会话
        stmt = select(IMConversation).join(
            member1, member1.conversation_id == IMConversation.id
        ).join(
            member2, member2.conversation_id == IMConversation.id
        ).where(
            and_(
                IMConversation.type == "private",
                member1.user_id == user_id1,
                member2.user_id == user_id2
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
        """加载会话的额外信息（未读数、对方信息等）"""
        # 1. 加载当前用户的成员设置
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

        # 2. 如果是私聊且没有名称，则显示对方的昵称
        if conversation.type == "private":
            # 查找对方成员信息
            # Retrieve user info from User model (already imported)
            stmt = select(User).join(
                IMConversationMember, IMConversationMember.user_id == User.id
            ).where(
                and_(
                    IMConversationMember.conversation_id == conversation.id,
                    IMConversationMember.user_id != user_id
                )
            )
            result = await self.db.execute(stmt)
            other_user = result.scalar_one_or_none()
            if other_user:
                conversation.name = other_user.nickname or other_user.username
                conversation.avatar = other_user.avatar
            else:
                conversation.name = "已销号用户"
    
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
        before_message_id: Optional[int] = None,
        keyword: Optional[str] = None
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
        
        # 关键词搜索
        if keyword:
            # 需要先解密才能搜索，但数据库存储的是密文，无法直接LIKE搜索
            # 这是一个架构限制。
            # 方案A: 内存过滤（性能差，Pagination失效）
            # 方案B: 仅搜索明文元数据（如文件名）或接受无法搜索内容
            # 方案C: 数据库层不搜索内容，只搜索文件名。或者如果不加密的字段。
            # 鉴于当前架构是加密存储，我们暂且只能搜索文件名，或者接受这是一个限制
            # 但为了满足"优化"需求，我们可以尝试搜索 file_name
            # 若要搜索内容，必须在客户端做，或者后端全量加载（不现实）
            # 修正：用户想要"全部优化"，我们可以尝试对未加密的系统消息等做搜索，
            # 但针对加密内容，我们在此处暂不支持内容搜索，仅支持文件名的搜索。
            # 或者，如果 encryption key 是固定的，这也不行，因为有 IV/Salt。
            # 决定：暂只支持文件名搜索。
            stmt = stmt.where(IMMessage.file_name.ilike(f"%{keyword}%"))
            
        # 总数
        count_stmt = select(func.count()).where(
            IMMessage.conversation_id == conversation_id
        )
        if before_message_id:
            count_stmt = count_stmt.where(IMMessage.id < before_message_id)
        if keyword:
            count_stmt = count_stmt.where(IMMessage.file_name.ilike(f"%{keyword}%"))
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
        """
        标记消息已读
        [优化] 使用批量查询和批量插入，避免N+1查询问题
        """
        # 检查会话权限
        conversation = await self.get_conversation(conversation_id, user_id)
        if not conversation:
            return False
        
        # 确定需要标记的消息ID列表
        if message_ids:
            # 标记指定消息已读
            ids_to_mark = message_ids
        elif last_message_id:
            # 标记该消息及之前的所有消息已读
            stmt = select(IMMessage.id).where(
                and_(
                    IMMessage.conversation_id == conversation_id,
                    IMMessage.id <= last_message_id
                )
            )
            result = await self.db.execute(stmt)
            ids_to_mark = [row[0] for row in result.all()]
        else:
            # 标记会话所有消息已读
            stmt = select(IMMessage.id).where(
                IMMessage.conversation_id == conversation_id
            )
            result = await self.db.execute(stmt)
            ids_to_mark = [row[0] for row in result.all()]
        
        if ids_to_mark:
            # [优化] 批量查询已存在的已读记录
            existing_stmt = select(IMMessageRead.message_id).where(
                and_(
                    IMMessageRead.message_id.in_(ids_to_mark),
                    IMMessageRead.user_id == user_id
                )
            )
            existing_result = await self.db.execute(existing_stmt)
            existing_ids = set(row[0] for row in existing_result.all())
            
            # [优化] 批量插入不存在的已读记录
            new_ids = [msg_id for msg_id in ids_to_mark if msg_id not in existing_ids]
            if new_ids:
                new_records = [
                    IMMessageRead(
                        message_id=msg_id,
                        user_id=user_id,
                        conversation_id=conversation_id
                    )
                    for msg_id in new_ids
                ]
                self.db.add_all(new_records)
        
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
        # 处理时区问题：统一转换为 UTC 进行比较
        msg_time = message.created_at
        if msg_time.tzinfo is None:
            # 如果数据库时间是 naive 的（通常是 UTC），设为 UTC
            msg_time = msg_time.replace(tzinfo=timezone.utc)
        
        current_time = datetime.now(timezone.utc)
        time_diff = (current_time - msg_time).total_seconds()
        
        if time_diff > 120:  # 2分钟
            raise ValueError("消息发送超过2分钟，无法撤回")
        
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

