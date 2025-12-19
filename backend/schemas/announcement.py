"""
公告数据验证
"""

from typing import Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class AnnouncementCreate(BaseModel):
    """创建公告"""
    title: str = Field(..., min_length=1, max_length=200, description="公告标题")
    content: str = Field(..., min_length=1, description="公告内容")
    type: str = Field(default="info", description="公告类型：info, success, warning, error")
    is_published: bool = Field(default=False, description="是否立即发布")
    is_top: bool = Field(default=False, description="是否置顶")
    start_at: Optional[datetime] = Field(None, description="开始时间")
    end_at: Optional[datetime] = Field(None, description="结束时间")


class AnnouncementUpdate(BaseModel):
    """更新公告"""
    title: Optional[str] = Field(None, min_length=1, max_length=200, description="公告标题")
    content: Optional[str] = Field(None, min_length=1, description="公告内容")
    type: Optional[str] = Field(None, description="公告类型")
    is_published: Optional[bool] = Field(None, description="是否发布")
    is_top: Optional[bool] = Field(None, description="是否置顶")
    start_at: Optional[datetime] = Field(None, description="开始时间")
    end_at: Optional[datetime] = Field(None, description="结束时间")


class AnnouncementInfo(BaseModel):
    """公告信息"""
    id: int
    title: str
    content: str
    type: str
    author_id: int
    author_name: Optional[str] = None
    is_published: bool
    is_top: bool
    start_at: Optional[datetime]
    end_at: Optional[datetime]
    views: int
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class AnnouncementListItem(BaseModel):
    """公告列表项"""
    id: int
    title: str
    type: str
    author_id: int
    author_name: Optional[str] = None
    is_published: bool
    is_top: bool
    start_at: Optional[datetime]
    end_at: Optional[datetime]
    views: int
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)











