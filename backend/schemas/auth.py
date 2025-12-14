"""
认证数据验证
用户注册、登录、信息等
"""

import re
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, field_validator, model_validator


def validate_password_complexity(password: str) -> None:
    """
    验证密码复杂度
    
    要求：
    - 至少 8 个字符
    - 至少包含一个大写字母
    - 至少包含一个小写字母
    - 至少包含一个数字
    - 至少包含一个特殊字符 (!@#$%^&*)
    """
    if len(password) < 8:
        raise ValueError('密码长度至少需要 8 个字符')
    
    has_upper = any(c.isupper() for c in password)
    has_lower = any(c.islower() for c in password)
    has_digit = any(c.isdigit() for c in password)
    has_special = any(c in '!@#$%^&*' for c in password)
    
    errors = []
    if not has_upper:
        errors.append('至少包含一个大写字母')
    if not has_lower:
        errors.append('至少包含一个小写字母')
    if not has_digit:
        errors.append('至少包含一个数字')
    if not has_special:
        errors.append('至少包含一个特殊字符 (!@#$%^&*)')
    
    if errors:
        raise ValueError('密码复杂度不足：' + '、'.join(errors))


class UserCreate(BaseModel):
    """用户注册"""
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=8, max_length=50)
    confirm_password: str = Field(..., min_length=8, max_length=50)  # 确认密码
    phone: str = Field(..., min_length=11, max_length=11)  # 手机号码（必填）
    nickname: Optional[str] = None
    
    @field_validator('password')
    @classmethod
    def validate_password(cls, v):
        """验证密码复杂度"""
        validate_password_complexity(v)
        return v
    
    @field_validator('confirm_password')
    @classmethod
    def passwords_match(cls, v, info):
        """验证两次密码是否一致"""
        if 'password' in info.data and v != info.data['password']:
            raise ValueError('两次输入的密码不一致')
        return v
    
    @field_validator('phone')
    @classmethod
    def validate_phone(cls, v):
        """验证手机号码格式"""
        if not re.match(r'^1[3-9]\d{9}$', v):
            raise ValueError('请输入正确的11位手机号码')
        return v


class UserLogin(BaseModel):
    """用户登录"""
    username: str
    password: str


class UserUpdate(BaseModel):
    """用户更新"""
    nickname: Optional[str] = None
    phone: Optional[str] = Field(None, max_length=11)
    avatar: Optional[str] = None
    
    @field_validator('phone')
    @classmethod
    def validate_phone(cls, v):
        """验证手机号码格式"""
        if v is not None and v != '':
            if not re.match(r'^1[3-9]\d{9}$', v):
                raise ValueError('请输入正确的11位手机号码')
        return v if v else None


class UserInfo(BaseModel):
    """用户信息"""
    id: int
    username: str
    phone: Optional[str] = None
    nickname: Optional[str] = None
    avatar: Optional[str] = None
    role: str
    permissions: List[str] = []
    is_active: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


class PasswordChange(BaseModel):
    """修改密码"""
    old_password: str
    new_password: str = Field(..., min_length=8)
    confirm_password: str = Field(..., min_length=8)  # 确认密码
    
    @field_validator('new_password')
    @classmethod
    def validate_password(cls, v):
        """验证密码复杂度"""
        validate_password_complexity(v)
        return v
    
    @field_validator('confirm_password')
    @classmethod
    def passwords_match(cls, v, info):
        """验证两次密码是否一致"""
        if 'new_password' in info.data and v != info.data['new_password']:
            raise ValueError('两次输入的密码不一致')
        return v


