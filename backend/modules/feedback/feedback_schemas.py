"""
反馈数据验证
"""

from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field
from .feedback_models import FeedbackStatus, FeedbackType, FeedbackPriority


class FeedbackCreate(BaseModel):
    """创建反馈"""
    title: str = Field(..., min_length=1, max_length=200, description="反馈标题")
    content: str = Field(..., min_length=1, description="反馈内容")
    type: FeedbackType = Field(FeedbackType.OTHER, description="反馈类型")
    priority: FeedbackPriority = Field(FeedbackPriority.NORMAL, description="优先级")
    contact: Optional[str] = Field(None, max_length=100, description="联系方式")
    attachments: Optional[str] = Field(None, max_length=500, description="附件路径（多个用逗号分隔）")


class FeedbackUpdate(BaseModel):
    """更新反馈（用户）"""
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    content: Optional[str] = Field(None, min_length=1)
    type: Optional[FeedbackType] = None
    priority: Optional[FeedbackPriority] = None
    contact: Optional[str] = Field(None, max_length=100)


class FeedbackReply(BaseModel):
    """回复反馈（管理员）"""
    reply_content: str = Field(..., min_length=1, description="回复内容")
    status: Optional[FeedbackStatus] = Field(None, description="更新状态")


class FeedbackAdminUpdate(BaseModel):
    """管理员更新反馈"""
    status: Optional[FeedbackStatus] = None
    priority: Optional[FeedbackPriority] = None
    handler_id: Optional[int] = Field(None, description="处理人ID")
    reply_content: Optional[str] = Field(None, min_length=1)
    resolved_at: Optional[datetime] = None


class FeedbackInfo(BaseModel):
    """反馈详情"""
    id: int
    title: str
    content: str
    type: FeedbackType
    priority: FeedbackPriority
    user_id: int
    status: FeedbackStatus
    handler_id: Optional[int]
    reply_content: Optional[str]
    reply_at: Optional[datetime]
    contact: Optional[str]
    attachments: Optional[str]
    created_at: datetime
    updated_at: datetime
    resolved_at: Optional[datetime]
    
    class Config:
        from_attributes = True


class FeedbackListItem(BaseModel):
    """反馈列表项"""
    id: int
    title: str
    type: FeedbackType
    priority: FeedbackPriority
    user_id: int
    status: FeedbackStatus
    handler_id: Optional[int]
    reply_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True



