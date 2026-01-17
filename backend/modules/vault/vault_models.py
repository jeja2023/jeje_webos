# -*- coding: utf-8 -*-
"""
密码保险箱数据模型
表名遵循隔离协议：vault_前缀
采用AES加密存储敏感数据
"""

from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base
from utils.timezone import get_beijing_time


class VaultCategory(Base):
    """密码分类"""
    __tablename__ = "vault_categories"
    __table_args__ = {"extend_existing": True, "comment": "密码分类表"}
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    name: Mapped[str] = mapped_column(String(100), comment="分类名称")
    icon: Mapped[str] = mapped_column(String(50), default="📁", comment="分类图标")
    color: Mapped[str] = mapped_column(String(20), default="#3b82f6", comment="分类颜色")
    
    # 所属用户（严格隔离）
    user_id: Mapped[int] = mapped_column(Integer, index=True, comment="所属用户ID")
    
    # 排序权重
    order: Mapped[int] = mapped_column(Integer, default=0, comment="排序权重")
    
    # 时间戳
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")


class VaultItem(Base):
    """密码条目"""
    __tablename__ = "vault_items"
    __table_args__ = {"extend_existing": True, "comment": "密码条目表"}
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    
    # 基本信息
    title: Mapped[str] = mapped_column(String(200), comment="条目标题")
    website: Mapped[Optional[str]] = mapped_column(String(500), nullable=True, comment="网站地址")
    
    # 加密存储的敏感数据
    username_encrypted: Mapped[str] = mapped_column(Text, comment="加密的用户名")
    password_encrypted: Mapped[str] = mapped_column(Text, comment="加密的密码")
    notes_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="加密的备注")
    
    # 所属分类（可为空，表示未分类）
    category_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("vault_categories.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="所属分类ID"
    )
    
    # 所属用户（严格隔离）
    user_id: Mapped[int] = mapped_column(Integer, index=True, comment="所属用户ID")
    
    # 是否收藏
    is_starred: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否收藏")
    
    # 最后使用时间
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, comment="最后使用时间")
    
    # 时间戳
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")


class VaultMasterKey(Base):
    """用户主密钥（用于验证主密码）"""
    __tablename__ = "vault_master_keys"
    __table_args__ = {"extend_existing": True, "comment": "用户主密钥表"}
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    
    # 所属用户（每个用户只有一条记录）
    user_id: Mapped[int] = mapped_column(Integer, unique=True, index=True, comment="所属用户ID")
    
    # 主密码的哈希值（用于验证）
    master_key_hash: Mapped[str] = mapped_column(String(255), comment="主密码哈希")
    
    # 加密用的盐值
    salt: Mapped[str] = mapped_column(String(64), comment="加密盐值")
    
    # 验证用的校验值（加密后的固定字符串，用于验证主密码是否正确）
    verification_hash: Mapped[str] = mapped_column(String(255), comment="验证哈希")
    
    # 恢复码相关字段（用于忘记主密码时恢复）
    recovery_salt: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, comment="恢复码盐值")
    encrypted_data_key: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="用恢复码加密的数据密钥")
    
    # 安全锁定相关
    failed_attempts: Mapped[int] = mapped_column(Integer, default=0, comment="连续失败尝试次数")
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否已锁定")
    
    # 时间戳
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")
