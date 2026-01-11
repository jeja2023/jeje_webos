"""
知识库模块数据模型
"""

from datetime import datetime
from typing import Optional, Dict, Any
from sqlalchemy import Integer, String, Text, Boolean, ForeignKey, JSON, DateTime
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base
from models import User
from utils.timezone import get_beijing_time

class KnowledgeBase(Base):
    """知识库"""
    __tablename__ = "knowledge_bases"
    
    __table_args__ = (
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4', 'comment': '知识库列表', 'extend_existing': True},
    )
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, comment="主键ID")
    name: Mapped[str] = mapped_column(String(50), nullable=False, comment="知识库名称")
    description: Mapped[str] = mapped_column(String(200), default="", comment="描述")
    cover: Mapped[str] = mapped_column(String(255), nullable=True, comment="封面图")
    owner_id: Mapped[int] = mapped_column(ForeignKey(User.id), nullable=False, comment="所有者ID")
    is_public: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否公开")
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")

class KnowledgeNode(Base):
    """知识库节点（文档/文件夹/文件）"""
    __tablename__ = "knowledge_nodes"
    
    __table_args__ = (
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4', 'comment': '知识库节点表', 'extend_existing': True},
    )
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, comment="主键ID")
    base_id: Mapped[int] = mapped_column(ForeignKey("knowledge_bases.id", ondelete="CASCADE"), nullable=False, comment="所属知识库ID")
    # 自引用使用字符串形式，避免定义顺序问题
    parent_id: Mapped[Optional[int]] = mapped_column(ForeignKey("knowledge_nodes.id", ondelete="CASCADE"), nullable=True, comment="父节点ID")
    
    title: Mapped[str] = mapped_column(String(100), nullable=False, comment="标题")
    node_type: Mapped[str] = mapped_column(String(20), default="document", comment="节点类型")  # folder, document, file
    
    # 纯文本/Markdown内容
    content: Mapped[str] = mapped_column(Text, nullable=True, comment="文档内容")
    
    # 实体文件相关
    file_path: Mapped[str] = mapped_column(String(255), nullable=True, comment="文件路径")
    file_meta: Mapped[Dict[str, Any]] = mapped_column(JSON, default={}, comment="文件元数据")  # size, mime, ext
    
    sort_order: Mapped[int] = mapped_column(Integer, default=0, comment="排序")
    status: Mapped[str] = mapped_column(String(20), default="draft", comment="状态")  # draft, published
    
    created_by: Mapped[int] = mapped_column(ForeignKey(User.id), comment="创建者ID")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")
    
    # 关系便于查询
    parent: Mapped[Optional["KnowledgeNode"]] = relationship("KnowledgeNode", remote_side=[id], back_populates="children")
    children: Mapped[list["KnowledgeNode"]] = relationship("KnowledgeNode", back_populates="parent", cascade="all, delete-orphan")

class KnowledgeEntity(Base):
    """知识实体 (用于知识图谱)"""
    __tablename__ = "knowledge_entities"
    __table_args__ = ({'comment': '知识实体表'},)
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    base_id: Mapped[int] = mapped_column(ForeignKey("knowledge_bases.id", ondelete="CASCADE"), nullable=False)
    node_id: Mapped[int] = mapped_column(ForeignKey("knowledge_nodes.id", ondelete="CASCADE"), nullable=False)
    
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)  # 人物, 机构, 地点, 概念...
    description: Mapped[str] = mapped_column(Text, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time)

class KnowledgeRelation(Base):
    """知识关系 (用于知识图谱)"""
    __tablename__ = "knowledge_relations"
    __table_args__ = ({'comment': '知识关系表'},)
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    base_id: Mapped[int] = mapped_column(ForeignKey("knowledge_bases.id", ondelete="CASCADE"), nullable=False)
    
    source_id: Mapped[int] = mapped_column(ForeignKey("knowledge_entities.id", ondelete="CASCADE"), nullable=False)
    target_id: Mapped[int] = mapped_column(ForeignKey("knowledge_entities.id", ondelete="CASCADE"), nullable=False)
    
    relation_type: Mapped[str] = mapped_column(String(100), nullable=False)  # 属于, 位于, 合作, 包含...
    description: Mapped[str] = mapped_column(Text, nullable=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time)
