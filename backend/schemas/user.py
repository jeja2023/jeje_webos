"""
用户管理数据验证
用户列表、审核等
"""

from datetime import datetime
from typing import Optional, List
import json
from pydantic import BaseModel, ConfigDict, Field, field_validator


class UserListQuery(BaseModel):
    """用户列表查询参数"""
    page: int = Field(1, ge=1)
    size: int = Field(10, ge=1, le=100)
    role: Optional[str] = None  # 角色筛选
    role_id: Optional[int] = None  # 用户组筛选
    is_active: Optional[bool] = None  # 状态筛选
    keyword: Optional[str] = None  # 关键词搜索（用户名、手机号）
    last_login_after: Optional[datetime] = None  # 最后登录时间范围（之后）
    last_login_before: Optional[datetime] = None  # 最后登录时间范围（之前）
    created_after: Optional[datetime] = None  # 注册时间范围（之后）
    created_before: Optional[datetime] = None  # 注册时间范围（之前）


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

    @field_validator('role_ids', 'permissions', mode='before')
    @classmethod
    def parse_json_list(cls, v):
        if isinstance(v, str):
            try:
                data = json.loads(v)
                return data if isinstance(data, list) else []
            except (json.JSONDecodeError, TypeError):
                return []
        return v or []


class UserUpdateAdmin(BaseModel):
    """更新用户信息（管理员）"""
    nickname: Optional[str] = Field(None, max_length=50, description="昵称")
    phone: Optional[str] = Field(None, max_length=11, description="手机号")
    avatar: Optional[str] = Field(None, max_length=255, description="头像URL")
    storage_quota: Optional[int] = Field(None, ge=0, description="存储配额（字节），None 表示无限制")


class UserProfileUpdate(BaseModel):
    """用户个人资料更新"""
    nickname: Optional[str] = Field(None, max_length=50, description="昵称")
    phone: Optional[str] = Field(None, max_length=11, description="手机号")
    avatar: Optional[str] = Field(None, max_length=255, description="头像URL")
    settings: Optional[dict] = Field(None, description="用户设置")


class UserBatchAction(BaseModel):
    """批量操作用户"""
    user_ids: List[int] = Field(..., min_length=1, description="用户ID列表")
    action: str = Field(..., description="操作类型：enable, disable, delete, audit_pass, audit_reject")
    reason: Optional[str] = Field(None, max_length=500, description="操作备注（用于审核）")
