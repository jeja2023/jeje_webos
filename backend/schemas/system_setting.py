"""
系统设置相关Schema
"""

from typing import Optional
from pydantic import BaseModel, Field


class SystemSettingInfo(BaseModel):
    """系统设置"""
    theme_mode: str = Field("dark", description="主题模式：auto|light|dark")
    password_min_length: int = Field(8, ge=4, le=128)
    jwt_expire_minutes: int = Field(60 * 24 * 7, ge=15, le=60 * 24 * 30)
    login_fail_lock: int = Field(5, ge=3, le=20, description="连续登录失败锁定阈值")
    jwt_rotate_enabled: bool = True


class SystemSettingUpdate(BaseModel):
    """更新系统设置"""
    theme_mode: Optional[str] = Field(None, description="auto|light|dark")
    password_min_length: Optional[int] = Field(None, ge=4, le=128)
    jwt_expire_minutes: Optional[int] = Field(None, ge=15, le=60 * 24 * 30)
    login_fail_lock: Optional[int] = Field(None, ge=3, le=20)
    jwt_rotate_enabled: Optional[bool] = None

