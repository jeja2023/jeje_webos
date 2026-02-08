"""
通知系统数据模型
"""

from typing import Optional
from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import String, Integer, Text, DateTime, ForeignKey, Boolean

from core.database import Base



class Notification(Base):
    """通知表"""
    __tablename__ = "sys_notifications"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("sys_users.id"), comment="接收用户ID")
    sender_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("sys_users.id"), nullable=True, comment="发送者ID")
    title: Mapped[str] = mapped_column(String(200), comment="通知标题")
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="通知内容")
    type: Mapped[str] = mapped_column(String(50), default="info", comment="通知类型")
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否已读")
    read_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, comment="阅读时间")
    action_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True, comment="操作链接")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, comment="创建时间")
    
    # Relationships
    sender = relationship("User", foreign_keys=[sender_id], lazy="joined")
    
    # 索引
    __table_args__ = (
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4', 'comment': '系统通知表'},
    )














