# -*- coding: utf-8 -*-
"""
模块数据模型模板
表名遵循隔离协议：模块ID_前缀

使用说明：
1. 复制此文件并重命名为 xxx_models.py（xxx 为模块ID）
2. 替换 TemplateModel 类名为实际的模型类名
3. 替换 module_template_items 为实际的表名
4. 根据实际需求定义数据表结构
5. 时间字段统一使用东八区时间（get_beijing_time）
"""

from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base
from utils.timezone import get_beijing_time


class TemplateModel(Base):
    """模板数据表（请修改类名和表名）"""
    __tablename__ = "module_template_items"  # 必须使用模块前缀
    __table_args__ = {"extend_existing": True}   # 避免表已存在错误
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    
    # 业务字段（根据实际需求修改）
    title: Mapped[str] = mapped_column(String(200), comment="标题")
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="内容")
    
    # 关联用户（如果需要用户隔离）
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("sys_users.id"), index=True, comment="用户ID")
    
    # 状态字段
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, comment="是否启用")
    
    # 时间字段（统一使用东八区时间）
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")
