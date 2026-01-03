# -*- coding: utf-8 -*-
"""
协同办公数据验证模型
"""

from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field
from enum import Enum


class DocType(str, Enum):
    """文档类型"""
    DOC = "doc"      # Word文档
    SHEET = "sheet"  # Excel表格


class ShareType(str, Enum):
    """分享类型"""
    PRIVATE = "private"  # 私有
    LINK = "link"        # 链接分享
    PUBLIC = "public"    # 公开


class SharePermission(str, Enum):
    """分享权限"""
    VIEW = "view"  # 只读
    EDIT = "edit"  # 可编辑


class CollabPermission(str, Enum):
    """协作者权限"""
    VIEW = "view"    # 只读
    EDIT = "edit"    # 编辑
    ADMIN = "admin"  # 管理员


# ==================== 文档相关 ====================

class DocumentCreate(BaseModel):
    """创建文档"""
    title: str = Field(..., min_length=1, max_length=200, description="文档标题")
    doc_type: DocType = Field(..., description="文档类型")
    content: Optional[str] = Field(None, description="初始内容(JSON)")
    folder_id: Optional[int] = Field(None, description="所属文件夹ID")
    is_template: bool = Field(False, description="是否模板")


class DocumentUpdate(BaseModel):
    """更新文档"""
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    content: Optional[str] = None
    folder_id: Optional[int] = None
    is_starred: Optional[bool] = None


class DocumentContentUpdate(BaseModel):
    """更新文档内容（用于实时保存）"""
    content: str = Field(..., description="文档内容(JSON)")
    version: int = Field(..., description="当前版本号")
    create_version: bool = Field(False, description="是否创建版本快照")
    version_comment: Optional[str] = Field(None, description="版本备注")


class DocumentShareUpdate(BaseModel):
    """更新文档分享设置"""
    share_type: ShareType = Field(..., description="分享类型")
    share_permission: SharePermission = Field(SharePermission.VIEW, description="分享权限")


class DocumentInfo(BaseModel):
    """文档信息"""
    id: int
    title: str
    doc_type: str
    user_id: int
    folder_id: Optional[int]
    is_starred: bool
    is_template: bool
    is_deleted: bool
    share_type: str
    share_code: Optional[str]
    share_permission: str
    version: int
    created_at: datetime
    updated_at: datetime
    
    # 额外信息
    owner_name: Optional[str] = None
    collaborator_count: int = 0
    
    model_config = ConfigDict(from_attributes=True)


class DocumentDetail(DocumentInfo):
    """文档详情（含内容）"""
    content: Optional[str] = None


class DocumentListItem(BaseModel):
    """文档列表项"""
    id: int
    title: str
    doc_type: str
    user_id: int
    is_starred: bool
    share_type: str
    version: int
    created_at: datetime
    updated_at: datetime
    owner_name: Optional[str] = None
    
    model_config = ConfigDict(from_attributes=True)


# ==================== 版本相关 ====================

class VersionInfo(BaseModel):
    """版本信息"""
    id: int
    document_id: int
    version: int
    user_id: int
    comment: Optional[str]
    created_at: datetime
    user_name: Optional[str] = None
    
    model_config = ConfigDict(from_attributes=True)


class VersionRestore(BaseModel):
    """恢复版本"""
    version_id: int = Field(..., description="要恢复的版本ID")


# ==================== 协作者相关 ====================

class CollaboratorAdd(BaseModel):
    """添加协作者"""
    user_id: int = Field(..., description="用户ID")
    permission: CollabPermission = Field(CollabPermission.EDIT, description="权限")


class CollaboratorUpdate(BaseModel):
    """更新协作者权限"""
    permission: CollabPermission = Field(..., description="权限")


class CollaboratorInfo(BaseModel):
    """协作者信息"""
    id: int
    document_id: int
    user_id: int
    permission: str
    invited_by: int
    created_at: datetime
    user_name: Optional[str] = None
    user_avatar: Optional[str] = None
    
    model_config = ConfigDict(from_attributes=True)


# ==================== 实时协同相关 ====================

class EditSessionInfo(BaseModel):
    """编辑会话信息"""
    user_id: int
    user_name: str
    user_avatar: Optional[str]
    cursor_position: Optional[str]
    last_activity: datetime
    
    model_config = ConfigDict(from_attributes=True)


class CollabMessage(BaseModel):
    """协同消息"""
    type: str = Field(..., description="消息类型: cursor/content/join/leave")
    document_id: int
    user_id: int
    data: dict = Field(default_factory=dict, description="消息数据")


# ==================== 从文件管理器打开 ====================

class OpenFromFileManager(BaseModel):
    """从文件管理器打开文档"""
    file_id: int = Field(..., description="文件管理器中的文件ID")
