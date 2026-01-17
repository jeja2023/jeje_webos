# -*- coding: utf-8 -*-
"""
课程学习模块 - 数据模型
"""

from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Text, Integer, DateTime, ForeignKey, Boolean, Float
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base
from models import User
from utils.timezone import get_beijing_time


class Course(Base):
    """课程表"""
    __tablename__ = "course_courses"
    __table_args__ = {'extend_existing': True, 'comment': '课程表'}
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    title: Mapped[str] = mapped_column(String(200), nullable=False, comment="课程标题")
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="课程描述")
    cover_image: Mapped[Optional[str]] = mapped_column(String(500), nullable=True, comment="封面图片")
    category: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, comment="课程分类")
    difficulty: Mapped[str] = mapped_column(String(20), default="beginner", comment="难度: beginner/intermediate/advanced")
    duration_hours: Mapped[float] = mapped_column(Float, default=0, comment="预计学时（小时）")
    is_published: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否发布")
    author_id: Mapped[int] = mapped_column(ForeignKey(User.id), comment="作者ID")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")
    
    # 关联
    chapters: Mapped[List["CourseChapter"]] = relationship("CourseChapter", back_populates="course", cascade="all, delete-orphan")


class CourseChapter(Base):
    """课程章节表"""
    __tablename__ = "course_chapters"
    __table_args__ = {'extend_existing': True, 'comment': '课程章节表'}
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    course_id: Mapped[int] = mapped_column(ForeignKey("course_courses.id", ondelete="CASCADE"), comment="所属课程ID")
    title: Mapped[str] = mapped_column(String(200), nullable=False, comment="章节标题")
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="章节内容（Markdown）")
    video_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True, comment="视频链接")
    sort_order: Mapped[int] = mapped_column(Integer, default=0, comment="排序序号")
    duration_minutes: Mapped[int] = mapped_column(Integer, default=0, comment="章节时长（分钟）")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")
    
    # 关联
    course: Mapped["Course"] = relationship("Course", back_populates="chapters")


class CourseEnrollment(Base):
    """课程报名/学习记录表"""
    __tablename__ = "course_enrollments"
    __table_args__ = {'extend_existing': True, 'comment': '课程报名记录表'}
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    user_id: Mapped[int] = mapped_column(ForeignKey(User.id), comment="用户ID")
    course_id: Mapped[int] = mapped_column(ForeignKey("course_courses.id", ondelete="CASCADE"), comment="课程ID")
    progress: Mapped[float] = mapped_column(Float, default=0, comment="学习进度 0-100")
    last_chapter_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, comment="上次学习的章节ID")
    enrolled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="报名时间")
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, comment="完成时间")
    

class CourseChapterProgress(Base):
    """章节学习进度表"""
    __tablename__ = "course_chapter_progress"
    __table_args__ = {'extend_existing': True, 'comment': '章节学习进度表'}
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    user_id: Mapped[int] = mapped_column(ForeignKey(User.id), comment="用户ID")
    chapter_id: Mapped[int] = mapped_column(ForeignKey("course_chapters.id", ondelete="CASCADE"), comment="章节ID")
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否完成")
    progress_seconds: Mapped[int] = mapped_column(Integer, default=0, comment="视频播放进度（秒）")
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, comment="完成时间")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")
