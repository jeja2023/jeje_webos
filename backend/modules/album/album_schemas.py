"""
相册模块数据验证
定义请求/响应的数据结构
"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field


# ==================== 相册模型 ====================

class AlbumBase(BaseModel):
    """相册基础数据模型"""
    name: str = Field(..., min_length=1, max_length=100, description="相册名称")
    description: Optional[str] = Field(None, description="相册描述")
    is_public: bool = Field(False, description="是否公开")


class AlbumCreate(AlbumBase):
    """创建相册请求"""
    pass


class AlbumUpdate(BaseModel):
    """更新相册请求"""
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="相册名称")
    description: Optional[str] = Field(None, description="相册描述")
    is_public: Optional[bool] = Field(None, description="是否公开")
    cover_photo_id: Optional[int] = Field(None, description="封面照片ID")


class AlbumResponse(AlbumBase):
    """相册响应模型"""
    id: int = Field(..., description="相册ID")
    user_id: int = Field(..., description="用户ID")
    cover_photo_id: Optional[int] = Field(None, description="封面照片ID")
    cover_url: Optional[str] = Field(None, description="封面图片URL")
    photo_count: int = Field(0, description="照片数量")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")
    
    model_config = ConfigDict(from_attributes=True)


# ==================== 照片模型 ====================

class PhotoBase(BaseModel):
    """照片基础数据模型"""
    title: Optional[str] = Field(None, max_length=200, description="照片标题")
    description: Optional[str] = Field(None, description="照片描述")


class PhotoCreate(PhotoBase):
    """创建照片请求（用于元数据更新）"""
    pass


class PhotoUpdate(PhotoBase):
    """更新照片请求"""
    sort_order: Optional[int] = Field(None, description="排序序号")


class PhotoResponse(PhotoBase):
    """照片响应模型"""
    id: int = Field(..., description="照片ID")
    album_id: int = Field(..., description="所属相册ID")
    user_id: int = Field(..., description="用户ID")
    filename: str = Field(..., description="原始文件名")
    url: str = Field(..., description="照片URL")
    thumbnail_url: Optional[str] = Field(None, description="缩略图URL")
    width: Optional[int] = Field(None, description="图片宽度")
    height: Optional[int] = Field(None, description="图片高度")
    file_size: Optional[int] = Field(None, description="文件大小")
    mime_type: Optional[str] = Field(None, description="MIME类型")
    taken_at: Optional[datetime] = Field(None, description="拍摄时间")
    sort_order: int = Field(0, description="排序序号")
    created_at: datetime = Field(..., description="上传时间")
    
    model_config = ConfigDict(from_attributes=True)


class PhotoListResponse(BaseModel):
    """照片列表响应"""
    items: List[PhotoResponse] = Field(..., description="照片列表")
    total: int = Field(..., description="总数")


class AlbumListResponse(BaseModel):
    """相册列表响应"""
    items: List[AlbumResponse] = Field(..., description="相册列表")
    total: int = Field(..., description="总数")
    page: int = Field(..., description="当前页")
    page_size: int = Field(..., description="每页数量")


class AlbumDetailResponse(AlbumResponse):
    """相册详情响应（包含照片列表）"""
    photos: List[PhotoResponse] = Field(default_factory=list, description="照片列表")
