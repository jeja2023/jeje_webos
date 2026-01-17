"""
文件管理数据模型
虚拟文件夹系统，物理文件存储在 storage 目录
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, BigInteger, Text, Boolean, Index
from sqlalchemy.orm import relationship, backref
from core.database import Base
from utils.timezone import get_beijing_time


class VirtualFolder(Base):
    """虚拟文件夹"""
    __tablename__ = "fm_folders"
    __table_args__ = (
        Index("idx_fm_folder_user", "user_id"),
        Index("idx_fm_folder_parent", "parent_id"),
        # path 字段太长无法建索引，通过 user_id 和 parent_id 查询
        {"extend_existing": True, "comment": "文件管理虚拟文件夹表"}
    )
    
    id = Column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    name = Column(String(255), nullable=False, comment="文件夹名称")
    parent_id = Column(Integer, ForeignKey("fm_folders.id", ondelete="CASCADE"), nullable=True, comment="父文件夹ID")
    user_id = Column(Integer, ForeignKey("sys_users.id", ondelete="CASCADE"), nullable=False, comment="所属用户ID")
    path = Column(String(1024), nullable=False, default="/", comment="完整路径")
    
    created_at = Column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")
    updated_at = Column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")
    
    # 关系 - 通过 VirtualFile 的 backref 自动创建 files


class VirtualFile(Base):
    """虚拟文件（关联物理文件）"""
    __tablename__ = "fm_files"
    __table_args__ = (
        Index("idx_fm_file_user", "user_id"),
        Index("idx_fm_file_folder", "folder_id"),
        Index("idx_fm_file_name", "name"),
        {"extend_existing": True, "comment": "文件管理虚拟文件表"}
    )
    
    id = Column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    name = Column(String(255), nullable=False, comment="文件名")
    folder_id = Column(Integer, ForeignKey("fm_folders.id", ondelete="CASCADE"), nullable=True, comment="所属文件夹ID")
    user_id = Column(Integer, ForeignKey("sys_users.id", ondelete="CASCADE"), nullable=False, comment="所属用户ID")
    
    # 物理文件信息
    storage_path = Column(String(512), nullable=False, comment="物理存储路径")
    file_size = Column(BigInteger, default=0, comment="文件大小(字节)")
    mime_type = Column(String(128), nullable=True, comment="MIME类型")
    
    # 元数据
    description = Column(Text, nullable=True, comment="文件描述")
    is_starred = Column(Boolean, default=False, comment="是否收藏")
    
    created_at = Column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")
    updated_at = Column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")
    
    # 代码中直接使用 folder_id 进行查询，不需要 relationship
    # 如果需要访问 folder 对象，可以通过 folder_id 查询 VirtualFolder
