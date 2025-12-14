"""
文本处理工具
"""

import re
import time
import hashlib


def generate_slug(text: str, unique: bool = True) -> str:
    """
    生成URL友好的slug
    
    Args:
        text: 原始文本
        unique: 是否添加时间戳确保唯一
    
    Returns:
        slug字符串
    """
    if not text:
        return ""
    
    # 转小写
    slug = text.lower()
    # 替换空格和特殊字符为横线
    slug = re.sub(r'[^\w\u4e00-\u9fa5]+', '-', slug)
    # 合并连续横线
    slug = re.sub(r'-+', '-', slug)
    # 去除首尾横线
    slug = slug.strip('-')
    
    # 添加时间戳确保唯一
    if unique:
        suffix = int(time.time() * 1000) % 100000
        slug = f"{slug}-{suffix}"
    
    return slug


def truncate(text: str, length: int, suffix: str = "...") -> str:
    """
    截取文本
    
    Args:
        text: 原始文本
        length: 最大长度
        suffix: 省略后缀
    
    Returns:
        截取后的文本
    """
    if not text or len(text) <= length:
        return text or ""
    return text[:length] + suffix


def md5(text: str) -> str:
    """计算MD5哈希"""
    return hashlib.md5(text.encode()).hexdigest()


def mask_email(email: str) -> str:
    """
    隐藏邮箱中间部分
    例: test@example.com -> t***@example.com
    """
    if not email or "@" not in email:
        return email or ""
    
    local, domain = email.split("@", 1)
    if len(local) <= 2:
        masked = local[0] + "***"
    else:
        masked = local[0] + "***" + local[-1]
    
    return f"{masked}@{domain}"



