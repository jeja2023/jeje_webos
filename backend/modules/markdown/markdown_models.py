# -*- coding: utf-8 -*-
"""
Markdown 文档数据模型
"""

from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import Integer, String, Text, DateTime, ForeignKey, Boolean
from datetime import datetime

from core.database import Base
from models import User
from utils.timezone import get_beijing_time


class MarkdownDoc(Base):
    """Markdown 文档表"""
    __tablename__ = "markdown_docs"
    __table_args__ = {
        'extend_existing': True,
        'comment': 'Markdown文档表'
    }
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="文档ID")
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey(User.id), nullable=False, comment="用户ID")
    title: Mapped[str] = mapped_column(String(200), nullable=False, comment="文档标题")
    content: Mapped[str] = mapped_column(Text, nullable=True, default="", comment="Markdown内容")
    summary: Mapped[str] = mapped_column(String(500), nullable=True, default="", comment="文档摘要")
    is_public: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否公开")
    is_starred: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否收藏")
    view_count: Mapped[int] = mapped_column(Integer, default=0, comment="阅读次数")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        default=get_beijing_time, 
        comment="创建时间"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        default=get_beijing_time, 
        onupdate=get_beijing_time, 
        comment="更新时间"
    )
    
    # 关联用户
    user: Mapped[User] = relationship(User, lazy="joined")
    
    def __repr__(self):
        return f"<MarkdownDoc(id={self.id}, title='{self.title}')>"


class MarkdownTemplate(Base):
    """Markdown 模板表"""
    __tablename__ = "markdown_templates"
    __table_args__ = {
        'extend_existing': True,
        'comment': 'Markdown模板表'
    }
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="模板ID")
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey(User.id), nullable=True, comment="创建用户ID，NULL表示系统模板")
    name: Mapped[str] = mapped_column(String(100), nullable=False, comment="模板名称")
    description: Mapped[str] = mapped_column(String(300), nullable=True, default="", comment="模板描述")
    content: Mapped[str] = mapped_column(Text, nullable=False, comment="模板内容")
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否为系统模板")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), 
        default=get_beijing_time, 
        comment="创建时间"
    )
    
    def __repr__(self):
        return f"<MarkdownTemplate(id={self.id}, name='{self.name}')>"
