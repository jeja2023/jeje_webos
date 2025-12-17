"""
WebSocket 路由
提供实时通信功能
"""

import json
import logging
from datetime import datetime
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException

from core.ws_manager import manager
from core.security import decode_token, TokenData

router = APIRouter()
logger = logging.getLogger(__name__)


def get_user_from_token(token: str) -> TokenData:
    """从 token 获取用户信息"""
    try:
        token_data = decode_token(token)
        if not token_data:
            raise HTTPException(status_code=401, detail="无效的 token")
        return token_data
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail="无效的 token")


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = None):
    """
    WebSocket 连接端点
    
    连接参数：
    - token: JWT token（通过查询参数或协议头传递）
    """
    user_id = None
    user_info = None
    
    try:
        # 获取 token
        if not token:
            # 尝试从查询参数获取
            token = websocket.query_params.get("token")
        
        if not token:
            # 尝试从协议头获取
            if "authorization" in websocket.headers:
                auth_header = websocket.headers["authorization"]
                if auth_header.startswith("Bearer "):
                    token = auth_header[7:]
        
        if not token:
            await websocket.close(code=1008, reason="缺少认证 token")
            return
        
        # 验证 token 并获取用户信息
        user_info = get_user_from_token(token)
        user_id = user_info.user_id
        
        # 建立连接
        await manager.connect(websocket, user_id)
        
        # 发送连接成功消息
        await websocket.send_text(json.dumps({
            "type": "connected",
            "message": "WebSocket 连接成功",
            "user_id": user_id,
            "timestamp": datetime.now().isoformat()
        }, ensure_ascii=False))
        
        # 保持连接并接收消息
        while True:
            try:
                data = await websocket.receive_text()
                
                # 解析消息
                try:
                    message = json.loads(data)
                    message_type = message.get("type", "unknown")
                    
                    # 处理心跳
                    if message_type == "ping":
                        await websocket.send_text(json.dumps({
                            "type": "pong",
                            "timestamp": datetime.now().isoformat()
                        }, ensure_ascii=False))
                    
                    # 处理快传相关消息
                    elif message_type.startswith("transfer_"):
                        await handle_transfer_message(websocket, user_id, message_type, message.get("data", {}))
                    
                    else:
                        # 其他消息类型可以在这里处理
                        logger.debug(f"收到消息: {message}")
                        
                except json.JSONDecodeError:
                    logger.warning(f"收到无效的 JSON 消息: {data}")
                    
            except WebSocketDisconnect:
                break
                
    except HTTPException as e:
        logger.error(f"WebSocket 认证失败: {e.detail}")
        await websocket.close(code=1008, reason=e.detail)
    except Exception as e:
        logger.error(f"WebSocket 连接异常: {e}", exc_info=True)
        await websocket.close(code=1011, reason="服务器内部错误")
    finally:
        if user_id:
            manager.disconnect(websocket, user_id)


@router.get("/ws/online-users")
async def get_online_users():
    """
    获取在线用户列表
    
    此接口需要认证，但 WebSocket 路由中无法使用 Depends
    实际使用时应在业务逻辑中验证权限
    """
    from schemas.response import success
    
    online_users = manager.get_online_users()
    connection_count = manager.get_connection_count()
    
    return success({
        "online_users": list(online_users),
        "user_count": len(online_users),
        "connection_count": connection_count
    })


# ==================== 快传消息处理 ====================

# 传输会话映射：session_code -> {sender_id, receiver_id}
transfer_sessions: dict = {}


async def handle_transfer_message(websocket: WebSocket, user_id: int, message_type: str, data: dict):
    """
    处理快传相关的WebSocket消息
    
    消息类型：
    - transfer_create: 创建传输会话（发送方进入等待）
    - transfer_join: 加入传输会话（接收方连接）
    - transfer_start: 开始传输
    - transfer_progress: 传输进度更新
    - transfer_complete: 传输完成
    - transfer_cancel: 取消传输
    - transfer_close: 关闭会话
    """
    session_code = data.get("session_code")
    
    if message_type == "transfer_create":
        # 发送方创建会话，进入等待状态
        if session_code:
            transfer_sessions[session_code] = {
                "sender_id": user_id,
                "receiver_id": None,
                "status": "waiting"
            }
            logger.info(f"快传会话已创建: {session_code}, 发送方: {user_id}")
    
    elif message_type == "transfer_join":
        # 接收方加入会话
        if session_code and session_code in transfer_sessions:
            session = transfer_sessions[session_code]
            session["receiver_id"] = user_id
            session["status"] = "connected"
            
            # 通知发送方：接收方已连接
            sender_id = session["sender_id"]
            await manager.send_personal_message({
                "type": "transfer_peer_connected",
                "data": {"session_code": session_code, "peer_id": user_id},
                "timestamp": datetime.now().isoformat()
            }, sender_id)
            
            logger.info(f"快传会话已连接: {session_code}, 接收方: {user_id}")
    
    elif message_type == "transfer_start":
        # 开始传输
        if session_code and session_code in transfer_sessions:
            session = transfer_sessions[session_code]
            session["status"] = "transferring"
            
            # 通知对方传输开始
            peer_id = session["receiver_id"] if user_id == session["sender_id"] else session["sender_id"]
            if peer_id:
                await manager.send_personal_message({
                    "type": "transfer_started",
                    "data": {"session_code": session_code},
                    "timestamp": datetime.now().isoformat()
                }, peer_id)
    
    elif message_type == "transfer_progress":
        # 传输进度更新，通知双方
        if session_code and session_code in transfer_sessions:
            session = transfer_sessions[session_code]
            # 广播给会话中的双方
            for uid in [session["sender_id"], session["receiver_id"]]:
                if uid:
                    await manager.send_personal_message({
                        "type": "transfer_progress",
                        "data": data,
                        "timestamp": datetime.now().isoformat()
                    }, uid)
    
    elif message_type == "transfer_complete":
        # 传输完成
        if session_code and session_code in transfer_sessions:
            session = transfer_sessions[session_code]
            # 通知双方
            for uid in [session["sender_id"], session["receiver_id"]]:
                if uid:
                    await manager.send_personal_message({
                        "type": "transfer_completed",
                        "data": {"session_code": session_code},
                        "timestamp": datetime.now().isoformat()
                    }, uid)
            # 清理会话
            del transfer_sessions[session_code]
            logger.info(f"快传会话已完成: {session_code}")
    
    elif message_type == "transfer_cancel" or message_type == "transfer_close":
        # 取消或关闭传输
        if session_code and session_code in transfer_sessions:
            session = transfer_sessions[session_code]
            # 通知对方
            peer_id = session["receiver_id"] if user_id == session["sender_id"] else session["sender_id"]
            if peer_id:
                await manager.send_personal_message({
                    "type": "transfer_cancelled",
                    "data": {"session_code": session_code, "cancelled_by": user_id},
                    "timestamp": datetime.now().isoformat()
                }, peer_id)
            # 清理会话
            del transfer_sessions[session_code]
            logger.info(f"快传会话已取消: {session_code}")
