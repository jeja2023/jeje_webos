"""
{模块名称}模块API路由
定义 RESTful API 接口

使用说明：
1. 将此文件重命名为 {module_id}_router.py
2. 替换所有占位符
"""

import logging
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

# 核心依赖
from core.database import get_db
from core.security import get_current_user, require_permission, TokenData
from core.errors import NotFoundException, success_response, ErrorCode
from core.pagination import create_page_response

# 模块内部导入
from .{module_id}_schemas import (
    {ModuleName}Create,
    {ModuleName}Update,
    {ModuleName}Response,
)
from .{module_id}_services import {ModuleName}Service

logger = logging.getLogger(__name__)

# 路由器（不设置 prefix，由 loader 自动添加）
router = APIRouter()


# ==================== 列表查询 ====================

@router.get("", response_model=dict, summary="获取列表")
async def get_list(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    keyword: Optional[str] = Query(None, description="搜索关键词"),
    is_active: Optional[bool] = Query(None, description="是否启用"),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """
    获取{模块名称}列表
    
    - 支持分页
    - 支持关键词搜索
    - 支持状态筛选
    - 数据按用户隔离
    """
    items, total = await {ModuleName}Service.get_list(
        db,
        user_id=user.user_id,
        page=page,
        page_size=page_size,
        keyword=keyword,
        is_active=is_active
    )
    
    return create_page_response(
        items=[{ModuleName}Response.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        message="获取成功"
    )


# ==================== 详情查询 ====================

@router.get("/{item_id}", response_model=dict, summary="获取详情")
async def get_detail(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取{模块名称}详情"""
    item = await {ModuleName}Service.get_by_id(db, item_id, user.user_id)
    if not item:
        raise NotFoundException("{模块名称}", item_id)
    
    return success_response(
        data={ModuleName}Response.model_validate(item),
        message="获取成功"
    )


# ==================== 创建 ====================

@router.post("", response_model=dict, summary="创建")
async def create(
    data: {ModuleName}Create,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("{module_id}.create"))
):
    """
    创建{模块名称}
    
    需要权限：{module_id}.create
    """
    item = await {ModuleName}Service.create(db, user.user_id, data)
    await db.commit()
    
    return success_response(
        data={ModuleName}Response.model_validate(item),
        message="创建成功"
    )


# ==================== 更新 ====================

@router.put("/{item_id}", response_model=dict, summary="更新")
async def update(
    item_id: int,
    data: {ModuleName}Update,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("{module_id}.update"))
):
    """
    更新{模块名称}
    
    需要权限：{module_id}.update
    """
    item = await {ModuleName}Service.update(db, item_id, data, user.user_id)
    if not item:
        raise NotFoundException("{模块名称}", item_id)
    
    await db.commit()
    
    return success_response(
        data={ModuleName}Response.model_validate(item),
        message="更新成功"
    )


# ==================== 删除 ====================

@router.delete("/{item_id}", response_model=dict, summary="删除")
async def delete(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("{module_id}.delete"))
):
    """
    删除{模块名称}
    
    需要权限：{module_id}.delete
    """
    success = await {ModuleName}Service.delete(db, item_id, user.user_id)
    if not success:
        raise NotFoundException("{模块名称}", item_id)
    
    await db.commit()
    
    return success_response(message="删除成功")


# ==================== 批量操作示例 ====================

@router.post("/batch-delete", response_model=dict, summary="批量删除")
async def batch_delete(
    ids: list[int],
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("{module_id}.delete"))
):
    """批量删除{模块名称}"""
    deleted_count = 0
    for item_id in ids:
        if await {ModuleName}Service.delete(db, item_id, user.user_id):
            deleted_count += 1
    
    await db.commit()
    
    return success_response(
        data={"deleted": deleted_count},
        message=f"成功删除 {deleted_count} 条记录"
    )







