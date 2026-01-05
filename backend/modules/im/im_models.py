"""
即时通讯数据模型
表名遵循隔离协议：im_前缀
"""

from datetime import datetime, timezone, timedelta
from typing import Optional
from sqlalchemy import String, Integer, Boolean, DateTime, Text, ForeignKey, BigInteger, Index
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base
from models import User


def get_beijing_time():
    """获取北京时间"""
    return datetime.now(timezone(timedelta(hours=8)))

class IMConversation(Base):
    """会话表"""
    __tablename__ = "im_conversations"
    __table_args__ = (
        Index("idx_im_conv_updated", "updated_at"),
        {"extend_existing": True, "comment": "即时通讯会话表"}
    )
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    type: Mapped[str] = mapped_column(String(20), default="private", index=True, comment="会话类型")
    name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, comment="会话名称")
    avatar: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, comment="会话头像")
    owner_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey(User.id), nullable=True, comment="群主ID")
    last_message_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, comment="最后消息ID")
    last_message_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, comment="最后消息时间")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")


class IMConversationMember(Base):
    """会话成员表"""
    __tablename__ = "im_conversation_members"
    __table_args__ = (
        Index("idx_im_member_conv_user", "conversation_id", "user_id"),
        Index("idx_im_member_user", "user_id"),
        {"extend_existing": True, "comment": "即时通讯会话成员表"}
    )
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    conversation_id: Mapped[int] = mapped_column(Integer, ForeignKey("im_conversations.id", ondelete="CASCADE"), index=True, comment="会话ID")
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey(User.id), index=True, comment="用户ID")
    role: Mapped[str] = mapped_column(String(20), default="member", comment="角色")
    unread_count: Mapped[int] = mapped_column(Integer, default=0, comment="未读数")
    last_read_message_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, comment="最后已读消息ID")
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否置顶")
    is_muted: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否免打扰")
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="加入时间")


class IMMessage(Base):
    """消息表"""
    __tablename__ = "im_messages"
    __table_args__ = (
        Index("idx_im_msg_conv_created", "conversation_id", "created_at"),
        Index("idx_im_msg_sender", "sender_id"),
        {"extend_existing": True, "comment": "即时通讯消息表"}
    )
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    conversation_id: Mapped[int] = mapped_column(Integer, ForeignKey("im_conversations.id", ondelete="CASCADE"), index=True, comment="会话ID")
    sender_id: Mapped[int] = mapped_column(Integer, ForeignKey(User.id), index=True, comment="发送者ID")
    type: Mapped[str] = mapped_column(String(20), default="text", comment="消息类型")
    content: Mapped[str] = mapped_column(Text, comment="消息内容")
    file_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True, comment="文件路径")
    file_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, comment="原始文件名")
    file_size: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True, comment="文件大小")
    file_mime: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, comment="文件MIME类型")
    reply_to_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("im_messages.id"), nullable=True, comment="回复消息ID")
    is_recalled: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否撤回")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, index=True, comment="发送时间")


class IMMessageRead(Base):
    """消息已读记录表"""
    __tablename__ = "im_message_reads"
    __table_args__ = (
        Index("idx_im_read_msg_user", "message_id", "user_id"),
        Index("idx_im_read_user_conv", "user_id", "conversation_id"),
        {"extend_existing": True, "comment": "即时通讯消息已读记录表"}
    )
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    message_id: Mapped[int] = mapped_column(Integer, ForeignKey("im_messages.id", ondelete="CASCADE"), index=True, comment="消息ID")
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey(User.id), index=True, comment="用户ID")
    conversation_id: Mapped[int] = mapped_column(Integer, ForeignKey("im_conversations.id", ondelete="CASCADE"), index=True, comment="会话ID")
    read_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="阅读时间")


class IMContact(Base):
    """联系人/好友表"""
    __tablename__ = "im_contacts"
    __table_args__ = (
        Index("idx_im_contact_user_contact", "user_id", "contact_id"),
        {"extend_existing": True, "comment": "即时通讯联系人表"}
    )
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey(User.id), index=True, comment="用户ID")
    contact_id: Mapped[int] = mapped_column(Integer, ForeignKey(User.id), index=True, comment="联系人ID")
    alias: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, comment="备注名")
    status: Mapped[str] = mapped_column(String(20), default="pending", comment="状态")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")






