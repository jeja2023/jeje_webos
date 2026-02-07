"""
模块API路由模板定义

使用说明：
1. 将此文件重命名为 xxx_router.py
2. 替换所有 Template、xxx 等占位符
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

# 模块内部导入（在具体实现中取消注释并修改名称）
# from .xxx_schemas import TemplateCreate, TemplateUpdate, TemplateResponse
# from .xxx_services import TemplateService

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
    """获取列表"""
    # 示例实现
    # items, total = await TemplateService.get_list(db, ...)
    # return create_page_response(items=..., total=total, ...)
    return success_response(data={"items": [], "total": 0})


# ==================== 详情查询 ====================

@router.get("/{item_id}", response_model=dict, summary="获取详情")
async def get_detail(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取详情"""
    return success_response(data={})


# ==================== 创建 ====================

@router.post("", response_model=dict, summary="创建")
async def create(
    data: dict, # TemplateCreate
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("xxx.create"))
):
    """创建项目"""
    await db.commit()
    return success_response(data={})


# ==================== 更新 ====================

@router.put("/{item_id}", response_model=dict, summary="更新")
async def update(
    item_id: int,
    data: dict, # TemplateUpdate
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("xxx.update"))
):
    """更新项目"""
    await db.commit()
    return success_response(data={})


# ==================== 删除 ====================

@router.delete("/{item_id}", response_model=dict, summary="删除")
async def delete(
    item_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("xxx.delete"))
):
    """删除项目"""
    # await TemplateService.delete(db, item_id, user.user_id)
    await db.commit()
    return success_response(message="删除成功")
