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
