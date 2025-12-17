"""
快传模块 - Pydantic 数据验证模型
定义API请求和响应的数据结构
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


# ==================== 枚举类型 ====================

class TransferStatusEnum(str, Enum):
    """传输状态枚举"""
    PENDING = "pending"
    CONNECTED = "connected"
    TRANSFERRING = "transferring"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    EXPIRED = "expired"
    FAILED = "failed"


class TransferDirectionEnum(str, Enum):
    """传输方向枚举"""
    SEND = "send"
    RECEIVE = "receive"


# ==================== 会话相关 ====================

class SessionCreate(BaseModel):
    """创建传输会话请求"""
    file_name: str = Field(..., max_length=255, description="文件名")
    file_size: int = Field(..., gt=0, description="文件大小(字节)")
    file_type: Optional[str] = Field(None, max_length=64, description="文件MIME类型")
    device_info: Optional[str] = Field(None, max_length=128, description="设备信息")


class SessionJoin(BaseModel):
    """加入传输会话请求"""
    session_code: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$", description="6位传输码")
    device_info: Optional[str] = Field(None, max_length=128, description="设备信息")


class SessionResponse(BaseModel):
    """传输会话响应"""
    id: int
    session_code: str
    status: TransferStatusEnum
    file_name: Optional[str]
    file_size: int
    file_type: Optional[str]
    file_count: int
    transferred_bytes: int
    total_chunks: int
    completed_chunks: int
    sender_id: int
    sender_nickname: Optional[str] = None
    receiver_id: Optional[int]
    receiver_nickname: Optional[str] = None
    created_at: datetime
    expires_at: datetime
    progress_percent: float = 0.0
    
    class Config:
        from_attributes = True


class SessionStatus(BaseModel):
    """会话状态简要信息"""
    session_code: str
    status: TransferStatusEnum
    file_name: Optional[str]
    file_size: int
    transferred_bytes: int
    progress_percent: float
    peer_connected: bool
    peer_nickname: Optional[str] = None


# ==================== 分块传输相关 ====================

class ChunkUploadRequest(BaseModel):
    """分块上传请求（元数据）"""
    session_code: str = Field(..., description="会话码")
    chunk_index: int = Field(..., ge=0, description="分块索引")
    chunk_size: int = Field(..., gt=0, description="分块大小")
    chunk_hash: Optional[str] = Field(None, max_length=64, description="分块MD5哈希")


class ChunkUploadResponse(BaseModel):
    """分块上传响应"""
    chunk_index: int
    success: bool
    verified: bool
    message: Optional[str] = None
    transferred_bytes: int
    progress_percent: float


class ChunkDownloadRequest(BaseModel):
    """分块下载请求"""
    session_code: str = Field(..., description="会话码")
    chunk_index: int = Field(..., ge=0, description="分块索引")


# ==================== 历史记录相关 ====================

class HistoryItem(BaseModel):
    """传输历史记录项"""
    id: int
    direction: TransferDirectionEnum
    file_name: str
    file_size: int
    file_type: Optional[str]
    file_count: int
    peer_nickname: Optional[str]
    success: bool
    error_message: Optional[str]
    duration_ms: int
    created_at: datetime
    
    # 计算字段
    speed_bps: Optional[float] = None  # 传输速度 (字节/秒)
    
    class Config:
        from_attributes = True


class HistoryListResponse(BaseModel):
    """历史记录列表响应"""
    items: List[HistoryItem]
    total: int
    page: int
    size: int


class HistoryStats(BaseModel):
    """传输统计信息"""
    total_sent: int = 0  # 发送总数
    total_received: int = 0  # 接收总数
    total_sent_bytes: int = 0  # 发送总字节数
    total_received_bytes: int = 0  # 接收总字节数
    success_rate: float = 100.0  # 成功率


# ==================== WebSocket 消息相关 ====================

class WSMessageType(str, Enum):
    """WebSocket消息类型"""
    # 连接管理
    PING = "ping"
    PONG = "pong"
    AUTH = "auth"
    AUTH_SUCCESS = "auth_success"
    AUTH_FAILED = "auth_failed"
    
    # 会话管理
    SESSION_CREATE = "session_create"
    SESSION_CREATED = "session_created"
    SESSION_JOIN = "session_join"
    SESSION_JOINED = "session_joined"
    SESSION_CLOSE = "session_close"
    SESSION_CLOSED = "session_closed"
    SESSION_EXPIRED = "session_expired"
    
    # 连接状态
    PEER_CONNECTED = "peer_connected"
    PEER_DISCONNECTED = "peer_disconnected"
    
    # 传输控制
    TRANSFER_START = "transfer_start"
    TRANSFER_PROGRESS = "transfer_progress"
    TRANSFER_COMPLETE = "transfer_complete"
    TRANSFER_CANCEL = "transfer_cancel"
    TRANSFER_CANCELLED = "transfer_cancelled"
    TRANSFER_ERROR = "transfer_error"
    
    # 分块传输
    CHUNK_READY = "chunk_ready"
    CHUNK_REQUEST = "chunk_request"
    CHUNK_RECEIVED = "chunk_received"
    CHUNK_ACK = "chunk_ack"
    
    # 错误
    ERROR = "error"


class WSMessage(BaseModel):
    """WebSocket消息基础结构"""
    type: WSMessageType
    data: Optional[dict] = None
    timestamp: Optional[datetime] = None


# ==================== 配置相关 ====================

class TransferConfig(BaseModel):
    """传输配置信息"""
    max_file_size: int = Field(default=1073741824, description="最大文件大小(1GB)")
    chunk_size: int = Field(default=1048576, description="分块大小(1MB)")
    session_expire_minutes: int = Field(default=10, description="会话过期时间(分钟)")
    history_days: int = Field(default=30, description="历史保留天数")
    concurrent_chunks: int = Field(default=3, description="并发分块数")
