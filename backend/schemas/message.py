"""
通知系统 Schema
"""

from typing import Optional
from pydantic import BaseModel, ConfigDict, Field
from datetime import datetime


class MessageInfo(BaseModel):
    """信息"""
    id: int
    user_id: int
    sender_id: Optional[int] = None
    sender_name: Optional[str] = None  # 发送者名称
    title: str
    content: Optional[str] = None
    type: str = "info"
    is_read: bool = False
    read_at: Optional[datetime] = None
    action_url: Optional[str] = None
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class MessageCreate(BaseModel):
    """创建信息请求"""
    user_id: Optional[int] = Field(None, description="接收用户ID，0表示所有用户")
    receiver_username: Optional[str] = Field(None, description="接收用户名")
    title: str = Field(..., min_length=1, max_length=200)
    content: Optional[str] = None
    type: str = Field(default="info", description="类型: info, success, warning, error")
    action_url: Optional[str] = None


class MessageUpdate(BaseModel):
    """更新信息请求"""
    is_read: Optional[bool] = None


class MessageListResponse(BaseModel):
    """信息列表响应"""
    items: list[MessageInfo]
    total: int
    unread_count: int
    page: int
    size: int





