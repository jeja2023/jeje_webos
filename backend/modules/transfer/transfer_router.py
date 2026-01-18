"""
快传模块 - HTTP API 路由
提供RESTful API接口
"""

import os
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Request
from fastapi.responses import StreamingResponse, FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from io import BytesIO

from core.database import get_db
from core.security import get_current_user, require_permission, TokenData

from .transfer_schemas import (
    SessionCreate, SessionJoin, SessionResponse, SessionStatus,
    ChunkUploadResponse, HistoryItem, HistoryListResponse, HistoryStats,
    TransferConfig, TransferStatusEnum, TransferDirectionEnum
)
from .transfer_services import TransferService, ChunkService, HistoryService, TransferConfig as ServiceConfig
from .transfer_models import TransferStatus, TransferDirection

logger = logging.getLogger(__name__)

router = APIRouter()


# ==================== 配置接口 ====================

@router.get("/config", response_model=TransferConfig, summary="获取传输配置")
async def get_config():
    """获取快传模块配置信息"""
    return TransferConfig(
        max_file_size=ServiceConfig.MAX_FILE_SIZE,
        chunk_size=ServiceConfig.CHUNK_SIZE,
        session_expire_minutes=ServiceConfig.SESSION_EXPIRE_MINUTES,
        history_days=ServiceConfig.HISTORY_DAYS,
        concurrent_chunks=ServiceConfig.CONCURRENT_CHUNKS
    )


# ==================== 会话管理接口 ====================

@router.post("/session", summary="创建传输会话")
async def create_session(
    data: SessionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("transfer.send"))
):
    """
    创建一个新的传输会话，获取6位传输码
    
    发送方调用此接口开始传输流程
    """
    # 检查文件大小
    if data.file_size > ServiceConfig.MAX_FILE_SIZE:
        raise HTTPException(
            status_code=400,
            detail=f"文件大小超过限制，最大支持 {ServiceConfig.MAX_FILE_SIZE // (1024*1024)}MB"
        )
    
    try:
        session = await TransferService.create_session(db, current_user.user_id, data)
        
        return {
            "code": 0,
            "message": "会话创建成功",
            "data": {
                "session_code": session.session_code,
                "file_name": session.file_name,
                "file_size": session.file_size,
                "total_chunks": session.total_chunks,
                "expires_at": session.expires_at.isoformat(),
                "chunk_size": ServiceConfig.CHUNK_SIZE
            }
        }
    except ValueError as e:
        logger.warning(f"创建会话参数错误: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import traceback
        error_msg = f"创建会话失败: {str(e)}\n{traceback.format_exc()}"
        logger.error(error_msg)
        raise HTTPException(status_code=500, detail=f"创建会话失败: {str(e)}")


@router.post("/session/join", summary="加入传输会话")
async def join_session(
    data: SessionJoin,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("transfer.receive"))
):
    """
    通过传输码加入会话
    
    接收方调用此接口连接发送方
    """
    try:
        session = await TransferService.join_session(
            db, current_user.user_id, data.session_code, data.device_info
        )
        
        if not session:
            raise HTTPException(status_code=404, detail="会话不存在或已过期")
        
        response_data = {
            "code": 0,
            "message": "加入会话成功",
            "data": {
                "session_code": session.session_code,
                "file_name": session.file_name,
                "file_size": session.file_size,
                "file_type": session.file_type,
                "total_chunks": session.total_chunks,
                "chunk_size": ServiceConfig.CHUNK_SIZE,
                "sender_id": session.sender_id
            }
        }
        
        # 发送 WebSocket 通知给发送方
        try:
            from core.ws_manager import manager
            from datetime import datetime
            
            logger.info(f"正在通知发送方 {session.sender_id}，Peer: {current_user.user_id}")
            
            await manager.send_personal_message({
                "type": "transfer_peer_connected",
                "data": {
                    "session_code": session.session_code,
                    "peer_id": current_user.user_id,
                    "nickname": getattr(current_user, 'nickname', None) or current_user.username
                },
                "timestamp": datetime.now().isoformat()
            }, session.sender_id)
        except Exception as e:
            logger.warning(f"发送 WebSocket 通知失败: {e}")
            
        return response_data
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"加入会话失败: {e}")
        raise HTTPException(status_code=500, detail="加入会话失败")


@router.get("/session/{session_code}", summary="获取会话状态")
async def get_session_status(
    session_code: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("transfer.send"))
):
    """获取传输会话的当前状态"""
    session = await TransferService.get_session(db, session_code, current_user.user_id)
    
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在或无权访问")
    
    # 计算进度
    progress = 0.0
    if session.file_size > 0:
        progress = round(session.transferred_bytes / session.file_size * 100, 2)
    
    # 获取对方信息
    peer_connected = session.receiver_id is not None
    peer_nickname = None
    
    if peer_connected:
        from models import User as UserModel
        from sqlalchemy import select
        
        peer_id = session.receiver_id if session.sender_id == current_user.user_id else session.sender_id
        result = await db.execute(select(UserModel).where(UserModel.id == peer_id))
        peer = result.scalar_one_or_none()
        if peer:
            peer_nickname = peer.nickname
    
    return {
        "code": 0,
        "data": {
            "session_code": session.session_code,
            "status": session.status,
            "file_name": session.file_name,
            "file_size": session.file_size,
            "transferred_bytes": session.transferred_bytes,
            "total_chunks": session.total_chunks,
            "completed_chunks": session.completed_chunks,
            "progress_percent": progress,
            "peer_connected": peer_connected,
            "peer_nickname": peer_nickname,
            "is_sender": session.sender_id == current_user.user_id,
            "created_at": session.created_at.isoformat(),
            "expires_at": session.expires_at.isoformat()
        }
    }


@router.get("/sessions", summary="获取活跃会话列表")
async def get_active_sessions(
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("transfer.send"))
):
    """获取当前用户的所有活跃传输会话"""
    sessions = await TransferService.get_active_sessions(db, current_user.user_id)
    
    result = []
    for session in sessions:
        progress = 0.0
        if session.file_size > 0:
            progress = round(session.transferred_bytes / session.file_size * 100, 2)
        
        result.append({
            "session_code": session.session_code,
            "status": session.status,
            "file_name": session.file_name,
            "file_size": session.file_size,
            "progress_percent": progress,
            "is_sender": session.sender_id == current_user.user_id,
            "peer_connected": session.receiver_id is not None,
            "created_at": session.created_at.isoformat()
        })
    
    return {
        "code": 0,
        "data": result
    }


@router.delete("/session/{session_code}", summary="取消传输会话")
async def cancel_session(
    session_code: str,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("transfer.send"))
):
    """取消传输会话"""
    success = await TransferService.cancel_session(db, session_code, current_user.user_id)
    
    if not success:
        raise HTTPException(status_code=404, detail="会话不存在或无法取消")
    
    return {
        "code": 0,
        "message": "会话已取消"
    }


# ==================== 分块传输接口 ====================

@router.post("/chunk/upload", summary="上传分块")
async def upload_chunk(
    session_code: str = Form(...),
    chunk_index: int = Form(...),
    chunk_hash: Optional[str] = Form(None),
    chunk: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("transfer.send"))
):
    """
    上传文件分块
    
    发送方调用此接口上传每个分块
    """
    # 验证会话权限
    session = await TransferService.get_session(db, session_code, current_user.user_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在或无权访问")
    
    if session.sender_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="只有发送方可以上传分块")
    
    # 读取分块数据
    chunk_data = await chunk.read()
    
    # 保存分块
    success, message = await ChunkService.save_chunk(
        db, session_code, chunk_index, chunk_data, chunk_hash
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    # 获取更新后的会话状态
    session = await TransferService.get_session(db, session_code)
    progress = round(session.transferred_bytes / session.file_size * 100, 2) if session.file_size > 0 else 0
    
    return {
        "code": 0,
        "message": "分块上传成功",
        "data": {
            "chunk_index": chunk_index,
            "success": True,
            "transferred_bytes": session.transferred_bytes,
            "completed_chunks": session.completed_chunks,
            "total_chunks": session.total_chunks,
            "progress_percent": progress,
            "status": session.status
        }
    }


@router.get("/chunk/download/{session_code}/{chunk_index}", summary="下载分块")
async def download_chunk(
    session_code: str,
    chunk_index: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("transfer.receive"))
):
    """
    下载文件分块
    
    接收方调用此接口下载每个分块
    """
    # 验证会话权限
    session = await TransferService.get_session(db, session_code, current_user.user_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在或无权访问")
    
    if session.receiver_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="只有接收方可以下载分块")
    
    # 获取分块数据
    chunk_data = await ChunkService.get_chunk(db, session_code, chunk_index)
    
    if chunk_data is None:
        raise HTTPException(status_code=404, detail="分块不存在")
    
    # 返回分块数据
    return StreamingResponse(
        BytesIO(chunk_data),
        media_type="application/octet-stream",
        headers={
            "Content-Length": str(len(chunk_data)),
            "X-Chunk-Index": str(chunk_index),
            "X-Chunk-Hash": ChunkService.calculate_chunk_hash(chunk_data)
        }
    )


@router.get("/download/{session_code}", summary="下载完整文件")
async def download_file(
    session_code: str,
    token: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    request: Request = None
):
    """
    下载完整文件
    
    传输完成后，接收方可以下载完整文件
    支持通过 token 参数传递认证信息（用于浏览器直接下载）
    """
    user_id = None
    
    # 1. 尝试从 Query 参数获取 Token
    if token:
        from core.security import decode_token
        token_data = decode_token(token)
        if token_data:
            user_id = token_data.user_id
            
    # 2. 尝试从 Header 获取 Token
    if not user_id and request and "Authorization" in request.headers:
        auth = request.headers["Authorization"]
        if auth.startswith("Bearer "):
            from core.security import decode_token
            token_data = decode_token(auth[7:])
            if token_data:
                user_id = token_data.user_id
    
    if not user_id:
        raise HTTPException(status_code=401, detail="无效的认证凭据")
        
    session = await TransferService.get_session(db, session_code, user_id)
    if not session:
        raise HTTPException(status_code=404, detail="会话不存在或无权访问")
    
    if session.status != TransferStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="传输尚未完成")
    
    if session.receiver_id != user_id:
        raise HTTPException(status_code=403, detail="只有接收方可以下载文件")
    
    if not session.temp_file_path or not os.path.exists(session.temp_file_path):
        raise HTTPException(status_code=404, detail="文件不存在")
    
    # URL 编码文件名以支持中文
    from urllib.parse import quote
    encoded_filename = quote(session.file_name)
    
    return FileResponse(
        session.temp_file_path,
        filename=session.file_name,
        media_type=session.file_type or "application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"}
    )


# ==================== 历史记录接口 ====================

@router.get("/history", summary="获取传输历史")
async def get_history(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    direction: Optional[str] = Query(None, description="发送/接收: send/receive"),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("transfer.history"))
):
    """获取当前用户的传输历史记录"""
    # 转换方向参数
    dir_filter = None
    if direction:
        if direction == "send":
            dir_filter = TransferDirection.SEND
        elif direction == "receive":
            dir_filter = TransferDirection.RECEIVE
    
    items, total = await HistoryService.get_history(
        db, current_user.user_id, page, size, dir_filter
    )
    
    result = []
    for item in items:
        # 计算传输速度
        speed_bps = None
        if item.duration_ms > 0:
            speed_bps = item.file_size / (item.duration_ms / 1000)
        
        result.append({
            "id": item.id,
            "direction": item.direction,
            "file_name": item.file_name,
            "file_size": item.file_size,
            "file_type": item.file_type,
            "file_count": item.file_count,
            "peer_nickname": item.peer_nickname,
            "success": item.success,
            "error_message": item.error_message,
            "duration_ms": item.duration_ms,
            "speed_bps": speed_bps,
            "created_at": item.created_at.isoformat()
        })
    
    return {
        "code": 0,
        "data": {
            "items": result,
            "total": total,
            "page": page,
            "size": size
        }
    }


@router.get("/history/stats", summary="获取传输统计")
async def get_history_stats(
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("transfer.history"))
):
    """获取当前用户的传输统计信息"""
    stats = await HistoryService.get_stats(db, current_user.user_id)
    
    return {
        "code": 0,
        "data": {
            "total_sent": stats.total_sent,
            "total_received": stats.total_received,
            "total_sent_bytes": stats.total_sent_bytes,
            "total_received_bytes": stats.total_received_bytes,
            "success_rate": stats.success_rate
        }
    }


@router.delete("/history/{history_id}", summary="删除历史记录")
async def delete_history(
    history_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("transfer.history"))
):
    """删除指定的历史记录"""
    from sqlalchemy import select, delete
    from .transfer_models import TransferHistory
    
    # 验证权限
    result = await db.execute(
        select(TransferHistory).where(
            TransferHistory.id == history_id,
            TransferHistory.user_id == current_user.user_id
        )
    )
    history = result.scalar_one_or_none()
    
    if not history:
        raise HTTPException(status_code=404, detail="记录不存在或无权删除")
    
    await db.delete(history)
    await db.flush()
    await db.commit()
    
    return {
        "code": 0,
        "message": "删除成功"
    }


# ==================== 清理接口（管理员） ====================

@router.post("/cleanup", summary="清理过期数据")
async def cleanup_expired(
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user)
):
    """清理过期的会话和历史记录（需要管理员权限）"""
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="需要管理员权限")
    
    # 清理过期会话
    session_count = await TransferService.cleanup_expired_sessions(db)
    
    # 清理旧历史记录
    history_count = await HistoryService.cleanup_old_history(db, ServiceConfig.HISTORY_DAYS)
    
    return {
        "code": 0,
        "message": f"清理完成：{session_count}个过期会话，{history_count}条历史记录"
    }
