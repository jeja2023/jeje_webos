"""
DataLens 数据透镜模块 - 数据模型
定义数据源、分类、视图、收藏等表结构
"""

from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Integer, Boolean, DateTime, Text, JSON, Index
from sqlalchemy.orm import Mapped, mapped_column

from core.database import Base
from utils.timezone import get_beijing_time


class LensDataSource(Base):
    """数据源配置表"""
    __tablename__ = "lens_datasources"
    __table_args__ = (
        Index("ix_lens_datasources_name", "name"),
        {"comment": "外部数据源配置表"}
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    name: Mapped[str] = mapped_column(String(100), nullable=False, comment="数据源名称")
    type: Mapped[str] = mapped_column(String(20), nullable=False, comment="数据源类型")
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True, comment="描述")

    # 数据库连接配置（JSON，敏感信息加密存储）
    # 格式: {"host": "...", "port": 3306, "user": "...", "password": "encrypted...", "database": "..."}
    connection_config: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="数据库连接配置")

    # 文件类型配置
    # 格式: {"file_path": "storage/lens/xxx.csv", "sheet_name": "Sheet1"}
    file_config: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="文件配置")

    # API 类型配置
    # 格式: {"url": "...", "method": "GET", "headers": {...}, "params": {...}}
    api_config: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="API接口配置")

    # 状态
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, comment="是否激活")
    last_connected_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, comment="最后连接时间")
    last_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="最后错误信息")

    # 归属
    created_by: Mapped[int] = mapped_column(Integer, nullable=False, comment="创建者ID")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")


class LensCategory(Base):
    """视图分类表"""
    __tablename__ = "lens_categories"
    __table_args__ = (
        Index("ix_lens_categories_order", "order"),
        {"comment": "数据视图分类表"}
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    name: Mapped[str] = mapped_column(String(50), nullable=False, comment="分类名称")
    icon: Mapped[str] = mapped_column(String(10), default="📂", comment="图标")
    color: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, comment="颜色")
    order: Mapped[int] = mapped_column(Integer, default=0, comment="排序权重")
    parent_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, comment="父分类ID")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")


class LensView(Base):
    """数据视图配置表"""
    __tablename__ = "lens_views"
    __table_args__ = (
        Index("ix_lens_views_category", "category_id"),
        Index("ix_lens_views_datasource", "datasource_id"),
        Index("ix_lens_views_created_by", "created_by"),
        {"comment": "数据视图配置表"}
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    name: Mapped[str] = mapped_column(String(100), nullable=False, comment="视图名称")
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True, comment="描述")
    icon: Mapped[str] = mapped_column(String(10), default="📊", comment="图标")
    category_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, comment="所属分类ID")

    # 数据源配置
    datasource_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, comment="关联数据源ID")
    query_type: Mapped[str] = mapped_column(String(20), default="sql", comment="查询类型")
    query_config: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="查询配置")
    # SQL类型示例: {"sql": "SELECT * FROM users WHERE status = 1", "params": []}
    # 表类型示例: {"table": "users", "columns": ["id", "name"], "where": "status = 1", "order_by": "id DESC"}
    # API类型示例: {"endpoint": "/data", "params": {"page": 1}}

    # 显示配置
    display_config: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="显示配置")
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
    status_config: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="状态配置")
    chart_config: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="图表配置")
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
    required_permission: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, comment="所需权限")
    is_public: Mapped[bool] = mapped_column(Boolean, default=True, comment="是否公开")

    # 统计
    view_count: Mapped[int] = mapped_column(Integer, default=0, comment="访问次数")

    # 归属
    created_by: Mapped[int] = mapped_column(Integer, nullable=False, comment="创建者ID")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")


class LensFavorite(Base):
    """用户收藏表"""
    __tablename__ = "lens_favorites"
    __table_args__ = (
        Index("ix_lens_favorites_user", "user_id"),
        Index("ix_lens_favorites_view", "view_id"),
        {"comment": "数据视图收藏表"}
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, comment="用户ID")
    view_id: Mapped[int] = mapped_column(Integer, nullable=False, comment="视图ID")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")


class LensRecentView(Base):
    """最近访问记录表"""
    __tablename__ = "lens_recent_views"
    __table_args__ = (
        Index("ix_lens_recent_user", "user_id"),
        Index("ix_lens_recent_time", "accessed_at"),
        {"comment": "最近访问记录表"}
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    user_id: Mapped[int] = mapped_column(Integer, nullable=False, comment="用户ID")
    view_id: Mapped[int] = mapped_column(Integer, nullable=False, comment="视图ID")
    accessed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="访问时间")
