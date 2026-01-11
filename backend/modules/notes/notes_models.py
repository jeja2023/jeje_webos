"""
笔记数据模型
表名遵循隔离协议：notes_前缀
支持无限层级目录树结构
"""

from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base
from utils.timezone import get_beijing_time


class NotesFolder(Base):
    """笔记文件夹（支持无限层级）"""
    __tablename__ = "notes_folders"
    __table_args__ = {"extend_existing": True, "comment": "笔记文件夹表"}
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    name: Mapped[str] = mapped_column(String(100), comment="文件夹名称")
    
    # 父文件夹（自引用实现无限层级）
    parent_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("notes_folders.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
        comment="父文件夹ID"
    )
    
    # 所属用户（严格隔离）
    user_id: Mapped[int] = mapped_column(Integer, index=True, comment="所属用户ID")
    
    # 排序权重
    order: Mapped[int] = mapped_column(Integer, default=0, comment="排序权重")
    
    # 时间戳
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")


class NotesNote(Base):
    """笔记内容"""
    __tablename__ = "notes_notes"
    __table_args__ = {"extend_existing": True, "comment": "笔记内容表"}
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    title: Mapped[str] = mapped_column(String(200), comment="标题")
    content: Mapped[str] = mapped_column(Text, default="", comment="内容")
    
    # 所属文件夹（可为空，表示根目录）
    folder_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("notes_folders.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="所属文件夹ID"
    )
    
    # 所属用户（严格隔离）
    user_id: Mapped[int] = mapped_column(Integer, index=True, comment="所属用户ID")
    
    # 是否收藏
    is_starred: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否收藏")
    
    # 是否置顶
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否置顶")
    
    # 排序权重
    order: Mapped[int] = mapped_column(Integer, default=0, comment="排序权重")
    
    # 时间戳
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")

    # 关联关系
    from sqlalchemy.orm import relationship
    tags: Mapped[list["NotesTag"]] = relationship(
        "NotesTag",
        secondary="notes_note_tags",
        lazy="selectin",
        viewonly=True
    )


class NotesTag(Base):
    """笔记标签"""
    __tablename__ = "notes_tags"
    __table_args__ = {"extend_existing": True, "comment": "笔记标签表"}
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    name: Mapped[str] = mapped_column(String(50), comment="标签名称")
    color: Mapped[str] = mapped_column(String(20), default="#3b82f6", comment="标签颜色")
    
    # 所属用户（每个用户有自己的标签体系）
    user_id: Mapped[int] = mapped_column(Integer, index=True, comment="所属用户ID")
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")


class NotesNoteTag(Base):
    """笔记与标签关联"""
    __tablename__ = "notes_note_tags"
    __table_args__ = {"extend_existing": True, "comment": "笔记与标签关联表"}
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    note_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("notes_notes.id", ondelete="CASCADE"),
        index=True,
        comment="笔记ID"
    )
    tag_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("notes_tags.id", ondelete="CASCADE"),
        index=True,
        comment="标签ID"
    )

