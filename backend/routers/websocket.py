"""
WebSocket 路由
提供实时通信功能
"""

import json
import logging
from datetime import datetime
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException

from core.websocket import manager
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

