"""
用户管理数据验证
用户列表、审核等
"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class UserListQuery(BaseModel):
    """用户列表查询参数"""
    page: int = Field(1, ge=1)
    size: int = Field(10, ge=1, le=100)
    role: Optional[str] = None  # 角色筛选
    is_active: Optional[bool] = None  # 状态筛选
    keyword: Optional[str] = None  # 关键词搜索（用户名、手机号）


class UserAudit(BaseModel):
    """用户审核"""
    is_active: bool = Field(..., description="是否通过审核")
    reason: Optional[str] = Field(None, max_length=500, description="审核备注")


class UserListItem(BaseModel):
    """用户列表项"""
    id: int
    username: str
    phone: Optional[str] = None
    nickname: Optional[str] = None
    avatar: Optional[str] = None
    role: str
    role_ids: Optional[list[int]] = []
    permissions: list[str] = []
    is_active: bool
    last_login: Optional[datetime] = None
    created_at: datetime
    
    class Config:
        from_attributes = True

