"""
视频模块数据模型
定义数据库表结构
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from core.database import Base
from utils.timezone import get_beijing_time


class VideoCollection(Base):
    """
    视频集数据表
    用于管理视频合集/分类
    """
    __tablename__ = "video_collections"
    __table_args__ = {'extend_existing': True, 'comment': '视频集表'}
    
    id = Column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    user_id = Column(Integer, nullable=False, index=True, comment="所属用户ID")
    
    name = Column(String(100), nullable=False, comment="视频集名称")
    description = Column(Text, nullable=True, comment="视频集描述")
    cover_video_id = Column(Integer, nullable=True, comment="封面视频ID")
    
    # 统计字段
    video_count = Column(Integer, default=0, comment="视频数量")
    
    # 状态字段
    is_public = Column(Boolean, default=False, comment="是否公开")
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")
    updated_at = Column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")
    
    # 关联视频
    videos = relationship("Video", back_populates="collection", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<VideoCollection(id={self.id}, name={self.name})>"


class Video(Base):
    """
    视频数据表
    存储视频集中的视频信息
    """
    __tablename__ = "video_videos"
    __table_args__ = {'extend_existing': True, 'comment': '视频表'}
    
    id = Column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    user_id = Column(Integer, nullable=False, index=True, comment="所属用户ID")
    collection_id = Column(Integer, ForeignKey("video_collections.id", ondelete="CASCADE"), nullable=False, index=True, comment="所属视频集ID")
    
    # 文件信息
    filename = Column(String(255), nullable=False, comment="原始文件名")
    storage_path = Column(String(500), nullable=False, comment="存储路径")
    thumbnail_path = Column(String(500), nullable=True, comment="缩略图路径")
    
    # 视频元信息
    title = Column(String(200), nullable=True, comment="视频标题")
    description = Column(Text, nullable=True, comment="视频描述")
    duration = Column(Integer, nullable=True, comment="时长(秒)")
    width = Column(Integer, nullable=True, comment="视频宽度")
    height = Column(Integer, nullable=True, comment="视频高度")
    file_size = Column(Integer, nullable=True, comment="文件大小(字节)")
    mime_type = Column(String(50), nullable=True, comment="MIME类型")
    
    # 排序字段
    sort_order = Column(Integer, default=0, comment="排序序号")
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), default=get_beijing_time, comment="上传时间")
    updated_at = Column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")
    
    # 关联视频集
    collection = relationship("VideoCollection", back_populates="videos")
    
    def __repr__(self):
        return f"<Video(id={self.id}, filename={self.filename})>"
