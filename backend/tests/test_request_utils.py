"""
HTTP 请求工具单元测试
覆盖：客户端 IP 提取、User-Agent 获取、AJAX 检测、IP 清洗
"""

import pytest
from unittest.mock import MagicMock

from utils.request import get_client_ip, get_user_agent, is_ajax, _sanitize_ip


class TestSanitizeIp:
    """IP 地址清洗测试"""

    def test_valid_ipv4(self):
        """测试有效 IPv4"""
        assert _sanitize_ip("192.168.1.1") == "192.168.1.1"
        assert _sanitize_ip("10.0.0.1") == "10.0.0.1"
        assert _sanitize_ip("127.0.0.1") == "127.0.0.1"

    def test_valid_ipv6(self):
        """测试有效 IPv6"""
        assert _sanitize_ip("::1") == "::1"
        assert _sanitize_ip("2001:db8::1") == "2001:db8::1"

    def test_ip_with_whitespace(self):
        """测试包含空白的 IP"""
        assert _sanitize_ip("  192.168.1.1  ") == "192.168.1.1"
        assert _sanitize_ip("\t10.0.0.1\n") == "10.0.0.1"

    def test_invalid_ip(self):
        """测试无效 IP"""
        assert _sanitize_ip("not_an_ip") == ""
        assert _sanitize_ip("abc.def.ghi.jkl") == ""

    def test_injection_attempt(self):
        """测试注入攻击"""
        assert _sanitize_ip("192.168.1.1\nmalicious") == ""
        assert _sanitize_ip("192.168.1.1; rm -rf /") == ""

    def test_too_long_ip(self):
        """测试超长 IP 被截断"""
        long_ip = "a" * 100
        result = _sanitize_ip(long_ip)
        # 截断后可能不匹配模式
        assert len(result) <= 45 or result == ""

    def test_empty_string(self):
        """测试空字符串"""
        assert _sanitize_ip("") == ""


class TestGetClientIp:
    """获取客户端 IP 测试"""

    def _make_request(self, headers=None, client_host="127.0.0.1"):
        """创建模拟请求"""
        request = MagicMock()
        request.headers = headers or {}
        if client_host:
            request.client = MagicMock()
            request.client.host = client_host
        else:
            request.client = None
        return request

    def test_x_real_ip(self):
        """测试从 X-Real-IP 获取"""
        request = self._make_request(headers={"X-Real-IP": "10.0.0.1"})
        assert get_client_ip(request) == "10.0.0.1"

    def test_x_forwarded_for(self):
        """测试从 X-Forwarded-For 获取"""
        request = self._make_request(
            headers={"X-Forwarded-For": "203.0.113.1, 70.41.3.18, 150.172.238.178"}
        )
        assert get_client_ip(request) == "203.0.113.1"

    def test_x_real_ip_priority(self):
        """测试 X-Real-IP 优先于 X-Forwarded-For"""
        request = self._make_request(
            headers={
                "X-Real-IP": "10.0.0.1",
                "X-Forwarded-For": "203.0.113.1"
            }
        )
        assert get_client_ip(request) == "10.0.0.1"

    def test_direct_connection(self):
        """测试直接连接获取 socket 地址"""
        request = self._make_request(client_host="192.168.1.100")
        assert get_client_ip(request) == "192.168.1.100"

    def test_no_client_info(self):
        """测试无客户端信息"""
        request = self._make_request(client_host=None)
        assert get_client_ip(request) == "unknown"

    def test_invalid_x_real_ip(self):
        """测试无效的 X-Real-IP 回退到下一个来源"""
        request = self._make_request(
            headers={"X-Real-IP": "not_valid"},
            client_host="192.168.1.1"
        )
        # 无效 IP 被拒绝，回退到 socket 地址
        result = get_client_ip(request)
        assert result == "192.168.1.1"

    def test_invalid_x_forwarded_for(self):
        """测试无效的 X-Forwarded-For 回退"""
        request = self._make_request(
            headers={"X-Forwarded-For": "invalid_ip_here"},
            client_host="192.168.1.1"
        )
        result = get_client_ip(request)
        assert result == "192.168.1.1"


class TestGetUserAgent:
    """获取 User-Agent 测试"""

    def test_with_user_agent(self):
        """测试有 User-Agent"""
        request = MagicMock()
        request.headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64)"}
        
        result = get_user_agent(request)
        assert "Mozilla" in result

    def test_without_user_agent(self):
        """测试无 User-Agent"""
        request = MagicMock()
        request.headers = {}
        
        result = get_user_agent(request)
        assert result == ""


class TestIsAjax:
    """AJAX 请求检测测试"""

    def test_ajax_request(self):
        """测试 AJAX 请求"""
        request = MagicMock()
        request.headers = {"X-Requested-With": "XMLHttpRequest"}
        
        assert is_ajax(request) is True

    def test_non_ajax_request(self):
        """测试非 AJAX 请求"""
        request = MagicMock()
        request.headers = {}
        
        assert is_ajax(request) is False

    def test_wrong_header_value(self):
        """测试错误的头值"""
        request = MagicMock()
        request.headers = {"X-Requested-With": "SomeOtherValue"}
        
        assert is_ajax(request) is False
