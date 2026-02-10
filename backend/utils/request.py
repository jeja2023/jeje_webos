"""
HTTP请求工具
"""

import re
from fastapi import Request

# 合法 IP 地址格式（IPv4 基础验证，防止日志注入和伪造垃圾值）
_IP_PATTERN = re.compile(
    r'^(\d{1,3}\.){3}\d{1,3}$'  # IPv4
    r'|^[0-9a-fA-F:]+$'          # IPv6（宽松匹配）
)


def _sanitize_ip(ip: str) -> str:
    """
    清洗 IP 地址：去除空白并验证基本格式
    防止通过 X-Forwarded-For 注入恶意值（如换行符、超长字符串）
    """
    ip = ip.strip()[:45]  # IPv6 最长 45 字符
    if _IP_PATTERN.match(ip):
        return ip
    return ""


def get_client_ip(request: Request) -> str:
    """
    获取客户端真实IP
    
    支持代理服务器（Nginx等）转发的请求
    注意：X-Forwarded-For 可被客户端伪造，生产环境应在反向代理层重写此头
    
    Args:
        request: FastAPI请求对象
    
    Returns:
        客户端IP地址
    """
    # 优先使用 X-Real-IP（通常由可信反向代理设置，更难伪造）
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        sanitized = _sanitize_ip(real_ip)
        if sanitized:
            return sanitized
    
    # 尝试从 X-Forwarded-For 获取（取第一个 IP）
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        first_ip = forwarded.split(",")[0]
        sanitized = _sanitize_ip(first_ip)
        if sanitized:
            return sanitized
    
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
