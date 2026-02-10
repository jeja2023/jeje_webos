"""
快传模块 - 业务逻辑服务
处理传输会话管理、文件处理、历史记录等核心业务
"""

import os
import random
import hashlib
import aiofiles
import logging
from datetime import datetime, timedelta
from utils.timezone import get_beijing_time, to_beijing_time
from typing import Optional, List, Tuple
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update, func, and_, or_
from sqlalchemy.orm import selectinload

from core.config import get_settings
from .transfer_models import TransferSession, TransferHistory, TransferChunk, TransferStatus, TransferDirection
from .transfer_schemas import (
    SessionCreate, SessionResponse, HistoryItem, HistoryStats,
    TransferStatusEnum, TransferDirectionEnum
)

logger = logging.getLogger(__name__)
settings = get_settings()


class TransferConfig:
    """传输配置"""
    # 默认配置值
    MAX_FILE_SIZE = 1024 * 1024 * 1024  # 1GB
    CHUNK_SIZE = 1024 * 1024  # 1MB
    SESSION_EXPIRE_MINUTES = 10
    HISTORY_DAYS = 30
    CONCURRENT_CHUNKS = 3
    
    @classmethod
    def get_temp_dir(cls) -> Path:
        """获取临时文件目录"""
        # 使用统一的 StorageManager 获取系统临时目录
        from utils.storage import get_storage_manager
        storage = get_storage_manager()
        temp_dir = storage.get_system_dir("transfer_temp")
        return temp_dir


class TransferService:
    """传输会话服务"""
    
    @staticmethod
    def generate_session_code() -> str:
        """生成 6 位数字传输码（密码学安全随机数）"""
        import secrets
        return str(secrets.randbelow(900000) + 100000)
    
    @staticmethod
    async def create_session(
        db: AsyncSession,
        user_id: int,
        data: SessionCreate
    ) -> TransferSession:
        """
        创建传输会话
        
        Args:
            db: 数据库会话
            user_id: 发送方用户ID
            data: 创建会话请求数据
        
        Returns:
            TransferSession: 创建的会话对象
        """
        # 生成唯一的传输码（优化：减少查询次数）
        max_attempts = 10
        session_code = None
        
        # 预先查询所有活跃的会话码，避免重复查询
        active_codes_result = await db.execute(
            select(TransferSession.session_code).where(
                TransferSession.status.in_([
                    TransferStatus.PENDING,
                    TransferStatus.CONNECTED,
                    TransferStatus.TRANSFERRING
                ])
            )
        )
        active_codes = {row[0] for row in active_codes_result.all()}
        
        # 生成唯一的传输码
        for _ in range(max_attempts):
            code = TransferService.generate_session_code()
            if code not in active_codes:
                session_code = code
                break
        
        if not session_code:
            raise ValueError("生成传输码失败，请重试")
        
        # 计算分块数
        chunk_size = TransferConfig.CHUNK_SIZE
        total_chunks = (data.file_size + chunk_size - 1) // chunk_size
        
        # 计算过期时间
        expires_at = get_beijing_time() + timedelta(minutes=TransferConfig.SESSION_EXPIRE_MINUTES)
        
        # 创建会话
        session = TransferSession(
            session_code=session_code,
            sender_id=user_id,
            sender_device=data.device_info,
            status=TransferStatus.PENDING,
            file_name=data.file_name,
            file_size=data.file_size,
            file_type=data.file_type,
            file_count=1,
            total_chunks=total_chunks,
            expires_at=expires_at
        )
        
        db.add(session)
        await db.commit()
        await db.refresh(session)
        
        logger.info(f"创建传输会话: {session_code}, 文件: {data.file_name}, 大小: {data.file_size}")
        
        return session
    
    @staticmethod
    async def join_session(
        db: AsyncSession,
        user_id: int,
        session_code: str,
        device_info: Optional[str] = None
    ) -> Optional[TransferSession]:
        """
        加入传输会话
        
        Args:
            db: 数据库会话
            user_id: 接收方用户ID
            session_code: 传输码
            device_info: 设备信息
        
        Returns:
            TransferSession: 会话对象，如果不存在或已过期则返回None
        """
        # 查找会话
        result = await db.execute(
            select(TransferSession).where(
                TransferSession.session_code == session_code,
                TransferSession.status == TransferStatus.PENDING
            )
        )
        session = result.scalar_one_or_none()
        
        if not session:
            return None
        
        # 检查是否过期
        if to_beijing_time(session.expires_at) < get_beijing_time():
            session.status = TransferStatus.EXPIRED
            await db.commit()
            return None
        
        # 不能接收自己发送的文件
        if session.sender_id == user_id:
            raise ValueError("不能接收自己发送的文件")
        
        # 更新会话状态
        session.receiver_id = user_id
        session.receiver_device = device_info
        session.status = TransferStatus.CONNECTED
        session.connected_at = get_beijing_time()
        
        await db.commit()
        await db.refresh(session)
        
        logger.info(f"用户 {user_id} 加入会话: {session_code}")
        
        return session
    
    @staticmethod
    async def get_session(
        db: AsyncSession,
        session_code: str,
        user_id: Optional[int] = None
    ) -> Optional[TransferSession]:
        """
        获取传输会话
        
        Args:
            db: 数据库会话
            session_code: 传输码
            user_id: 可选，用户ID（用于权限验证）
        
        Returns:
            TransferSession: 会话对象
        """
        query = select(TransferSession).where(
            TransferSession.session_code == session_code
        )
        
        if user_id:
            query = query.where(
                or_(
                    TransferSession.sender_id == user_id,
                    TransferSession.receiver_id == user_id
                )
            )
        
        result = await db.execute(query)
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_active_sessions(
        db: AsyncSession,
        user_id: int
    ) -> List[TransferSession]:
        """
        获取用户的活跃会话
        
        Args:
            db: 数据库会话
            user_id: 用户ID
        
        Returns:
            List[TransferSession]: 活跃会话列表
        """
        result = await db.execute(
            select(TransferSession).where(
                or_(
                    TransferSession.sender_id == user_id,
                    TransferSession.receiver_id == user_id
                ),
                TransferSession.status.in_([
                    TransferStatus.PENDING,
                    TransferStatus.CONNECTED,
                    TransferStatus.TRANSFERRING
                ])
            ).order_by(TransferSession.created_at.desc())
        )
        return list(result.scalars().all())
    
    @staticmethod
    async def update_session_status(
        db: AsyncSession,
        session_code: str,
        status: TransferStatus,
        error_message: Optional[str] = None
    ) -> Optional[TransferSession]:
        """更新会话状态（优化：直接更新，避免先查询）"""
        from sqlalchemy import update as sql_update
        
        status_value = status.value if isinstance(status, TransferStatus) else status
        update_values = {"status": status_value}
        
        if status_value == TransferStatus.COMPLETED.value:
            update_values["completed_at"] = get_beijing_time()
        
        result = await db.execute(
            sql_update(TransferSession)
            .where(TransferSession.session_code == session_code)
            .values(**update_values)
        )
        await db.commit()
        
        if result.rowcount > 0:
            return await TransferService.get_session(db, session_code)
        return None
    
    @staticmethod
    async def update_transfer_progress(
        db: AsyncSession,
        session_code: str,
        transferred_bytes: int,
        completed_chunks: int
    ) -> Optional[TransferSession]:
        """更新传输进度（优化：直接更新，避免先查询）"""
        from sqlalchemy import update as sql_update, case, text
        
        # 如果状态是 CONNECTED，自动更新为 TRANSFERRING
        # 使用 CASE WHEN 在 SQL 层面处理状态更新
        update_values = {
            "transferred_bytes": transferred_bytes,
            "completed_chunks": completed_chunks
        }
        
        # 构建状态更新表达式
        status_update = case(
            (TransferSession.status == TransferStatus.CONNECTED.value, TransferStatus.TRANSFERRING.value),
            else_=TransferSession.status
        )
        update_values["status"] = status_update
        
        result = await db.execute(
            sql_update(TransferSession)
            .where(TransferSession.session_code == session_code)
            .values(**update_values)
        )
        await db.commit()
        
        if result.rowcount > 0:
            return await TransferService.get_session(db, session_code)
        return None
    
    @staticmethod
    async def cancel_session(
        db: AsyncSession,
        session_code: str,
        user_id: int
    ) -> bool:
        """取消传输会话（优化：保留清理逻辑，但优化状态检查）"""
        # 先获取会话（需要用于清理临时文件）
        session = await TransferService.get_session(db, session_code, user_id)
        if not session:
            return False
        
        # 如果已经取消或已完成，直接返回
        if session.status == TransferStatus.CANCELLED.value:
            return True
            
        if session.status == TransferStatus.COMPLETED.value:
            return False
        
        # 使用直接更新（优化：减少一次 refresh）
        from sqlalchemy import update as sql_update
        await db.execute(
            sql_update(TransferSession)
            .where(TransferSession.id == session.id)
            .values(status=TransferStatus.CANCELLED.value)
        )
        await db.commit()
        
        # 清理临时文件
        await TransferService.cleanup_temp_files(session)
        
        logger.info(f"会话已取消: {session_code}")
        
        return True
    
    @staticmethod
    async def cleanup_temp_files(session: TransferSession):
        """清理会话的临时文件"""
        if session.temp_file_path and os.path.exists(session.temp_file_path):
            try:
                os.remove(session.temp_file_path)
                logger.info(f"已清理临时文件: {session.temp_file_path}")
            except Exception as e:
                logger.error(f"清理临时文件失败: {e}")
    
    @staticmethod
    async def cleanup_expired_sessions(db: AsyncSession) -> int:
        """清理过期的会话"""
        now = get_beijing_time()
        
        # 查找过期会话
        result = await db.execute(
            select(TransferSession).where(
                TransferSession.expires_at < now,
                TransferSession.status.in_([
                    TransferStatus.PENDING,
                    TransferStatus.CONNECTED
                ])
            )
        )
        expired_sessions = list(result.scalars().all())
        
        count = 0
        for session in expired_sessions:
            session.status = TransferStatus.EXPIRED
            await TransferService.cleanup_temp_files(session)
            count += 1
        
        if count > 0:
            await db.commit()
            logger.info(f"已清理 {count} 个过期会话")
        
        return count


class ChunkService:
    """分块传输服务"""
    
    @staticmethod
    def calculate_chunk_hash(data: bytes) -> str:
        """计算分块的MD5哈希"""
        return hashlib.md5(data).hexdigest()
    
    @staticmethod
    async def save_chunk(
        db: AsyncSession,
        session_code: str,
        chunk_index: int,
        chunk_data: bytes,
        chunk_hash: Optional[str] = None
    ) -> Tuple[bool, str]:
        """
        保存分块数据
        
        Args:
            db: 数据库会话
            session_code: 会话码
            chunk_index: 分块索引
            chunk_data: 分块数据
            chunk_hash: 可选的哈希值用于验证
        
        Returns:
            Tuple[bool, str]: (是否成功, 消息)
        """
        # 获取会话
        session = await TransferService.get_session(db, session_code)
        if not session:
            return False, "会话不存在"
        
        if session.status not in [TransferStatus.CONNECTED, TransferStatus.TRANSFERRING]:
            return False, f"会话状态无效: {session.status}"
        
        # 验证哈希
        if chunk_hash:
            calculated_hash = ChunkService.calculate_chunk_hash(chunk_data)
            if calculated_hash != chunk_hash:
                return False, "分块数据校验失败"
        
        # 确定临时文件路径（对文件名进行安全过滤，防止路径穿越）
        if not session.temp_file_path:
            temp_dir = TransferConfig.get_temp_dir()
            # 只保留文件名部分，移除任何路径分隔符防止路径穿越
            safe_name = os.path.basename(session.file_name).replace('..', '_')
            if not safe_name:
                safe_name = 'unnamed'
            temp_file = temp_dir / f"{session_code}_{safe_name}"
            # 验证最终路径确实在临时目录下
            resolved = temp_file.resolve()
            if not str(resolved).startswith(str(temp_dir.resolve())):
                return False, "文件名包含非法字符"
            session.temp_file_path = str(resolved)
        
        # 写入分块数据
        try:
            chunk_size = TransferConfig.CHUNK_SIZE
            offset = chunk_index * chunk_size
            
            # 确保文件存在并预分配空间
            async with aiofiles.open(session.temp_file_path, mode='r+b' if os.path.exists(session.temp_file_path) else 'wb') as f:
                await f.seek(offset)
                await f.write(chunk_data)
            
            # 更新进度
            session.completed_chunks += 1
            session.transferred_bytes += len(chunk_data)
            
            if session.status == TransferStatus.CONNECTED:
                session.status = TransferStatus.TRANSFERRING
            
            # 检查是否完成
            # 检查是否完成
            if session.completed_chunks >= session.total_chunks:
                session.status = TransferStatus.COMPLETED
                session.completed_at = get_beijing_time()
                
                # 创建历史记录
                await HistoryService.create_history(db, session)
            
            await db.commit()
            
            return True, "分块保存成功"
            
        except Exception as e:
            logger.error(f"保存分块失败: {e}")
            return False, f"保存失败: {str(e)}"
    
    @staticmethod
    async def get_chunk(
        db: AsyncSession,
        session_code: str,
        chunk_index: int
    ) -> Optional[bytes]:
        """
        获取分块数据
        
        Args:
            db: 数据库会话
            session_code: 会话码
            chunk_index: 分块索引
        
        Returns:
            bytes: 分块数据
        """
        session = await TransferService.get_session(db, session_code)
        if not session or not session.temp_file_path:
            return None
        
        try:
            chunk_size = TransferConfig.CHUNK_SIZE
            offset = chunk_index * chunk_size
            
            async with aiofiles.open(session.temp_file_path, mode='rb') as f:
                await f.seek(offset)
                
                # 最后一个分块可能不满
                if chunk_index == session.total_chunks - 1:
                    remaining = session.file_size - offset
                    data = await f.read(remaining)
                else:
                    data = await f.read(chunk_size)
                
                return data
                
        except Exception as e:
            logger.error(f"读取分块失败: {e}")
            return None


class HistoryService:
    """传输历史服务"""
    
    @staticmethod
    async def create_history(
        db: AsyncSession,
        session: TransferSession,
        success: bool = True,
        error_message: Optional[str] = None
    ):
        """
        创建传输历史记录
        
        为发送方和接收方各创建一条记录
        """
        if not session.receiver_id:
            return  # 没有完成连接，不记录
        
        # 计算耗时
        duration_ms = 0
        if session.connected_at and session.completed_at:
            duration_ms = int((to_beijing_time(session.completed_at) - to_beijing_time(session.connected_at)).total_seconds() * 1000)
        elif session.connected_at:
            duration_ms = int((get_beijing_time() - to_beijing_time(session.connected_at)).total_seconds() * 1000)
        
        # 获取用户昵称
        from models import User
        sender_result = await db.execute(select(User).where(User.id == session.sender_id))
        sender = sender_result.scalar_one_or_none()
        
        receiver_result = await db.execute(select(User).where(User.id == session.receiver_id))
        receiver = receiver_result.scalar_one_or_none()
        
        sender_nickname = sender.nickname if sender else "未知用户"
        receiver_nickname = receiver.nickname if receiver else "未知用户"
        
        # 发送方记录
        sender_history = TransferHistory(
            user_id=session.sender_id,
            direction=TransferDirection.SEND,
            peer_id=session.receiver_id,
            peer_nickname=receiver_nickname,
            peer_device=session.receiver_device,
            file_name=session.file_name,
            file_size=session.file_size,
            file_type=session.file_type,
            file_count=session.file_count,
            success=success,
            error_message=error_message,
            duration_ms=duration_ms
        )
        db.add(sender_history)
        
        # 接收方记录
        receiver_history = TransferHistory(
            user_id=session.receiver_id,
            direction=TransferDirection.RECEIVE,
            peer_id=session.sender_id,
            peer_nickname=sender_nickname,
            peer_device=session.sender_device,
            file_name=session.file_name,
            file_size=session.file_size,
            file_type=session.file_type,
            file_count=session.file_count,
            success=success,
            error_message=error_message,
            duration_ms=duration_ms
        )
        db.add(receiver_history)
        
        await db.commit()
        
        logger.info(f"已创建传输历史: {session.file_name}, 发送方: {session.sender_id}, 接收方: {session.receiver_id}")
    
    @staticmethod
    async def get_history(
        db: AsyncSession,
        user_id: int,
        page: int = 1,
        size: int = 20,
        direction: Optional[TransferDirection] = None
    ) -> Tuple[List[TransferHistory], int]:
        """
        获取用户的传输历史
        
        Args:
            db: 数据库会话
            user_id: 用户ID
            page: 页码
            size: 每页数量
            direction: 可选的方向过滤
        
        Returns:
            Tuple[List[TransferHistory], int]: (历史记录列表, 总数)
        """
        query = select(TransferHistory).where(TransferHistory.user_id == user_id)
        count_query = select(func.count(TransferHistory.id)).where(TransferHistory.user_id == user_id)
        
        if direction:
            query = query.where(TransferHistory.direction == direction)
            count_query = count_query.where(TransferHistory.direction == direction)
        
        # 获取总数
        total_result = await db.execute(count_query)
        total = total_result.scalar() or 0
        
        # 分页查询
        query = query.order_by(TransferHistory.created_at.desc())
        query = query.offset((page - 1) * size).limit(size)
        
        result = await db.execute(query)
        items = list(result.scalars().all())
        
        return items, total
    
    @staticmethod
    async def get_stats(db: AsyncSession, user_id: int) -> HistoryStats:
        """获取用户的传输统计"""
        # 发送统计
        send_result = await db.execute(
            select(
                func.count(TransferHistory.id).label('count'),
                func.sum(TransferHistory.file_size).label('total_bytes')
            ).where(
                TransferHistory.user_id == user_id,
                TransferHistory.direction == TransferDirection.SEND
            )
        )
        send_stats = send_result.first()
        
        # 接收统计
        recv_result = await db.execute(
            select(
                func.count(TransferHistory.id).label('count'),
                func.sum(TransferHistory.file_size).label('total_bytes')
            ).where(
                TransferHistory.user_id == user_id,
                TransferHistory.direction == TransferDirection.RECEIVE
            )
        )
        recv_stats = recv_result.first()
        
        # 成功率
        total_result = await db.execute(
            select(func.count(TransferHistory.id)).where(
                TransferHistory.user_id == user_id
            )
        )
        total = total_result.scalar() or 0
        
        success_result = await db.execute(
            select(func.count(TransferHistory.id)).where(
                TransferHistory.user_id == user_id,
                TransferHistory.success == True
            )
        )
        success_count = success_result.scalar() or 0
        
        success_rate = (success_count / total * 100) if total > 0 else 100.0
        
        return HistoryStats(
            total_sent=send_stats.count or 0,
            total_received=recv_stats.count or 0,
            total_sent_bytes=send_stats.total_bytes or 0,
            total_received_bytes=recv_stats.total_bytes or 0,
            success_rate=round(success_rate, 2)
        )
    
    @staticmethod
    async def cleanup_old_history(db: AsyncSession, days: int = 30) -> int:
        """清理旧的历史记录"""
        cutoff_date = get_beijing_time() - timedelta(days=days)
        
        result = await db.execute(
            delete(TransferHistory).where(
                TransferHistory.created_at < cutoff_date
            )
        )
        
        await db.commit()
        
        count = result.rowcount
        if count > 0:
            logger.info(f"已清理 {count} 条历史记录")
        
        return count
