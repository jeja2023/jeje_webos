"""
视频模块路由
定义 API 接口
"""

import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user, TokenData
from schemas.response import success, error
from utils.storage import get_storage_manager

from .video_schemas import (
    CollectionCreate, CollectionUpdate, CollectionResponse, CollectionListResponse, CollectionDetailResponse,
    VideoUpdate, VideoResponse, VideoListResponse
)
from .video_services import VideoService

router = APIRouter()
storage_manager = get_storage_manager()


# ==================== 视频集接口 ====================

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
        collection_data = CollectionResponse.model_validate(collection).model_dump()
        # 添加封面URL
        if collection.cover_video_id:
            collection_data['cover_url'] = f"/api/v1/video/videos/{collection.cover_video_id}/thumbnail"
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
    return success(data=CollectionResponse.model_validate(collection).model_dump(), message="视频集创建成功")


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
    if collection.cover_video_id:
        collection_data['cover_url'] = f"/api/v1/video/videos/{collection.cover_video_id}/thumbnail"
    
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


# ==================== 视频接口 ====================

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
    user: TokenData = Depends(get_current_user)
):
    """获取视频文件（支持流式传输）"""
    video = await VideoService.get_video_by_id(db, video_id, user.user_id)
    if not video:
        raise HTTPException(status_code=404, detail="视频不存在")
    
    if not os.path.exists(video.storage_path):
        raise HTTPException(status_code=404, detail="文件不存在")
    
    # 使用流式响应支持视频播放进度条
    def iterfile():
        with open(video.storage_path, 'rb') as f:
            while chunk := f.read(1024 * 1024):  # 1MB 块
                yield chunk
    
    return StreamingResponse(
        iterfile(),
        media_type=video.mime_type or "video/mp4",
        headers={
            "Content-Disposition": f"inline; filename={video.filename}",
            "Accept-Ranges": "bytes"
        }
    )


@router.get("/videos/{video_id}/thumbnail", summary="获取视频缩略图")
async def get_video_thumbnail(
    video_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取视频缩略图文件"""
    video = await VideoService.get_video_by_id(db, video_id, user.user_id)
    if not video:
        raise HTTPException(status_code=404, detail="视频不存在")
    
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
    deleted = await VideoService.delete_video(db, video_id, user.user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="视频不存在")
    
    await db.commit()
    return success(message="视频已删除")
