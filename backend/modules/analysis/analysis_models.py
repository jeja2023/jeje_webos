from typing import Optional
from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, Text, DateTime, JSON

from core.database import Base
from utils.timezone import get_beijing_time

class AnalysisDataset(Base):
    """分析数据集元数据表"""
    __tablename__ = "analysis_datasets"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    name: Mapped[str] = mapped_column(String(255), comment="数据集名称")
    source_type: Mapped[str] = mapped_column(String(50), comment="来源类型")
    table_name: Mapped[str] = mapped_column(String(100), comment="引擎表名")
    config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, comment="导入配置")
    row_count: Mapped[int] = mapped_column(Integer, default=0, comment="数据行数")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")
    
    __table_args__ = (
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4', 'comment': '数据分析集管理表', 'extend_existing': True},
    )

class AnalysisModel(Base):
    """数据模型表（保存ETL流程）"""
    __tablename__ = "analysis_models"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    name: Mapped[str] = mapped_column(String(255), comment="模型名称")
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="模型描述")
    graph_config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, comment="流程图配置")
    status: Mapped[str] = mapped_column(String(50), default='draft', comment="状态")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")
    
    __table_args__ = (
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4', 'comment': '数据流程模型表', 'extend_existing': True},
    )

class AnalysisDashboard(Base):
    """BI 仪表盘表"""
    __tablename__ = "analysis_dashboards"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    name: Mapped[str] = mapped_column(String(255), comment="仪表盘名称")
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="仪表盘描述")
    widgets: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, comment="组件配置")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")
    
    __table_args__ = (
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4', 'comment': '数据仪表盘管理表', 'extend_existing': True},
    )


class AnalysisSmartTable(Base):
    """智能表格定义表"""
    __tablename__ = "analysis_smart_tables"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    name: Mapped[str] = mapped_column(String(255), comment="表格名称")
    fields: Mapped[dict] = mapped_column(JSON, comment="字段定义")
    config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, comment="表格配置")
    dataset_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, comment="关联数据集ID")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")
    
    __table_args__ = (
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4', 'comment': '智能表格定义表', 'extend_existing': True},
    )

class AnalysisSmartTableData(Base):
    """智能表格数据表"""
    __tablename__ = "analysis_smart_table_data"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    table_id: Mapped[int] = mapped_column(Integer, comment="智能表格ID")
    row_data: Mapped[dict] = mapped_column(JSON, comment="行数据")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")
    
    __table_args__ = (
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4', 'comment': '智能表格数据表', 'extend_existing': True},
    )



class AnalysisChart(Base):
    """保存的图表配置"""
    __tablename__ = "analysis_charts"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    name: Mapped[str] = mapped_column(String(255), comment="图表名称")
    dataset_id: Mapped[int] = mapped_column(Integer, comment="关联数据集ID")
    chart_type: Mapped[str] = mapped_column(String(50), comment="图表类型")
    config: Mapped[dict] = mapped_column(JSON, comment="图表配置")
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="图表描述")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")
    
    __table_args__ = (
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4', 'comment': '分析图表保存表', 'extend_existing': True},
    )
