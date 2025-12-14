"""
统一响应格式
API返回的标准JSON结构
"""

from typing import Any, Generic, TypeVar, Optional, List
from pydantic import BaseModel


T = TypeVar("T")


class ApiResponse(BaseModel, Generic[T]):
    """统一API响应"""
    code: int = 200
    message: str = "success"
    data: Optional[T] = None


class PageData(BaseModel, Generic[T]):
    """分页数据"""
    items: List[T]
    total: int
    page: int
    size: int
    pages: int


class ApiPageResponse(BaseModel, Generic[T]):
    """分页响应"""
    code: int = 200
    message: str = "success"
    data: Optional[PageData[T]] = None


def success(data: Any = None, message: str = "success") -> dict:
    """成功响应"""
    return {
        "code": 200,
        "message": message,
        "data": data
    }


def error(code: int = 400, message: str = "error", data: Any = None) -> dict:
    """错误响应"""
    return {
        "code": code,
        "message": message,
        "data": data
    }


def paginate(items: List, total: int, page: int, size: int) -> dict:
    """分页响应"""
    pages = (total + size - 1) // size if size > 0 else 0
    return {
        "code": 200,
        "message": "success",
        "data": {
            "items": items,
            "total": total,
            "page": page,
            "size": size,
            "pages": pages
        }
    }



