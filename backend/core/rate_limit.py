"""
速率限制模块
防止API滥用和DDoS攻击
"""

import time
import logging
from typing import Dict, Optional, Callable
from collections import defaultdict
from dataclasses import dataclass, field
from functools import wraps

from fastapi import Request, HTTPException, status
from fastapi.responses import JSONResponse


from starlette.middleware.base import BaseHTTPMiddleware
from core.config import get_settings

logger = logging.getLogger(__name__)


@dataclass
class RateLimitConfig:
    """速率限制配置"""
    requests: int = 200      # 允许的请求数（默认200/分钟，开发环境更宽松）
    window: int = 60         # 时间窗口（秒）
    block_duration: int = 30  # 超限后封禁时间（秒，默认30秒，生产环境可设置为60-300秒）


@dataclass
class ClientState:
    """客户端状态"""
    requests: int = 0
    window_start: float = 0
    blocked_until: float = 0


class RateLimiter:
    """
    速率限制器
    使用滑动窗口算法限制请求频率
    """
    
    def __init__(self):
        # 存储客户端状态：IP -> ClientState
        self._clients: Dict[str, ClientState] = defaultdict(ClientState)
        # 路由级别配置：path -> RateLimitConfig
        self._route_configs: Dict[str, RateLimitConfig] = {}
        # 默认配置
        self._default_config = RateLimitConfig()
        # 白名单IP
        self._whitelist: set = set()
        # 黑名单IP
        self._blacklist: set = set()
    
    def configure(
        self,
        requests: int = 100,
        window: int = 60,
        block_duration: int = 60
    ):
        """配置默认速率限制"""
        self._default_config = RateLimitConfig(
            requests=requests,
            window=window,
            block_duration=block_duration
        )
    
    def configure_route(
        self,
        path: str,
        requests: int,
        window: int = 60,
        block_duration: int = 60
    ):
        """配置特定路由的速率限制"""
        self._route_configs[path] = RateLimitConfig(
            requests=requests,
            window=window,
            block_duration=block_duration
        )
    
    def add_whitelist(self, ip: str):
        """添加白名单IP"""
        self._whitelist.add(ip)
    
    def remove_whitelist(self, ip: str):
        """移除白名单IP"""
        self._whitelist.discard(ip)
    
    def add_blacklist(self, ip: str):
        """添加黑名单IP"""
        self._blacklist.add(ip)
    
    def remove_blacklist(self, ip: str):
        """移除黑名单IP"""
        self._blacklist.discard(ip)
    
    def _get_client_ip(self, request: Request) -> str:
        """获取客户端真实IP"""
        # 优先从代理头获取
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip
        
        # 回退到直连IP
        return request.client.host if request.client else "unknown"
    
    def _get_config(self, path: str) -> RateLimitConfig:
        """获取路由配置"""
        # 精确匹配
        if path in self._route_configs:
            return self._route_configs[path]
        
        # 前缀匹配
        for route_path, config in self._route_configs.items():
            if path.startswith(route_path):
                return config
        
        return self._default_config
    
    def check(self, request: Request) -> tuple[bool, Optional[dict]]:
        """
        检查请求是否允许
        
        Returns:
            (allowed, info): allowed为是否允许，info包含限制信息
        """
        client_ip = self._get_client_ip(request)
        current_time = time.time()
        path = request.url.path
        
        # 检查白名单
        if client_ip in self._whitelist:
            return True, {"whitelisted": True}
        
        # 检查黑名单
        if client_ip in self._blacklist:
            return False, {
                "reason": "blocked",
                "message": "IP已被封禁"
            }
        
        config = self._get_config(path)
        state = self._clients[client_ip]
        
        # 检查是否在封禁期
        if state.blocked_until > current_time:
            remaining = int(state.blocked_until - current_time)
            return False, {
                "reason": "rate_limited",
                "message": f"请求过于频繁，请 {remaining} 秒后重试",
                "retry_after": remaining
            }
        
        # 检查是否需要重置窗口
        if current_time - state.window_start >= config.window:
            state.requests = 0
            state.window_start = current_time
        
        # 检查请求数
        state.requests += 1
        
        if state.requests > config.requests:
            # 超限，设置封禁
            state.blocked_until = current_time + config.block_duration
            logger.warning(f"IP {client_ip} 请求超限，已封禁 {config.block_duration} 秒")
            return False, {
                "reason": "rate_limited",
                "message": f"请求过于频繁，请 {config.block_duration} 秒后重试",
                "retry_after": config.block_duration
            }
        
        # 返回剩余配额信息
        remaining = config.requests - state.requests
        reset_time = int(state.window_start + config.window - current_time)
        
        return True, {
            "remaining": remaining,
            "limit": config.requests,
            "reset": reset_time
        }
    
    def get_stats(self) -> dict:
        """获取统计信息"""
        current_time = time.time()
        active_clients = 0
        blocked_clients = 0
        
        for ip, state in self._clients.items():
            if state.blocked_until > current_time:
                blocked_clients += 1
            elif current_time - state.window_start < 300:  # 5分钟内活跃
                active_clients += 1
        
        return {
            "total_tracked": len(self._clients),
            "active_clients": active_clients,
            "blocked_clients": blocked_clients,
            "whitelist_count": len(self._whitelist),
            "blacklist_count": len(self._blacklist)
        }
    
    def clear_expired(self):
        """清理过期记录"""
        current_time = time.time()
        expired = []
        
        for ip, state in self._clients.items():
            # 超过1小时未活动且未被封禁
            if (current_time - state.window_start > 3600 and 
                state.blocked_until < current_time):
                expired.append(ip)
        
        for ip in expired:
            del self._clients[ip]
        
        if expired:
            logger.debug(f"清理 {len(expired)} 个过期速率限制记录")
    
    def unblock_ip(self, ip: str) -> bool:
        """
        解除IP封禁
        
        Args:
            ip: 要解除封禁的IP地址
            
        Returns:
            bool: 是否成功解除封禁
        """
        if ip in self._clients:
            state = self._clients[ip]
            if state.blocked_until > time.time():
                state.blocked_until = 0
                state.requests = 0
                state.window_start = time.time()
                logger.info(f"已解除IP {ip} 的封禁状态")
                return True
        return False
    
    def unblock_all(self) -> int:
        """
        解除所有IP的封禁状态
        
        Returns:
            int: 解除封禁的IP数量
        """
        current_time = time.time()
        unblocked_count = 0
        
        for ip, state in self._clients.items():
            if state.blocked_until > current_time:
                state.blocked_until = 0
                state.requests = 0
                state.window_start = current_time
                unblocked_count += 1
        
        if unblocked_count > 0:
            logger.info(f"已解除 {unblocked_count} 个IP的封禁状态")
        
        return unblocked_count
    
    def get_blocked_ips(self) -> list:
        """
        获取当前被封禁的IP列表
        
        Returns:
            list: 被封禁的IP列表，包含IP和剩余封禁时间
        """
        current_time = time.time()
        blocked = []
        
        for ip, state in self._clients.items():
            if state.blocked_until > current_time:
                remaining = int(state.blocked_until - current_time)
                blocked.append({
                    "ip": ip,
                    "remaining_seconds": remaining,
                    "blocked_until": state.blocked_until
                })
        
        return blocked


# 全局限制器实例
rate_limiter = RateLimiter()


def init_rate_limiter():
    """初始化速率限制器"""
    try:
        settings = get_settings()
        # 从配置中读取速率限制参数
        requests = getattr(settings, "rate_limit_requests", 200)
        window = getattr(settings, "rate_limit_window", 60)
        block_duration = getattr(settings, "rate_limit_block_duration", 30)
        enable_whitelist_localhost = getattr(settings, "rate_limit_enable_whitelist_localhost", True)
        
        rate_limiter.configure(
            requests=requests,
            window=window,
            block_duration=block_duration
        )
        
        # 如果启用，将本地IP加入白名单（开发环境推荐）
        if enable_whitelist_localhost:
            rate_limiter.add_whitelist("127.0.0.1")
            rate_limiter.add_whitelist("localhost")
            rate_limiter.add_whitelist("::1")  # IPv6 localhost
            logger.debug("本地IP已加入速率限制白名单")
        
        logger.info(f"速率限制已配置: {requests} 请求/{window}秒，封禁时长: {block_duration}秒")
    except Exception as e:
        logger.warning(f"速率限制初始化使用默认配置: {e}")


def limit(requests: int = 10, window: int = 60):
    """
    速率限制装饰器（用于单个路由）
    
    使用方式:
        @router.get("/api/data")
        @limit(requests=10, window=60)
        async def get_data():
            pass
    """
    def decorator(func: Callable):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # 从参数中获取 request
            request = kwargs.get("request")
            if not request:
                for arg in args:
                    if isinstance(arg, Request):
                        request = arg
                        break
            
            if request:
                allowed, info = rate_limiter.check(request)
                if not allowed:
                    raise HTTPException(
                        status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                        detail=info.get("message", "请求过于频繁"),
                        headers={"Retry-After": str(info.get("retry_after", 60))}
                    )
            
            return await func(*args, **kwargs)
        return wrapper
    return decorator


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    速率限制中间件
    在main.py中通过 app.add_middleware(RateLimitMiddleware) 注册
    """
    
    async def dispatch(self, request: Request, call_next):
        # 跳过静态资源和健康检查
        skip_paths = ["/static/", "/health", "/api/docs", "/api/redoc", "/api/openapi.json"]
        if any(request.url.path.startswith(p) for p in skip_paths):
            return await call_next(request)
        
        allowed, info = rate_limiter.check(request)
        
        if not allowed:
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "code": 429,
                    "message": info.get("message", "请求过于频繁"),
                    "data": None
                },
                headers={"Retry-After": str(info.get("retry_after", 60))}
            )
        
        try:
            response = await call_next(request)
        except Exception as e:
            logger.error(f"速率限制中间件捕获异常: {e}")
            raise
        
        # 添加速率限制响应头
        if info and "remaining" in info:
            response.headers["X-RateLimit-Limit"] = str(info["limit"])
            response.headers["X-RateLimit-Remaining"] = str(info["remaining"])
            response.headers["X-RateLimit-Reset"] = str(info["reset"])
        
        return response


def get_rate_limiter() -> RateLimiter:
    """获取速率限制器实例"""
    return rate_limiter


