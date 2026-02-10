"""
速率限制模块测试
"""
import pytest
import time
from unittest.mock import MagicMock, patch
from core.rate_limit import RateLimiter, RateLimitConfig, ClientState

class TestRateLimiter:
    """速率限制器测试"""
    
    def setup_method(self):
        self.limiter = RateLimiter()
    
    def test_configure(self):
        """测试基本配置"""
        self.limiter.configure(requests=10, window=60, block_duration=300)
        config = self.limiter._default_config
        assert config.requests == 10
        assert config.window == 60
        assert config.block_duration == 300
        
    def test_configure_route(self):
        """测试特定路由配置"""
        self.limiter.configure_route("/api/test", requests=5)
        config = self.limiter._get_config("/api/test")
        assert config.requests == 5
        
        # 测试前缀匹配
        self.limiter.configure_route("/api/v1", requests=100)
        config = self.limiter._get_config("/api/v1/users")
        assert config.requests == 100
        
        # 测试默认配置
        config = self.limiter._get_config("/other")
        assert config.requests == 200 # 默认值
        
    def test_whitelist_blacklist(self):
        """测试黑白名单"""
        ip_white = "1.2.3.4"
        ip_black = "5.6.7.8"
        ip_normal = "9.9.9.9"
        
        self.limiter.add_whitelist(ip_white)
        self.limiter.add_blacklist(ip_black)
        
        # 模拟 Request 对象
        def make_req(ip):
            req = MagicMock()
            req.client.host = ip
            req.headers = {}
            req.url.path = "/api"
            return req
            
        # 测试白名单
        allowed, info = self.limiter.check(make_req(ip_white))
        assert allowed is True
        assert info.get("whitelisted") is True
        
        # 测试黑名单
        allowed, info = self.limiter.check(make_req(ip_black))
        assert allowed is False
        assert info.get("reason") == "blocked"
        
        # 测试普通 IP
        allowed, info = self.limiter.check(make_req(ip_normal))
        assert allowed is True
        
    def test_rate_limiting_logic(self):
        """测试限流逻辑"""
        self.limiter.configure(requests=2, window=10, block_duration=10)
        ip = "10.0.0.1"
        
        def make_req():
            req = MagicMock()
            req.client.host = ip
            req.headers = {}
            req.url.path = "/api"
            return req
            
        # 第1次请求
        allowed, _ = self.limiter.check(make_req())
        assert allowed is True
        
        # 第2次请求
        allowed, _ = self.limiter.check(make_req())
        assert allowed is True
        
        # 第3次请求 (被封禁)
        allowed, info = self.limiter.check(make_req())
        assert allowed is False
        assert info.get("reason") == "rate_limited"
        
    def test_cleanup(self):
        """测试清理逻辑"""
        # 手动注入一个过期的客户端状态
        stale_ip = "1.1.1.1"
        self.limiter._clients[stale_ip] = ClientState(
            window_start=time.time() - 301, # 已过期
            requests=1
        )
        
        # 模拟请求计数以触发清理
        self.limiter._request_count = self.limiter.CLEANUP_INTERVAL
        self.limiter._last_cleanup = time.time() - 61 # 达到清理间隔
        
        mock_request = MagicMock()
        mock_request.client = MagicMock(host="2.2.2.2")
        mock_request.headers = {}
        self.limiter.check(mock_request)
        
        # 期望 stale_ip 被清理掉
        assert stale_ip not in self.limiter._clients

    def test_unblock(self):
        """测试解除封禁"""
        ip = "1.2.3.4"
        self.limiter._clients[ip] = ClientState(
            blocked_until=time.time() + 100,
            requests=10
        )
        
        assert self.limiter.unblock_ip(ip) is True
        state = self.limiter._clients[ip]
        assert state.blocked_until == 0
        assert state.requests == 0
