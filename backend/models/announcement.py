"""
公告系统数据模型
"""

from typing import Optional
from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, Text, DateTime, ForeignKey, Boolean

from core.database import Base


class Announcement(Base):
    """公告表"""
    __tablename__ = "sys_announcements"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(200))  # 公告标题
    content: Mapped[str] = mapped_column(Text)  # 公告内容
    type: Mapped[str] = mapped_column(String(20), default="info")  # 类型：info, success, warning, error
    
    # 作者
    author_id: Mapped[int] = mapped_column(Integer, index=True)  # 创建者ID
    
    # 状态
    is_published: Mapped[bool] = mapped_column(Boolean, default=False)  # 是否发布
    is_top: Mapped[bool] = mapped_column(Boolean, default=False)  # 是否置顶
    
    # 有效期
    start_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)  # 开始时间
    end_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)  # 结束时间
    
    # 统计
    views: Mapped[int] = mapped_column(Integer, default=0)  # 浏览次数
    
    # 时间
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    # 索引
    __table_args__ = (
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4', 'comment': '系统公告表'},
    )









