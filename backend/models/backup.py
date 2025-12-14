"""
数据备份数据模型
"""

from typing import Optional
from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, Text, DateTime, Enum as SQLEnum
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
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    backup_type: Mapped[str] = mapped_column(String(20))  # 备份类型
    status: Mapped[str] = mapped_column(String(20), default=BackupStatus.PENDING.value)  # 备份状态
    file_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)  # 备份文件路径
    file_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # 备份文件大小（字节）
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # 备份描述
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # 错误信息
    created_by: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # 创建者ID
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)  # 开始时间
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)  # 完成时间
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    
    # 索引
    __table_args__ = (
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4', 'comment': '系统备份记录表'},
    )





