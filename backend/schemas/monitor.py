"""
系统监控 Schema
"""

from typing import Optional, Dict, Any
from pydantic import BaseModel
from datetime import datetime


class SystemInfo(BaseModel):
    """系统信息"""
    cpu: Dict[str, Any]
    memory: Dict[str, Any]
    disk: Dict[str, Any]
    timestamp: str


class ProcessInfo(BaseModel):
    """进程信息"""
    pid: int
    memory: Dict[str, int]
    cpu_percent: float
    num_threads: int
    create_time: str


class MetricInfo(BaseModel):
    """性能指标信息"""
    id: int
    metric_type: str
    metric_name: str
    value: float
    unit: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    created_at: datetime
    
    class Config:
        from_attributes = True





