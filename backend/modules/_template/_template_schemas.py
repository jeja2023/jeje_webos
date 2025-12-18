"""
模块数据验证模板

使用说明：
1. 复制此文件并重命名为 {module_id}_schemas.py
2. 替换所有 {ModuleName} 等占位符
3. 根据实际需求定义数据验证规则
"""

from typing import Optional
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field


class {ModuleName}Create(BaseModel):
    """创建{模块名称}"""
    title: str = Field(..., min_length=1, max_length=200, description="标题")
    content: Optional[str] = Field(None, description="内容")


class {ModuleName}Update(BaseModel):
    """更新{模块名称}"""
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    content: Optional[str] = None
    is_active: Optional[bool] = None


class {ModuleName}Info(BaseModel):
    """{模块名称}信息"""
    id: int
    title: str
    content: Optional[str]
    user_id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class {ModuleName}ListItem(BaseModel):
    """{模块名称}列表项"""
    id: int
    title: str
    user_id: int
    is_active: bool
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)










