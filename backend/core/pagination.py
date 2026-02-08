"""
统一分页工具
提供标准化的分页查询功能
"""

import math
from typing import TypeVar, Generic, List, Optional, Any, Callable
from dataclasses import dataclass, field
from pydantic import BaseModel, ConfigDict, Field

from sqlalchemy import func, select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Query

T = TypeVar('T')


class PaginationParams(BaseModel):
    """分页参数"""
    page: int = Field(default=1, ge=1, description="页码，从1开始")
    page_size: int = Field(default=20, ge=1, le=100, description="每页数量，最大100")
    
    @property
    def offset(self) -> int:
        """计算偏移量"""
        return (self.page - 1) * self.page_size
    
    @property
    def limit(self) -> int:
        """获取限制数量"""
        return self.page_size


class PageResult(BaseModel, Generic[T]):
    """
    分页结果
    
    泛型类，可指定 items 的类型
    """
    items: List[Any] = Field(description="数据列表")
    total: int = Field(description="总记录数")
    page: int = Field(description="当前页码")
    page_size: int = Field(description="每页数量")
    total_pages: int = Field(description="总页数")
    has_next: bool = Field(description="是否有下一页")
    has_prev: bool = Field(description="是否有上一页")
    
    model_config = ConfigDict(arbitrary_types_allowed=True)
    
    @classmethod
    def create(
        cls,
        items: List[Any],
        total: int,
        page: int,
        page_size: int
    ) -> "PageResult":
        """创建分页结果"""
        total_pages = math.ceil(total / page_size) if page_size > 0 else 0
        return cls(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            total_pages=total_pages,
            has_next=page < total_pages,
            has_prev=page > 1
        )
    
    def to_dict(self) -> dict:
        """转换为字典（用于API响应）"""
        return {
            "items": self.items,
            "pagination": {
                "total": self.total,
                "page": self.page,
                "page_size": self.page_size,
                "total_pages": self.total_pages,
                "has_next": self.has_next,
                "has_prev": self.has_prev
            }
        }


async def paginate(
    db: AsyncSession,
    query,
    page: int = 1,
    page_size: int = 20,
    transformer: Optional[Callable] = None
) -> PageResult:
    """
    通用分页查询
    
    Args:
        db: 数据库会话
        query: SQLAlchemy 查询对象
        page: 页码（从1开始）
        page_size: 每页数量
        transformer: 可选的数据转换函数，用于将ORM对象转换为字典或其他格式
    
    Returns:
        PageResult: 分页结果
    
    Usage:
        # 基本用法
        query = select(User).where(User.is_active == True)
        result = await paginate(db, query, page=1, page_size=20)
        
        # 带转换器
        result = await paginate(
            db, query, page=1, page_size=20,
            transformer=lambda user: {"id": user.id, "name": user.username}
        )
    """
    # 计算总数（基于原始查询构建 count，避免不必要的子查询开销）
    # 对于简单查询直接 count，对于含 GROUP BY/DISTINCT 的查询使用子查询
    try:
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await db.execute(count_query)
        total = total_result.scalar() or 0
    except Exception:
        # 降级方案：使用子查询
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await db.execute(count_query)
        total = total_result.scalar() or 0
    
    # 计算偏移量
    offset = (page - 1) * page_size
    
    # 执行分页查询
    paginated_query = query.offset(offset).limit(page_size)
    result = await db.execute(paginated_query)
    items = result.scalars().all()
    
    # 应用转换器
    if transformer:
        items = [transformer(item) for item in items]
    
    return PageResult.create(
        items=items,
        total=total,
        page=page,
        page_size=page_size
    )


async def paginate_list(
    items: List[Any],
    page: int = 1,
    page_size: int = 20,
    transformer: Optional[Callable] = None
) -> PageResult:
    """
    对内存中的列表进行分页
    
    Args:
        items: 数据列表
        page: 页码（从1开始）
        page_size: 每页数量
        transformer: 可选的数据转换函数
    
    Returns:
        PageResult: 分页结果
    
    Usage:
        # 对内存列表分页
        all_items = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
        result = await paginate_list(all_items, page=2, page_size=3)
        # result.items = [4, 5, 6]
    """
    total = len(items)
    offset = (page - 1) * page_size
    
    # 切片获取当前页数据
    page_items = items[offset:offset + page_size]
    
    # 应用转换器
    if transformer:
        page_items = [transformer(item) for item in page_items]
    
    return PageResult.create(
        items=page_items,
        total=total,
        page=page,
        page_size=page_size
    )


class Paginator:
    """
    分页器类
    
    提供更灵活的分页配置和使用方式
    
    Usage:
        paginator = Paginator(default_page_size=15, max_page_size=50)
        
        @router.get("/users")
        async def get_users(
            page: int = 1,
            page_size: int = 15,
            db: AsyncSession = Depends(get_db)
        ):
            query = select(User)
            return await paginator.paginate(db, query, page, page_size)
    """
    
    def __init__(
        self,
        default_page_size: int = 20,
        max_page_size: int = 100,
        min_page_size: int = 1
    ):
        self.default_page_size = default_page_size
        self.max_page_size = max_page_size
        self.min_page_size = min_page_size
    
    def _normalize_params(self, page: int, page_size: Optional[int]) -> tuple[int, int]:
        """规范化分页参数"""
        if page < 1:
            page = 1
        
        if page_size is None:
            page_size = self.default_page_size
        else:
            page_size = max(self.min_page_size, min(page_size, self.max_page_size))
        
        return page, page_size
    
    async def paginate(
        self,
        db: AsyncSession,
        query,
        page: int = 1,
        page_size: Optional[int] = None,
        transformer: Optional[Callable] = None
    ) -> PageResult:
        """执行分页查询"""
        page, page_size = self._normalize_params(page, page_size)
        return await paginate(db, query, page, page_size, transformer)
    
    async def paginate_list(
        self,
        items: List[Any],
        page: int = 1,
        page_size: Optional[int] = None,
        transformer: Optional[Callable] = None
    ) -> PageResult:
        """对列表分页"""
        page, page_size = self._normalize_params(page, page_size)
        return await paginate_list(items, page, page_size, transformer)


# 默认分页器实例
default_paginator = Paginator()


# ==================== 便捷函数 ====================

def get_pagination_params(
    page: int = 1,
    page_size: int = 20
) -> PaginationParams:
    """
    FastAPI 依赖注入函数
    
    Usage:
        @router.get("/items")
        async def get_items(
            pagination: PaginationParams = Depends(get_pagination_params)
        ):
            query = select(Item)
            return await paginate(db, query, pagination.page, pagination.page_size)
    """
    return PaginationParams(page=page, page_size=page_size)


def create_page_response(
    items: List[Any],
    total: int,
    page: int,
    page_size: int,
    message: str = "获取成功"
) -> dict:
    """
    创建标准分页响应
    
    Args:
        items: 数据列表
        total: 总记录数
        page: 当前页码
        page_size: 每页数量
        message: 响应消息
    
    Returns:
        标准 API 响应格式
    """
    result = PageResult.create(items, total, page, page_size)
    return {
        "code": 0,
        "message": message,
        "data": result.to_dict()
    }


async def paginate_model(
    db: AsyncSession,
    model,
    conditions: List[Any] = None,
    order_by = None,
    page: int = 1,
    page_size: int = 20,
    transformer: Optional[Callable] = None
) -> tuple[List[Any], int]:
    """
    通用模型分页查询助手
    
    封装了各模块中重复的分页逻辑，简化 Service 层代码。
    
    Args:
        db: 数据库会话
        model: SQLAlchemy 模型类
        conditions: 查询条件列表（使用 and_ 连接）
        order_by: 排序字段（如 Model.created_at.desc()）
        page: 页码（从1开始）
        page_size: 每页数量
        transformer: 可选的数据转换函数
    
    Returns:
        (items, total): 数据列表和总记录数的元组
    
    Usage:
        # 在 Service 中使用
        conditions = [User.is_active == True]
        if keyword:
            conditions.append(User.username.ilike(f"%{keyword}%"))
        
        items, total = await paginate_model(
            db, User, 
            conditions=conditions,
            order_by=User.created_at.desc(),
            page=page, 
            page_size=page_size
        )
    """
    # 构建计数查询
    count_query = select(func.count(model.id))
    if conditions:
        count_query = count_query.where(and_(*conditions))
    
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    
    # 构建数据查询
    query = select(model)
    if conditions:
        query = query.where(and_(*conditions))
    if order_by is not None:
        query = query.order_by(order_by)
    
    query = query.offset((page - 1) * page_size).limit(page_size)
    
    result = await db.execute(query)
    items = list(result.scalars().all())
    
    # 应用转换器
    if transformer:
        items = [transformer(item) for item in items]
    
    return items, total
