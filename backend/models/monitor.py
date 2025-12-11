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
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    metric_type: Mapped[str] = mapped_column(String(50))  # 指标类型: cpu, memory, disk, api_response_time
    metric_name: Mapped[str] = mapped_column(String(100))  # 指标名称
    value: Mapped[float] = mapped_column(Float)  # 指标值
    unit: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # 单位
    extra_metadata: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)  # 额外元数据
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    
    # 索引
    __table_args__ = (
        {'mysql_engine': 'InnoDB', 'mysql_charset': 'utf8mb4', 'comment': '系统性能指标表'},
    )


