"""
数据备份 Schema
"""

from typing import Optional
from pydantic import BaseModel, Field
from datetime import datetime


class BackupInfo(BaseModel):
    """备份信息"""
    id: int
    backup_type: str
    status: str
    file_path: Optional[str] = None
    file_size: Optional[int] = None
    description: Optional[str] = None
    error_message: Optional[str] = None
    created_by: Optional[int] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class BackupCreate(BaseModel):
    """创建备份请求"""
    backup_type: str = Field(..., description="备份类型: full, database, files")
    description: Optional[str] = None


class BackupRestore(BaseModel):
    """恢复备份请求"""
    backup_id: int = Field(..., description="备份记录ID")


class BackupListResponse(BaseModel):
    """备份列表响应"""
    items: list[BackupInfo]
    total: int
    page: int
    size: int





