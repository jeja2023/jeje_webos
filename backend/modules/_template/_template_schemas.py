"""
模块数据验证模板

使用说明：
1. 复制此文件并重命名为 xxx_schemas.py
2. 替换所有 Template 等占位符
3. 根据实际需求定义数据验证规则
"""

from typing import Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class TemplateCreate(BaseModel):
    """创建示例"""
    title: str = Field(..., min_length=1, max_length=200, description="标题")
    content: Optional[str] = Field(None, description="内容")


class TemplateUpdate(BaseModel):
    """更新示例"""
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    content: Optional[str] = None
    is_active: Optional[bool] = None


class TemplateInfo(BaseModel):
    """项目信息"""
    id: int
    title: str
    content: Optional[str]
    user_id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class TemplateListItem(BaseModel):
    """列表项"""
    id: int
    title: str
    user_id: int
    is_active: bool
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)
