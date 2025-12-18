"""
博客数据验证模式
"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field


# ============ 分类 ============

class CategoryCreate(BaseModel):
    """创建分类"""
    name: str = Field(..., min_length=1, max_length=50)
    slug: str = Field(..., min_length=1, max_length=50)
    description: Optional[str] = None
    order: int = 0


class CategoryUpdate(BaseModel):
    """更新分类"""
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    order: Optional[int] = None


class CategoryInfo(BaseModel):
    """分类信息"""
    id: int
    name: str
    slug: str
    description: Optional[str]
    order: int
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


# ============ 标签 ============

class TagCreate(BaseModel):
    """创建标签"""
    name: str = Field(..., min_length=1, max_length=30)
    slug: str = Field(..., min_length=1, max_length=30)


class TagInfo(BaseModel):
    """标签信息"""
    id: int
    name: str
    slug: str
    
    model_config = ConfigDict(from_attributes=True)


# ============ 文章 ============

class PostCreate(BaseModel):
    """创建文章"""
    title: str = Field(..., min_length=1, max_length=200)
    slug: str = Field(..., min_length=1, max_length=200)
    summary: Optional[str] = None
    content: str
    cover: Optional[str] = None
    category_id: Optional[int] = None
    tags: List[int] = []
    status: str = "draft"
    is_top: bool = False


class PostUpdate(BaseModel):
    """更新文章"""
    title: Optional[str] = None
    slug: Optional[str] = None
    summary: Optional[str] = None
    content: Optional[str] = None
    cover: Optional[str] = None
    category_id: Optional[int] = None
    tags: Optional[List[int]] = None
    status: Optional[str] = None
    is_top: Optional[bool] = None


class PostInfo(BaseModel):
    """文章信息"""
    id: int
    title: str
    slug: str
    summary: Optional[str]
    content: str
    cover: Optional[str]
    category_id: Optional[int]
    category: Optional[CategoryInfo] = None
    author_id: int
    status: str
    is_top: bool
    views: int
    likes: int
    tags: List[TagInfo] = []
    published_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class PostListItem(BaseModel):
    """文章列表项"""
    id: int
    title: str
    slug: str
    summary: Optional[str]
    cover: Optional[str]
    category: Optional[CategoryInfo] = None
    author_id: int
    status: str
    is_top: bool
    views: int
    likes: int
    tags: List[TagInfo] = []
    published_at: Optional[datetime]
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class PostQuery(BaseModel):
    """文章查询参数"""
    page: int = 1
    size: int = 10
    category_id: Optional[int] = None
    tag_id: Optional[int] = None
    status: Optional[str] = None
    keyword: Optional[str] = None


