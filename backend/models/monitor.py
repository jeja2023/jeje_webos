"""
系统监控数据模型
"""

from typing import Optional
from datetime import datetime
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy import String, Integer, Float, Text, DateTime, JSON

from core.database import Base


class PerformanceMetric(Base):
    """性能指标记录表"""
    __tablename__ = "sys_metrics"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    metric_type: Mapped[str] = mapped_column(String(50), comment="指标类型")
    metric_name: Mapped[str] = mapped_column(String(100), comment="指标名称")
    value: Mapped[float] = mapped_column(Float, comment="指标值")
    unit: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, comment="单位")
    extra_metadata: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, comment="额外元数据")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, comment="创建时间")
    
    # 索引
    __table_args__ = (
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4', 'comment': '系统性能指标表'},
    )


