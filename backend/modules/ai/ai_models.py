"""
AI 模块数据模型
"""

from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, Boolean, DateTime, Text, ForeignKey, JSON, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base
from models import User
from utils.timezone import get_beijing_time


class AIChatSession(Base):
    """AI对话会话表"""
    __tablename__ = "ai_chat_sessions"
    __table_args__ = (
        Index("idx_ai_session_user_updated", "user_id", "updated_at"),
        {"extend_existing": True, "comment": "AI对话会话表"}
    )
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey(User.id), index=True, comment="用户ID")
    title: Mapped[str] = mapped_column(String(200), default="新对话", comment="会话标题")
    provider: Mapped[str] = mapped_column(String(20), default="local", comment="提供者: local/online")
    knowledge_base_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, comment="知识库ID")
    use_analysis: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否使用数据分析")
    config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, comment="会话配置")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")
    
    # 关系
    messages: Mapped[list["AIChatMessage"]] = relationship("AIChatMessage", back_populates="session", cascade="all, delete-orphan", order_by="AIChatMessage.created_at")


class AIChatMessage(Base):
    """AI对话消息表"""
    __tablename__ = "ai_chat_messages"
    __table_args__ = (
        Index("idx_ai_msg_session_created", "session_id", "created_at"),
        {"extend_existing": True, "comment": "AI对话消息表"}
    )
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    session_id: Mapped[int] = mapped_column(Integer, ForeignKey(AIChatSession.id, ondelete="CASCADE"), index=True, comment="会话ID")
    role: Mapped[str] = mapped_column(String(20), comment="角色: user/assistant/system")
    content: Mapped[str] = mapped_column(Text, comment="消息内容")
    is_error: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否为错误消息")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")
    
    # 关系
    session: Mapped["AIChatSession"] = relationship("AIChatSession", back_populates="messages")





