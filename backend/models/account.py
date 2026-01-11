"""
账户数据模型
用户账号表
"""

from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, Boolean, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base
from utils.timezone import get_beijing_time


class User(Base):
    """用户表"""
    __tablename__ = "sys_users"
    __table_args__ = {"comment": "系统用户表"}
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True, comment="用户名")
    phone: Mapped[Optional[str]] = mapped_column(String(11), unique=True, nullable=True, comment="手机号码")
    password_hash: Mapped[str] = mapped_column(String(128), comment="密码哈希")
    nickname: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, comment="昵称")
    avatar: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, comment="头像URL")
    role: Mapped[str] = mapped_column(String(20), default="guest", comment="角色")
    permissions: Mapped[Optional[list]] = mapped_column(JSON, nullable=True, default=list, comment="权限列表")
    role_ids: Mapped[Optional[list]] = mapped_column(JSON, nullable=True, default=list, comment="角色ID列表")
    settings: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default=dict, comment="个性化设置")
    storage_quota: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, comment="存储配额(字节)")
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否激活")
    last_login: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, comment="最后登录时间")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")

