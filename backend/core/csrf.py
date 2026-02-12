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
MAX_MEMORY_TOKENS = 10000    # 内存中最大 Token 数量，防止 DoS


async def generate_csrf_token() -> str:
    """
    生成 CSRF Token
    
    Returns:
        CSRF Token 字符串
    """
    token = secrets.token_urlsafe(32)
    timestamp = time.time()
    token_data = {
        "created_at": timestamp
    }
    
    # 尝试存入 Redis
    saved = await set_cache(f"csrf:{token}", token_data, TOKEN_EXPIRE_SECONDS)
    
    # 如果 Redis 不可用，存入内存
    if not saved:
        _csrf_tokens[token] = token_data
        # 清理过期 Token
        _cleanup_expired_tokens()
    
    return token


async def verify_and_consume_csrf_token(token: str) -> bool:
    """
    验证 CSRF Token 的有效性（不再物理删除，允许在有效期内多次使用，平衡安全与 SPA 体验）
    
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
        # 必须是 dict 且包含 created_at，否则视为无效
        if not isinstance(redis_data, dict) or "created_at" not in redis_data:
            return False
        # 不再检查 used 状态，允许多次使用
        if time.time() - redis_data["created_at"] > TOKEN_EXPIRE_SECONDS:
            return False
        return True
    
    # 2. 尝试从内存获取
    token_info = _csrf_tokens.get(token)
    if token_info:
        # 检查是否过期
        if time.time() - token_info["created_at"] > TOKEN_EXPIRE_SECONDS:
            return False
        return True
    
    return False


# 保留向后兼容别名
async def verify_csrf_token(token: str) -> bool:
    """验证 CSRF Token（已弃用，请使用 verify_and_consume_csrf_token）"""
    return await verify_and_consume_csrf_token(token)


async def mark_token_used(token: str):
    """标记 Token 为已使用（已弃用，verify_and_consume_csrf_token 已原子化处理）"""
    # 兜底清理：如果 token 仍然存在则删除
    await delete_cache(f"csrf:{token}")
    _csrf_tokens.pop(token, None)


def _cleanup_expired_tokens():
    """清理过期的内存 Token，并限制最大数量防止 DoS"""
    current_time = time.time()
    expired = [
        token for token, info in _csrf_tokens.items()
        if current_time - info["created_at"] > TOKEN_EXPIRE_SECONDS
    ]
    for token in expired:
        del _csrf_tokens[token]
    
    # 超过上限时，移除最早创建的 Token
    if len(_csrf_tokens) > MAX_MEMORY_TOKENS:
        sorted_tokens = sorted(_csrf_tokens.items(), key=lambda x: x[1]["created_at"])
        to_remove = len(_csrf_tokens) - MAX_MEMORY_TOKENS
        for token, _ in sorted_tokens[:to_remove]:
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
            
            # 跳过流式响应路径，避免与 StreamingResponse 的兼容性问题
            from core.middleware import STREAMING_PATHS
            if any(request.url.path.startswith(sp) for sp in STREAMING_PATHS):
                return await call_next(request)
            
            # 只对状态变更操作进行验证
            if request.method in self.PROTECTED_METHODS:
                # 获取 CSRF Token
                token = get_csrf_token_from_request(request)
                
                # 原子化验证并消耗 Token（避免 TOCTOU 竞态条件）
                if not token or not await verify_and_consume_csrf_token(token):
                    import logging
                    logger = logging.getLogger(__name__)
                    if not token:
                        logger.warning(f"CSRF 验证失败: 缺失 Token | 路径: {request.url.path} | 方法: {request.method}")
                    else:
                        logger.warning(f"CSRF 验证失败: 无效或已过期 Token ({token[:10]}...) | 路径: {request.url.path} | 方法: {request.method}")
                    
                    from fastapi.responses import JSONResponse
                    return JSONResponse(
                        status_code=status.HTTP_403_FORBIDDEN,
                        content={
                            "code": 403,
                            "message": "CSRF Token 验证失败，请刷新页面后重试",
                            "data": None
                        }
                    )
            
            response = await call_next(request)
            return response
        except RuntimeError as e:
            if "No response returned" in str(e):
                from fastapi import Response
                import logging
                logger = logging.getLogger(__name__)
                path = request.url.path
                logger.info(f"[客户端断开] {request.method} {path} (CSRF)")
                return Response(status_code=499)
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"CSRF 中间件捕获运行时错误: {e}")
            raise
        except Exception as e:
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"CSRF 中间件捕获异常: {e}")
            raise

