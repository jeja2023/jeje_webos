"""
通知系统 Schema
"""

from typing import Optional
from pydantic import BaseModel, Field
from datetime import datetime


class NotificationInfo(BaseModel):
    """通知信息"""
    id: int
    user_id: int
    title: str
    content: Optional[str] = None
    type: str = "info"
    is_read: bool = False
    read_at: Optional[datetime] = None
    action_url: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class NotificationCreate(BaseModel):
    """创建通知请求"""
    user_id: int = Field(..., description="接收用户ID，0表示所有用户")
    title: str = Field(..., min_length=1, max_length=200)
    content: Optional[str] = None
    type: str = Field(default="info", description="通知类型: info, success, warning, error")
    action_url: Optional[str] = None


class NotificationUpdate(BaseModel):
    """更新通知请求"""
    is_read: Optional[bool] = None


class NotificationListResponse(BaseModel):
    """通知列表响应"""
    items: list[NotificationInfo]
    total: int
    unread_count: int
    page: int
    size: int





