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

# 存储 CSRF Token（生产环境应使用 Redis）
_csrf_tokens: dict[str, dict] = {}
TOKEN_EXPIRE_SECONDS = 3600  # Token 有效期：1小时


def generate_csrf_token() -> str:
    """
    生成 CSRF Token
    
    Returns:
        CSRF Token 字符串
    """
    token = secrets.token_urlsafe(32)
    timestamp = time.time()
    
    # 存储 Token（带时间戳）
    _csrf_tokens[token] = {
        "created_at": timestamp,
        "used": False
    }
    
    # 清理过期 Token
    _cleanup_expired_tokens()
    
    return token


def verify_csrf_token(token: str) -> bool:
    """
    验证 CSRF Token
    
    Args:
        token: CSRF Token
    
    Returns:
        是否有效
    """
    if not token:
        return False
    
    # 检查 Token 是否存在
    if token not in _csrf_tokens:
        return False
    
    token_info = _csrf_tokens[token]
    
    # 检查是否过期
    if time.time() - token_info["created_at"] > TOKEN_EXPIRE_SECONDS:
        del _csrf_tokens[token]
        return False
    
    # 检查是否已使用（可选：单次使用）
    # if token_info["used"]:
    #     return False
    
    return True


def mark_token_used(token: str):
    """标记 Token 为已使用（可选：单次使用）"""
    if token in _csrf_tokens:
        _csrf_tokens[token]["used"] = True


def _cleanup_expired_tokens():
    """清理过期的 Token"""
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
            form_data = request.form()
            if "csrf_token" in form_data:
                return form_data["csrf_token"]
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
                
                if not token or not verify_csrf_token(token):
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
                # mark_token_used(token)
            
            response = await call_next(request)
            return response
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"CSRF 中间件捕获异常: {e}")
            raise

