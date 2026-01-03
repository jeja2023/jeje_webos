"""
视频模块数据验证
定义请求/响应的数据结构
"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field


# ==================== 视频集模型 ====================

class CollectionBase(BaseModel):
    """视频集基础数据模型"""
    name: str = Field(..., min_length=1, max_length=100, description="视频集名称")
    description: Optional[str] = Field(None, description="视频集描述")
    is_public: bool = Field(False, description="是否公开")


class CollectionCreate(CollectionBase):
    """创建视频集请求"""
    pass


class CollectionUpdate(BaseModel):
    """更新视频集请求"""
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="视频集名称")
    description: Optional[str] = Field(None, description="视频集描述")
    is_public: Optional[bool] = Field(None, description="是否公开")
    cover_video_id: Optional[int] = Field(None, description="封面视频ID")


class CollectionResponse(CollectionBase):
    """视频集响应模型"""
    id: int = Field(..., description="视频集ID")
    user_id: int = Field(..., description="用户ID")
    cover_video_id: Optional[int] = Field(None, description="封面视频ID")
    cover_url: Optional[str] = Field(None, description="封面图片URL")
    video_count: int = Field(0, description="视频数量")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")
    
    model_config = ConfigDict(from_attributes=True)


# ==================== 视频模型 ====================

class VideoBase(BaseModel):
    """视频基础数据模型"""
    title: Optional[str] = Field(None, max_length=200, description="视频标题")
    description: Optional[str] = Field(None, description="视频描述")


class VideoCreate(VideoBase):
    """创建视频请求（用于元数据更新）"""
    pass


class VideoUpdate(VideoBase):
    """更新视频请求"""
    sort_order: Optional[int] = Field(None, description="排序序号")


class VideoResponse(VideoBase):
    """视频响应模型"""
    id: int = Field(..., description="视频ID")
    collection_id: int = Field(..., description="所属视频集ID")
    user_id: int = Field(..., description="用户ID")
    filename: str = Field(..., description="原始文件名")
    url: str = Field(..., description="视频URL")
    thumbnail_url: Optional[str] = Field(None, description="缩略图URL")
    duration: Optional[int] = Field(None, description="时长(秒)")
    width: Optional[int] = Field(None, description="视频宽度")
    height: Optional[int] = Field(None, description="视频高度")
    file_size: Optional[int] = Field(None, description="文件大小")
    mime_type: Optional[str] = Field(None, description="MIME类型")
    sort_order: int = Field(0, description="排序序号")
    created_at: datetime = Field(..., description="上传时间")
    
    model_config = ConfigDict(from_attributes=True)


class VideoListResponse(BaseModel):
    """视频列表响应"""
    items: List[VideoResponse] = Field(..., description="视频列表")
    total: int = Field(..., description="总数")


class CollectionListResponse(BaseModel):
    """视频集列表响应"""
    items: List[CollectionResponse] = Field(..., description="视频集列表")
    total: int = Field(..., description="总数")
    page: int = Field(..., description="当前页")
    page_size: int = Field(..., description="每页数量")


class CollectionDetailResponse(CollectionResponse):
    """视频集详情响应（包含视频列表）"""
    videos: List[VideoResponse] = Field(default_factory=list, description="视频列表")
