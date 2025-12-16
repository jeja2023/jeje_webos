"""
文件存储数据模型
"""

from typing import Optional
from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, Text, DateTime, ForeignKey

from core.database import Base


class FileRecord(Base):
    """文件记录表"""
    __tablename__ = "sys_files"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    filename: Mapped[str] = mapped_column(String(255))  # 原始文件名
    storage_path: Mapped[str] = mapped_column(String(500))  # 存储相对路径
    file_size: Mapped[int] = mapped_column(Integer)  # 文件大小（字节）
    mime_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # MIME 类型
    uploader_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("sys_users.id"), nullable=True)  # 上传者ID
    category: Mapped[str] = mapped_column(String(50), default="attachment", server_default="attachment")  # 业务分类：avatar, blog, note, attachment
    ref_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # 关联业务ID（可选）
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # 文件描述
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    
    # 索引
    __table_args__ = (
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4', 'comment': '文件存储记录表'},
    )

