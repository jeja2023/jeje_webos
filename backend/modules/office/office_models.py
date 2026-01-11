# -*- coding: utf-8 -*-
"""
协同办公数据模型
表名遵循隔离协议：office_前缀
"""

from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, Boolean, DateTime, Text, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base
from utils.timezone import get_beijing_time


class OfficeDocument(Base):
    """办公文档表（Word文档和Excel表格共用）"""
    __tablename__ = "office_documents"
    __table_args__ = (
        Index("idx_office_doc_user", "user_id"),
        Index("idx_office_doc_folder", "folder_id"),
        Index("idx_office_doc_type", "doc_type"),
        {"extend_existing": True, "comment": "协同办公文档表"}
    )
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    
    # 文档基本信息
    title: Mapped[str] = mapped_column(String(200), comment="文档标题")
    doc_type: Mapped[str] = mapped_column(String(20), comment="文档类型: doc/sheet")
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="文档内容(JSON格式)")
    
    # 所属用户
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("sys_users.id", ondelete="CASCADE"), comment="所有者ID")
    
    # 文件夹关联（与文件管理器打通）
    folder_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("fm_folders.id", ondelete="SET NULL"), nullable=True, comment="所属文件夹ID")
    
    # 文档状态
    is_starred: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否收藏")
    is_template: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否模板")
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否已删除(回收站)")
    
    # 协作设置
    share_type: Mapped[str] = mapped_column(String(20), default="private", comment="分享类型: private/link/public")
    share_code: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, comment="分享码")
    share_permission: Mapped[str] = mapped_column(String(20), default="view", comment="分享权限: view/edit")
    
    # 版本控制
    version: Mapped[int] = mapped_column(Integer, default=1, comment="当前版本号")
    
    # 时间戳
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, comment="删除时间")


class OfficeVersion(Base):
    """文档版本历史表"""
    __tablename__ = "office_versions"
    __table_args__ = (
        Index("idx_office_version_doc", "document_id"),
        {"extend_existing": True, "comment": "文档版本历史表"}
    )
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(Integer, ForeignKey("office_documents.id", ondelete="CASCADE"), comment="文档ID")
    version: Mapped[int] = mapped_column(Integer, comment="版本号")
    content: Mapped[str] = mapped_column(Text, comment="版本内容快照")
    user_id: Mapped[int] = mapped_column(Integer, comment="修改用户ID")
    comment: Mapped[Optional[str]] = mapped_column(String(500), nullable=True, comment="版本备注")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")


class OfficeCollaborator(Base):
    """文档协作者表"""
    __tablename__ = "office_collaborators"
    __table_args__ = (
        Index("idx_office_collab_doc", "document_id"),
        Index("idx_office_collab_user", "user_id"),
        {"extend_existing": True, "comment": "文档协作者表"}
    )
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(Integer, ForeignKey("office_documents.id", ondelete="CASCADE"), comment="文档ID")
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("sys_users.id", ondelete="CASCADE"), comment="协作者用户ID")
    permission: Mapped[str] = mapped_column(String(20), default="edit", comment="权限: view/edit/admin")
    invited_by: Mapped[int] = mapped_column(Integer, comment="邀请人ID")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="邀请时间")


class OfficeEditSession(Base):
    """实时编辑会话表（用于协同编辑状态追踪）"""
    __tablename__ = "office_edit_sessions"
    __table_args__ = (
        Index("idx_office_session_doc", "document_id"),
        {"extend_existing": True, "comment": "实时编辑会话表"}
    )
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(Integer, ForeignKey("office_documents.id", ondelete="CASCADE"), comment="文档ID")
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("sys_users.id", ondelete="CASCADE"), comment="编辑用户ID")
    session_id: Mapped[str] = mapped_column(String(64), comment="WebSocket会话ID")
    cursor_position: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, comment="光标位置(JSON)")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, comment="是否活跃")
    last_activity: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="最后活动时间")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="加入时间")
