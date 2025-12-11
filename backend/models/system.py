"""
系统数据模型
模块配置、系统日志、系统设置、用户组
"""

from datetime import datetime, timezone
from typing import Optional, List
from sqlalchemy import String, Integer, Boolean, DateTime, JSON, Text
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base


class ModuleConfig(Base):
    """模块配置表"""
    __tablename__ = "sys_module_configs"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    module_id: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class SystemLog(Base):
    """系统审计日志表"""
    __tablename__ = "sys_logs"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    level: Mapped[str] = mapped_column(String(20), default="INFO", index=True)  # INFO/WARNING/ERROR
    module: Mapped[str] = mapped_column(String(50), index=True)  # 模块名称
    action: Mapped[str] = mapped_column(String(100), index=True)  # 操作类型
    message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # 日志内容
    user_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)  # 操作用户
    ip_address: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # IP地址
    user_agent: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)  # 用户代理
    request_method: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # 请求方法
    request_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)  # 请求路径
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), index=True)


class SystemSetting(Base):
    """系统设置表"""
    __tablename__ = "sys_settings"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    key: Mapped[str] = mapped_column(String(100), unique=True, index=True)  # 设置键
    value: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)  # 设置值（JSON格式）
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class UserGroup(Base):
    """用户组（权限模板）表"""
    __tablename__ = "sys_user_groups"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True)  # 组名称
    permissions: Mapped[Optional[List[str]]] = mapped_column(JSON, nullable=True, default=list)  # 权限列表
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


# 兼容旧命名
Role = UserGroup
