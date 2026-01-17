"""
反馈数据模型
表名遵循隔离协议：feedback_前缀
"""

from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, Boolean, DateTime, Text, ForeignKey, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from core.database import Base
from models.account import User
from utils.timezone import get_beijing_time


class FeedbackStatus(str, enum.Enum):
    """反馈状态枚举"""
    PENDING = "pending"      # 待处理
    PROCESSING = "processing"  # 处理中
    RESOLVED = "resolved"    # 已解决
    CLOSED = "closed"        # 已关闭


class FeedbackType(str, enum.Enum):
    """反馈类型枚举"""
    SUGGESTION = "suggestion"  # 建议
    OPINION = "opinion"       # 建议
    BUG = "bug"              # 问题反馈
    FEATURE = "feature"       # 功能需求
    OTHER = "other"          # 其他


class FeedbackPriority(str, enum.Enum):
    """反馈优先级枚举"""
    LOW = "low"              # 低
    NORMAL = "normal"        # 普通
    HIGH = "high"            # 高
    URGENT = "urgent"        # 紧急


class Feedback(Base):
    """反馈表"""
    __tablename__ = "feedback_feedbacks"
    __table_args__ = {"extend_existing": True, "comment": "反馈表"}
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    
    # 基本信息
    title: Mapped[str] = mapped_column(String(200), comment="反馈标题")
    content: Mapped[str] = mapped_column(Text, comment="反馈内容")
    type: Mapped[FeedbackType] = mapped_column(
        SQLEnum(FeedbackType),
        default=FeedbackType.OTHER,
        comment="反馈类型"
    )
    priority: Mapped[FeedbackPriority] = mapped_column(
        SQLEnum(FeedbackPriority),
        default=FeedbackPriority.NORMAL,
        comment="优先级"
    )
    
    # 提交者
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("sys_users.id"), index=True, comment="提交用户ID")
    
    # 状态
    status: Mapped[FeedbackStatus] = mapped_column(
        SQLEnum(FeedbackStatus),
        default=FeedbackStatus.PENDING,
        index=True,
        comment="处理状态"
    )
    
    # 处理信息
    handler_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("sys_users.id"),
        nullable=True,
        comment="处理人ID"
    )
    reply_content: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="回复内容")
    reply_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, comment="回复时间")
    
    # 联系方式（可选）
    contact: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, comment="联系方式")
    
    # 附件（存储附件路径，多个用逗号分隔）
    attachments: Mapped[Optional[str]] = mapped_column(String(500), nullable=True, comment="附件路径")
    
    # 时间
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, comment="解决时间")
    
    # 关联
    user: Mapped["User"] = relationship(User, foreign_keys="Feedback.user_id", lazy="selectin", viewonly=True)
    handler: Mapped[Optional["User"]] = relationship(User, foreign_keys="Feedback.handler_id", lazy="selectin", viewonly=True)

