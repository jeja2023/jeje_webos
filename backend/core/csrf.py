"""
CSRF 防护模块
提供 CSRF Token 生成和验证功能
"""

import secrets
import hashlib
import time
from typing import Optional
from fastapi import Request, HTTPException, status
from starlette.middleware.base import BaseHTTPMiddleware
from core.cache import set_cache, get_cache, delete_cache

# 存储 CSRF Token（当 Redis 不可用时的内存回退方案）
_csrf_tokens: dict[str, dict] = {}
TOKEN_EXPIRE_SECONDS = 3600  # Token 有效期：1小时


async def generate_csrf_token() -> str:
    """
    生成 CSRF Token
    
    Returns:
        CSRF Token 字符串
    """
    token = secrets.token_urlsafe(32)
    timestamp = time.time()
    token_data = {
        "created_at": timestamp,
        "used": False
    }
    
    # 尝试存入 Redis
    saved = await set_cache(f"csrf:{token}", token_data, TOKEN_EXPIRE_SECONDS)
    
    # 如果 Redis 不可用，存入内存
    if not saved:
        _csrf_tokens[token] = token_data
        # 清理过期 Token
        _cleanup_expired_tokens()
    
    return token


async def verify_csrf_token(token: str) -> bool:
    """
    验证 CSRF Token
    
    Args:
        token: CSRF Token
    
    Returns:
        是否有效
    """
    if not token:
        return False
    
    # 1. 尝试从 Redis 获取
    redis_data = await get_cache(f"csrf:{token}")
    if redis_data:
        # 验证 Token 有效期（双重保障，即使 Redis TTL 未正确设置）
        if isinstance(redis_data, dict) and "created_at" in redis_data:
            if time.time() - redis_data["created_at"] > TOKEN_EXPIRE_SECONDS:
                await delete_cache(f"csrf:{token}")
                return False
        return True
    
    # 2. 尝试从内存获取
    if token in _csrf_tokens:
        token_info = _csrf_tokens[token]
        
        # 检查是否过期
        if time.time() - token_info["created_at"] > TOKEN_EXPIRE_SECONDS:
            del _csrf_tokens[token]
            return False
        
        return True
    
    return False


async def mark_token_used(token: str):
    """标记 Token 为已使用（可选：单次使用）"""
    # 尝试更新 Redis
    redis_data = await get_cache(f"csrf:{token}")
    if redis_data:
        redis_data["used"] = True
        await set_cache(f"csrf:{token}", redis_data, TOKEN_EXPIRE_SECONDS)
        return

    # 尝试更新内存
    if token in _csrf_tokens:
        _csrf_tokens[token]["used"] = True


def _cleanup_expired_tokens():
    """清理过期的内存 Token"""
    current_time = time.time()
    expired = [
        token for token, info in _csrf_tokens.items()
        if current_time - info["created_at"] > TOKEN_EXPIRE_SECONDS
    ]
    for token in expired:
        del _csrf_tokens[token]


def get_csrf_token_from_request(request: Request) -> Optional[str]:
    """
    从请求中获取 CSRF Token
    
    支持从以下位置获取：
    1. Header: X-CSRF-Token
    2. Form Data: csrf_token
    3. Query Parameter: csrf_token
    """
    # 优先从 Header 获取
    token = request.headers.get("X-CSRF-Token")
    if token:
        return token
    
    # 从表单数据获取
    if hasattr(request, "form"):
        try:
            # 注意：request.form() 是 async 的，但在 BaseHTTPMiddleware 中无法轻易 await
            # 这里的 request 已经被处理过，或者假设是 Starlette Request
            # 实际上在 Middleware 中获取 form data 会消耗 request body stream，可能导致后续 router 无法读取
            # 因此，通常建议 CSRF 只检查 Header
            pass
        except Exception:
            pass
    
    # 从查询参数获取
    token = request.query_params.get("csrf_token")
    if token:
        return token
    
    return None


class CSRFMiddleware(BaseHTTPMiddleware):
    """
    CSRF 防护中间件
    
    对状态变更操作（POST/PUT/PATCH/DELETE）进行 CSRF Token 验证
    """
    
    # 需要 CSRF 验证的 HTTP 方法
    PROTECTED_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
    
    # 跳过 CSRF 验证的路径
    SKIP_PATHS = [
        "/api/docs",
        "/api/redoc",
        "/api/openapi.json",
        "/health",
        "/static/",
        "/ws",  # WebSocket
        "/api/v1/auth/login",  # 登录接口（使用 JWT，不需要 CSRF）
        "/api/v1/auth/register",  # 注册接口
        "/api/v1/auth/refresh",  # 刷新令牌接口
    ]
    
    async def dispatch(self, request: Request, call_next):
        try:
            # 跳过指定路径
            if any(request.url.path.startswith(path) for path in self.SKIP_PATHS):
                return await call_next(request)
            
            # 只对状态变更操作进行验证
            if request.method in self.PROTECTED_METHODS:
                # 获取 CSRF Token
                token = get_csrf_token_from_request(request)
                
                # 验证 Token (await async function)
                if not token or not await verify_csrf_token(token):
                    from fastapi.responses import JSONResponse
                    return JSONResponse(
                        status_code=status.HTTP_403_FORBIDDEN,
                        content={
                            "code": 403,
                            "message": "CSRF Token 验证失败，请刷新页面后重试",
                            "data": None
                        }
                    )
                
                # 标记 Token 为已使用（可选）
                # await mark_token_used(token)
            
            response = await call_next(request)
            return response
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"CSRF 中间件捕获异常: {e}")
            raise

