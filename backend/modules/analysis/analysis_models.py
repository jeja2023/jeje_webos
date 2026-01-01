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
    config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True) # 表格级别配置
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
    """智能报告模版表"""
    __tablename__ = "analysis_smart_reports"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255))
    template_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True) # Word 模板文件路径
    content_html: Mapped[Optional[str]] = mapped_column(Text, nullable=True) # 解析后的 HTML 内容
    content_md: Mapped[Optional[str]] = mapped_column(Text, nullable=True) # Markdown 内容
    template_vars: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True) # 模板变量列表
    dataset_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True) # 默认关联的数据集ID
    data_row: Mapped[Optional[str]] = mapped_column(String(50), nullable=True) # 默认使用的数据行模式 (first, last, sum, avg)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    __table_args__ = (
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4', 'comment': '智能报告模版表', 'extend_existing': True},
    )

class AnalysisSmartReportRecord(Base):
    """智能报告已生成记录表"""
    __tablename__ = "analysis_smart_report_records"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    report_id: Mapped[int] = mapped_column(Integer) # 关联的模版ID
    name: Mapped[str] = mapped_column(String(255)) # 记录名称(例如：2025-12-27日报)
    docx_file_path: Mapped[str] = mapped_column(String(500)) # 生成的Word文件路径 (归档)
    pdf_file_path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True) # PDF文件存储路径 (可选)
    full_content: Mapped[Optional[str]] = mapped_column(Text(length=16777215), nullable=True) # 生成的报告全文内容(Markdown)，用于知识库 (MEDIUMTEXT)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    
    __table_args__ = (
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4', 'comment': '智能报告生成记录表', 'extend_existing': True},
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
