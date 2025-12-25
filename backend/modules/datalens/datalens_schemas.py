"""
DataLens 数据透镜模块 - 数据校验模型
定义 API 请求和响应的 Pydantic 模型
"""

from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum


# ==================== 枚举类型 ====================

class DataSourceType(str, Enum):
    """数据源类型"""
    MYSQL = "mysql"
    POSTGRES = "postgres"
    SQLSERVER = "sqlserver"
    ORACLE = "oracle"
    SQLITE = "sqlite"
    CSV = "csv"
    EXCEL = "excel"
    API = "api"


class QueryType(str, Enum):
    """查询类型"""
    SQL = "sql"
    TABLE = "table"
    API = "api"


# ==================== 数据源相关 ====================

class DataSourceBase(BaseModel):
    """数据源基础模型"""
    name: str = Field(..., min_length=1, max_length=100, description="数据源名称")
    type: DataSourceType = Field(..., description="数据源类型")
    description: Optional[str] = Field(None, max_length=500, description="描述")


class DataSourceCreate(DataSourceBase):
    """创建数据源请求"""
    # 数据库连接配置
    connection_config: Optional[Dict[str, Any]] = Field(None, description="数据库连接配置")
    # 文件配置
    file_config: Optional[Dict[str, Any]] = Field(None, description="文件配置")
    # API 配置
    api_config: Optional[Dict[str, Any]] = Field(None, description="API配置")


class DataSourceUpdate(BaseModel):
    """更新数据源请求"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    connection_config: Optional[Dict[str, Any]] = None
    file_config: Optional[Dict[str, Any]] = None
    api_config: Optional[Dict[str, Any]] = None
    is_active: Optional[bool] = None


class DataSourceResponse(DataSourceBase):
    """数据源响应"""
    id: int
    is_active: bool
    last_connected_at: Optional[datetime] = None
    last_error: Optional[str] = None
    created_by: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DataSourceTestRequest(BaseModel):
    """测试数据源连接请求"""
    type: DataSourceType
    connection_config: Optional[Dict[str, Any]] = None
    file_config: Optional[Dict[str, Any]] = None
    api_config: Optional[Dict[str, Any]] = None


# ==================== 分类相关 ====================

class CategoryBase(BaseModel):
    """分类基础模型"""
    name: str = Field(..., min_length=1, max_length=50, description="分类名称")
    icon: str = Field("📂", max_length=10, description="图标")
    color: Optional[str] = Field(None, max_length=20, description="颜色")
    order: int = Field(0, ge=0, description="排序权重")
    parent_id: Optional[int] = Field(None, description="父分类ID")


class CategoryCreate(CategoryBase):
    """创建分类请求"""
    pass


class CategoryUpdate(BaseModel):
    """更新分类请求"""
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    icon: Optional[str] = Field(None, max_length=10)
    color: Optional[str] = Field(None, max_length=20)
    order: Optional[int] = Field(None, ge=0)
    parent_id: Optional[int] = None


class CategoryResponse(CategoryBase):
    """分类响应"""
    id: int
    created_at: datetime
    updated_at: datetime
    view_count: int = 0  # 该分类下的视图数量

    class Config:
        from_attributes = True


# ==================== 视图相关 ====================

class ViewBase(BaseModel):
    """视图基础模型"""
    name: str = Field(..., min_length=1, max_length=100, description="视图名称")
    description: Optional[str] = Field(None, max_length=500, description="描述")
    icon: str = Field("📊", max_length=10, description="图标")
    category_id: Optional[int] = Field(None, description="所属分类ID")


class ViewCreate(ViewBase):
    """创建视图请求"""
    datasource_id: Optional[int] = Field(None, description="数据源ID")
    query_type: QueryType = Field(QueryType.SQL, description="查询类型")
    query_config: Optional[Dict[str, Any]] = Field(None, description="查询配置")
    display_config: Optional[Dict[str, Any]] = Field(None, description="显示配置")
    status_config: Optional[Dict[str, Any]] = Field(None, description="状态配置")
    chart_config: Optional[Dict[str, Any]] = Field(None, description="图表配置")
    required_permission: Optional[str] = Field(None, max_length=50, description="所需权限")
    is_public: bool = Field(True, description="是否公开")


class ViewUpdate(BaseModel):
    """更新视图请求"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    icon: Optional[str] = Field(None, max_length=10)
    category_id: Optional[int] = None
    datasource_id: Optional[int] = None
    query_type: Optional[QueryType] = None
    query_config: Optional[Dict[str, Any]] = None
    display_config: Optional[Dict[str, Any]] = None
    status_config: Optional[Dict[str, Any]] = None
    chart_config: Optional[Dict[str, Any]] = None
    required_permission: Optional[str] = None
    is_public: Optional[bool] = None


class ViewResponse(ViewBase):
    """视图响应"""
    id: int
    datasource_id: Optional[int] = None
    query_type: str
    display_config: Optional[Dict[str, Any]] = None
    status_config: Optional[Dict[str, Any]] = None
    chart_config: Optional[Dict[str, Any]] = None
    required_permission: Optional[str] = None
    is_public: bool
    view_count: int
    created_by: int
    created_at: datetime
    updated_at: datetime
    # 额外信息
    is_favorited: bool = False  # 当前用户是否已收藏
    category_name: Optional[str] = None  # 分类名称
    datasource_name: Optional[str] = None  # 数据源名称

    class Config:
        from_attributes = True


class ViewDataRequest(BaseModel):
    """获取视图数据请求"""
    page: int = Field(1, ge=1, description="页码")
    page_size: int = Field(20, ge=1, le=100000, description="每页数量")
    # 单字段排序（兼容旧版）
    sort_field: Optional[str] = Field(None, description="排序字段")
    sort_order: Optional[str] = Field(None, description="排序方式: asc/desc")
    # 多字段排序: [{"field": "name", "order": "asc"}, {"field": "age", "order": "desc"}]
    sorts: Optional[List[Dict[str, str]]] = Field(None, description="多字段排序")
    # 筛选条件: {"field": {"op": "eq", "value": "xxx"}}
    # 支持的操作符: eq(等于), ne(不等于), gt(大于), gte(大于等于), lt(小于), lte(小于等于), 
    #              like(包含), notlike(不包含), in(在列表中), notin(不在列表中), 
    #              isnull(为空), notnull(不为空)
    filters: Optional[Dict[str, Any]] = Field(None, description="筛选条件")
    search: Optional[str] = Field(None, description="搜索关键词")


class ViewDataResponse(BaseModel):
    """视图数据响应"""
    columns: List[Dict[str, Any]]  # 列定义
    data: List[Dict[str, Any]]     # 数据行
    total: int                      # 总记录数
    page: int                       # 当前页
    page_size: int                  # 每页数量


class PreviewRequest(BaseModel):
    """预览请求"""
    datasource_id: int
    query_type: QueryType
    query_config: Optional[Dict[str, Any]] = None


# ==================== 收藏相关 ====================

class FavoriteResponse(BaseModel):
    """收藏响应"""
    id: int
    view_id: int
    view_name: str
    view_icon: str
    category_name: Optional[str] = None
    created_at: datetime


# ==================== 最近访问相关 ====================

class RecentViewResponse(BaseModel):
    """最近访问响应"""
    id: int
    view_id: int
    view_name: str
    view_icon: str
    category_name: Optional[str] = None
    accessed_at: datetime


# ==================== Hub 首页相关 ====================

class HubOverviewResponse(BaseModel):
    """Hub 首页概览响应"""
    total_views: int           # 视图总数
    total_datasources: int     # 数据源总数
    total_categories: int      # 分类总数
    recent_views: List[RecentViewResponse]  # 最近访问
    favorites: List[FavoriteResponse]       # 收藏列表
