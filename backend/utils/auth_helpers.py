"""
认证辅助工具
提供可复用的 Token 验证依赖函数
支持 HttpOnly Cookie：优先从 Cookie 读取，其次 Query（用于新窗口下载等）
"""

from typing import Optional
from fastapi import Query, Request
from core.config import get_settings
from core.security import TokenData, decode_token, COOKIE_ACCESS_TOKEN
from core.errors import AuthException, PermissionException, ErrorCode


def get_user_from_token(
    request: Request,
    token: Optional[str] = Query(None)
) -> TokenData:
    """
    从 Cookie 或 URL query 参数中获取 token 并验证
    HttpOnly Cookie 模式下优先读 Cookie；否则或用于新窗口下载时可用 query token
    """
    jwt_token = None
    if get_settings().auth_use_httponly_cookie:
        jwt_token = request.cookies.get(COOKIE_ACCESS_TOKEN)
    if not jwt_token:
        jwt_token = token
    if not jwt_token:
        raise AuthException(ErrorCode.UNAUTHORIZED, "未认证")
    
    token_data = decode_token(jwt_token)
    if not token_data:
        raise AuthException(ErrorCode.TOKEN_INVALID, "无效的令牌")
    
    return token_data


def get_admin_from_token(
    request: Request,
    token: Optional[str] = Query(None)
) -> TokenData:
    """
    从 Cookie 或 URL query 获取 token 并验证管理员权限
    用于管理后台的文件下载等场景
    """
    token_data = get_user_from_token(request, token)
    
    if token_data.role != "admin":
        raise PermissionException("仅系统管理员可执行此操作")
    
    return token_data
