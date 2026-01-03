"""
知识库模块数据结构 schemas
"""

from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List, Dict, Any

# ==================== 知识库 Base ====================

class KbBaseCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    is_public: bool = False
    cover: Optional[str] = None

class KbBaseUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_public: Optional[bool] = None
    cover: Optional[str] = None

class KbBaseResponse(BaseModel):
    id: int
    name: str
    description: str
    cover: Optional[str]
    owner_id: int
    is_public: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

# ==================== 节点 Node ====================

class KbNodeCreate(BaseModel):
    base_id: int
    parent_id: Optional[int] = None
    title: str
    node_type: str = "document" # folder, document
    content: Optional[str] = None
    sort_order: int = 0
    status: str = "draft"

class KbNodeUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    sort_order: Optional[int] = None
    status: Optional[str] = None
    parent_id: Optional[int] = None # 允许移动

class KbNodeResponse(BaseModel):
    id: int
    base_id: int
    parent_id: Optional[int]
    title: str
    node_type: str
    # content: str # 通常不返回content在列表里，详情再返回
    file_path: Optional[str]
    file_meta: Optional[Dict[str, Any]]
    sort_order: int
    status: str
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class KbNodeDetail(KbNodeResponse):
    content: Optional[str] = ""

class KbTreeItem(BaseModel):
    id: int
    title: str
    node_type: str
    parent_id: Optional[int]
    children: List['KbTreeItem'] = []
    
    class Config:
        from_attributes = True
