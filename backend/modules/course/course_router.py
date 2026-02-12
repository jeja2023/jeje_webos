# -*- coding: utf-8 -*-
"""
课程学习模块 - API 路由
支持视频课程上传和学习
"""

import logging
import os
import uuid
from fastapi import APIRouter, Depends, Query, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from core.database import get_db
from core.security import get_current_user, TokenData
from core.errors import NotFoundException, BusinessException, ErrorCode
from schemas.response import success, error
from utils.storage import get_storage_manager

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


# ========== 视频上传相关接口 ==========

# 支持的视频类型
ALLOWED_VIDEO_TYPES = {
    'video/mp4': '.mp4',
    'video/webm': '.webm',
    'video/quicktime': '.mov',
    'video/x-msvideo': '.avi',
    'video/x-matroska': '.mkv',
    'video/x-flv': '.flv',
    'video/x-ms-wmv': '.wmv',
    'video/x-m4v': '.m4v'
}


@router.post("/chapters/{chapter_id}/video")
async def upload_chapter_video(
    chapter_id: int,
    file: UploadFile = File(..., description="视频文件"),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """
    上传章节视频
    支持的格式: mp4, webm, mov, avi, mkv, flv, wmv, m4v
    最大文件大小: 500MB
    """
    # 验证章节
    chapter = await ChapterService.get_chapter_by_id(db, chapter_id)
    if not chapter:
        return error(code=404, message="章节不存在")
    
    # 验证权限
    course = await CourseService.get_course_by_id(db, chapter.course_id)
    if course.author_id != user.user_id and user.role != "admin":
        return error(code=403, message="无权限上传视频")
    
    # 验证文件类型
    content_type = file.content_type or ''
    if content_type not in ALLOWED_VIDEO_TYPES:
        return error(code=400, message=f"不支持的视频格式，请上传 MP4、WebM、MOV 等格式")
    
    # 获取存储管理器
    storage = get_storage_manager()
    max_video_size = 500 * 1024 * 1024  # 500MB
    
    # 读取文件内容（流式读取检查大小）
    content_chunks = []
    total_size = 0
    chunk_size = 2 * 1024 * 1024  # 2MB 块
    
    try:
        while True:
            chunk = await file.read(chunk_size)
            if not chunk:
                break
            total_size += len(chunk)
            if total_size > max_video_size:
                return error(code=413, message="视频文件过大，最大支持 500MB")
            content_chunks.append(chunk)
    except Exception as e:
        logger.error(f"读取视频文件失败: {e}")
        return error(code=500, message="读取视频文件失败")
    
    content = b''.join(content_chunks)
    
    # 生成文件名
    ext = ALLOWED_VIDEO_TYPES.get(content_type, '.mp4')
    filename = f"{uuid.uuid4().hex}{ext}"
    
    # 保存到课程模块的 uploads 目录
    video_dir = storage.get_module_dir("course", "uploads", user_id=user.user_id)
    video_path = os.path.join(video_dir, filename)
    
    try:
        with open(video_path, 'wb') as f:
            f.write(content)
        
        # 生成访问URL
        # 使用相对路径存储，方便迁移
        relative_path = os.path.relpath(video_path, storage.upload_dir)
        video_url = f"/api/v1/course/video/{chapter_id}/stream"
        
        # 更新章节视频URL
        from .course_schemas import ChapterUpdate
        update_data = ChapterUpdate(video_url=relative_path)
        await ChapterService.update_chapter(db, chapter_id, update_data)
        
        logger.info(f"视频上传成功: {filename}, 大小: {total_size / 1024 / 1024:.2f}MB, 章节: {chapter_id}")
        
        return success(data={
            "video_url": video_url,
            "filename": file.filename,
            "size": total_size,
            "size_mb": round(total_size / 1024 / 1024, 2)
        }, message="视频上传成功")
        
    except Exception as e:
        logger.error(f"保存视频文件失败: {e}")
        # 清理已上传的文件
        if os.path.exists(video_path):
            os.remove(video_path)
        return error(code=500, message="保存视频文件失败")


@router.get("/video/{chapter_id}/stream")
async def stream_chapter_video(
    chapter_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """
    获取章节视频流
    返回视频文件以供播放
    """
    # 获取章节
    chapter = await ChapterService.get_chapter_by_id(db, chapter_id)
    if not chapter:
        raise NotFoundException("章节")
    
    if not chapter.video_url:
        raise BusinessException(ErrorCode.RESOURCE_NOT_FOUND, "该章节没有视频")
    
    # 获取视频文件路径
    storage = get_storage_manager()
    video_path = storage.get_file_path(chapter.video_url)
    
    if not video_path or not video_path.exists():
        raise NotFoundException("视频文件")
    
    # 确定视频类型
    ext = video_path.suffix.lower()
    mime_types = {
        '.mp4': 'video/mp4',
        '.webm': 'video/webm',
        '.mov': 'video/quicktime',
        '.avi': 'video/x-msvideo',
        '.mkv': 'video/x-matroska',
        '.m4v': 'video/x-m4v'
    }
    media_type = mime_types.get(ext, 'video/mp4')
    
    return FileResponse(
        path=str(video_path),
        media_type=media_type,
        headers={
            "Accept-Ranges": "bytes",
            "Cache-Control": "public, max-age=3600"
        }
    )


@router.delete("/chapters/{chapter_id}/video")
async def delete_chapter_video(
    chapter_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """删除章节视频"""
    # 验证章节
    chapter = await ChapterService.get_chapter_by_id(db, chapter_id)
    if not chapter:
        return error(code=404, message="章节不存在")
    
    # 验证权限
    course = await CourseService.get_course_by_id(db, chapter.course_id)
    if course.author_id != user.user_id and user.role != "admin":
        return error(code=403, message="无权限删除视频")
    
    if not chapter.video_url:
        return error(code=400, message="该章节没有视频")
    
    # 删除视频文件
    storage = get_storage_manager()
    video_path = storage.get_file_path(chapter.video_url)
    
    if video_path and video_path.exists():
        try:
            os.remove(str(video_path))
        except Exception as e:
            logger.error(f"删除视频文件失败: {e}")
    
    # 清空视频URL
    from .course_schemas import ChapterUpdate
    update_data = ChapterUpdate(video_url=None)
    await ChapterService.update_chapter(db, chapter_id, update_data)
    
    return success(message="视频已删除")

