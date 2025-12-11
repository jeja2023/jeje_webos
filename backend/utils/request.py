"""
HTTP请求工具
"""

from fastapi import Request


def get_client_ip(request: Request) -> str:
    """
    获取客户端真实IP
    
    支持代理服务器（Nginx等）转发的请求
    
    Args:
        request: FastAPI请求对象
    
    Returns:
        客户端IP地址
    """
    # 尝试从代理头获取（Nginx配置：proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for）
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        # 取第一个IP（最原始的客户端IP）
        return forwarded.split(",")[0].strip()
    
    # 尝试X-Real-IP头（Nginx配置：proxy_set_header X-Real-IP $remote_addr）
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip
    
    # 直接连接，获取socket地址
    if request.client:
        return request.client.host
    
    return "unknown"


def get_user_agent(request: Request) -> str:
    """获取用户代理"""
    return request.headers.get("User-Agent", "")


def is_ajax(request: Request) -> bool:
    """判断是否为AJAX请求"""
    return request.headers.get("X-Requested-With") == "XMLHttpRequest"



