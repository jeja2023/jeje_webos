# -*- coding: utf-8 -*-
"""
课程学习模块 - 数据验证模型
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime


# ========== 课程相关 Schema ==========

class CourseCreate(BaseModel):
    """创建课程请求"""
    title: str = Field(..., min_length=1, max_length=200, description="课程标题")
    description: Optional[str] = Field(None, description="课程描述")
    cover_image: Optional[str] = Field(None, description="封面图片URL")
    category: Optional[str] = Field(None, max_length=50, description="课程分类")
    difficulty: str = Field("beginner", description="难度等级")
    duration_hours: float = Field(0, ge=0, description="预计学时")


class CourseUpdate(BaseModel):
    """更新课程请求"""
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    cover_image: Optional[str] = None
    category: Optional[str] = None
    difficulty: Optional[str] = None
    duration_hours: Optional[float] = None
    is_published: Optional[bool] = None


class ChapterResponse(BaseModel):
    """章节响应"""
    id: int
    course_id: int
    title: str
    content: Optional[str] = None
    video_url: Optional[str] = None
    sort_order: int
    duration_minutes: int
    created_at: datetime
    
    class Config:
        from_attributes = True


class CourseResponse(BaseModel):
    """课程响应"""
    id: int
    title: str
    description: Optional[str] = None
    cover_image: Optional[str] = None
    category: Optional[str] = None
    difficulty: str
    duration_hours: float
    is_published: bool
    author_id: int
    created_at: datetime
    updated_at: datetime
    chapter_count: int = 0
    
    class Config:
        from_attributes = True


class CourseDetailResponse(CourseResponse):
    """课程详情响应（包含章节列表）"""
    chapters: List[ChapterResponse] = []
    enrolled: bool = False
    progress: float = 0


# ========== 章节相关 Schema ==========

class ChapterCreate(BaseModel):
    """创建章节请求"""
    title: str = Field(..., min_length=1, max_length=200, description="章节标题")
    content: Optional[str] = Field(None, description="章节内容")
    video_url: Optional[str] = Field(None, description="视频链接")
    sort_order: int = Field(0, ge=0, description="排序序号")
    duration_minutes: int = Field(0, ge=0, description="时长（分钟）")


class ChapterUpdate(BaseModel):
    """更新章节请求"""
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    content: Optional[str] = None
    video_url: Optional[str] = None
    sort_order: Optional[int] = None
    duration_minutes: Optional[int] = None


# ========== 学习进度相关 Schema ==========

class EnrollmentResponse(BaseModel):
    """报名记录响应"""
    id: int
    user_id: int
    course_id: int
    progress: float
    last_chapter_id: Optional[int] = None
    enrolled_at: datetime
    completed_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class ProgressUpdate(BaseModel):
    """更新学习进度请求"""
    chapter_id: int = Field(..., description="章节ID")
    is_completed: bool = Field(False, description="是否完成")
    progress_seconds: int = Field(0, ge=0, description="视频播放进度（秒）")


class ChapterProgressResponse(BaseModel):
    """章节进度响应"""
    chapter_id: int
    is_completed: bool
    progress_seconds: int
    
    class Config:
        from_attributes = True


class LearningStatsResponse(BaseModel):
    """学习统计响应"""
    enrolled_count: int = 0
    completed_count: int = 0
    in_progress_count: int = 0
    total_learning_hours: float = 0
