# -*- coding: utf-8 -*-
"""
课程学习模块 - 业务逻辑服务
"""

import logging
from typing import List, Optional, Tuple
from datetime import datetime
from utils.timezone import get_beijing_time
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, func, and_

from .course_models import Course, CourseChapter, CourseEnrollment, CourseChapterProgress
from .course_schemas import (
    CourseCreate, CourseUpdate, ChapterCreate, ChapterUpdate, 
    ProgressUpdate, CourseResponse, CourseDetailResponse, ChapterResponse
)

logger = logging.getLogger(__name__)


class CourseService:
    """课程服务"""
    
    # ========== 课程 CRUD ==========
    
    @staticmethod
    async def create_course(db: AsyncSession, user_id: int, data: CourseCreate) -> Course:
        """创建课程"""
        course = Course(
            author_id=user_id,
            **data.model_dump()
        )
        db.add(course)
        await db.commit()
        await db.refresh(course)
        logger.info(f"用户 {user_id} 创建课程: {course.title}")
        return course
    
    @staticmethod
    async def get_course_by_id(db: AsyncSession, course_id: int) -> Optional[Course]:
        """根据ID获取课程"""
        stmt = select(Course).where(Course.id == course_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_course_list(
        db: AsyncSession, 
        user_id: Optional[int] = None,
        only_published: bool = True,
        category: Optional[str] = None,
        keyword: Optional[str] = None,
        skip: int = 0, 
        limit: int = 20
    ) -> Tuple[List[Course], int]:
        """获取课程列表"""
        conditions = []
        
        if only_published:
            conditions.append(Course.is_published == True)
        
        if user_id:
            conditions.append(Course.author_id == user_id)
            
        if category:
            conditions.append(Course.category == category)
            
        if keyword:
            conditions.append(Course.title.contains(keyword))
        
        # 查询总数
        count_stmt = select(func.count(Course.id))
        if conditions:
            count_stmt = count_stmt.where(and_(*conditions))
        total_result = await db.execute(count_stmt)
        total = total_result.scalar() or 0
        
        # 查询列表
        stmt = select(Course).order_by(Course.created_at.desc())
        if conditions:
            stmt = stmt.where(and_(*conditions))
        stmt = stmt.offset(skip).limit(limit)
        
        result = await db.execute(stmt)
        courses = result.scalars().all()
        
        return list(courses), total
    
    @staticmethod
    async def update_course(db: AsyncSession, course_id: int, data: CourseUpdate) -> Optional[Course]:
        """更新课程"""
        course = await CourseService.get_course_by_id(db, course_id)
        if not course:
            return None
            
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(course, key, value)
            
        await db.commit()
        await db.refresh(course)
        return course
    
    @staticmethod
    async def delete_course(db: AsyncSession, course_id: int) -> bool:
        """删除课程"""
        course = await CourseService.get_course_by_id(db, course_id)
        if not course:
            return False
            
        await db.delete(course)
        await db.flush()
        await db.commit()
        logger.info(f"课程已删除: {course_id}")
        return True
    
    @staticmethod
    async def get_course_detail(db: AsyncSession, course_id: int, user_id: Optional[int] = None) -> Optional[dict]:
        """获取课程详情（含章节和学习状态）"""
        course = await CourseService.get_course_by_id(db, course_id)
        if not course:
            return None
        
        # 获取章节列表
        stmt = select(CourseChapter).where(
            CourseChapter.course_id == course_id
        ).order_by(CourseChapter.sort_order)
        result = await db.execute(stmt)
        chapters = result.scalars().all()
        
        # 检查用户是否已报名
        enrolled = False
        progress = 0
        if user_id:
            enrollment = await EnrollmentService.get_enrollment(db, user_id, course_id)
            if enrollment:
                enrolled = True
                progress = enrollment.progress
        
        return {
            **course.__dict__,
            "chapter_count": len(chapters),
            "chapters": [ChapterResponse.model_validate(ch) for ch in chapters],
            "enrolled": enrolled,
            "progress": progress
        }
    
    @staticmethod
    async def get_chapter_count(db: AsyncSession, course_id: int) -> int:
        """获取课程章节数量"""
        stmt = select(func.count(CourseChapter.id)).where(CourseChapter.course_id == course_id)
        result = await db.execute(stmt)
        return result.scalar() or 0


class ChapterService:
    """章节服务"""
    
    @staticmethod
    async def create_chapter(db: AsyncSession, course_id: int, data: ChapterCreate) -> CourseChapter:
        """创建章节"""
        chapter = CourseChapter(
            course_id=course_id,
            **data.model_dump()
        )
        db.add(chapter)
        await db.commit()
        await db.refresh(chapter)
        return chapter
    
    @staticmethod
    async def get_chapter_by_id(db: AsyncSession, chapter_id: int) -> Optional[CourseChapter]:
        """根据ID获取章节"""
        stmt = select(CourseChapter).where(CourseChapter.id == chapter_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_chapters_by_course(db: AsyncSession, course_id: int) -> List[CourseChapter]:
        """获取课程的所有章节"""
        stmt = select(CourseChapter).where(
            CourseChapter.course_id == course_id
        ).order_by(CourseChapter.sort_order)
        result = await db.execute(stmt)
        return list(result.scalars().all())
    
    @staticmethod
    async def update_chapter(db: AsyncSession, chapter_id: int, data: ChapterUpdate) -> Optional[CourseChapter]:
        """更新章节"""
        chapter = await ChapterService.get_chapter_by_id(db, chapter_id)
        if not chapter:
            return None
            
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(chapter, key, value)
            
        await db.commit()
        await db.refresh(chapter)
        return chapter
    
    @staticmethod
    async def delete_chapter(db: AsyncSession, chapter_id: int) -> bool:
        """删除章节"""
        chapter = await ChapterService.get_chapter_by_id(db, chapter_id)
        if not chapter:
            return False
            
        await db.delete(chapter)
        await db.flush()
        await db.commit()
        return True


class EnrollmentService:
    """报名与学习进度服务"""
    
    @staticmethod
    async def enroll_course(db: AsyncSession, user_id: int, course_id: int) -> CourseEnrollment:
        """报名课程"""
        # 检查是否已报名
        existing = await EnrollmentService.get_enrollment(db, user_id, course_id)
        if existing:
            return existing
            
        enrollment = CourseEnrollment(
            user_id=user_id,
            course_id=course_id
        )
        db.add(enrollment)
        await db.commit()
        await db.refresh(enrollment)
        logger.info(f"用户 {user_id} 报名课程 {course_id}")
        return enrollment
    
    @staticmethod
    async def get_enrollment(db: AsyncSession, user_id: int, course_id: int) -> Optional[CourseEnrollment]:
        """获取报名记录"""
        stmt = select(CourseEnrollment).where(
            and_(
                CourseEnrollment.user_id == user_id,
                CourseEnrollment.course_id == course_id
            )
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_user_enrollments(db: AsyncSession, user_id: int) -> List[CourseEnrollment]:
        """获取用户的所有报名记录"""
        stmt = select(CourseEnrollment).where(
            CourseEnrollment.user_id == user_id
        ).order_by(CourseEnrollment.enrolled_at.desc())
        result = await db.execute(stmt)
        return list(result.scalars().all())
    
    @staticmethod
    async def update_chapter_progress(
        db: AsyncSession, 
        user_id: int, 
        data: ProgressUpdate
    ) -> CourseChapterProgress:
        """更新章节学习进度"""
        # 查找或创建进度记录
        stmt = select(CourseChapterProgress).where(
            and_(
                CourseChapterProgress.user_id == user_id,
                CourseChapterProgress.chapter_id == data.chapter_id
            )
        )
        result = await db.execute(stmt)
        progress = result.scalar_one_or_none()
        
        if not progress:
            progress = CourseChapterProgress(
                user_id=user_id,
                chapter_id=data.chapter_id
            )
            db.add(progress)
        
        progress.is_completed = data.is_completed
        progress.progress_seconds = data.progress_seconds
        if data.is_completed and not progress.completed_at:
            progress.completed_at = get_beijing_time()
        
        await db.commit()
        await db.refresh(progress)
        
        # 更新课程总进度
        await EnrollmentService._update_course_progress(db, user_id, data.chapter_id)
        
        return progress
    
    @staticmethod
    async def _update_course_progress(db: AsyncSession, user_id: int, chapter_id: int):
        """更新课程总进度"""
        # 获取章节所属课程
        chapter = await ChapterService.get_chapter_by_id(db, chapter_id)
        if not chapter:
            return
            
        course_id = chapter.course_id
        
        # 获取课程总章节数
        total_chapters = await CourseService.get_chapter_count(db, course_id)
        if total_chapters == 0:
            return
        
        # 获取已完成章节数
        stmt = select(func.count(CourseChapterProgress.id)).where(
            and_(
                CourseChapterProgress.user_id == user_id,
                CourseChapterProgress.is_completed == True,
                CourseChapterProgress.chapter_id.in_(
                    select(CourseChapter.id).where(CourseChapter.course_id == course_id)
                )
            )
        )
        result = await db.execute(stmt)
        completed_chapters = result.scalar() or 0
        
        # 计算进度百分比
        progress = (completed_chapters / total_chapters) * 100
        
        # 更新报名记录
        enrollment = await EnrollmentService.get_enrollment(db, user_id, course_id)
        if enrollment:
            enrollment.progress = progress
            enrollment.last_chapter_id = chapter_id
            if progress >= 100:
                enrollment.completed_at = get_beijing_time()
            await db.commit()
    
    @staticmethod
    async def get_chapter_progress(db: AsyncSession, user_id: int, course_id: int) -> List[CourseChapterProgress]:
        """获取用户在某课程的所有章节进度"""
        stmt = select(CourseChapterProgress).where(
            and_(
                CourseChapterProgress.user_id == user_id,
                CourseChapterProgress.chapter_id.in_(
                    select(CourseChapter.id).where(CourseChapter.course_id == course_id)
                )
            )
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())
    
    @staticmethod
    async def get_learning_stats(db: AsyncSession, user_id: int) -> dict:
        """获取用户学习统计"""
        enrollments = await EnrollmentService.get_user_enrollments(db, user_id)
        
        enrolled_count = len(enrollments)
        completed_count = sum(1 for e in enrollments if e.completed_at)
        in_progress_count = enrolled_count - completed_count
        
        # 计算总学习时长（简化：基于完成的章节数估算）
        total_hours = 0
        for enrollment in enrollments:
            course = await CourseService.get_course_by_id(db, enrollment.course_id)
            if course:
                total_hours += course.duration_hours * (enrollment.progress / 100)
        
        return {
            "enrolled_count": enrolled_count,
            "completed_count": completed_count,
            "in_progress_count": in_progress_count,
            "total_learning_hours": round(total_hours, 1)
        }
