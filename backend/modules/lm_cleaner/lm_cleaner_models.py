"""
NotebookLM水印清除模块数据模型
定义数据库表结构
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from core.database import Base
from utils.timezone import get_beijing_time


class LmCleaner(Base):
    """
    NotebookLM水印清除数据表
    
    表名规范：lm_cleaner_<表名>
    """
    __tablename__ = "lm_cleaner_items"
    __table_args__ = {'extend_existing': True, 'comment': 'NotebookLM水印清除数据表'}  # 避免热重载时表重复定义错误
    
    id = Column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    user_id = Column(Integer, nullable=False, index=True, comment="所属用户ID")
    
    title = Column(String(200), nullable=False, comment="标题")
    content = Column(Text, nullable=True, comment="内容")
    source_file = Column(Text, nullable=True, comment="原始文件路径")
    
    # 状态字段
    is_active = Column(Boolean, default=True, comment="是否启用")
    
    # 时间戳（统一使用东八区时间）
    created_at = Column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")
    updated_at = Column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")
    
    def __repr__(self):
        return f"<LmCleaner(id={self.id}, title={self.title})>"
