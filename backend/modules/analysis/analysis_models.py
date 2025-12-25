from typing import Optional
from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, Text, DateTime, JSON

from core.database import Base

class AnalysisDataset(Base):
    """分析数据集元数据表"""
    __tablename__ = "analysis_datasets"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255))  # 数据集名称
    source_type: Mapped[str] = mapped_column(String(50))  # 来源类型: file, database
    table_name: Mapped[str] = mapped_column(String(100))  # 在 DuckDB 中的表名
    config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)  # 导入配置(如存储路径或数据库连接信息)
    row_count: Mapped[int] = mapped_column(Integer, default=0) # 数据行数
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    __table_args__ = (
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4', 'comment': '数据分析集管理表', 'extend_existing': True},
    )

class AnalysisModel(Base):
    """数据模型表（保存ETL流程）"""
    __tablename__ = "analysis_models"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    graph_config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True) # 保存 nodes 和 connections
    status: Mapped[str] = mapped_column(String(50), default='draft') # draft, published
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    __table_args__ = (
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4', 'comment': 'ETL数据模型表', 'extend_existing': True},
    )

class AnalysisDashboard(Base):
    """BI 仪表盘表"""
    __tablename__ = "analysis_dashboards"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    widgets: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True) # 保存组件列表和布局
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    __table_args__ = (
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4', 'comment': 'BI仪表盘管理表', 'extend_existing': True},
    )


class AnalysisSmartTable(Base):
    """智能表格定义表"""
    __tablename__ = "analysis_smart_tables"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255))
    fields: Mapped[dict] = mapped_column(JSON) # 字段名、类型、描述等列表
    dataset_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True) # 关联的数据集ID
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    __table_args__ = (
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4', 'comment': '智能表格定义表', 'extend_existing': True},
    )

class AnalysisSmartTableData(Base):
    """智能表格数据表"""
    __tablename__ = "analysis_smart_table_data"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    table_id: Mapped[int] = mapped_column(Integer) # 关联的智能表格ID
    row_data: Mapped[dict] = mapped_column(JSON) # 行数据
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    __table_args__ = (
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4', 'comment': '智能表格数据表', 'extend_existing': True},
    )

class AnalysisSmartReport(Base):
    """智能报告模版与生成记录表"""
    __tablename__ = "analysis_smart_reports"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255))
    template: Mapped[str] = mapped_column(Text) # 报告模版内容 (JSON string or HTML/Markdown)
    dataset_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True) # 关联的数据集ID
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    __table_args__ = (
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4', 'comment': '智能报告表', 'extend_existing': True},
    )

class AnalysisChart(Base):
    """保存的图表配置"""
    __tablename__ = "analysis_charts"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255))
    dataset_id: Mapped[int] = mapped_column(Integer) # 关联数据集
    chart_type: Mapped[str] = mapped_column(String(50)) # bar, line, pie, etc.
    config: Mapped[dict] = mapped_column(JSON) # xField, yField, etc.
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    __table_args__ = (
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4', 'comment': '分析图表保存表', 'extend_existing': True},
    )
