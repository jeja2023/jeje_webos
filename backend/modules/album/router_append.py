
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
