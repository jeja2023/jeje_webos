"""
相册模块路由
定义 API 接口
"""

import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user, TokenData
from schemas.response import success, error
from utils.storage import get_storage_manager

from .album_schemas import (
    AlbumCreate, AlbumUpdate, AlbumResponse, AlbumListResponse, AlbumDetailResponse,
    PhotoUpdate, PhotoResponse, PhotoListResponse
)
from .album_services import AlbumService

router = APIRouter()
storage_manager = get_storage_manager()


# ==================== 相册接口 ====================

@router.get("/", summary="获取相册列表")
async def get_album_list(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    keyword: str = Query(None, description="搜索关键词"),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取当前用户的相册列表"""
    albums, total = await AlbumService.get_album_list(
        db, user.user_id, page, page_size, keyword
    )
    
    # 构建响应数据
    items = []
    for album in albums:
        album_data = AlbumResponse.model_validate(album).model_dump()
        # 添加封面URL
        if album.cover_photo_id:
            album_data['cover_url'] = f"/api/v1/album/photos/{album.cover_photo_id}/thumbnail"
        items.append(album_data)
    
    return success(data={
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size
    })


@router.post("/", summary="创建相册")
async def create_album(
    data: AlbumCreate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """创建新相册"""
    album = await AlbumService.create_album(db, user.user_id, data)
    await db.commit()
    return success(data=AlbumResponse.model_validate(album).model_dump(), message="相册创建成功")


@router.get("/{album_id}", summary="获取相册详情")
async def get_album_detail(
    album_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取相册详情（包含照片列表）"""
    album = await AlbumService.get_album_by_id(db, album_id, user.user_id, include_photos=True)
    if not album:
        raise HTTPException(status_code=404, detail="相册不存在")
    
    # 构建响应
    album_data = AlbumResponse.model_validate(album).model_dump()
    if album.cover_photo_id:
        album_data['cover_url'] = f"/api/v1/album/photos/{album.cover_photo_id}/thumbnail"
    
    # 添加照片列表
    photos = []
    for photo in album.photos:
        photo_data = {
            "id": photo.id,
            "album_id": photo.album_id,
            "user_id": photo.user_id,
            "filename": photo.filename,
            "title": photo.title,
            "description": photo.description,
            "url": AlbumService.get_photo_url(photo),
            "thumbnail_url": AlbumService.get_thumbnail_url(photo),
            "width": photo.width,
            "height": photo.height,
            "file_size": photo.file_size,
            "mime_type": photo.mime_type,
            "taken_at": photo.taken_at,
            "sort_order": photo.sort_order,
            "created_at": photo.created_at
        }
        photos.append(photo_data)
    
    album_data['photos'] = photos
    return success(data=album_data)


@router.put("/{album_id}", summary="更新相册")
async def update_album(
    album_id: int,
    data: AlbumUpdate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """更新相册信息"""
    album = await AlbumService.update_album(db, album_id, data, user.user_id)
    if not album:
        raise HTTPException(status_code=404, detail="相册不存在")
    
    await db.commit()
    return success(data=AlbumResponse.model_validate(album).model_dump(), message="更新成功")


@router.delete("/{album_id}", summary="删除相册")
async def delete_album(
    album_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """删除相册（同时删除所有照片）"""
    deleted = await AlbumService.delete_album(db, album_id, user.user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="相册不存在")
    
    await db.commit()
    return success(message="相册已删除")


# ==================== 照片接口 ====================

@router.post("/{album_id}/photos", summary="上传照片")
async def upload_photo(
    album_id: int,
    file: UploadFile = File(..., description="照片文件"),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """上传照片到指定相册"""
    # 验证文件类型
    if not file.content_type or not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="只能上传图片文件")
    
    # 读取文件内容
    content = await file.read()
    if len(content) > 20 * 1024 * 1024:  # 20MB 限制
        raise HTTPException(status_code=400, detail="文件大小不能超过 20MB")
    
    try:
        photo = await AlbumService.upload_photo(
            db, user.user_id, album_id,
            content, file.filename, file.content_type,
            storage_manager
        )
        if not photo:
            raise HTTPException(status_code=404, detail="相册不存在")
        
        await db.commit()
        
        return success(data={
            "id": photo.id,
            "album_id": photo.album_id,
            "filename": photo.filename,
            "url": AlbumService.get_photo_url(photo),
            "thumbnail_url": AlbumService.get_thumbnail_url(photo),
            "width": photo.width,
            "height": photo.height,
            "file_size": photo.file_size
        }, message="照片上传成功")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/{album_id}/photos", summary="获取相册照片列表")
async def get_album_photos(
    album_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取指定相册的所有照片"""
    # 验证相册归属
    album = await AlbumService.get_album_by_id(db, album_id, user.user_id)
    if not album:
        raise HTTPException(status_code=404, detail="相册不存在")
    
    photos = await AlbumService.get_photos_by_album(db, album_id, user.user_id)
    
    items = []
    for photo in photos:
        items.append({
            "id": photo.id,
            "album_id": photo.album_id,
            "user_id": photo.user_id,
            "filename": photo.filename,
            "title": photo.title,
            "description": photo.description,
            "url": AlbumService.get_photo_url(photo),
            "thumbnail_url": AlbumService.get_thumbnail_url(photo),
            "width": photo.width,
            "height": photo.height,
            "file_size": photo.file_size,
            "mime_type": photo.mime_type,
            "sort_order": photo.sort_order,
            "created_at": photo.created_at
        })
    
    return success(data={"items": items, "total": len(items)})


@router.get("/photos/{photo_id}/file", summary="获取照片原图")
async def get_photo_file(
    photo_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取照片原图文件"""
    photo = await AlbumService.get_photo_by_id(db, photo_id, user.user_id)
    if not photo:
        raise HTTPException(status_code=404, detail="照片不存在")
    
    if not os.path.exists(photo.storage_path):
        raise HTTPException(status_code=404, detail="文件不存在")
    
    return FileResponse(
        photo.storage_path,
        media_type=photo.mime_type or "image/jpeg",
        filename=photo.filename
    )


@router.get("/photos/{photo_id}/thumbnail", summary="获取照片缩略图")
async def get_photo_thumbnail(
    photo_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取照片缩略图文件"""
    photo = await AlbumService.get_photo_by_id(db, photo_id, user.user_id)
    if not photo:
        raise HTTPException(status_code=404, detail="照片不存在")
    
    # 优先返回缩略图，没有则返回原图
    file_path = photo.thumbnail_path if photo.thumbnail_path and os.path.exists(photo.thumbnail_path) else photo.storage_path
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="文件不存在")
    
    return FileResponse(
        file_path,
        media_type=photo.mime_type or "image/jpeg"
    )


@router.put("/photos/{photo_id}", summary="更新照片信息")
async def update_photo(
    photo_id: int,
    data: PhotoUpdate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """更新照片标题、描述等信息"""
    photo = await AlbumService.update_photo(db, photo_id, data, user.user_id)
    if not photo:
        raise HTTPException(status_code=404, detail="照片不存在")
    
    await db.commit()
    return success(message="更新成功")


@router.delete("/photos/{photo_id}", summary="删除照片")
async def delete_photo(
    photo_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """删除指定照片"""
    deleted = await AlbumService.delete_photo(db, photo_id, user.user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="照片不存在")
    
    await db.commit()
    return success(message="照片已删除")
