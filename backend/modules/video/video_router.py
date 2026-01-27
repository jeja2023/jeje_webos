"""
视频模块路由
定义 API 接口
"""

import os
import mimetypes
import logging

logger = logging.getLogger(__name__)
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Header
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user, get_optional_user, TokenData
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
        raise HTTPException(status_code=404, detail="视频集不存在")
    
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
        raise HTTPException(status_code=404, detail="视频集不存在")
    
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
        raise HTTPException(status_code=404, detail="视频集不存在")
    
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
    # 验证文件类型
    if not file.content_type or not file.content_type.startswith('video/'):
        raise HTTPException(status_code=400, detail="只能上传视频文件")
    
    # 读取文件内容
    content = await file.read()
    if len(content) > 500 * 1024 * 1024:  # 500MB 限制
        raise HTTPException(status_code=400, detail="文件大小不能超过 500MB")
    
    try:
        video = await VideoService.upload_video(
            db, user.user_id, collection_id,
            content, file.filename, file.content_type,
            storage_manager
        )
        if not video:
            raise HTTPException(status_code=404, detail="视频集不存在")
        
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
        raise HTTPException(status_code=400, detail=str(e))


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
        raise HTTPException(status_code=404, detail="视频集不存在")
    
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
        raise HTTPException(status_code=404, detail="视频不存在")
    
    # 验证访问权限：已登录用户验证归属，或视频集公开
    if user:
        # 已登录用户：验证视频归属
        if video.user_id != user.user_id:
            # 检查视频集是否公开
            collection = await VideoService.get_collection_by_id(db, video.collection_id)
            if not collection or not collection.is_public:
                raise HTTPException(status_code=403, detail="无权访问此视频")
    else:
        # 未登录用户：仅允许访问公开视频集的视频
        collection = await VideoService.get_collection_by_id(db, video.collection_id)
        if not collection or not collection.is_public:
            raise HTTPException(status_code=401, detail="请先登录")
    
    if not os.path.exists(video.storage_path):
        logger.error(f"视频文件未找到: {video.storage_path} (ID: {video_id})")
        raise HTTPException(status_code=404, detail="文件不存在")
    
    logger.debug(f"正在读取视频: {video.filename}, 大小: {video.file_size}, 路径: {video.storage_path}")
    
    # 确定 MIME 类型，对播放最友好的做法是强制 mp4 后缀为 video/mp4
    mime_type = "video/mp4" if video.filename.endswith(".mp4") else (video.mime_type or "video/mp4")
    
    # 彻底简化：使用 FileResponse 的默认行为，不传 filename 避免触发下载行为
    # Starlette 会自动根据请求头中的 Range 返回 206 Partial Content
    return FileResponse(
        video.storage_path,
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
        raise HTTPException(status_code=404, detail="视频不存在")
    
    # 验证访问权限：已登录用户验证归属，或视频集公开
    if user:
        # 已登录用户：验证视频归属
        if video.user_id != user.user_id:
            # 检查视频集是否公开
            collection = await VideoService.get_collection_by_id(db, video.collection_id)
            if not collection or not collection.is_public:
                raise HTTPException(status_code=403, detail="无权访问此视频")
    else:
        # 未登录用户：仅允许访问公开视频集的视频
        collection = await VideoService.get_collection_by_id(db, video.collection_id)
        if not collection or not collection.is_public:
            raise HTTPException(status_code=401, detail="请先登录")
    
    # 返回缩略图
    if video.thumbnail_path and os.path.exists(video.thumbnail_path):
        return FileResponse(
            video.thumbnail_path,
            media_type="image/jpeg"
        )
    
    # 如果没有缩略图，返回404
    raise HTTPException(status_code=404, detail="缩略图不存在")


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
        raise HTTPException(status_code=404, detail="视频不存在")
    
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
        raise HTTPException(status_code=404, detail="视频不存在")
    
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
        raise HTTPException(status_code=400, detail="未提供视频ID列表")
    
    count = await VideoService.delete_videos(db, video_ids, user.user_id)
    await db.commit()
    
    return success(message=f"成功删除 {count} 个视频")

