"""
审计日志工具单元测试
"""

import pytest
from core.audit_utils import DataMasker, AuditLogger, AuditLogEntry
from unittest.mock import patch, MagicMock, AsyncMock

class TestDataMasker:
    """数据脱敏工具测试"""
    
    def test_mask_password(self):
        """测试密码脱敏"""
        assert DataMasker.mask_password("secret123") == "******"
        assert DataMasker.mask_password("") == ""
        
    def test_mask_phone(self):
        """测试手机号脱敏"""
        assert DataMasker.mask_phone("13800138000") == "138****8000"
        assert DataMasker.mask_phone("123") == "123"
        
    def test_mask_email(self):
        """测试邮箱脱敏"""
        assert DataMasker.mask_email("test@example.com").startswith("t***")
        assert "@example.com" in DataMasker.mask_email("test@example.com")
        
    def test_mask_dict(self):
        """测试字典脱敏"""
        data = {
            "username": "tester",
            "password": "mypassword",
            "phone": "13800138000",
            "token": "abcdefg1234567890abcdefg1234567890",
            "nested": {
                "pwd": "nestedpassword"
            }
        }
        masked = DataMasker.mask_dict(data)
        
        assert masked["username"] == "tester"
        assert masked["password"] == "******"
        assert masked["phone"] == "138****8000"
        assert "..." in masked["token"]
        assert masked["nested"]["pwd"] == "******"

    def test_mask_message(self):
        """测试字符串消息脱敏"""
        msg = "用户 13800138000 登录成功，Token: abcdefg1234567890abcdefg1234567890"
        masked = DataMasker.mask_message(msg)
        
        assert "138****8000" in masked
        assert "..." in masked
        assert "abcdefg" not in masked or "..." in masked

class TestAuditLogger:
    """审计日志记录器测试"""
    
    @pytest.mark.asyncio
    async def test_log_immediate(self):
        """测试立即记录日志"""
        mock_session = AsyncMock()
        mock_session.add = MagicMock()
        mock_session.commit = AsyncMock()  # commit is actually async in our code? wait.
        mock_session.__aenter__.return_value = mock_session
        mock_factory = MagicMock(return_value=mock_session)
        
        with patch("core.audit_utils.async_session", mock_factory):
            await AuditLogger.log(
                module="test",
                action="test_action",
                message="test message",
                immediate=True
            )
            
            # 验证是否调用了 add 和 commit
            mock_session.add.assert_called()
            mock_session.commit.assert_called()

    @pytest.mark.asyncio
    async def test_log_queued(self):
        """测试队列记录日志"""
        # 重置队列并防止自动刷新干扰
        AuditLogger._log_queue = []
        
        with patch.object(AuditLogger, "_flush_logs", new_callable=AsyncMock):
            await AuditLogger.log(
                module="test_queued",
                action="test_action",
                message="test message",
                immediate=False
            )
            
            assert len(AuditLogger._log_queue) == 1
            assert AuditLogger._log_queue[0].module == "test_queued"
            
        # 清理队列
        AuditLogger._log_queue = []

    def test_get_client_ip(self):
        """测试获取客户端 IP"""
        mock_request = MagicMock()
        mock_request.headers = {"X-Forwarded-For": "1.2.3.4, 5.6.7.8"}
        
        ip = AuditLogger.get_client_ip(mock_request)
        assert ip == "1.2.3.4"
        
        mock_request.headers = {"X-Real-IP": "9.10.11.12"}
        ip = AuditLogger.get_client_ip(mock_request)
        assert ip == "9.10.11.12"
        
        mock_request.headers = {}
        mock_request.client.host = "127.0.0.1"
        ip = AuditLogger.get_client_ip(mock_request)
        assert ip == "127.0.0.1"
