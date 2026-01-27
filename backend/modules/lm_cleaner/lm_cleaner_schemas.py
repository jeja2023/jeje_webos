"""
NotebookLM水印清除模块数据验证
定义请求/响应的数据结构
"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field


# ==================== 基础模型 ====================

class LmCleanerBase(BaseModel):
    """基础数据模型"""
    title: str = Field(..., min_length=1, max_length=200, description="标题")
    content: Optional[str] = Field(None, description="内容")
    source_file: Optional[str] = Field(None, description="原始文件路径")


class LmCleanerCreate(LmCleanerBase):
    """创建请求"""
    pass


class LmCleanerUpdate(BaseModel):
    """更新请求"""
    title: Optional[str] = Field(None, min_length=1, max_length=200, description="标题")
    content: Optional[str] = Field(None, description="内容")
    source_file: Optional[str] = Field(None, description="原始文件路径")
    is_active: Optional[bool] = Field(None, description="是否启用")


class LmCleanerResponse(LmCleanerBase):
    """响应模型"""
    id: int = Field(..., description="ID")
    user_id: int = Field(..., description="用户ID")
    is_active: bool = Field(..., description="是否启用")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")
    
    model_config = ConfigDict(from_attributes=True)


class LmCleanerListResponse(BaseModel):
    """列表响应"""
    items: List[LmCleanerResponse] = Field(..., description="数据列表")
    total: int = Field(..., description="总数")
    page: int = Field(..., description="当前页")
    page_size: int = Field(..., description="每页数量")
