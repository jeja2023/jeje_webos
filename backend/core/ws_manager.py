"""
WebSocket 管理器
处理 WebSocket 连接和消息推送
"""

import json
import logging
from typing import Dict, Set
from fastapi import WebSocket, WebSocketDisconnect
from datetime import datetime

logger = logging.getLogger(__name__)


class ConnectionManager:
    """WebSocket 连接管理器"""
    
    def __init__(self):
        # 用户ID -> WebSocket 连接集合（一个用户可能有多个连接）
        self.active_connections: Dict[int, Set[WebSocket]] = {}
    
    async def connect(self, websocket: WebSocket, user_id: int):
        """接受连接"""
        await websocket.accept()
        
        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()
        
        self.active_connections[user_id].add(websocket)
        logger.debug(f"WebSocket 连接已建立: 用户 {user_id}")
    
    def disconnect(self, websocket: WebSocket, user_id: int):
        """断开连接"""
        if user_id in self.active_connections:
            self.active_connections[user_id].discard(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
            logger.debug(f"WebSocket 连接已断开: 用户 {user_id}")
    
    async def send_personal_message(self, message: dict, user_id: int):
        """向指定用户发送消息"""
        if user_id in self.active_connections:
            disconnected = set()
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_text(json.dumps(message, ensure_ascii=False))
                except Exception as e:
                    logger.error(f"发送消息失败: {e}")
                    disconnected.add(connection)
            
            # 清理断开的连接
            for conn in disconnected:
                self.disconnect(conn, user_id)
        else:
            logger.debug(f"忽略离线用户消息推送: {user_id}")
    
    async def broadcast(self, message: dict, exclude_user_ids: Set[int] = None):
        """广播消息给所有用户"""
        if exclude_user_ids is None:
            exclude_user_ids = set()
        
        disconnected_users = []
        for user_id, connections in self.active_connections.items():
            if user_id in exclude_user_ids:
                continue
            
            disconnected = set()
            for connection in connections:
                try:
                    await connection.send_text(json.dumps(message, ensure_ascii=False))
                except Exception as e:
                    logger.error(f"广播消息失败: {e}")
                    disconnected.add(connection)
            
            # 清理断开的连接
            for conn in disconnected:
                self.disconnect(conn, user_id)
                if not self.active_connections.get(user_id):
                    disconnected_users.append(user_id)
        
        # 清理空连接
        for user_id in disconnected_users:
            if user_id in self.active_connections and not self.active_connections[user_id]:
                del self.active_connections[user_id]
    
    def get_online_users(self) -> Set[int]:
        """获取在线用户ID集合"""
        return set(self.active_connections.keys())
    
    def get_connection_count(self) -> int:
        """获取总连接数"""
        return sum(len(connections) for connections in self.active_connections.values())


# 全局连接管理器
manager = ConnectionManager()





