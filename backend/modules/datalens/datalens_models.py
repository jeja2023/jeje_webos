"""
DataLens 数据透镜模块 - 数据模型
定义数据源、分类、视图、收藏等表结构
"""

from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Integer, Boolean, DateTime, Text, JSON, Index
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base


class LensDataSource(Base):
    """数据源配置表"""
    __tablename__ = "lens_datasources"
    __table_args__ = (
        Index("ix_lens_datasources_name", "name"),
        {"comment": "DataLens 外部数据源配置表"}
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)  # 数据源名称
    type: Mapped[str] = mapped_column(String(20), nullable=False)   # 类型：mysql/postgres/sqlserver/oracle/sqlite/csv/excel/api
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)  # 描述

    # 数据库连接配置（JSON，敏感信息加密存储）
    # 格式: {"host": "...", "port": 3306, "user": "...", "password": "encrypted...", "database": "..."}
    connection_config: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # 文件类型配置
    # 格式: {"file_path": "storage/lens/xxx.csv", "sheet_name": "Sheet1"}
    file_config: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # API 类型配置
    # 格式: {"url": "...", "method": "GET", "headers": {...}, "params": {...}}
    api_config: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # 状态
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_connected_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # 最后一次连接错误

    # 归属
    created_by: Mapped[int] = mapped_column(Integer, nullable=False)  # 创建者用户ID
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)


class LensCategory(Base):
    """视图分类表"""
    __tablename__ = "lens_categories"
    __table_args__ = (
        Index("ix_lens_categories_order", "order"),
        {"comment": "DataLens 视图分类表"}
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)   # 分类名称
    icon: Mapped[str] = mapped_column(String(10), default="📂")     # Emoji 图标
    color: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # 颜色标识 #hex
    order: Mapped[int] = mapped_column(Integer, default=0)          # 排序权重
    parent_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # 父分类ID，支持子分类

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)


class LensView(Base):
    """数据视图配置表"""
    __tablename__ = "lens_views"
    __table_args__ = (
        Index("ix_lens_views_category", "category_id"),
        Index("ix_lens_views_datasource", "datasource_id"),
        Index("ix_lens_views_created_by", "created_by"),
        {"comment": "DataLens 数据视图配置表"}
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)  # 视图名称
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)  # 描述
    icon: Mapped[str] = mapped_column(String(10), default="📊")     # 图标
    category_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # 所属分类

    # 数据源配置
    datasource_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # 关联的数据源ID
    query_type: Mapped[str] = mapped_column(String(20), default="sql")  # 查询类型：sql/table/api
    query_config: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # SQL: {"sql": "SELECT * FROM users WHERE status = 1", "params": []}
    # Table: {"table": "users", "columns": ["id", "name"], "where": "status = 1", "order_by": "id DESC"}
    # API: {"endpoint": "/data", "params": {"page": 1}}

    # 显示配置
    display_config: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # {
    #   "columns": [
    #     {"field": "id", "title": "ID", "width": 80, "sortable": true, "align": "center"},
    #     {"field": "name", "title": "姓名", "width": 120, "searchable": true}
    #   ],
    #   "filters": [
    #     {"field": "status", "type": "select", "options": [{"value": 1, "label": "启用"}]}
    #   ],
    #   "actions": ["export", "refresh"],
    #   "pagination": {"pageSize": 20, "pageSizes": [10, 20, 50, 100]}
    # }

    # 状态指示器配置（在卡片上显示）
    status_config: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    chart_config: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    # {
    #   "enabled": true,
    #   "type": "count",                    // count/expression/field
    #   "expression": "SELECT COUNT(*) FROM ...",
    #   "thresholds": [
    #     {"max": 0, "color": "green", "label": "正常"},
    #     {"max": 10, "color": "yellow", "label": "注意"},
    #     {"max": null, "color": "red", "label": "异常"}
    #   ],
    #   "refresh_interval": 60              // 刷新间隔（秒）
    # }

    # 权限控制
    required_permission: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # 需要的额外权限
    is_public: Mapped[bool] = mapped_column(Boolean, default=True)  # 是否公开（所有人可见）

    # 统计
    view_count: Mapped[int] = mapped_column(Integer, default=0)

    # 归属
    created_by: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)


class LensFavorite(Base):
    """用户收藏表"""
    __tablename__ = "lens_favorites"
    __table_args__ = (
        Index("ix_lens_favorites_user", "user_id"),
        Index("ix_lens_favorites_view", "view_id"),
        {"comment": "DataLens 用户收藏表"}
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False)   # 用户ID
    view_id: Mapped[int] = mapped_column(Integer, nullable=False)   # 视图ID
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class LensRecentView(Base):
    """最近访问记录表"""
    __tablename__ = "lens_recent_views"
    __table_args__ = (
        Index("ix_lens_recent_user", "user_id"),
        Index("ix_lens_recent_time", "accessed_at"),
        {"comment": "DataLens 最近访问记录表"}
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(Integer, nullable=False)
    view_id: Mapped[int] = mapped_column(Integer, nullable=False)
    accessed_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
