"""
即时通讯数据验证模型
"""

from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


# ==================== 会话相关 ====================

class ConversationCreate(BaseModel):
    """创建会话"""
    type: str = Field(..., description="会话类型: private/group")
    member_ids: List[int] = Field(..., min_length=1, description="成员ID列表（私聊时只需一个，群聊时多个）")
    name: Optional[str] = Field(None, max_length=100, description="会话名称（群聊时必填）")
    avatar: Optional[str] = Field(None, max_length=255, description="会话头像")


class ConversationUpdate(BaseModel):
    """更新会话"""
    name: Optional[str] = Field(None, max_length=100)
    avatar: Optional[str] = Field(None, max_length=255)


class ConversationMemberInfo(BaseModel):
    """会话成员信息"""
    id: int
    user_id: int
    username: Optional[str] = None
    nickname: Optional[str] = None
    avatar: Optional[str] = None
    role: str
    joined_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class ConversationResponse(BaseModel):
    """会话响应"""
    id: int
    type: str
    name: Optional[str]
    avatar: Optional[str]
    owner_id: Optional[int]
    last_message_id: Optional[int]
    last_message_time: Optional[datetime]
    unread_count: int = 0
    is_pinned: bool = False
    is_muted: bool = False
    last_read_message_id: Optional[int] = None
    target_user_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    members: Optional[List[ConversationMemberInfo]] = None
    
    model_config = ConfigDict(from_attributes=True)


class ConversationListItem(BaseModel):
    """会话列表项"""
    id: int
    type: str
    name: Optional[str]
    avatar: Optional[str]
    last_message_id: Optional[int]
    last_message_time: Optional[datetime]
    unread_count: int = 0
    is_pinned: bool = False
    is_muted: bool = False
    target_user_id: Optional[int] = None
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


# ==================== 消息相关 ====================

class MessageCreate(BaseModel):
    """创建消息"""
    conversation_id: int
    type: str = Field(default="text", description="消息类型: text/image/file/system")
    content: str = Field(..., description="消息内容（文本消息直接传，文件消息传JSON）")
    reply_to_id: Optional[int] = Field(None, description="回复的消息ID")


class MessageFileInfo(BaseModel):
    """文件消息信息"""
    file_path: str
    file_name: str
    file_size: int
    file_mime: Optional[str] = None


class MessageResponse(BaseModel):
    """消息响应"""
    id: int
    conversation_id: int
    sender_id: int
    sender_username: Optional[str] = None
    sender_nickname: Optional[str] = None
    sender_avatar: Optional[str] = None
    type: str
    content: str  # 解密后的内容
    file_path: Optional[str] = None
    file_name: Optional[str] = None
    file_size: Optional[int] = None
    file_mime: Optional[str] = None
    reply_to_id: Optional[int] = None
    reply_to_message: Optional["MessageResponse"] = None
    is_recalled: bool
    is_read: bool = False  # 当前用户是否已读
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class MessageListResponse(BaseModel):
    """消息列表响应"""
    items: List[MessageResponse]
    total: int
    page: int
    page_size: int
    has_more: bool


# ==================== 联系人相关 ====================

class ContactCreate(BaseModel):
    """添加联系人"""
    contact_id: int = Field(..., description="联系人用户ID")
    alias: Optional[str] = Field(None, max_length=50, description="备注名")


class ContactUpdate(BaseModel):
    """更新联系人"""
    alias: Optional[str] = Field(None, max_length=50)
    status: Optional[str] = Field(None, description="状态: pending/accepted/blocked")


class ContactResponse(BaseModel):
    """联系人响应"""
    id: int
    user_id: int
    contact_id: int
    contact_username: Optional[str] = None
    contact_nickname: Optional[str] = None
    contact_avatar: Optional[str] = None
    alias: Optional[str]
    status: str
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


# ==================== 其他 ====================

class ConversationAddMember(BaseModel):
    """添加会话成员"""
    user_ids: List[int] = Field(..., min_length=1, description="要添加的用户ID列表")


class MarkReadRequest(BaseModel):
    """标记已读请求"""
    conversation_id: int
    message_ids: Optional[List[int]] = Field(None, description="消息ID列表，为空则标记会话所有消息已读")
    last_message_id: Optional[int] = Field(None, description="最后已读消息ID（用于批量标记）")


class UserStatusResponse(BaseModel):
    """用户在线状态响应"""
    user_id: int
    is_online: bool
    last_seen: Optional[datetime] = None






