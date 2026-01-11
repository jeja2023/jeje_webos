# -*- coding: utf-8 -*-
"""
时区工具模块
统一使用东八区（北京时间）
"""

from datetime import datetime, timezone, timedelta

# 东八区时区对象
BEIJING_TZ = timezone(timedelta(hours=8))


def get_beijing_time() -> datetime:
    """
    获取当前北京时间（东八区）
    
    Returns:
        datetime: 带有东八区时区信息的当前时间
    """
    return datetime.now(BEIJING_TZ)


def to_beijing_time(dt: datetime) -> datetime:
    """
    将任意时间转换为北京时间
    
    Args:
        dt: 待转换的时间对象
        
    Returns:
        datetime: 转换后的北京时间
    """
    if dt is None:
        return None
    
    if dt.tzinfo is None:
        # 无时区信息，假设为本地时间，直接替换时区
        return dt.replace(tzinfo=BEIJING_TZ)
    else:
        # 有时区信息，进行时区转换
        return dt.astimezone(BEIJING_TZ)


def utc_to_beijing(dt: datetime) -> datetime:
    """
    将UTC时间转换为北京时间
    
    Args:
        dt: UTC时间对象
        
    Returns:
        datetime: 北京时间
    """
    if dt is None:
        return None
    
    if dt.tzinfo is None:
        # 无时区信息，假设为UTC
        dt = dt.replace(tzinfo=timezone.utc)
    
    return dt.astimezone(BEIJING_TZ)


def beijing_to_utc(dt: datetime) -> datetime:
    """
    将北京时间转换为UTC时间
    
    Args:
        dt: 北京时间对象
        
    Returns:
        datetime: UTC时间
    """
    if dt is None:
        return None
    
    if dt.tzinfo is None:
        # 无时区信息，假设为北京时间
        dt = dt.replace(tzinfo=BEIJING_TZ)
    
    return dt.astimezone(timezone.utc)
