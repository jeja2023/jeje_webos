"""
用户管理数据验证
用户列表、审核等
"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field


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
    storage_quota: Optional[int] = None  # 存储配额（字节）
    is_active: bool
    last_login: Optional[datetime] = None
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class UserUpdateAdmin(BaseModel):
    """更新用户信息（管理员）"""
    nickname: Optional[str] = Field(None, max_length=50, description="昵称")
    phone: Optional[str] = Field(None, max_length=11, description="手机号")
    avatar: Optional[str] = Field(None, max_length=255, description="头像URL")
    storage_quota: Optional[int] = Field(None, ge=0, description="存储配额（字节），None 表示无限制")

