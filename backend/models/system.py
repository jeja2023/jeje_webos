"""
系统数据模型
模块配置、系统日志、系统设置、用户组
"""

from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Integer, Boolean, DateTime, JSON, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base


class ModuleConfig(Base):
    """模块配置表"""
    __tablename__ = "sys_module_configs"
    __table_args__ = {"comment": "模块启用状态与配置表"}
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    module_id: Mapped[str] = mapped_column(String(50), unique=True, index=True, comment="模块ID")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, comment="是否启用")
    config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default=dict, comment="配置内容")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now, comment="更新时间")


class SystemLog(Base):
    """系统审计日志表"""
    __tablename__ = "sys_logs"
    __table_args__ = {"comment": "系统审计日志表"}
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    level: Mapped[str] = mapped_column(String(20), default="INFO", index=True, comment="日志级别")
    module: Mapped[str] = mapped_column(String(50), index=True, comment="模块名称")
    action: Mapped[str] = mapped_column(String(100), index=True, comment="操作类型")
    message: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="日志内容")
    user_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True, comment="操作用户ID")
    ip_address: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, comment="IP地址")
    user_agent: Mapped[Optional[str]] = mapped_column(String(500), nullable=True, comment="用户代理")
    request_method: Mapped[Optional[str]] = mapped_column(String(10), nullable=True, comment="请求方法")
    request_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True, comment="请求路径")
    # 需求：数据库中直接呈现东八区时间，因此使用本地时间存储（会话已设置 +08:00）
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, index=True, comment="创建时间")


class SystemSetting(Base):
    """系统设置表"""
    __tablename__ = "sys_settings"
    __table_args__ = {"comment": "系统配置项表"}
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    key: Mapped[str] = mapped_column(String(100), unique=True, index=True, comment="配置键")
    value: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, comment="配置值")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now, comment="更新时间")


class UserGroup(Base):
    """用户组（权限模板）表"""
    __tablename__ = "sys_user_groups"
    __table_args__ = {"comment": "用户组/权限模板表"}
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    name: Mapped[str] = mapped_column(String(100), unique=True, index=True, comment="组名称")
    permissions: Mapped[Optional[List[str]]] = mapped_column(JSON, nullable=True, default=list, comment="权限列表")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now, comment="更新时间")


class UserModule(Base):
    """用户模块配置表"""
    __tablename__ = "sys_user_modules"
    __table_args__ = (
        UniqueConstraint('user_id', 'module_id', name='uq_user_module'),
        {"comment": "用户个人模块安装与启用状态表"}
    )
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    user_id: Mapped[int] = mapped_column(Integer, index=True, comment="用户ID")
    module_id: Mapped[str] = mapped_column(String(50), index=True, comment="模块ID")
    installed: Mapped[bool] = mapped_column(Boolean, default=True, comment="用户是否安装")
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, comment="用户是否启用")
    installed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, default=datetime.now, comment="安装时间")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now, comment="更新时间")


# 兼容旧命名
Role = UserGroup
