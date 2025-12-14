"""
文件存储 Schema
"""

from typing import Optional
from pydantic import BaseModel, Field
from datetime import datetime


class FileInfo(BaseModel):
    """文件信息"""
    id: int
    filename: str
    storage_path: str
    file_size: int
    mime_type: Optional[str] = None
    uploader_id: Optional[int] = None
    description: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class FileUploadResponse(BaseModel):
    """文件上传响应"""
    id: int
    filename: str
    storage_path: str
    file_size: int
    url: str  # 访问URL
    message: str = "上传成功"


class FileListResponse(BaseModel):
    """文件列表响应"""
    items: list[FileInfo]
    total: int
    page: int
    size: int





