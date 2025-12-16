"""
文件存储路由
处理文件上传、下载、删除、列表查询
"""

import os
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status, Query
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
from core.config import get_settings

router = APIRouter(prefix="/api/v1/storage", tags=["文件存储"])
settings = get_settings()


def get_user_from_token(token: Optional[str] = Query(None)) -> TokenData:
    """从URL参数获取Token并验证"""
    if not token:
        raise HTTPException(status_code=401, detail="未认证")
    
    token_data = decode_token(token)
    if not token_data:
        raise HTTPException(status_code=401, detail="无效的令牌")
    
    return token_data


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
    上传文件
    
    需要权限：storage.upload (或者特定业务权限)
    category: 默认为 attachment。可选值: avatar, blog, note, attachment
    """
    # 权限检查 - 细化权限控制
    # 1. 头像上传：任何登录用户都可以上传自己的头像
    # 2. 博客/笔记图片：需要相应模块的权限
    # 3. 通用附件：需要 storage.upload 权限
    
    has_permission = False
    
    if category == "avatar":
        has_permission = True  # 登录用户都可以上传头像
    elif category == "blog":
        has_permission = current_user.permissions and ("*" in current_user.permissions or "blog.create" in current_user.permissions or "blog.update" in current_user.permissions)
    elif category == "note":
        has_permission = current_user.permissions and ("*" in current_user.permissions or "notes.create" in current_user.permissions or "notes.update" in current_user.permissions)
    else:
        # 通用附件，需要 storage.upload
        has_permission = current_user.permissions and ("*" in current_user.permissions or "storage.upload" in current_user.permissions)

    if not has_permission:
        raise HTTPException(status_code=403, detail=f"无权上传 {category} 类型的文件")
    
    storage = get_storage_manager()
    max_size = storage.max_size
    max_size_mb = max_size / 1024 / 1024
    
    # 1. 检查 Content-Length 头（如果可用）
    content_length = None
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
    
    # 2. 流式读取并检查大小
    content_chunks = []
    total_size = 0
    chunk_size = 1024 * 1024  # 1MB 块大小
    
    try:
        while True:
            chunk = await file.read(chunk_size)
            if not chunk:
                break
            
            total_size += len(chunk)
            
            # 实时检查大小
            if total_size > max_size:
                raise HTTPException(
                    status_code=413,
                    detail=f"文件大小超过限制（最大 {max_size_mb:.1f}MB，当前已读取 {total_size / 1024 / 1024:.1f}MB）"
                )
            
            content_chunks.append(chunk)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"读取文件失败: {str(e)}")
    
    # 3. 合并所有块
    content = b''.join(content_chunks)
    file_size = len(content)
    
    # 4. 最终验证
    if file_size > max_size:
        raise HTTPException(
            status_code=413,
            detail=f"文件大小超过限制（最大 {max_size_mb:.1f}MB，当前文件 {file_size / 1024 / 1024:.1f}MB）"
        )
    
    # 5. 验证文件（包括内容验证）
    is_valid, error_msg = storage.validate_file(file.filename or "unknown", file_size, content)
    if not is_valid:
        raise HTTPException(status_code=400, detail=error_msg)
    
    # 如果是头像，额外检查是否为图片
    if category == "avatar":
        if not (file.content_type and file.content_type.startswith("image/")):
             raise HTTPException(status_code=400, detail="头像必须是图片格式")
    
    # 生成存储路径
    relative_path, full_path = storage.generate_filename(
        file.filename or "unknown",
        current_user.user_id,
        category=category
    )
    
    # 保存文件
    try:
        Path(full_path).parent.mkdir(parents=True, exist_ok=True)
        with open(full_path, "wb") as f:
            f.write(content)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"文件保存失败: {str(e)}")
    
    # 获取 MIME 类型
    mime_type = file.content_type
    
    # 保存文件记录到数据库
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
    file_id: int,
    token: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """
    下载文件
    
    需要权限：storage.download
    """
    # 验证 Token
    current_user = get_user_from_token(token)

    # 权限检查
    if not (current_user.permissions and ("*" in current_user.permissions or "storage.download" in current_user.permissions)):
        raise HTTPException(status_code=403, detail="无权下载文件")
    
    # 查询文件记录
    result = await db.execute(select(FileRecord).where(FileRecord.id == file_id))
    file_record = result.scalar_one_or_none()
    
    if not file_record:
        raise HTTPException(status_code=404, detail="文件不存在")
    
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
    if not (current_user.permissions and ("*" in current_user.permissions or "storage.list" in current_user.permissions)):
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
    if not (current_user.permissions and ("*" in current_user.permissions or "storage.delete" in current_user.permissions)):
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
    if not (current_user.permissions and ("*" in current_user.permissions or "storage.list" in current_user.permissions)):
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





