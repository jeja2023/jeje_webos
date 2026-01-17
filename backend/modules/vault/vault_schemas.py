# -*- coding: utf-8 -*-
"""
密码保险箱数据验证模式
"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, ConfigDict, Field


# ============ 主密码 ============

class MasterKeyCreate(BaseModel):
    """创建主密码"""
    master_password: str = Field(..., min_length=6, max_length=100, description="主密码")


class MasterKeyVerify(BaseModel):
    """验证主密码"""
    master_password: str = Field(..., min_length=1, max_length=100, description="主密码")


class MasterKeyChange(BaseModel):
    """修改主密码"""
    old_password: str = Field(..., min_length=1, max_length=100, description="旧主密码")
    new_password: str = Field(..., min_length=6, max_length=100, description="新主密码")


class MasterKeyStatus(BaseModel):
    """主密码状态"""
    has_master_key: bool
    is_unlocked: bool = False
    is_locked: bool = False


class MasterKeyRecover(BaseModel):
    """使用恢复码重置主密码"""
    recovery_key: str = Field(..., min_length=20, max_length=40, description="恢复码")
    new_password: str = Field(..., min_length=8, max_length=100, description="新主密码")


# ============ 分类 ============

class CategoryCreate(BaseModel):
    """创建分类"""
    name: str = Field(..., min_length=1, max_length=100)
    icon: str = Field(default="📁", max_length=50)
    color: str = Field(default="#3b82f6", max_length=20)
    order: int = 0


class CategoryUpdate(BaseModel):
    """更新分类"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    icon: Optional[str] = Field(None, max_length=50)
    color: Optional[str] = Field(None, max_length=20)
    order: Optional[int] = None


class CategoryInfo(BaseModel):
    """分类信息"""
    id: int
    name: str
    icon: str
    color: str
    order: int
    item_count: int = 0
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


# ============ 密码条目 ============

class ItemCreate(BaseModel):
    """创建密码条目"""
    title: str = Field(..., min_length=1, max_length=200)
    website: Optional[str] = Field(None, max_length=500)
    username: str = Field(..., min_length=1, description="用户名（明文，会被加密存储）")
    password: str = Field(..., min_length=1, description="密码（明文，会被加密存储）")
    notes: Optional[str] = Field(None, description="备注（明文，会被加密存储）")
    category_id: Optional[int] = None
    is_starred: bool = False


class ItemUpdate(BaseModel):
    """更新密码条目"""
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    website: Optional[str] = Field(None, max_length=500)
    username: Optional[str] = Field(None, min_length=1, description="用户名")
    password: Optional[str] = Field(None, min_length=1, description="密码")
    notes: Optional[str] = None
    category_id: Optional[int] = None
    is_starred: Optional[bool] = None


class ItemInfo(BaseModel):
    """密码条目信息（不含敏感数据）"""
    id: int
    title: str
    website: Optional[str]
    category_id: Optional[int]
    category_name: Optional[str] = None
    is_starred: bool
    last_used_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class ItemDetail(BaseModel):
    """密码条目详情（含解密后的敏感数据）"""
    id: int
    title: str
    website: Optional[str]
    username: str  # 解密后的用户名
    password: str  # 解密后的密码
    notes: Optional[str]  # 解密后的备注
    category_id: Optional[int]
    category_name: Optional[str] = None
    is_starred: bool
    last_used_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class ItemMove(BaseModel):
    """移动条目"""
    category_id: Optional[int] = None  # None表示移动到未分类


# ============ 密码生成 ============

class PasswordGenerateRequest(BaseModel):
    """密码生成请求"""
    length: int = Field(default=16, ge=8, le=64, description="密码长度")
    include_uppercase: bool = Field(default=True, description="包含大写字母")
    include_lowercase: bool = Field(default=True, description="包含小写字母")
    include_numbers: bool = Field(default=True, description="包含数字")
    include_symbols: bool = Field(default=True, description="包含特殊符号")
    exclude_ambiguous: bool = Field(default=False, description="排除易混淆字符")


class PasswordGenerateResponse(BaseModel):
    """密码生成响应"""
    password: str
    strength: str  # weak, medium, strong, very_strong
