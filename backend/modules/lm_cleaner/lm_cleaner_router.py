"""
NotebookLM水印清除模块API路由
定义 RESTful API 接口
"""

import logging
import os
import uuid
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, Query, UploadFile, File, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from pathlib import Path

from core.database import get_db
from core.security import get_current_user, require_permission, TokenData
from core.errors import NotFoundException, success_response, ErrorCode, ValidationException
from core.pagination import create_page_response
from utils.storage import get_storage_manager

from .lm_cleaner_schemas import (
    LmCleanerCreate,
    LmCleanerResponse,
    LmCleanerListResponse
)
from .lm_cleaner_services import LmCleanerService

logger = logging.getLogger(__name__)

router = APIRouter()
storage_manager = get_storage_manager()

@router.post("/clean", response_model=dict, summary="处理文件（清除水印）")
async def clean_file(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """
    上传文件并清除 NotebookLM 水印
    """
    # 1. 验证文件
    content = await file.read()
    is_valid, error = storage_manager.validate_file(file.filename, len(content), content)
    if not is_valid:
        raise ValidationException(error)
    
    # 2. 保存原始文件到上传目录（用户隔离）
    uploads_dir = LmCleanerService._get_user_dir(user.user_id, "uploads")
    temp_input_path = uploads_dir / f"source_{uuid.uuid4().hex[:8]}_{file.filename}"
    with open(temp_input_path, "wb") as f:
        f.write(content)
    
    try:
        # 3. 处理文件
        output_path = await LmCleanerService.process_file(
            str(temp_input_path), 
            file.filename, 
            user.user_id
        )
        
        # 4. 创建记录
        item_data = LmCleanerCreate(
            title=file.filename,
            content=output_path,
            source_file=str(temp_input_path)  # 保存原始文件路径
        )
        item = await LmCleanerService.create(db, user.user_id, item_data)
        await db.commit()
        
        return success_response(
            data={
                "id": item.id,
                "filename": file.filename,
                "cleaned_file": os.path.basename(output_path)
            },
            message="水印处理成功"
        )
    except Exception as e:
        # 仅在失败时删除原始文件
        if temp_input_path.exists():
            os.remove(temp_input_path)
        raise e



@router.get("/download/{item_id}", summary="下载文件")
async def download_file(
    item_id: int,
    type: str = Query("cleaned", pattern="^(cleaned|source)$"),
    preview: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """下载处理后的文件或原始文件"""
    item = await LmCleanerService.get_by_id(db, item_id, user.user_id)
    if not item:
        raise NotFoundException("处理记录", item_id)
    
    if type == "source":
        if not item.source_file:
            raise NotFoundException("原始文件", item_id)
        file_path = Path(item.source_file)
        filename = f"source_{item.title}"
    else:
        if not item.content:
            raise NotFoundException("处理结果", item_id)
        file_path = Path(item.content)
        filename = f"cleaned_{item.title}"
        
    if not file_path.exists():
        raise NotFoundException("文件", item_id)

    # 自动判断文件类型
    import mimetypes
    media_type, _ = mimetypes.guess_type(file_path)
    if not media_type:
        media_type = "application/octet-stream"

    return FileResponse(
        path=file_path,
        filename=filename,
        media_type=media_type,
        content_disposition_type="inline" if preview else "attachment"
    )

@router.get("", response_model=dict, summary="获取历史记录")
async def get_list(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    keyword: Optional[str] = Query(None, description="搜索关键词"),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取清除历史列表"""
    items, total = await LmCleanerService.get_list(
        db,
        user_id=user.user_id,
        page=page,
        page_size=page_size,
        keyword=keyword
    )
    
    return create_page_response(
        items=[LmCleanerResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        message="获取成功"
    )

@router.delete("/{item_id}", response_model=dict, summary="删除记录")
async def delete(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("lm_cleaner.delete"))
):
    """删除处理记录"""
    success = await LmCleanerService.delete(db, item_id, user.user_id)
    if not success:
        raise NotFoundException("记录", item_id)
    
    await db.commit()
    return success_response(message="删除成功")
