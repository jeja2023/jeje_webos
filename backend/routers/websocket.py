"""
WebSocket 路由
提供实时通信功能
"""

import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends

from core.errors import AuthException, ErrorCode

from utils.timezone import get_beijing_time

from core.ws_manager import manager
from core.security import decode_token, TokenData, require_manager, get_current_user, COOKIE_ACCESS_TOKEN

router = APIRouter(prefix="/api/v1", tags=["WebSocket"])
logger = logging.getLogger(__name__)


def get_user_from_token(token: str) -> TokenData:
    """从 token 获取用户信息"""
    try:
        token_data = decode_token(token)
        if not token_data:
            raise AuthException(ErrorCode.TOKEN_INVALID, "无效的 token")
        return token_data
    except AuthException:
        raise
    except Exception:
        raise AuthException(ErrorCode.TOKEN_INVALID, "无效的 token")


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = None):
    """
    WebSocket 连接端点
    
    连接参数：
    - token: JWT token（通过查询参数或协议头传递）
    """
    user_id = None
    user_info = None
    selected_subprotocol = None
    connection_established = False  # 标记连接是否已建立
    
    async def safe_close(code: int, reason: str):
        """安全关闭 WebSocket 连接，避免重复关闭"""
        try:
            if websocket.client_state.name != "DISCONNECTED":
                await websocket.close(code=code, reason=reason)
        except Exception:
            pass  # 忽略关闭时的任何错误
    
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
            # 尝试从 WebSocket 子协议获取（Sec-WebSocket-Protocol）
            proto_header = websocket.headers.get("sec-websocket-protocol", "")
            if proto_header:
                parts = [p.strip() for p in proto_header.split(",") if p.strip()]
                # 约定：["bearer", "<token>"]
                if len(parts) >= 2 and parts[0].lower() == "bearer":
                    token = parts[1]
                    selected_subprotocol = parts[0]
                elif "bearer" in [p.lower() for p in parts]:
                    # 兜底：取第一个非 bearer 的值作为 token
                    for p in parts:
                        if p.lower() != "bearer":
                            token = p
                            selected_subprotocol = "bearer"
                            break
        
        if not token:
            # 尝试从 Cookie 获取（HttpOnly Cookie 模式）
            cookie_header = websocket.headers.get("cookie", "")
            if cookie_header:
                # 简单解析 Cookie 字符串
                cookies = {}
                for part in cookie_header.split(";"):
                    if "=" in part:
                        k, v = part.split("=", 1)
                        cookies[k.strip()] = v.strip()
                token = cookies.get(COOKIE_ACCESS_TOKEN)
        
        if not token:
            await safe_close(1008, "缺少认证 token")
            return
        
        # 验证 token 并获取用户信息
        user_info = get_user_from_token(token)
        user_id = user_info.user_id
        
        # 建立连接
        await manager.connect(websocket, user_id, subprotocol=selected_subprotocol)
        connection_established = True
        
        # 发送连接成功消息
        try:
            await websocket.send_text(json.dumps({
                "type": "connected",
                "message": "WebSocket 连接成功",
                "user_id": user_id,
                "timestamp": get_beijing_time().isoformat()
            }, ensure_ascii=False))
        except WebSocketDisconnect:
            # 发送时客户端已断开，直接退出
            return
        except Exception:
            # 其他发送错误，尝试关闭
            await safe_close(1011, "发送消息失败")
            return
        
        # 保持连接并接收消息
        while True:
            try:
                data = await websocket.receive_text()
                # 限制消息大小，防止 DoS（1MB）
                if data and len(data) > 1024 * 1024:
                    await safe_close(1009, "消息过大")
                    break
                
                # 解析消息
                try:
                    message = json.loads(data)
                    message_type = message.get("type", "unknown")
                    
                    if not isinstance(message_type, str):
                        logger.warning(f"无效的消息类型格式: {message_type}")
                        continue

                    # 处理心跳
                    if message_type == "ping":
                        try:
                            await websocket.send_text(json.dumps({
                                "type": "pong",
                                "timestamp": get_beijing_time().isoformat()
                            }, ensure_ascii=False))
                        except Exception:
                            break  # 发送失败，退出循环
                    
                    # 处理快传相关消息
                    elif message_type.startswith("transfer_"):
                        await handle_transfer_message(websocket, user_id, message_type, message.get("data", {}))
                    
                    # 处理即时通讯相关消息
                    elif message_type.startswith("im_"):
                        try:
                            from modules.im.im_websocket import handle_im_message
                            await handle_im_message(websocket, user_id, message_type, message.get("data", {}))
                        except ImportError as e:
                            logger.warning(f"即时通讯模块未加载: {e}")
                        except Exception as e:
                            logger.error(f"处理IM消息失败: {e}", exc_info=True)
                    
                    else:
                        # 其他消息类型可以在这里处理
                        logger.debug(f"收到消息: {message}")
                        
                except json.JSONDecodeError:
                    logger.warning(f"收到无效的 JSON 消息: {data}")
                    
            except WebSocketDisconnect:
                break
                
    except HTTPException as e:
        logger.warning(f"WebSocket 认证失败: {e.detail}")
        await safe_close(1008, e.detail)
    except WebSocketDisconnect:
        # 客户端主动断开，正常情况
        logger.debug(f"WebSocket 客户端断开: user_id={user_id}")
    except Exception as e:
        # 仅记录非预期的异常
        if "disconnect" not in str(e).lower() and "closed" not in str(e).lower():
            logger.error(f"WebSocket 连接异常: {e}", exc_info=True)
        await safe_close(1011, "服务器内部错误")
    finally:
        if user_id and connection_established:
            manager.disconnect(websocket, user_id)


@router.get("/ws/online-users")
async def get_online_users(
    current_user: TokenData = Depends(get_current_user)
):
    """
    获取在线用户列表
    
    仅管理员和业务管理员可访问
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

# 传输会话映射：session_code -> {sender_id, receiver_id, created_at}
transfer_sessions: dict = {}
_MAX_TRANSFER_SESSIONS = 1000  # 最大会话数


def _cleanup_transfer_sessions():
    """清理超过1小时的传输会话"""
    if len(transfer_sessions) < _MAX_TRANSFER_SESSIONS // 2:
        return
    now = get_beijing_time()
    from datetime import timedelta
    expired = [
        code for code, info in transfer_sessions.items()
        if now - info.get("created_at", now) > timedelta(hours=1)
    ]
    for code in expired:
        del transfer_sessions[code]


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
    
    # 验证 session_code 格式（防止恶意输入和内存滥用）
    if session_code:
        if not isinstance(session_code, str) or len(session_code) > 64 or not session_code.replace('-', '').replace('_', '').isalnum():
            logger.warning(f"非法 session_code 格式: user_id={user_id}")
            return
    
    if message_type == "transfer_create":
        # 发送方创建会话，进入等待状态
        if session_code:
            # 定期清理过期会话
            _cleanup_transfer_sessions()
            transfer_sessions[session_code] = {
                "sender_id": user_id,
                "receiver_id": None,
                "status": "waiting",
                "created_at": get_beijing_time()
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
                "timestamp": get_beijing_time().isoformat()
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
                    "timestamp": get_beijing_time().isoformat()
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
                        "timestamp": get_beijing_time().isoformat()
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
                        "timestamp": get_beijing_time().isoformat()
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
                    "timestamp": get_beijing_time().isoformat()
                }, peer_id)
            # 清理会话
            del transfer_sessions[session_code]
            logger.info(f"快传会话已取消: {session_code}")
