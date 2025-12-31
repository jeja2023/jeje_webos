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
    """
    错误响应
    
    支持两种调用方式：
    1. error(message="错误信息") - 使用默认 code=400
    2. error(404, "资源不存在") - 位置参数
    3. error(code=404, message="资源不存在") - 关键字参数
    """
    # 如果第一个参数是字符串，将其作为 message
    if isinstance(code, str):
        message = code
        code = 400
    
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



