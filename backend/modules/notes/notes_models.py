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


class NotesFolder(Base):
    """笔记文件夹（支持无限层级）"""
    __tablename__ = "notes_folders"
    __table_args__ = {"extend_existing": True, "comment": "笔记文件夹表"}
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100))  # 文件夹名称
    
    # 父文件夹（自引用实现无限层级）
    parent_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("notes_folders.id", ondelete="CASCADE"),
        nullable=True,
        index=True
    )
    
    # 所属用户（严格隔离）
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    
    # 排序权重
    order: Mapped[int] = mapped_column(Integer, default=0)
    
    # 时间戳
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)


class NotesNote(Base):
    """笔记内容"""
    __tablename__ = "notes_notes"
    __table_args__ = {"extend_existing": True, "comment": "笔记内容表"}
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(200))  # 标题
    content: Mapped[str] = mapped_column(Text, default="")  # 内容（Markdown）
    
    # 所属文件夹（可为空，表示根目录）
    folder_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("notes_folders.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    
    # 所属用户（严格隔离）
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    
    # 是否收藏
    is_starred: Mapped[bool] = mapped_column(Boolean, default=False)
    
    # 是否置顶
    is_pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    
    # 排序权重
    order: Mapped[int] = mapped_column(Integer, default=0)
    
    # 时间戳
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)


class NotesTag(Base):
    """笔记标签"""
    __tablename__ = "notes_tags"
    __table_args__ = {"extend_existing": True, "comment": "笔记标签表"}
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50))  # 标签名称
    color: Mapped[str] = mapped_column(String(20), default="#3b82f6")  # 标签颜色
    
    # 所属用户（每个用户有自己的标签体系）
    user_id: Mapped[int] = mapped_column(Integer, index=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class NotesNoteTag(Base):
    """笔记与标签关联"""
    __tablename__ = "notes_note_tags"
    __table_args__ = {"extend_existing": True, "comment": "笔记与标签关联表"}
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    note_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("notes_notes.id", ondelete="CASCADE"),
        index=True
    )
    tag_id: Mapped[int] = mapped_column(
        Integer,
        ForeignKey("notes_tags.id", ondelete="CASCADE"),
        index=True
    )

