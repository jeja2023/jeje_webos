"""
系统设置相关Schema
"""

from typing import Optional, Literal
from pydantic import BaseModel, Field, field_validator, model_validator


class SystemSettingInfo(BaseModel):
    """系统设置"""
    theme_mode: str = Field("neon", description="主题模式：sunrise|neon")
    password_min_length: int = Field(8, ge=4, le=128)
    jwt_expire_minutes: int = Field(60 * 24 * 7, ge=15, le=60 * 24 * 30)
    login_fail_lock: int = Field(5, ge=3, le=20, description="连续登录失败锁定阈值")
    jwt_rotate_enabled: bool = True
    rate_limit_requests: int = Field(200, ge=1, le=10000)
    rate_limit_window: int = Field(60, ge=1, le=3600)
    rate_limit_block_duration: int = Field(30, ge=1, le=3600)
    # AI 相关设置
    ai_online_api_key: Optional[str] = Field("sk-xxx", description="在线 AI API Key")
    ai_online_base_url: Optional[str] = Field("https://api.deepseek.com/v1", description="在线 AI API 地址")
    ai_online_model: Optional[str] = Field("deepseek-chat", description="在线 AI 模型名称")
    # ICP 备案信息
    icp_number: Optional[str] = Field("", description="ICP 备案号")
    icp_link: Optional[str] = Field("https://beian.miit.gov.cn/", description="ICP 备案查询链接")
    # 公安备案信息
    psb_number: Optional[str] = Field("", description="公安备案号")
    psb_link: Optional[str] = Field("", description="公安备案查询链接")
    
    @field_validator('theme_mode')
    @classmethod
    def validate_theme(cls, v):
        if v not in ('sunrise', 'neon'):
            raise ValueError("主题模式必须为 sunrise 或 neon")
        return v


class SystemSettingUpdate(BaseModel):
    """更新系统设置"""
    theme_mode: Optional[str] = Field(None, description="sunrise|neon")
    password_min_length: Optional[int] = Field(None, ge=4, le=128)
    jwt_expire_minutes: Optional[int] = Field(None, ge=15, le=60 * 24 * 30)
    login_fail_lock: Optional[int] = Field(None, ge=3, le=20)
    jwt_rotate_enabled: Optional[bool] = None
    rate_limit_requests: Optional[int] = Field(None, ge=1, le=10000)
    rate_limit_window: Optional[int] = Field(None, ge=1, le=3600)
    rate_limit_block_duration: Optional[int] = Field(None, ge=1, le=3600)
    
    # AI 相关设置
    ai_online_api_key: Optional[str] = None
    ai_online_base_url: Optional[str] = None
    ai_online_model: Optional[str] = None
    # ICP 备案信息
    icp_number: Optional[str] = None
    icp_link: Optional[str] = None
    # 公安备案信息
    psb_number: Optional[str] = None
    psb_link: Optional[str] = None
    
    @field_validator('theme_mode')
    @classmethod
    def validate_theme(cls, v):
        if v is not None and v not in ('sunrise', 'neon'):
            raise ValueError("主题模式必须为 sunrise 或 neon")
        return v
    
    @model_validator(mode='after')
    def validate_rate_limit(self):
        """验证速率限制参数的合理性"""
        if self.rate_limit_window is not None and self.rate_limit_block_duration is not None:
            if self.rate_limit_block_duration > self.rate_limit_window:
                raise ValueError("封禁时长不应超过速率限制窗口时长")
        return self