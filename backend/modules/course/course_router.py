# -*- coding: utf-8 -*-
"""
课程学习模块 - API 路由
"""

import logging
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from core.database import get_db
from core.security import get_current_user, TokenData
from schemas.response import success, error

from .course_schemas import (
    CourseCreate, CourseUpdate, CourseResponse, CourseDetailResponse,
    ChapterCreate, ChapterUpdate, ChapterResponse,
    ProgressUpdate, EnrollmentResponse, ChapterProgressResponse, LearningStatsResponse
)
from .course_services import CourseService, ChapterService, EnrollmentService

logger = logging.getLogger(__name__)
router = APIRouter()


# ========== 课程相关接口 ==========

@router.get("/list")
async def get_course_list(
    category: Optional[str] = Query(None, description="课程分类"),
    keyword: Optional[str] = Query(None, description="搜索关键词"),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取课程列表（已发布的）"""
    skip = (page - 1) * size
    courses, total = await CourseService.get_course_list(
        db, 
        only_published=True,
        category=category,
        keyword=keyword,
        skip=skip, 
        limit=size
    )
    
    # 补充章节数量
    items = []
    for course in courses:
        chapter_count = await CourseService.get_chapter_count(db, course.id)
        item = CourseResponse.model_validate(course).model_dump()
        item["chapter_count"] = chapter_count
        items.append(item)
    
    return success(data={
        "items": items,
        "total": total,
        "page": page,
        "size": size
    })


@router.get("/my")
async def get_my_courses(
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取我创建的课程"""
    courses, total = await CourseService.get_course_list(
        db, 
        user_id=user.user_id,
        only_published=False
    )
    
    items = []
    for course in courses:
        chapter_count = await CourseService.get_chapter_count(db, course.id)
        item = CourseResponse.model_validate(course).model_dump()
        item["chapter_count"] = chapter_count
        items.append(item)
    
    return success(data=items)


@router.post("/create")
async def create_course(
    data: CourseCreate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """创建课程"""
    try:
        course = await CourseService.create_course(db, user.user_id, data)
        return success(data=CourseResponse.model_validate(course).model_dump(), message="课程创建成功")
    except Exception as e:
        logger.error(f"创建课程失败: {e}")
        return error(message=f"创建失败: {str(e)}")


@router.get("/{course_id}")
async def get_course_detail(
    course_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取课程详情"""
    detail = await CourseService.get_course_detail(db, course_id, user.user_id)
    if not detail:
        return error(code=404, message="课程不存在")
    return success(data=detail)


@router.put("/{course_id}")
async def update_course(
    course_id: int,
    data: CourseUpdate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """更新课程"""
    course = await CourseService.get_course_by_id(db, course_id)
    if not course:
        return error(code=404, message="课程不存在")
    
    # 权限检查：只有作者或管理员可以编辑
    if course.author_id != user.user_id and user.role != "admin":
        return error(code=403, message="无权限编辑此课程")
    
    updated = await CourseService.update_course(db, course_id, data)
    return success(data=CourseResponse.model_validate(updated).model_dump(), message="更新成功")


@router.delete("/{course_id}")
async def delete_course(
    course_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """删除课程"""
    course = await CourseService.get_course_by_id(db, course_id)
    if not course:
        return error(code=404, message="课程不存在")
    
    if course.author_id != user.user_id and user.role != "admin":
        return error(code=403, message="无权限删除此课程")
    
    await CourseService.delete_course(db, course_id)
    return success(message="课程已删除")


# ========== 章节相关接口 ==========

@router.post("/{course_id}/chapters")
async def create_chapter(
    course_id: int,
    data: ChapterCreate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """创建章节"""
    course = await CourseService.get_course_by_id(db, course_id)
    if not course:
        return error(code=404, message="课程不存在")
    
    if course.author_id != user.user_id and user.role != "admin":
        return error(code=403, message="无权限添加章节")
    
    chapter = await ChapterService.create_chapter(db, course_id, data)
    return success(data=ChapterResponse.model_validate(chapter).model_dump(), message="章节创建成功")


@router.get("/{course_id}/chapters")
async def get_chapters(
    course_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取课程的所有章节"""
    chapters = await ChapterService.get_chapters_by_course(db, course_id)
    return success(data=[ChapterResponse.model_validate(ch).model_dump() for ch in chapters])


@router.get("/chapters/{chapter_id}")
async def get_chapter_detail(
    chapter_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取章节详情"""
    chapter = await ChapterService.get_chapter_by_id(db, chapter_id)
    if not chapter:
        return error(code=404, message="章节不存在")
    return success(data=ChapterResponse.model_validate(chapter).model_dump())


@router.put("/chapters/{chapter_id}")
async def update_chapter(
    chapter_id: int,
    data: ChapterUpdate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """更新章节"""
    chapter = await ChapterService.get_chapter_by_id(db, chapter_id)
    if not chapter:
        return error(code=404, message="章节不存在")
    
    # 获取课程检查权限
    course = await CourseService.get_course_by_id(db, chapter.course_id)
    if course.author_id != user.user_id and user.role != "admin":
        return error(code=403, message="无权限编辑此章节")
    
    updated = await ChapterService.update_chapter(db, chapter_id, data)
    return success(data=ChapterResponse.model_validate(updated).model_dump(), message="更新成功")


@router.delete("/chapters/{chapter_id}")
async def delete_chapter(
    chapter_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """删除章节"""
    chapter = await ChapterService.get_chapter_by_id(db, chapter_id)
    if not chapter:
        return error(code=404, message="章节不存在")
    
    course = await CourseService.get_course_by_id(db, chapter.course_id)
    if course.author_id != user.user_id and user.role != "admin":
        return error(code=403, message="无权限删除此章节")
    
    await ChapterService.delete_chapter(db, chapter_id)
    return success(message="章节已删除")


# ========== 学习相关接口 ==========

@router.post("/{course_id}/enroll")
async def enroll_course(
    course_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """报名课程"""
    course = await CourseService.get_course_by_id(db, course_id)
    if not course:
        return error(code=404, message="课程不存在")
    
    if not course.is_published:
        return error(code=400, message="课程未发布，无法报名")
    
    enrollment = await EnrollmentService.enroll_course(db, user.user_id, course_id)
    return success(data=EnrollmentResponse.model_validate(enrollment).model_dump(), message="报名成功")


@router.get("/learning/my")
async def get_my_learning(
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取我的学习列表"""
    enrollments = await EnrollmentService.get_user_enrollments(db, user.user_id)
    
    items = []
    for enrollment in enrollments:
        course = await CourseService.get_course_by_id(db, enrollment.course_id)
        if course:
            items.append({
                "enrollment": EnrollmentResponse.model_validate(enrollment).model_dump(),
                "course": CourseResponse.model_validate(course).model_dump()
            })
    
    return success(data=items)


@router.get("/learning/stats")
async def get_learning_stats(
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取学习统计"""
    stats = await EnrollmentService.get_learning_stats(db, user.user_id)
    return success(data=stats)


@router.post("/learning/progress")
async def update_progress(
    data: ProgressUpdate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """更新章节学习进度"""
    # 验证章节是否存在
    chapter = await ChapterService.get_chapter_by_id(db, data.chapter_id)
    if not chapter:
        return error(code=404, message="章节不存在")
    
    # 验证用户是否已报名该课程
    enrollment = await EnrollmentService.get_enrollment(db, user.user_id, chapter.course_id)
    if not enrollment:
        return error(code=400, message="请先报名课程")
    
    progress = await EnrollmentService.update_chapter_progress(db, user.user_id, data)
    return success(data=ChapterProgressResponse.model_validate(progress).model_dump(), message="进度已更新")


@router.get("/{course_id}/progress")
async def get_course_progress(
    course_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取课程学习进度"""
    enrollment = await EnrollmentService.get_enrollment(db, user.user_id, course_id)
    if not enrollment:
        return success(data={"enrolled": False, "progress": 0, "chapters": []})
    
    chapter_progress = await EnrollmentService.get_chapter_progress(db, user.user_id, course_id)
    
    return success(data={
        "enrolled": True,
        "progress": enrollment.progress,
        "last_chapter_id": enrollment.last_chapter_id,
        "chapters": [ChapterProgressResponse.model_validate(cp).model_dump() for cp in chapter_progress]
    })
