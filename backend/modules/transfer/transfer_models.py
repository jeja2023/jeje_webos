"""
快传模块 - 数据模型
定义传输会话和历史记录的数据库表结构
"""

from sqlalchemy import Column, Integer, String, BigInteger, DateTime, Enum, ForeignKey, Text, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from core.database import Base
import enum


class TransferStatus(str, enum.Enum):
    """传输会话状态"""
    PENDING = "pending"          # 等待连接
    CONNECTED = "connected"      # 已连接，等待传输
    TRANSFERRING = "transferring"  # 传输中
    COMPLETED = "completed"      # 已完成
    CANCELLED = "cancelled"      # 已取消
    EXPIRED = "expired"          # 已过期
    FAILED = "failed"            # 传输失败


class TransferDirection(str, enum.Enum):
    """传输方向"""
    SEND = "send"      # 发送
    RECEIVE = "receive"  # 接收


class TransferSession(Base):
    """传输会话表 - 存储活跃的传输会话"""
    __tablename__ = "transfer_sessions"
    __table_args__ = {
        'extend_existing': True,
        'comment': '快传会话表'
    }
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # 会话码（6位数字）
    session_code = Column(String(16), unique=True, nullable=False, index=True, comment="传输码")
    
    # 发送方信息
    sender_id = Column(Integer, ForeignKey("sys_users.id", ondelete="CASCADE"), nullable=False, comment="发送方用户ID")
    sender_device = Column(String(128), nullable=True, comment="发送方设备信息")
    
    # 接收方信息
    receiver_id = Column(Integer, ForeignKey("sys_users.id", ondelete="SET NULL"), nullable=True, comment="接收方用户ID")
    receiver_device = Column(String(128), nullable=True, comment="接收方设备信息")
    
    # 传输状态
    status = Column(String(32), default=TransferStatus.PENDING.value, nullable=False, comment="会话状态")
    
    # 文件信息（支持多文件，JSON格式存储）
    file_name = Column(String(255), nullable=True, comment="文件名")
    file_size = Column(BigInteger, default=0, comment="文件大小(字节)")
    file_type = Column(String(64), nullable=True, comment="文件MIME类型")
    file_count = Column(Integer, default=1, comment="文件数量")
    
    # 传输进度
    transferred_bytes = Column(BigInteger, default=0, comment="已传输字节数")
    total_chunks = Column(Integer, default=0, comment="总分块数")
    completed_chunks = Column(Integer, default=0, comment="已完成分块数")
    
    # 临时文件路径
    temp_file_path = Column(String(512), nullable=True, comment="临时文件存储路径")
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment="创建时间")
    connected_at = Column(DateTime(timezone=True), nullable=True, comment="连接时间")
    completed_at = Column(DateTime(timezone=True), nullable=True, comment="完成时间")
    expires_at = Column(DateTime(timezone=True), nullable=False, comment="过期时间")
    
    # 不定义与 User 模型的 relationship，避免跨模块导入问题
    # 如需获取发送方/接收方用户信息，应在业务层通过 sender_id/receiver_id 单独查询


class TransferHistory(Base):
    """传输历史表 - 记录已完成的传输"""
    __tablename__ = "transfer_history"
    __table_args__ = {
        'extend_existing': True,
        'comment': '快传历史记录表'
    }
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # 用户信息
    user_id = Column(Integer, ForeignKey("sys_users.id", ondelete="CASCADE"), nullable=False, comment="用户ID")
    
    # 传输方向
    direction = Column(String(16), nullable=False, comment="传输方向(send/receive)")
    status = Column(String(32), default=TransferStatus.COMPLETED.value, nullable=False, comment="传输状态")
    
    # 对方信息
    peer_id = Column(Integer, ForeignKey("sys_users.id", ondelete="SET NULL"), nullable=True, comment="对方用户ID")
    peer_nickname = Column(String(64), nullable=True, comment="对方昵称（冗余存储）")
    peer_device = Column(String(128), nullable=True, comment="对方设备信息")
    
    # 文件信息
    file_name = Column(String(255), nullable=False, comment="文件名")
    file_size = Column(BigInteger, default=0, comment="文件大小(字节)")
    file_type = Column(String(64), nullable=True, comment="文件MIME类型")
    file_count = Column(Integer, default=1, comment="文件数量")
    
    # 传输结果
    success = Column(Boolean, default=True, comment="是否成功")
    error_message = Column(Text, nullable=True, comment="错误信息")
    
    # 传输耗时（毫秒）
    duration_ms = Column(Integer, default=0, comment="传输耗时(毫秒)")
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment="完成时间")
    
    # 不定义与 User 模型的 relationship，避免跨模块导入问题
    # 如需获取用户/对方信息，应在业务层通过 user_id/peer_id 单独查询


class TransferChunk(Base):
    """传输分块表 - 用于断点续传"""
    __tablename__ = "transfer_chunks"
    __table_args__ = {
        'extend_existing': True,
        'comment': '快传分块表'
    }
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # 关联会话
    session_id = Column(Integer, ForeignKey(TransferSession.id, ondelete="CASCADE"), nullable=False, comment="会话ID")
    
    # 分块信息
    chunk_index = Column(Integer, nullable=False, comment="分块索引（从0开始）")
    chunk_size = Column(Integer, nullable=False, comment="分块大小(字节)")
    chunk_hash = Column(String(64), nullable=True, comment="分块MD5哈希")
    
    # 状态
    uploaded = Column(Boolean, default=False, comment="是否已上传")
    verified = Column(Boolean, default=False, comment="是否已验证")
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment="创建时间")
    uploaded_at = Column(DateTime(timezone=True), nullable=True, comment="上传时间")
    
    # 关联关系
    # session = relationship(TransferSession, backref="chunks")
