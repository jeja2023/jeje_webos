"""
数据备份数据模型
"""

from typing import Optional
from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, Text, DateTime, Boolean
import enum

from core.database import Base


class BackupType(str, enum.Enum):
    """备份类型"""
    FULL = "full"  # 全量备份
    INCREMENTAL = "incremental"  # 增量备份
    DATABASE = "database"  # 仅数据库
    FILES = "files"  # 仅文件


class BackupStatus(str, enum.Enum):
    """备份状态"""
    PENDING = "pending"  # 待执行
    RUNNING = "running"  # 执行中
    SUCCESS = "success"  # 成功
    FAILED = "failed"  # 失败


class BackupRecord(Base):
    """备份记录表"""
    __tablename__ = "sys_backups"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    backup_type: Mapped[str] = mapped_column(String(20), comment="备份类型")
    status: Mapped[str] = mapped_column(String(20), default=BackupStatus.PENDING.value, comment="备份状态")
    file_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True, comment="备份文件路径")
    file_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, comment="备份文件大小(字节)")
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="备份描述")
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="错误信息")
    is_encrypted: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否加密")
    created_by: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, comment="创建者ID")
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, comment="开始时间")
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, comment="完成时间")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, comment="创建时间")
    
    # 索引
    __table_args__ = (
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4', 'comment': '系统备份记录表'},
    )


class BackupSchedule(Base):
    """备份计划表"""
    __tablename__ = "sys_backup_schedules"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    name: Mapped[str] = mapped_column(String(100), comment="计划名称")
    backup_type: Mapped[str] = mapped_column(String(20), default="full", comment="备份类型")
    schedule_type: Mapped[str] = mapped_column(String(20), comment="调度类型: daily, weekly, monthly")
    schedule_time: Mapped[str] = mapped_column(String(10), comment="执行时间 HH:MM")
    schedule_day: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, comment="执行日期 (周几1-7 或 月几1-31)")
    is_encrypted: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否加密")
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, comment="是否启用")
    retention_days: Mapped[int] = mapped_column(Integer, default=30, comment="保留天数")
    last_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, comment="上次执行时间")
    next_run_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, comment="下次执行时间")
    created_by: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, comment="创建者ID")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now, comment="更新时间")
    
    __table_args__ = (
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4', 'comment': '备份调度计划表'},
    )

