"""
模块数据模型模板
表名遵循隔离协议：{module_id}_前缀

使用说明：
1. 复制此文件并重命名为 {module_id}_models.py
2. 替换所有 {module_id}、{ModuleName}、{table_name} 等占位符
3. 根据实际需求定义数据表结构
"""

from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, Integer, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base


class {ModuleName}(Base):
    """{模块名称}表"""
    __tablename__ = "{module_id}_{table_name}"  # 必须使用模块前缀
    __table_args__ = {"extend_existing": True}   # 避免表已存在错误
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    
    # 业务字段（根据实际需求修改）
    title: Mapped[str] = mapped_column(String(200))  # 标题
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # 内容
    
    # 关联用户（如果需要用户隔离）
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("sys_users.id"), index=True)
    
    # 状态字段
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    
    # 时间字段
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))










