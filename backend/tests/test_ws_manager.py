"""
WebSocket 管理器单元测试
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from core.ws_manager import ConnectionManager

class TestConnectionManager:
    """WebSocket 连接管理器测试"""
    
    @pytest.mark.asyncio
    async def test_connect_disconnect(self):
        """测试连接和断开"""
        manager = ConnectionManager()
        mock_ws = AsyncMock()
        user_id = 1
        
        # 测试连接
        await manager.connect(mock_ws, user_id)
        assert user_id in manager.active_connections
        assert mock_ws in manager.active_connections[user_id]
        mock_ws.accept.assert_called_once()
        
        # 测试断开
        manager.disconnect(mock_ws, user_id)
        assert user_id not in manager.active_connections
        
    @pytest.mark.asyncio
    async def test_send_personal_message(self):
        """测试发送个人消息"""
        manager = ConnectionManager()
        mock_ws = AsyncMock()
        user_id = 1
        await manager.connect(mock_ws, user_id)
        
        message = {"type": "test", "content": "hello"}
        await manager.send_personal_message(message, user_id)
        
        mock_ws.send_text.assert_called_once()
        # 验证发送的内容包含消息
        call_args = mock_ws.send_text.call_args[0][0]
        assert '"test"' in call_args
        assert '"hello"' in call_args

    @pytest.mark.asyncio
    async def test_broadcast(self):
        """测试广播消息"""
        manager = ConnectionManager()
        mock_ws1 = AsyncMock()
        mock_ws2 = AsyncMock()
        
        await manager.connect(mock_ws1, 1)
        await manager.connect(mock_ws2, 2)
        
        message = {"type": "broadcast", "content": "all"}
        await manager.broadcast(message)
        
        mock_ws1.send_text.assert_called_once()
        mock_ws2.send_text.assert_called_once()

    def test_get_online_users(self):
        """测试获取在线用户"""
        manager = ConnectionManager()
        manager.active_connections = {1: {MagicMock()}, 2: {MagicMock()}}
        
        online_users = manager.get_online_users()
        assert online_users == {1, 2}
        assert manager.get_connection_count() == 2
