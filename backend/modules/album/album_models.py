"""
相册模块数据模型
定义数据库表结构
"""

from datetime import datetime
from sqlalchemy import Column, Integer, String, Text, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship

from core.database import Base
from utils.timezone import get_beijing_time


class Album(Base):
    """
    相册数据表
    用于管理相册/相集
    """
    __tablename__ = "album_albums"
    __table_args__ = {'extend_existing': True, 'comment': '相册表'}
    
    id = Column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    user_id = Column(Integer, nullable=False, index=True, comment="所属用户ID")
    
    name = Column(String(100), nullable=False, comment="相册名称")
    description = Column(Text, nullable=True, comment="相册描述")
    cover_photo_id = Column(Integer, nullable=True, comment="封面照片ID")
    
    # 统计字段
    photo_count = Column(Integer, default=0, comment="照片数量")
    
    # 状态字段
    is_public = Column(Boolean, default=False, comment="是否公开")
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")
    updated_at = Column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")
    
    # 关联照片
    photos = relationship("AlbumPhoto", back_populates="album", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Album(id={self.id}, name={self.name})>"


class AlbumPhoto(Base):
    """
    照片数据表
    存储相册中的照片信息
    """
    __tablename__ = "album_photos"
    __table_args__ = {'extend_existing': True, 'comment': '照片表'}
    
    id = Column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    user_id = Column(Integer, nullable=False, index=True, comment="所属用户ID")
    album_id = Column(Integer, ForeignKey("album_albums.id", ondelete="CASCADE"), nullable=False, index=True, comment="所属相册ID")
    
    # 文件信息
    filename = Column(String(255), nullable=False, comment="原始文件名")
    storage_path = Column(String(500), nullable=False, comment="存储路径")
    thumbnail_path = Column(String(500), nullable=True, comment="缩略图路径")
    
    # 图片元信息
    title = Column(String(200), nullable=True, comment="照片标题")
    description = Column(Text, nullable=True, comment="照片描述")
    width = Column(Integer, nullable=True, comment="图片宽度")
    height = Column(Integer, nullable=True, comment="图片高度")
    file_size = Column(Integer, nullable=True, comment="文件大小(字节)")
    mime_type = Column(String(50), nullable=True, comment="MIME类型")
    
    # EXIF信息（可选）
    taken_at = Column(DateTime, nullable=True, comment="拍摄时间")
    camera_model = Column(String(100), nullable=True, comment="相机型号")
    
    # 排序字段
    sort_order = Column(Integer, default=0, comment="排序序号")
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), default=get_beijing_time, comment="上传时间")
    updated_at = Column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")
    
    # 关联相册
    album = relationship("Album", back_populates="photos")
    
    def __repr__(self):
        return f"<AlbumPhoto(id={self.id}, filename={self.filename})>"
