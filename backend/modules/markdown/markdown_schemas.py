# -*- coding: utf-8 -*-
"""
Markdown 文档数据验证模型
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


# 文档相关 Schema

class MarkdownDocCreate(BaseModel):
    """创建文档请求"""
    title: str = Field(..., min_length=1, max_length=200, description="文档标题")
    content: Optional[str] = Field(default="", description="Markdown内容")
    summary: Optional[str] = Field(default="", max_length=500, description="文档摘要")
    is_public: Optional[bool] = Field(default=False, description="是否公开")


class MarkdownDocUpdate(BaseModel):
    """更新文档请求"""
    title: Optional[str] = Field(None, min_length=1, max_length=200, description="文档标题")
    content: Optional[str] = Field(None, description="Markdown内容")
    summary: Optional[str] = Field(None, max_length=500, description="文档摘要")
    is_public: Optional[bool] = Field(None, description="是否公开")
    is_starred: Optional[bool] = Field(None, description="是否收藏")


class MarkdownDocResponse(BaseModel):
    """文档响应"""
    id: int
    user_id: int
    title: str
    content: str
    summary: str
    is_public: bool
    is_starred: bool
    view_count: int
    created_at: datetime
    updated_at: datetime
    username: Optional[str] = None
    
    class Config:
        from_attributes = True


class MarkdownDocListItem(BaseModel):
    """文档列表项"""
    id: int
    title: str
    summary: str
    is_public: bool
    is_starred: bool
    view_count: int
    created_at: datetime
    updated_at: datetime
    username: Optional[str] = None
    
    class Config:
        from_attributes = True


# 模板相关 Schema

class MarkdownTemplateCreate(BaseModel):
    """创建模板请求"""
    name: str = Field(..., min_length=1, max_length=100, description="模板名称")
    description: Optional[str] = Field(default="", max_length=300, description="模板描述")
    content: str = Field(..., description="模板内容")


class MarkdownTemplateUpdate(BaseModel):
    """更新模板请求"""
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="模板名称")
    description: Optional[str] = Field(None, max_length=300, description="模板描述")
    content: Optional[str] = Field(None, description="模板内容")


class MarkdownTemplateResponse(BaseModel):
    """模板响应"""
    id: int
    name: str
    description: str
    content: str
    is_system: bool
    created_at: datetime
    
    class Config:
        from_attributes = True


# 导出相关 Schema

class MarkdownExportRequest(BaseModel):
    """导出请求"""
    format: str = Field(default="html", description="导出格式: html, pdf")
    include_toc: Optional[bool] = Field(default=True, description="是否包含目录")
