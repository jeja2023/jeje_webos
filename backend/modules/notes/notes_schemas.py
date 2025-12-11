"""
笔记数据验证模式
"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


# ============ 文件夹 ============

class FolderCreate(BaseModel):
    """创建文件夹"""
    name: str = Field(..., min_length=1, max_length=100)
    parent_id: Optional[int] = None
    order: int = 0


class FolderUpdate(BaseModel):
    """更新文件夹"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    parent_id: Optional[int] = None
    order: Optional[int] = None


class FolderInfo(BaseModel):
    """文件夹信息"""
    id: int
    name: str
    parent_id: Optional[int]
    order: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class FolderTree(BaseModel):
    """文件夹树结构"""
    id: int
    name: str
    parent_id: Optional[int]
    order: int
    children: List["FolderTree"] = []
    note_count: int = 0
    
    class Config:
        from_attributes = True


# ============ 标签 ============

class TagCreate(BaseModel):
    """创建标签"""
    name: str = Field(..., min_length=1, max_length=50)
    color: str = Field(default="#3b82f6", max_length=20)


class TagUpdate(BaseModel):
    """更新标签"""
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    color: Optional[str] = Field(None, max_length=20)


class TagInfo(BaseModel):
    """标签信息"""
    id: int
    name: str
    color: str
    
    class Config:
        from_attributes = True


# ============ 笔记 ============

class NoteCreate(BaseModel):
    """创建笔记"""
    title: str = Field(..., min_length=1, max_length=200)
    content: str = ""
    folder_id: Optional[int] = None
    tags: List[int] = []
    is_starred: bool = False
    is_pinned: bool = False


class NoteUpdate(BaseModel):
    """更新笔记"""
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    content: Optional[str] = None
    folder_id: Optional[int] = None
    tags: Optional[List[int]] = None
    is_starred: Optional[bool] = None
    is_pinned: Optional[bool] = None
    order: Optional[int] = None


class NoteInfo(BaseModel):
    """笔记信息"""
    id: int
    title: str
    content: str
    folder_id: Optional[int]
    is_starred: bool
    is_pinned: bool
    order: int
    tags: List[TagInfo] = []
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class NoteListItem(BaseModel):
    """笔记列表项"""
    id: int
    title: str
    folder_id: Optional[int]
    is_starred: bool
    is_pinned: bool
    tags: List[TagInfo] = []
    created_at: datetime
    updated_at: datetime
    # 摘要（前100字符）
    summary: str = ""
    
    class Config:
        from_attributes = True


class NoteMove(BaseModel):
    """移动笔记"""
    folder_id: Optional[int] = None  # None表示移动到根目录


