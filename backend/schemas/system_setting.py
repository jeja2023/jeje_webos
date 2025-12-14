"""
系统设置相关Schema
"""

from typing import Optional, Literal
from pydantic import BaseModel, Field


class SystemSettingInfo(BaseModel):
    """系统设置"""
    theme_mode: str = Field("dark", description="主题模式：auto|light|dark|sunrise")
    password_min_length: int = Field(8, ge=4, le=128)
    jwt_expire_minutes: int = Field(60 * 24 * 7, ge=15, le=60 * 24 * 30)
    login_fail_lock: int = Field(5, ge=3, le=20, description="连续登录失败锁定阈值")
    jwt_rotate_enabled: bool = True
    rate_limit_requests: int = Field(200, ge=1, le=10000)
    rate_limit_window: int = Field(60, ge=1, le=3600)
    rate_limit_block_duration: int = Field(30, ge=1, le=3600)


class SystemSettingUpdate(BaseModel):
    """更新系统设置"""
    theme_mode: Optional[str] = Field(None, description="auto|light|dark|sunrise")
    password_min_length: Optional[int] = Field(None, ge=4, le=128)
    jwt_expire_minutes: Optional[int] = Field(None, ge=15, le=60 * 24 * 30)
    login_fail_lock: Optional[int] = Field(None, ge=3, le=20)
    jwt_rotate_enabled: Optional[bool] = None
    rate_limit_requests: Optional[int] = Field(None, ge=1)
    rate_limit_window: Optional[int] = Field(None, ge=1)
    rate_limit_block_duration: Optional[int] = Field(None, ge=1)
