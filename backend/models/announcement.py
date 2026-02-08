"""
公告系统数据模型
"""

from typing import Optional
from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import String, Integer, Text, DateTime, ForeignKey, Boolean, Index

from core.database import Base
from models.account import User


class Announcement(Base):
    """公告表"""
    __tablename__ = "sys_announcements"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    title: Mapped[str] = mapped_column(String(200), comment="公告标题")
    content: Mapped[str] = mapped_column(Text, comment="公告内容")
    type: Mapped[str] = mapped_column(String(20), default="info", comment="类型")
    
    # 作者
    author_id: Mapped[int] = mapped_column(Integer, ForeignKey("sys_users.id"), index=True, comment="创建者ID")
    
    # 状态
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否发布")
    is_top: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否置顶")
    
    # 有效期
    start_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, comment="开始时间")
    end_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, comment="结束时间")
    
    # 统计
    views: Mapped[int] = mapped_column(Integer, default=0, comment="浏览次数")
    
    # 时间
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now, comment="更新时间")
    
    # 关联
    author: Mapped["User"] = relationship(User, foreign_keys="Announcement.author_id", lazy="selectin", viewonly=True)

    # 索引
    __table_args__ = (
        # 复合索引：查询已发布公告的常见模式
        Index('ix_announcements_published_time', 'is_published', 'created_at'),
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4', 'comment': '系统公告表'},
    )









