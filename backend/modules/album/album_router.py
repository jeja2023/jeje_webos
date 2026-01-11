"""
相册模块路由
定义 API 接口
"""

import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user, get_optional_user, TokenData
from schemas.response import success, error
from utils.storage import get_storage_manager

from .album_schemas import (
    AlbumCreate, AlbumUpdate, AlbumResponse, AlbumListResponse, AlbumDetailResponse,
    PhotoUpdate, PhotoResponse, PhotoListResponse
)
from .album_services import AlbumService, create_zip_stream

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
    items = []
    for album in albums:
        # 手动构建，避免 model_validate 可能的异常
        album_data = {
            "id": album.id,
            "name": album.name,
            "description": album.description,
            "is_public": album.is_public,
            "user_id": album.user_id,
            "cover_photo_id": album.cover_photo_id,
            "cover_url": None,
            "photo_count": album.photo_count,
            "created_at": album.created_at,
            "updated_at": album.updated_at
        }
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
    # 手动构建响应，避免 model_validate 潜在问题
    album_data = {
        "id": album.id,
        "name": album.name,
        "description": album.description,
        "is_public": album.is_public,
        "user_id": album.user_id,
        "cover_photo_id": album.cover_photo_id,
        "cover_url": None,
        "photo_count": 0,
        "created_at": album.created_at,
        "updated_at": album.updated_at
    }
    return success(data=album_data, message="相册已成功创建")


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
    user: TokenData = Depends(get_optional_user)
):
    """获取照片原图文件（支持公开相册匿名访问）"""
    # 获取照片
    photo = await AlbumService.get_photo_by_id(db, photo_id)
    if not photo:
        raise HTTPException(status_code=404, detail="照片不存在")
    
    # 验证访问权限：已登录用户验证归属，或相册公开
    if user:
        # 已登录用户：验证照片归属
        if photo.user_id != user.user_id:
            # 检查相册是否公开
            album = await AlbumService.get_album_by_id(db, photo.album_id)
            if not album or not album.is_public:
                raise HTTPException(status_code=403, detail="无权访问此照片")
    else:
        # 未登录用户：仅允许访问公开相册的照片
        album = await AlbumService.get_album_by_id(db, photo.album_id)
        if not album or not album.is_public:
            raise HTTPException(status_code=401, detail="请先登录")
    
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
    user: TokenData = Depends(get_optional_user)
):
    """获取照片缩略图文件（支持公开相册匿名访问）"""
    # 获取照片
    photo = await AlbumService.get_photo_by_id(db, photo_id)
    if not photo:
        raise HTTPException(status_code=404, detail="照片不存在")
    
    # 验证访问权限：已登录用户验证归属，或相册公开
    if user:
        # 已登录用户：验证照片归属
        if photo.user_id != user.user_id:
            # 检查相册是否公开
            album = await AlbumService.get_album_by_id(db, photo.album_id)
            if not album or not album.is_public:
                raise HTTPException(status_code=403, detail="无权访问此照片")
    else:
        # 未登录用户：仅允许访问公开相册的照片
        album = await AlbumService.get_album_by_id(db, photo.album_id)
        if not album or not album.is_public:
            raise HTTPException(status_code=401, detail="请先登录")
    
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
    count = await AlbumService.delete_photos(db, [photo_id], user.user_id)
    if count == 0:
        raise HTTPException(status_code=404, detail="照片不存在")
    
    await db.commit()
    return success(message="照片已删除")





@router.post("/photos/batch-delete", summary="批量删除照片")
async def batch_delete_photos(
    data: dict,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """批量删除指定的一组照片"""
    photo_ids = data.get("ids", [])
    if not photo_ids:
        raise HTTPException(status_code=400, detail="未提供照片ID列表")
    
    count = await AlbumService.delete_photos(db, photo_ids, user.user_id)
    await db.commit()
    
    return success(message=f"成功删除 {count} 张照片")


@router.post("/{album_id}/reorder", summary="更新照片排序")
async def reorder_photos(
    album_id: int,
    data: dict,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """
    更新照片排序
    data: { ids: [id1, id2, id3...] }
    """
    photo_ids = data.get("ids", [])
    if not photo_ids:
        return success(message="无需更新")
        
    # 验证相册
    album = await AlbumService.get_album_by_id(db, album_id, user.user_id)
    if not album:
        raise HTTPException(status_code=404, detail="相册不存在")
        
    await AlbumService.reorder_photos(db, album_id, photo_ids, user.user_id)
    await db.commit()
    
    return success(message="排序已更新")


@router.post("/photos/batch-download", summary="批量下载照片")
async def batch_download_photos(
    data: dict,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """批量打包下载照片"""
    photo_ids = data.get("ids", [])
    if not photo_ids:
        raise HTTPException(status_code=400, detail="未提供照片ID列表")
    
    photos = await AlbumService.get_photos_by_ids(db, photo_ids, user.user_id)
    if not photos:
        raise HTTPException(status_code=404, detail="未找到有效照片")
        
    files_to_zip = []
    for photo in photos:
        if photo.storage_path and os.path.exists(photo.storage_path):
            files_to_zip.append((photo.storage_path, photo.filename))
            
    if not files_to_zip:
        raise HTTPException(status_code=404, detail="照片文件不存在")
        
    zip_stream = create_zip_stream(files_to_zip)
    
    filename = f"photos_download_{len(photos)}.zip"
    return StreamingResponse(
        zip_stream,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

