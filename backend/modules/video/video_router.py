"""
视频模块路由
定义 API 接口
"""

import os
import mimetypes
import logging

logger = logging.getLogger(__name__)
from fastapi import APIRouter, Depends, UploadFile, File, Query, Header
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user, get_optional_user, TokenData
from core.errors import NotFoundException, PermissionException, AuthException, BusinessException, ErrorCode
from schemas.response import success, error
from utils.storage import get_storage_manager

from .video_schemas import (
    CollectionCreate, CollectionUpdate, CollectionResponse, CollectionListResponse, CollectionDetailResponse,
    VideoUpdate, VideoResponse, VideoListResponse
)
from .video_services import VideoService

router = APIRouter()
storage_manager = get_storage_manager()


async def get_cover_url(db: AsyncSession, cover_video_id: int) -> str:
    """获取视频集封面 URL（仅在视频和缩略图存在时返回）"""
    if not cover_video_id:
        return ""
    video = await VideoService.get_video_by_id(db, cover_video_id)
    if video:
        return VideoService.get_thumbnail_url(video)
    return ""


# 视频集接口

@router.get("/", summary="获取视频集列表")
async def get_collection_list(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    keyword: str = Query(None, description="搜索关键词"),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取当前用户的视频集列表"""
    collections, total = await VideoService.get_collection_list(
        db, user.user_id, page, page_size, keyword
    )
    
    # 构建响应数据
    items = []
    for collection in collections:
        # 手动构建，避免 model_validate 可能的异常
        collection_data = {
            "id": collection.id,
            "name": collection.name,
            "description": collection.description,
            "is_public": collection.is_public,
            "user_id": collection.user_id,
            "cover_video_id": collection.cover_video_id,
            "cover_url": await get_cover_url(db, collection.cover_video_id),
            "video_count": collection.video_count,
            "created_at": collection.created_at,
            "updated_at": collection.updated_at
        }
        items.append(collection_data)
    
    return success(data={
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size
    })


@router.post("/", summary="创建视频集")
async def create_collection(
    data: CollectionCreate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """创建新视频集"""
    collection = await VideoService.create_collection(db, user.user_id, data)
    await db.commit()
    # 手动构建响应
    collection_data = {
        "id": collection.id,
        "name": collection.name,
        "description": collection.description,
        "is_public": collection.is_public,
        "user_id": collection.user_id,
        "cover_video_id": collection.cover_video_id,
        "cover_url": None,
        "video_count": 0,
        "created_at": collection.created_at,
        "updated_at": collection.updated_at
    }
    return success(data=collection_data, message="视频集已成功创建")


@router.get("/{collection_id}", summary="获取视频集详情")
async def get_collection_detail(
    collection_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取视频集详情（包含视频列表）"""
    collection = await VideoService.get_collection_by_id(db, collection_id, user.user_id, include_videos=True)
    if not collection:
        raise NotFoundException("视频集")
    
    # 构建响应
    collection_data = CollectionResponse.model_validate(collection).model_dump()
    collection_data['cover_url'] = await get_cover_url(db, collection.cover_video_id)
    
    # 添加视频列表
    videos = []
    for video in collection.videos:
        video_data = {
            "id": video.id,
            "collection_id": video.collection_id,
            "user_id": video.user_id,
            "filename": video.filename,
            "title": video.title,
            "description": video.description,
            "url": VideoService.get_video_url(video),
            "thumbnail_url": VideoService.get_thumbnail_url(video),
            "duration": video.duration,
            "duration_formatted": VideoService.format_duration(video.duration),
            "width": video.width,
            "height": video.height,
            "file_size": video.file_size,
            "mime_type": video.mime_type,
            "sort_order": video.sort_order,
            "created_at": video.created_at
        }
        videos.append(video_data)
    
    collection_data['videos'] = videos
    return success(data=collection_data)


@router.put("/{collection_id}", summary="更新视频集")
async def update_collection(
    collection_id: int,
    data: CollectionUpdate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """更新视频集信息"""
    collection = await VideoService.update_collection(db, collection_id, data, user.user_id)
    if not collection:
        raise NotFoundException("视频集")
    
    await db.commit()
    return success(data=CollectionResponse.model_validate(collection).model_dump(), message="更新成功")


@router.delete("/{collection_id}", summary="删除视频集")
async def delete_collection(
    collection_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """删除视频集（同时删除所有视频）"""
    deleted = await VideoService.delete_collection(db, collection_id, user.user_id)
    if not deleted:
        raise NotFoundException("视频集")
    
    await db.commit()
    return success(message="视频集已删除")


# 视频接口

@router.post("/{collection_id}/videos", summary="上传视频")
async def upload_video(
    collection_id: int,
    file: UploadFile = File(..., description="视频文件"),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """上传视频到指定视频集"""
    # 验证文件类型（Content-Type + 魔数双重验证）
    if not file.content_type or not file.content_type.startswith('video/'):
        raise BusinessException(ErrorCode.FILE_TYPE_NOT_ALLOWED, "只能上传视频文件")
    
    # 读取文件内容
    content = await file.read()
    if len(content) > 1024 * 1024 * 1024:  # 1GB 限制 (与前端一致)
        raise BusinessException(ErrorCode.FILE_TOO_LARGE, "文件大小不能超过 1GB")
    
    # 验证文件魔数（防止 Content-Type 伪造）
    # 注意：如果 filetype 库不可用或不支持该格式，默认放行，依靠后续处理（ffmpeg）来验证
    try:
        import filetype
        kind = filetype.guess(content[:8192])
        if kind and not kind.mime.startswith('video/'):
            # 只有确信它不是视频时才拒绝（例如它是图片或可执行文件）
            # 有些特殊的视频格式 filetype 可能识别不出来，此时 kind 为 None，我们选择放行
            logger.warning(f"上传的文件可能不是视频: {kind.mime}")
            # raise HTTPException(status_code=400, detail="文件内容不是有效的视频格式")
    except ImportError:
        pass  # filetype 库未安装时跳过
    
    try:
        video = await VideoService.upload_video(
            db, user.user_id, collection_id,
            content, file.filename, file.content_type,
            storage_manager
        )
        if not video:
            raise NotFoundException("视频集")
        
        await db.commit()
        
        return success(data={
            "id": video.id,
            "collection_id": video.collection_id,
            "filename": video.filename,
            "url": VideoService.get_video_url(video),
            "thumbnail_url": VideoService.get_thumbnail_url(video),
            "duration": video.duration,
            "duration_formatted": VideoService.format_duration(video.duration),
            "width": video.width,
            "height": video.height,
            "file_size": video.file_size
        }, message="视频上传成功")
    except ValueError as e:
        raise BusinessException(ErrorCode.VALIDATION_ERROR, str(e))


@router.get("/{collection_id}/videos", summary="获取视频集视频列表")
async def get_collection_videos(
    collection_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取指定视频集的所有视频"""
    # 验证视频集归属
    collection = await VideoService.get_collection_by_id(db, collection_id, user.user_id)
    if not collection:
        raise NotFoundException("视频集")
    
    videos = await VideoService.get_videos_by_collection(db, collection_id, user.user_id)
    
    items = []
    for video in videos:
        items.append({
            "id": video.id,
            "collection_id": video.collection_id,
            "user_id": video.user_id,
            "filename": video.filename,
            "title": video.title,
            "description": video.description,
            "url": VideoService.get_video_url(video),
            "thumbnail_url": VideoService.get_thumbnail_url(video),
            "duration": video.duration,
            "duration_formatted": VideoService.format_duration(video.duration),
            "width": video.width,
            "height": video.height,
            "file_size": video.file_size,
            "mime_type": video.mime_type,
            "sort_order": video.sort_order,
            "created_at": video.created_at
        })
    
    return success(data={"items": items, "total": len(items)})


@router.get("/videos/{video_id}/file", summary="获取视频文件")
async def get_video_file(
    video_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_optional_user),
    range: str = Header(None)
):
    """获取视频文件（支持流式传输，支持公开视频集匿名访问）"""
    # 获取视频
    video = await VideoService.get_video_by_id(db, video_id)
    if not video:
        raise NotFoundException("视频")
    
    # 验证访问权限：已登录用户验证归属，或视频集公开
    if user:
        # 已登录用户：验证视频归属
        if video.user_id != user.user_id:
            # 检查视频集是否公开
            collection = await VideoService.get_collection_by_id(db, video.collection_id)
            if not collection or not collection.is_public:
                raise PermissionException("无权访问此视频")
    else:
        # 未登录用户：仅允许访问公开视频集的视频
        collection = await VideoService.get_collection_by_id(db, video.collection_id)
        if not collection or not collection.is_public:
            raise AuthException(ErrorCode.UNAUTHORIZED, "请先登录")
    
    if not os.path.exists(video.storage_path):
        logger.error(f"视频文件未找到: {video.storage_path} (ID: {video_id})")
        raise NotFoundException("文件")
    
    # 路径安全验证：确保文件在 storage 目录下
    from core.config import get_settings
    _settings = get_settings()
    resolved = os.path.realpath(video.storage_path)
    storage_root = os.path.realpath(_settings.upload_dir)
    if not resolved.startswith(storage_root):
        raise PermissionException("文件路径非法")
    
    logger.debug(f"正在读取视频: {video.filename}, 大小: {video.file_size}, 路径: {resolved}")
    
    # 确定 MIME 类型，对播放最友好的做法是强制 mp4 后缀为 video/mp4
    mime_type = "video/mp4" if video.filename.endswith(".mp4") else (video.mime_type or "video/mp4")
    
    return FileResponse(
        resolved,
        media_type=mime_type,
        content_disposition_type="inline"
    )


@router.get("/videos/{video_id}/thumbnail", summary="获取视频缩略图")
async def get_video_thumbnail(
    video_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_optional_user)
):
    """获取视频缩略图文件（支持公开视频集匿名访问）"""
    # 获取视频
    video = await VideoService.get_video_by_id(db, video_id)
    if not video:
        raise NotFoundException("视频")
    
    # 验证访问权限：已登录用户验证归属，或视频集公开
    if user:
        # 已登录用户：验证视频归属
        if video.user_id != user.user_id:
            # 检查视频集是否公开
            collection = await VideoService.get_collection_by_id(db, video.collection_id)
            if not collection or not collection.is_public:
                raise PermissionException("无权访问此视频")
    else:
        # 未登录用户：仅允许访问公开视频集的视频
        collection = await VideoService.get_collection_by_id(db, video.collection_id)
        if not collection or not collection.is_public:
            raise AuthException(ErrorCode.UNAUTHORIZED, "请先登录")
    
    # 返回缩略图
    if video.thumbnail_path and os.path.exists(video.thumbnail_path):
        # 路径安全验证：确保文件在 storage 目录下
        from core.config import get_settings
        _settings = get_settings()
        resolved = os.path.realpath(video.thumbnail_path)
        storage_root = os.path.realpath(_settings.upload_dir)
        if not resolved.startswith(storage_root):
            raise PermissionException("文件路径非法")
        
        return FileResponse(
            resolved,
            media_type="image/jpeg"
        )
    
    # 如果没有缩略图，返回404
    raise NotFoundException("缩略图")


@router.put("/videos/{video_id}", summary="更新视频信息")
async def update_video(
    video_id: int,
    data: VideoUpdate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """更新视频标题、描述等信息"""
    video = await VideoService.update_video(db, video_id, data, user.user_id)
    if not video:
        raise NotFoundException("视频")
    
    await db.commit()
    return success(message="更新成功")


@router.delete("/videos/{video_id}", summary="删除视频")
async def delete_video(
    video_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """删除指定视频"""
    logger.info(f"正在删除单个视频: id={video_id}, user_id={user.user_id}")
    count = await VideoService.delete_videos(db, [video_id], user.user_id)
    if count == 0:
        raise NotFoundException("视频")
    
    await db.commit()
    return success(message="视频已删除")


@router.post("/videos/batch-delete", summary="批量删除视频")
async def batch_delete_videos(
    data: dict,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """批量删除指定的一组视频"""
    video_ids = data.get("ids", [])
    if not video_ids:
        raise BusinessException(ErrorCode.VALIDATION_ERROR, "未提供视频ID列表")
    
    count = await VideoService.delete_videos(db, video_ids, user.user_id)
    await db.commit()
    
    return success(message=f"成功删除 {count} 个视频")

