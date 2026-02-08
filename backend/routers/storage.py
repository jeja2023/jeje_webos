"""
文件存储路由
处理文件上传、下载、删除、列表查询
"""

import os
import logging
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, Request, UploadFile, File, HTTPException, status, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from core.database import get_db
from core.security import get_current_user, TokenData, require_permission, decode_token
from models.storage import FileRecord
from models.account import User
from schemas.storage import FileInfo, FileUploadResponse, FileListResponse
from schemas.response import success
from utils.storage import get_storage_manager
from utils.auth_helpers import get_user_from_token
from core.config import get_settings

router = APIRouter(prefix="/api/v1/storage", tags=["文件存储"])
settings = get_settings()
logger = logging.getLogger(__name__)


@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    description: Optional[str] = None,
    category: str = Query("attachment", description="文件分类: avatar, blog, note, attachment"),
    ref_id: Optional[int] = Query(None, description="关联业务ID"),
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    上传文件（流式写入优化版）
    
    需要权限：storage.upload (或者特定业务权限)
    category: 默认为 attachment。可选值: avatar, blog, note, attachment
    
    优化点：
    - 采用流式写入，避免大文件占用过多内存
    - 先写入临时文件，验证通过后再移动到目标位置
    """
    import tempfile
    import shutil
    
    # 权限检查 - 细化权限控制
    has_permission = False
    
    if current_user.role == "admin":
        has_permission = True
    elif category == "avatar":
        has_permission = True  # 登录用户都可以上传头像
    elif category == "blog":
        has_permission = current_user.permissions and ("*" in current_user.permissions or "blog.create" in current_user.permissions or "blog.update" in current_user.permissions)
    elif category == "note":
        has_permission = current_user.permissions and ("*" in current_user.permissions or "notes.create" in current_user.permissions or "notes.update" in current_user.permissions)
    else:
        has_permission = current_user.permissions and ("*" in current_user.permissions or "storage.upload" in current_user.permissions)

    if not has_permission:
        raise HTTPException(status_code=403, detail=f"无权上传 {category} 类型的文件")
    
    storage = get_storage_manager()
    max_size = storage.max_size
    max_size_mb = max_size / 1024 / 1024
    
    # 1. 检查 Content-Length 头（快速拦截明显超限的请求）
    if hasattr(file, 'headers'):
        content_length_str = file.headers.get('content-length')
        if content_length_str:
            try:
                content_length = int(content_length_str)
                if content_length > max_size:
                    raise HTTPException(
                        status_code=413,
                        detail=f"文件大小超过限制（最大 {max_size_mb:.1f}MB，当前文件 {content_length / 1024 / 1024:.1f}MB）"
                    )
            except (ValueError, TypeError):
                pass
    
    # 2. 流式写入临时文件（内存占用恒定，仅为 chunk_size）
    chunk_size = 1024 * 1024  # 1MB 块大小
    total_size = 0
    temp_file = None
    first_chunk = None  # 用于文件类型验证
    
    try:
        # 创建临时文件
        temp_file = tempfile.NamedTemporaryFile(delete=False, suffix=Path(file.filename or "unknown").suffix)
        temp_path = temp_file.name
        
        while True:
            chunk = await file.read(chunk_size)
            if not chunk:
                break
            
            # 保存第一个块用于文件类型验证
            if first_chunk is None:
                first_chunk = chunk
            
            total_size += len(chunk)
            
            # 实时检查大小（边读边检查，超限立即中断）
            if total_size > max_size:
                temp_file.close()
                os.unlink(temp_path)
                raise HTTPException(
                    status_code=413,
                    detail=f"文件大小超过限制（最大 {max_size_mb:.1f}MB，当前已读取 {total_size / 1024 / 1024:.1f}MB）"
                )
            
            # 直接写入临时文件（不占用额外内存）
            temp_file.write(chunk)
        
        temp_file.close()
        file_size = total_size
        
    except HTTPException:
        raise
    except Exception as e:
        if temp_file:
            try:
                temp_file.close()
                os.unlink(temp_file.name)
            except Exception as e:
                logger.debug(f"清理临时文件失败: {e}")
        raise HTTPException(status_code=500, detail=f"读取文件失败: {str(e)}")
    
    # 3. 验证文件类型（使用第一个块进行内容检测）
    is_valid, error_msg = storage.validate_file(file.filename or "unknown", file_size, first_chunk)
    if not is_valid:
        os.unlink(temp_path)
        raise HTTPException(status_code=400, detail=error_msg)
    
    # 4. 检查用户存储配额（头像除外）
    if category != "avatar":
        from sqlalchemy import func, select
        from models.account import User
        from models.storage import FileRecord as StorageFileRecord
        
        user_result = await db.execute(select(User).where(User.id == current_user.user_id))
        user = user_result.scalar_one_or_none()
        
        if user and user.storage_quota is not None:
            size_result = await db.execute(
                select(func.coalesce(func.sum(StorageFileRecord.file_size), 0))
                .select_from(StorageFileRecord)
                .where(StorageFileRecord.uploader_id == current_user.user_id)
            )
            current_size = size_result.scalar_one()
            
            if current_size + file_size > user.storage_quota:
                os.unlink(temp_path)
                used_mb = current_size / 1024 / 1024
                quota_mb = user.storage_quota / 1024 / 1024
                file_mb = file_size / 1024 / 1024
                raise HTTPException(
                    status_code=413,
                    detail=f"存储空间不足：当前已使用 {used_mb:.2f}MB / {quota_mb:.2f}MB，"
                           f"本次上传需要 {file_mb:.2f}MB，超出配额限制。"
                           f"请删除部分文件或联系管理员增加配额。"
                )
    
    # 5. 头像额外检查
    if category == "avatar":
        if not (file.content_type and file.content_type.startswith("image/")):
            os.unlink(temp_path)
            raise HTTPException(status_code=400, detail="头像必须是图片格式")
    
    # 6. 生成存储路径并移动文件（原子操作）
    relative_path, full_path = storage.generate_filename(
        file.filename or "unknown",
        current_user.user_id,
        category=category
    )
    
    try:
        Path(full_path).parent.mkdir(parents=True, exist_ok=True)
        # 使用 shutil.move 进行原子移动（比重新写入更高效）
        shutil.move(temp_path, full_path)
    except Exception as e:
        # 清理临时文件
        try:
            os.unlink(temp_path)
        except Exception as e:
            logger.debug(f"清理临时文件失败: {e}")
        raise HTTPException(status_code=500, detail=f"文件保存失败: {str(e)}")
    
    # 7. 保存文件记录到数据库
    mime_type = file.content_type
    
    file_record = FileRecord(
        filename=file.filename or "unknown",
        storage_path=relative_path,
        file_size=file_size,
        mime_type=mime_type,
        uploader_id=current_user.user_id,
        category=category,
        ref_id=ref_id,
        description=description
    )
    db.add(file_record)
    await db.commit()
    await db.refresh(file_record)
    
    # 生成访问URL
    url = f"/api/v1/storage/download/{file_record.id}"
    
    return success(
        FileUploadResponse(
            id=file_record.id,
            filename=file_record.filename,
            storage_path=file_record.storage_path,
            file_size=file_record.file_size,
            url=url
        ).model_dump(),
        "上传成功"
    )


@router.get("/download/{file_id}")
async def download_file(
    request: Request,
    file_id: int,
    token: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """
    下载文件
    
    需要权限：storage.download
    """
    # 验证 Token（支持 HttpOnly Cookie 或 query token）
    current_user = get_user_from_token(request, token)

    # 查询文件记录
    result = await db.execute(select(FileRecord).where(FileRecord.id == file_id))
    file_record = result.scalar_one_or_none()
    
    if not file_record:
        raise HTTPException(status_code=404, detail="文件不存在")
    
    # 权限检查
    # 1. 管理员可以直接访问
    is_admin = current_user.role in ("admin", "manager")
    # 2. 上传者本人可以直接访问
    is_owner = file_record.uploader_id == current_user.user_id
    # 3. 头像文件对所有登录用户可见
    is_avatar = file_record.category == "avatar"
    # 4. 拥有 storage.download 权限的用户
    has_perm = current_user.permissions and ("*" in current_user.permissions or "storage.download" in current_user.permissions)

    if not (is_admin or is_owner or is_avatar or has_perm):
        raise HTTPException(status_code=403, detail="无权下载文件")

    # 获取文件路径
    storage = get_storage_manager()
    file_path = storage.get_file_path(file_record.storage_path)
    
    if not file_path:
        raise HTTPException(status_code=404, detail="文件已丢失")
    
    # 返回文件
    return FileResponse(
        path=str(file_path),
        filename=file_record.filename,
        media_type=file_record.mime_type or "application/octet-stream"
    )


@router.get("/list")
async def list_files(
    page: int = 1,
    size: int = 20,
    keyword: Optional[str] = None,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    获取文件列表
    
    需要权限：storage.list
    """
    # 权限检查
    if not (current_user.role == "admin" or (current_user.permissions and ("*" in current_user.permissions or "storage.list" in current_user.permissions))):
        raise HTTPException(status_code=403, detail="无权查看文件列表")
    
    # 构建查询
    query = select(FileRecord)
    
    # 如果不是管理员，只能查看自己上传的文件
    if current_user.role not in ("admin", "manager"):
        query = query.where(FileRecord.uploader_id == current_user.user_id)
    
    # 关键词搜索
    if keyword:
        query = query.where(FileRecord.filename.contains(keyword))
    
    # 总数查询
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()
    
    # 分页查询
    query = query.order_by(desc(FileRecord.created_at))
    query = query.offset((page - 1) * size).limit(size)
    
    result = await db.execute(query)
    files = result.scalars().all()
    
    return success(
        FileListResponse(
            items=[FileInfo.model_validate(f) for f in files],
            total=total,
            page=page,
            size=size
        ).model_dump()
    )


@router.delete("/{file_id}")
async def delete_file(
    file_id: int,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    删除文件
    
    需要权限：storage.delete
    """
    # 权限检查
    if not (current_user.role == "admin" or (current_user.permissions and ("*" in current_user.permissions or "storage.delete" in current_user.permissions))):
        raise HTTPException(status_code=403, detail="无权删除文件")
    
    # 查询文件记录
    result = await db.execute(select(FileRecord).where(FileRecord.id == file_id))
    file_record = result.scalar_one_or_none()
    
    if not file_record:
        raise HTTPException(status_code=404, detail="文件不存在")
    
    # 权限检查：非管理员只能删除自己上传的文件
    if current_user.role not in ("admin", "manager") and file_record.uploader_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="只能删除自己上传的文件")
    
    # 删除物理文件
    storage = get_storage_manager()
    storage.delete_file(file_record.storage_path)
    
    # 删除数据库记录
    await db.delete(file_record)
    await db.flush()
    await db.commit()
    
    return success(message="文件已删除")


@router.get("/info/{file_id}")
async def get_file_info(
    file_id: int,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    获取文件信息
    
    需要权限：storage.list
    """
    # 权限检查
    if not (current_user.role == "admin" or (current_user.permissions and ("*" in current_user.permissions or "storage.list" in current_user.permissions))):
        raise HTTPException(status_code=403, detail="无权查看文件信息")
    
    # 查询文件记录
    result = await db.execute(select(FileRecord).where(FileRecord.id == file_id))
    file_record = result.scalar_one_or_none()
    
    if not file_record:
        raise HTTPException(status_code=404, detail="文件不存在")
    
    # 权限检查：非管理员只能查看自己上传的文件
    if current_user.role not in ("admin", "manager") and file_record.uploader_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="无权查看此文件")
    
    return success(FileInfo.model_validate(file_record).model_dump())

