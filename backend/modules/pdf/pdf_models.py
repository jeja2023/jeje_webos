"""
PDF 工具模块数据模型
定义数据库表结构
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from core.database import Base
from utils.timezone import get_beijing_time


class Pdf(Base):
    """
    PDF 工具数据表 - 记录用户的 PDF 操作记录
    
    表名规范：pdf_<表名>
    """
    __tablename__ = "pdf_history"
    __table_args__ = {
        'extend_existing': True,
        'comment': 'PDF 工具操作历史记录表'
    }
    
    id = Column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    user_id = Column(Integer, nullable=False, index=True, comment="所属用户ID")
    
    title = Column(String(200), nullable=False, comment="标题/描述")
    filename = Column(String(255), nullable=True, comment="原始文件名")
    file_id = Column(Integer, nullable=True, index=True, comment="关联的文件ID（文件管理器）")
    operation = Column(String(50), nullable=True, comment="操作类型: merge, split, convert, read")
    
    # 时间戳（统一使用东八区时间）
    created_at = Column(DateTime(timezone=True), default=get_beijing_time, comment="操作时间")
    
    def __repr__(self):
        return f"<Pdf(id={self.id}, title={self.title}, operation={self.operation})>"


class PdfItems(Base):
    """
    PDF 工具项目保存表
    """
    __tablename__ = "pdf_items"
    __table_args__ = {
        'extend_existing': True,
        'comment': 'PDF 工具扩展项目表'
    }
    
    id = Column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    user_id = Column(Integer, nullable=False, index=True, comment="所属用户ID")
    
    title = Column(String(200), nullable=False, comment="标题")
    content = Column(Text, nullable=True, comment="内容")
    is_active = Column(Boolean, default=True, comment="是否启用")
    
    # 时间戳
    created_at = Column(DateTime, default=get_beijing_time, comment="创建时间")
    updated_at = Column(DateTime, default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")

    def __repr__(self):
        return f"<PdfItems(id={self.id}, title={self.title})>"
