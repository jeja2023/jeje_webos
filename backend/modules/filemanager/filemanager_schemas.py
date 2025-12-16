"""
文件管理数据验证模型
"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


# ============ 文件夹相关 ============

class FolderCreate(BaseModel):
    """创建文件夹"""
    name: str = Field(..., min_length=1, max_length=255, description="文件夹名称")
    parent_id: Optional[int] = Field(None, description="父文件夹ID，为空则在根目录")


class FolderUpdate(BaseModel):
    """更新文件夹"""
    name: Optional[str] = Field(None, min_length=1, max_length=255, description="文件夹名称")


class FolderMove(BaseModel):
    """移动文件夹"""
    target_parent_id: Optional[int] = Field(None, description="目标父文件夹ID，为空则移动到根目录")


class FolderInfo(BaseModel):
    """文件夹信息"""
    id: int
    name: str
    parent_id: Optional[int]
    path: str
    created_at: datetime
    updated_at: datetime
    
    # 统计信息（动态计算）
    file_count: int = 0
    folder_count: int = 0
    
    class Config:
        from_attributes = True


class FolderTreeNode(BaseModel):
    """文件夹树节点"""
    id: int
    name: str
    path: str
    children: List["FolderTreeNode"] = []
    
    class Config:
        from_attributes = True


# ============ 文件相关 ============

class FileUpload(BaseModel):
    """文件上传参数"""
    folder_id: Optional[int] = Field(None, description="目标文件夹ID")
    description: Optional[str] = Field(None, max_length=500, description="文件描述")


class FileUpdate(BaseModel):
    """更新文件"""
    name: Optional[str] = Field(None, min_length=1, max_length=255, description="文件名")
    description: Optional[str] = Field(None, max_length=500, description="文件描述")
    is_starred: Optional[bool] = Field(None, description="是否收藏")


class FileMove(BaseModel):
    """移动文件"""
    target_folder_id: Optional[int] = Field(None, description="目标文件夹ID，为空则移动到根目录")


class FileInfo(BaseModel):
    """文件信息"""
    id: int
    name: str
    folder_id: Optional[int]
    storage_path: str
    file_size: int
    mime_type: Optional[str]
    description: Optional[str]
    is_starred: bool
    created_at: datetime
    updated_at: datetime
    
    # 扩展信息
    download_url: str = ""
    preview_url: str = ""
    icon: str = "📄"
    
    class Config:
        from_attributes = True


class FileListItem(BaseModel):
    """文件列表项"""
    id: int
    name: str
    type: str = "file"  # file 或 folder
    size: int = 0
    mime_type: Optional[str] = None
    is_starred: bool = False
    created_at: datetime
    updated_at: datetime
    icon: str = "📄"


class BreadcrumbItem(BaseModel):
    """面包屑导航项"""
    id: Optional[int]
    name: str
    path: str


class DirectoryContents(BaseModel):
    """目录内容"""
    current_folder: Optional[FolderInfo]
    breadcrumbs: List[BreadcrumbItem]
    folders: List[FolderInfo]
    files: List[FileInfo]
    total_folders: int
    total_files: int


class StorageStats(BaseModel):
    """存储统计"""
    total_files: int
    total_folders: int
    total_size: int
    storage_quota: Optional[int] = None  # 存储配额（字节），None 表示无限制
    used_percentage: Optional[float] = None  # 使用百分比（0-100），仅当有配额时计算
    starred_count: int
    recent_files: List[FileInfo] = []


class BatchDeleteRequest(BaseModel):
    """批量删除请求"""
    file_ids: List[int] = Field(default=[], description="要删除的文件ID列表")
    folder_ids: List[int] = Field(default=[], description="要删除的文件夹ID列表")


class BatchDeleteResult(BaseModel):
    """批量删除结果"""
    success_count: int
    failed_count: int
    deleted_files: List[int] = []
    deleted_folders: List[int] = []
    errors: List[dict] = []
