"""
文件管理 API 路由
RESTful 风格，提供完整的文件管理功能
"""

from typing import Optional, List
import os
from urllib.parse import quote
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user, TokenData, decode_token, require_permission
from schemas import success

from .filemanager_schemas import (
    FolderCreate, FolderUpdate, FolderMove, FolderInfo,
    FileUpdate, FileMove, FileInfo, DirectoryContents, StorageStats,
    BatchDeleteRequest, BatchDeleteResult
)
from .filemanager_models import VirtualFolder, VirtualFile
from sqlalchemy import select
import logging
from .filemanager_services import FileManagerService
from utils.storage import get_storage_manager

logger = logging.getLogger(__name__)


def encode_filename_for_header(filename: str) -> str:
    """
    对文件名进行编码以适应 HTTP 响应头
    使用 RFC 5987 规范处理非 ASCII 字符
    """
    # 尝试 ASCII 编码，如果失败则使用 RFC 5987 格式
    try:
        filename.encode('ascii')
        # 纯 ASCII 字符，直接使用
        return f'"{filename}"'
    except UnicodeEncodeError:
        # 包含非 ASCII 字符，使用 RFC 5987 格式
        encoded = quote(filename, safe='')
        return f"UTF-8''{encoded}"

router = APIRouter()


def get_service(db: AsyncSession, user: TokenData) -> FileManagerService:
    """创建文件管理服务实例"""
    return FileManagerService(db, user.user_id)


def get_user_from_token(token: Optional[str] = Query(None)) -> TokenData:
    """从 URL 参数获取 Token 并验证（用于下载/预览）"""
    if not token:
        raise HTTPException(status_code=401, detail="未认证")
    
    token_data = decode_token(token)
    if not token_data:
        raise HTTPException(status_code=401, detail="无效的令牌")
    
    return token_data


# ============ 目录浏览 ============

@router.get("/browse")
async def browse_directory(
    folder_id: Optional[int] = Query(None, description="文件夹ID，为空则浏览根目录"),
    keyword: Optional[str] = Query(None, description="搜索关键词"),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("filemanager.read"))
):
    """浏览目录内容"""
    service = get_service(db, user)
    try:
        contents = await service.browse_directory(folder_id, keyword)
        return success(contents.model_dump())
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        logger.error(f"浏览目录失败: {e}\n{traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"浏览失败: {str(e)}")


@router.get("/search")
async def search_files(
    keyword: str = Query(..., min_length=1, description="搜索关键词"),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("filemanager.read"))
):
    """全局搜索文件和文件夹"""
    service = get_service(db, user)
    contents = await service.search(keyword)
    return success(contents.model_dump())


@router.get("/stats")
async def get_storage_stats(
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("filemanager.read"))
):
    """获取存储统计信息"""
    service = get_service(db, user)
    stats = await service.get_storage_stats()
    return success(stats.model_dump())


@router.get("/starred")
async def get_starred_files(
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("filemanager.read"))
):
    """获取收藏的文件"""
    service = get_service(db, user)
    files = await service.get_starred_files()
    return success([f.model_dump() for f in files])


# --- 模块文件聚合功能已移除 ---


# ============ 文件夹操作 ============

@router.get("/folders/tree")
async def get_folder_tree(
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("filemanager.read"))
):
    """获取完整文件夹树"""
    service = get_service(db, user)
    tree = await service.get_folder_tree()
    return success([t.model_dump() for t in tree])


@router.post("/folders")
async def create_folder(
    data: FolderCreate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("filemanager.create"))
):
    """创建文件夹"""
    service = get_service(db, user)
    try:
        folder = await service.create_folder(data)
        return success(FolderInfo(
            id=folder.id,
            name=folder.name,
            parent_id=folder.parent_id,
            path=folder.path,
            created_at=folder.created_at,
            updated_at=folder.updated_at
        ).model_dump(), "创建成功")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/folders/{folder_id}")
async def update_folder(
    folder_id: int,
    data: FolderUpdate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("filemanager.update"))
):
    """更新文件夹（重命名）"""
    service = get_service(db, user)
    try:
        folder = await service.update_folder(folder_id, data)
        if not folder:
            raise HTTPException(status_code=404, detail="文件夹不存在")
        return success(FolderInfo(
            id=folder.id,
            name=folder.name,
            parent_id=folder.parent_id,
            path=folder.path,
            created_at=folder.created_at,
            updated_at=folder.updated_at
        ).model_dump(), "更新成功")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/folders/{folder_id}/move")
async def move_folder(
    folder_id: int,
    data: FolderMove,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("filemanager.update"))
):
    """移动文件夹"""
    service = get_service(db, user)
    try:
        folder = await service.move_folder(folder_id, data.target_parent_id)
        if not folder:
            raise HTTPException(status_code=404, detail="文件夹不存在")
        return success({"id": folder.id, "path": folder.path}, "移动成功")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/folders/{folder_id}")
async def delete_folder(
    folder_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("filemanager.delete"))
):
    """删除文件夹（级联删除所有内容）"""
    service = get_service(db, user)
    if not await service.delete_folder(folder_id):
        raise HTTPException(status_code=404, detail="文件夹不存在")
    return success(message="删除成功")


# ============ 文件操作 ============

async def _process_single_file(
    file: UploadFile,
    service: FileManagerService,
    storage,
    folder_id: Optional[int],
    description: Optional[str],
    user_id: int
) -> dict:
    """处理单个文件上传（内部辅助函数）"""
    import logging
    logger = logging.getLogger(__name__)
    
    max_size = storage.max_size
    max_size_mb = max_size / 1024 / 1024
    
    # 1. 检查 Content-Length 头
    content_length = None
    if hasattr(file, 'headers'):
        content_length_str = file.headers.get('content-length')
        if content_length_str:
            try:
                content_length = int(content_length_str)
                if content_length > max_size:
                    raise HTTPException(
                        status_code=413,
                        detail=f"文件 {file.filename} 大小超过限制（最大 {max_size_mb:.1f}MB，当前文件 {content_length / 1024 / 1024:.1f}MB）"
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
            
            if total_size > max_size:
                raise HTTPException(
                    status_code=413,
                    detail=f"文件 {file.filename} 大小超过限制（最大 {max_size_mb:.1f}MB，当前已读取 {total_size / 1024 / 1024:.1f}MB）"
                )
            
            content_chunks.append(chunk)
            
            if content_length and total_size > content_length:
                logger.warning(f"文件 {file.filename} 实际大小 ({total_size}) 超过声明的 Content-Length ({content_length})")
                break
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"读取文件 {file.filename} 时发生错误: {str(e)}")
        raise HTTPException(status_code=500, detail=f"读取文件失败: {str(e)}")
    
    # 3. 合并所有块
    content = b''.join(content_chunks)
    actual_size = len(content)
    
    # 4. 最终验证
    if actual_size > max_size:
        raise HTTPException(
            status_code=413,
            detail=f"文件 {file.filename} 大小超过限制（最大 {max_size_mb:.1f}MB，当前文件 {actual_size / 1024 / 1024:.1f}MB）"
        )
    
    # 5. 上传文件
    try:
        uploaded = await service.upload_file(
            filename=file.filename or "unknown",
            content=content,
            mime_type=file.content_type or "application/octet-stream",
            folder_id=folder_id,
            description=description
        )
        
        logger.info(f"文件上传成功: {file.filename}, 大小: {actual_size / 1024 / 1024:.2f}MB, 用户: {user_id}")
        
        return {
            "success": True,
            "file": FileInfo(
                id=uploaded.id,
                name=uploaded.name,
                folder_id=uploaded.folder_id,
                storage_path=uploaded.storage_path,
                file_size=uploaded.file_size,
                mime_type=uploaded.mime_type,
                description=uploaded.description,
                is_starred=uploaded.is_starred,
                created_at=uploaded.created_at,
                updated_at=uploaded.updated_at,
                download_url=f"/api/v1/filemanager/download/{uploaded.id}",
                preview_url=f"/api/v1/filemanager/preview/{uploaded.id}"
            ).model_dump()
        }
    except ValueError as e:
        return {
            "success": False,
            "filename": file.filename or "unknown",
            "error": str(e)
        }
    except Exception as e:
        logger.error(f"保存文件 {file.filename} 失败: {str(e)}")
        return {
            "success": False,
            "filename": file.filename or "unknown",
            "error": f"保存文件失败: {str(e)}"
        }


async def _process_single_file_with_name(
    file: UploadFile,
    filename: str,
    service: FileManagerService,
    storage,
    folder_id: Optional[int],
    description: Optional[str],
    user_id: int
) -> dict:
    """
    处理单个文件上传（允许覆盖文件名）
    用于文件夹上传时，提取正确的文件名而非含路径的完整名称
    """
    max_size = storage.max_size
    max_size_mb = max_size / 1024 / 1024
    
    # 1. 检查 Content-Length 头
    content_length = None
    if hasattr(file, 'headers'):
        content_length_str = file.headers.get('content-length')
        if content_length_str:
            try:
                content_length = int(content_length_str)
                if content_length > max_size:
                    raise HTTPException(
                        status_code=413,
                        detail=f"文件 {filename} 大小超过限制（最大 {max_size_mb:.1f}MB，当前文件 {content_length / 1024 / 1024:.1f}MB）"
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
            
            if total_size > max_size:
                raise HTTPException(
                    status_code=413,
                    detail=f"文件 {filename} 大小超过限制（最大 {max_size_mb:.1f}MB，当前已读取 {total_size / 1024 / 1024:.1f}MB）"
                )
            
            content_chunks.append(chunk)
            
            if content_length and total_size > content_length:
                logger.warning(f"文件 {filename} 实际大小 ({total_size}) 超过声明的 Content-Length ({content_length})")
                break
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"读取文件 {filename} 时发生错误: {str(e)}")
        raise HTTPException(status_code=500, detail=f"读取文件失败: {str(e)}")
    
    # 3. 合并所有块
    content = b''.join(content_chunks)
    actual_size = len(content)
    
    # 4. 最终验证
    if actual_size > max_size:
        raise HTTPException(
            status_code=413,
            detail=f"文件 {filename} 大小超过限制（最大 {max_size_mb:.1f}MB，当前文件 {actual_size / 1024 / 1024:.1f}MB）"
        )
    
    # 5. 上传文件（使用指定的文件名）
    try:
        uploaded = await service.upload_file(
            filename=filename,
            content=content,
            mime_type=file.content_type or "application/octet-stream",
            folder_id=folder_id,
            description=description
        )
        
        logger.info(f"文件上传成功: {filename}, 大小: {actual_size / 1024 / 1024:.2f}MB, 用户: {user_id}")
        
        return {
            "success": True,
            "file": FileInfo(
                id=uploaded.id,
                name=uploaded.name,
                folder_id=uploaded.folder_id,
                storage_path=uploaded.storage_path,
                file_size=uploaded.file_size,
                mime_type=uploaded.mime_type,
                description=uploaded.description,
                is_starred=uploaded.is_starred,
                created_at=uploaded.created_at,
                updated_at=uploaded.updated_at,
                download_url=f"/api/v1/filemanager/download/{uploaded.id}",
                preview_url=f"/api/v1/filemanager/preview/{uploaded.id}"
            ).model_dump()
        }
    except ValueError as e:
        return {
            "success": False,
            "filename": filename,
            "error": str(e)
        }
    except Exception as e:
        logger.error(f"保存文件 {filename} 失败: {str(e)}")
        return {
            "success": False,
            "filename": filename,
            "error": f"保存文件失败: {str(e)}"
        }

@router.post("/upload")
async def upload_file(
    files: List[UploadFile] = File(...),
    folder_id: Optional[int] = Form(None),
    description: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("filemanager.upload"))
):
    """
    上传文件（支持多文件批量上传）
    
    文件大小限制：由系统配置 max_upload_size 决定（默认 100MB）
    支持的文件类型：图片、文档、压缩文件等（详见系统配置）
    存储配额：每个用户有独立的存储配额限制（可在用户管理中设置）
    
    优化特性：
    - 支持多文件批量上传
    - 流式读取，边读边检查大小，避免大文件占用过多内存
    - 多重检查：Content-Length 头、流式检查、最终验证、存储配额检查
    - 友好的错误提示，显示限制和实际大小
    - 部分文件失败不影响其他文件上传
    """
    import logging
    logger = logging.getLogger(__name__)
    
    if not files:
        raise HTTPException(status_code=400, detail="请至少选择一个文件")
    
    service = get_service(db, user)
    storage = get_storage_manager()
    
    logger.info(f"用户 {user.user_id} 开始批量上传 {len(files)} 个文件，folder_id: {folder_id}")
    
    # 处理所有文件
    results = []
    success_count = 0
    fail_count = 0
    
    for file in files:
        try:
            result = await _process_single_file(file, service, storage, folder_id, description, user.user_id)
            results.append(result)
            if result["success"]:
                success_count += 1
            else:
                fail_count += 1
        except HTTPException as e:
            # HTTP 异常（如文件过大）直接返回
            results.append({
                "success": False,
                "filename": file.filename or "unknown",
                "error": e.detail
            })
            fail_count += 1
        except Exception as e:
            logger.error(f"处理文件 {file.filename} 时发生未知错误: {str(e)}")
            results.append({
                "success": False,
                "filename": file.filename or "unknown",
                "error": f"上传失败: {str(e)}"
            })
            fail_count += 1
    
    # 返回结果
    uploaded_files = [r["file"] for r in results if r.get("success")]
    errors = [{"filename": r.get("filename", "unknown"), "error": r.get("error")} for r in results if not r.get("success")]
    
    message = f"成功上传 {success_count} 个文件"
    if fail_count > 0:
        message += f"，{fail_count} 个文件失败"
    
    return success({
        "uploaded": uploaded_files,
        "errors": errors,
        "summary": {
            "total": len(files),
            "success": success_count,
            "failed": fail_count
        }
    }, message)


@router.post("/upload/folder")
async def upload_folder(
    files: List[UploadFile] = File(...),
    relative_paths: List[str] = Form(...),
    folder_id: Optional[int] = Form(None),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("filemanager.upload"))
):
    """
    上传整个文件夹（保持目录结构）
    
    - files: 文件列表
    - relative_paths: 每个文件的相对路径（与 files 一一对应）
    - folder_id: 目标父文件夹 ID
    """
    if not files or not relative_paths:
        raise HTTPException(status_code=400, detail="请选择文件夹上传")
    
    if len(files) != len(relative_paths):
        raise HTTPException(status_code=400, detail="文件数量与路径数量不匹配")
    
    service = get_service(db, user)
    storage = get_storage_manager()
    
    logger.info(f"用户 {user.user_id} 上传文件夹，包含 {len(files)} 个文件，目标文件夹: {folder_id}")
    logger.info(f"相对路径列表: {relative_paths[:5]}{'...' if len(relative_paths) > 5 else ''}")
    
    # 收集所有需要创建的文件夹路径
    folder_paths = set()
    for rel_path in relative_paths:
        # 分解路径，收集所有父目录
        parts = rel_path.replace("\\", "/").split("/")
        for i in range(1, len(parts)):  # 不包含文件名本身
            folder_path = "/".join(parts[:i])
            if folder_path:
                folder_paths.add(folder_path)
    
    # 按层级排序（先创建父目录）
    folder_paths = sorted(folder_paths, key=lambda x: x.count("/"))
    logger.info(f"需要创建的文件夹路径: {folder_paths}")
    
    # 缓存已创建的文件夹：路径 -> ID
    folder_cache = {}
    created_folders = 0
    
    # 创建文件夹结构
    for folder_path in folder_paths:
        parts = folder_path.split("/")
        folder_name = parts[-1]
        parent_path = "/".join(parts[:-1]) if len(parts) > 1 else ""
        
        # 确定父文件夹 ID
        if parent_path:
            parent_id = folder_cache.get(parent_path)
        else:
            parent_id = folder_id
        
        # 检查文件夹是否已存在
        try:
            existing_folder = await db.execute(
                select(VirtualFolder).where(
                    VirtualFolder.name == folder_name,
                    VirtualFolder.parent_id == parent_id,
                    VirtualFolder.user_id == user.user_id
                )
            )
            existing = existing_folder.scalar_one_or_none()
            
            if existing:
                folder_cache[folder_path] = existing.id
                logger.debug(f"文件夹已存在: {folder_path} -> ID {existing.id}")
            else:
                # 创建新文件夹
                new_folder = await service.create_folder(FolderCreate(
                    name=folder_name,
                    parent_id=parent_id
                ))
                folder_cache[folder_path] = new_folder.id
                created_folders += 1
                logger.info(f"创建文件夹: {folder_path} -> ID {new_folder.id}")
        except Exception as e:
            import traceback
            logger.error(f"创建文件夹 {folder_path} 失败: {e}\n{traceback.format_exc()}")
    
    logger.info(f"文件夹创建完成，共创建 {created_folders} 个，缓存: {folder_cache}")
    
    # 上传文件
    results = []
    success_count = 0
    fail_count = 0
    
    for file, rel_path in zip(files, relative_paths):
        try:
            # 解析相对路径得到目标文件夹和真正的文件名
            parts = rel_path.replace("\\", "/").split("/")
            actual_filename = parts[-1] if parts else (file.filename or "unknown")
            
            if len(parts) > 1:
                # 有子目录
                folder_path = "/".join(parts[:-1])
                target_folder_id = folder_cache.get(folder_path, folder_id)
            else:
                # 直接放在目标目录
                target_folder_id = folder_id
            
            logger.debug(f"处理文件: {rel_path} -> 文件名: {actual_filename}, 目标文件夹ID: {target_folder_id}")
            
            # 自定义处理：使用提取的文件名而非 file.filename（可能包含路径）
            result = await _process_single_file_with_name(
                file, actual_filename, service, storage, target_folder_id, None, user.user_id
            )
            results.append(result)
            if result["success"]:
                success_count += 1
            else:
                fail_count += 1
        except HTTPException as e:
            results.append({
                "success": False,
                "filename": file.filename or "unknown",
                "error": e.detail
            })
            fail_count += 1
        except Exception as e:
            logger.error(f"处理文件 {file.filename} 失败: {e}")
            results.append({
                "success": False,
                "filename": file.filename or "unknown",
                "error": str(e)
            })
            fail_count += 1
    
    uploaded_files = [r["file"] for r in results if r.get("success")]
    errors = [{"filename": r.get("filename", "unknown"), "error": r.get("error")} for r in results if not r.get("success")]
    
    message = f"文件夹上传完成：{success_count} 个文件"
    if created_folders > 0:
        message += f"，{created_folders} 个文件夹"
    if fail_count > 0:
        message += f"，{fail_count} 个失败"
    
    return success({
        "uploaded": uploaded_files,
        "errors": errors,
        "summary": {
            "total": len(files),
            "success": success_count,
            "failed": fail_count,
            "created_folders": created_folders
        }
    }, message)


@router.get("/folders/{folder_id}/download")
async def download_folder(
    folder_id: int,
    token: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("filemanager.download"))
):
    """
    下载文件夹（打包为 ZIP 文件）
    
    递归获取文件夹下所有文件，打包成 ZIP 流式返回
    """
    import zipfile
    import io
    from datetime import datetime
    
    service = get_service(db, user)
    storage = get_storage_manager()
    
    # 获取文件夹信息
    folder = await service.get_folder(folder_id)
    if not folder:
        raise HTTPException(status_code=404, detail="文件夹不存在")
    
    folder_name = folder.name
    
    # 递归收集文件夹下所有文件
    async def collect_files(fid: int, path_prefix: str = "") -> list:
        """递归收集文件夹下的所有文件"""
        files = []
        
        # 获取当前文件夹的文件
        from .filemanager_models import VirtualFile, VirtualFolder
        from sqlalchemy import select
        
        file_result = await db.execute(
            select(VirtualFile).where(
                VirtualFile.folder_id == fid,
                VirtualFile.user_id == user.user_id
            )
        )
        for f in file_result.scalars().all():
            file_path = storage.get_file_path(f.storage_path)
            if file_path and file_path.exists():
                files.append({
                    "name": f"{path_prefix}{f.name}" if path_prefix else f.name,
                    "path": file_path
                })
        
        # 递归处理子文件夹
        subfolder_result = await db.execute(
            select(VirtualFolder).where(
                VirtualFolder.parent_id == fid,
                VirtualFolder.user_id == user.user_id
            )
        )
        for sf in subfolder_result.scalars().all():
            sub_prefix = f"{path_prefix}{sf.name}/" if path_prefix else f"{sf.name}/"
            files.extend(await collect_files(sf.id, sub_prefix))
        
        return files
    
    all_files = await collect_files(folder_id)
    
    if not all_files:
        raise HTTPException(status_code=400, detail="文件夹为空，无法下载")
    
    # 创建 ZIP 文件到内存
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        for file_info in all_files:
            try:
                # 在 ZIP 中保持目录结构
                arcname = f"{folder_name}/{file_info['name']}"
                zf.write(file_info["path"], arcname)
            except Exception as e:
                logger.warning(f"添加文件到ZIP失败: {file_info['name']}, 错误: {e}")
    
    zip_buffer.seek(0)
    
    # 处理文件名编码
    zip_filename = f"{folder_name}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.zip"
    encoded_filename = encode_filename_for_header(zip_filename)
    cd_header = f"attachment; filename*={encoded_filename}" if not encoded_filename.startswith('"') else f'attachment; filename={encoded_filename}'
    
    logger.info(f"用户 {user.user_id} 下载文件夹: {folder_name}，包含 {len(all_files)} 个文件")
    
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": cd_header}
    )


@router.get("/files/{file_id}")
async def get_file_info(
    file_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("filemanager.read"))
):
    """获取文件详情"""
    service = get_service(db, user)
    file = await service.get_file(file_id)
    if not file:
        raise HTTPException(status_code=404, detail="文件不存在")
    
    return success(service._file_to_info(file).model_dump())


@router.put("/files/{file_id}")
async def update_file(
    file_id: int,
    data: FileUpdate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("filemanager.update"))
):
    """更新文件信息"""
    service = get_service(db, user)
    file = await service.update_file(file_id, data)
    if not file:
        raise HTTPException(status_code=404, detail="文件不存在")
    return success(service._file_to_info(file).model_dump(), "更新成功")


@router.put("/files/{file_id}/move")
async def move_file(
    file_id: int,
    data: FileMove,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("filemanager.update"))
):
    """移动文件"""
    service = get_service(db, user)
    try:
        file = await service.move_file(file_id, data.target_folder_id)
        if not file:
            raise HTTPException(status_code=404, detail="文件不存在")
        return success({"id": file.id}, "移动成功")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/files/{file_id}/star")
async def toggle_star(
    file_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("filemanager.update"))
):
    """切换收藏状态"""
    service = get_service(db, user)
    file = await service.toggle_star(file_id)
    if not file:
        raise HTTPException(status_code=404, detail="文件不存在")
    return success({"is_starred": file.is_starred}, "收藏" if file.is_starred else "取消收藏")


@router.delete("/files/{file_id}")
async def delete_file(
    file_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("filemanager.delete"))
):
    """删除文件"""
    service = get_service(db, user)
    if not await service.delete_file(file_id):
        raise HTTPException(status_code=404, detail="文件不存在")
    return success(message="删除成功")


@router.post("/batch/delete")
async def batch_delete(
    data: BatchDeleteRequest,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("filemanager.delete"))
):
    """
    批量删除文件和文件夹
    
    支持同时删除多个文件和文件夹
    文件夹会级联删除其下的所有内容
    """
    if not data.file_ids and not data.folder_ids:
        raise HTTPException(status_code=400, detail="请至少选择一个文件或文件夹")
    
    service = get_service(db, user)
    result = await service.batch_delete(
        file_ids=data.file_ids,
        folder_ids=data.folder_ids
    )
    
    message = f"成功删除 {result['success_count']} 项"
    if result['failed_count'] > 0:
        message += f"，{result['failed_count']} 项失败"
    
    return success(
        BatchDeleteResult(**result).model_dump(),
        message
    )


# ============ 下载与预览 ============

@router.get("/download/{file_id}")
async def download_file(
    file_id: int,
    token: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("filemanager.download"))
):
    """下载文件（需要 filemanager.download 权限）"""
    storage = get_storage_manager()
    service = FileManagerService(db, user.user_id)
    file = await service.get_file(file_id)
    
    if not file:
        raise HTTPException(status_code=404, detail="文件不存在")
    
    file_path = storage.get_file_path(file.storage_path)
    if not file_path or not file_path.exists():
        raise HTTPException(status_code=404, detail="物理文件已丢失")
    
    # 处理文件名编码
    encoded_filename = encode_filename_for_header(file.name)
    cd_type = 'inline' if file.mime_type and ('image' in file.mime_type or 'video' in file.mime_type or 'pdf' in file.mime_type) else 'attachment'
    cd_header = f"{cd_type}; filename={encoded_filename}" if encoded_filename.startswith('"') else f"{cd_type}; filename*={encoded_filename}"
    
    return FileResponse(
        path=str(file_path),
        media_type=file.mime_type or "application/octet-stream",
        headers={"Content-Disposition": cd_header}
    )


@router.get("/preview/{file_id}")
async def preview_file(
    file_id: int,
    token: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("filemanager.download"))
):
    """预览文件（在线查看，不触发下载）"""
    return await download_file(file_id, token, db, user)
