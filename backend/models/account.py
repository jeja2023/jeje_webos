"""
账户数据模型
用户账号表
"""

from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, Integer, Boolean, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base


class User(Base):
    """用户表"""
    __tablename__ = "sys_users"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    phone: Mapped[Optional[str]] = mapped_column(String(11), unique=True, nullable=True)  # 手机号码
    password_hash: Mapped[str] = mapped_column(String(128))
    nickname: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    avatar: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    role: Mapped[str] = mapped_column(String(20), default="guest")  # 角色：admin/guest/自定义
    permissions: Mapped[Optional[list]] = mapped_column(JSON, nullable=True, default=list)
    role_ids: Mapped[Optional[list]] = mapped_column(JSON, nullable=True, default=list)
    is_active: Mapped[bool] = mapped_column(Boolean, default=False)  # 默认未激活，需管理员审核
    last_login: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

