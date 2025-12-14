"""
系统监控路由
提供系统资源监控和性能指标查询
"""

from typing import Optional
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, and_

from core.database import get_db
from core.security import require_admin, TokenData
from models.monitor import PerformanceMetric
from schemas.monitor import SystemInfo, ProcessInfo, MetricInfo
from schemas.response import success
from utils.monitor import get_monitor

router = APIRouter(prefix="/api/v1/monitor", tags=["系统监控"])


@router.get("/system")
async def get_system_info(
    current_user: TokenData = Depends(require_admin())
):
    """
    获取系统资源信息
    
    仅系统管理员可访问
    """
    monitor = get_monitor()
    system_info = monitor.get_system_info()
    return success(system_info)


@router.get("/process")
async def get_process_info(
    current_user: TokenData = Depends(require_admin())
):
    """
    获取应用进程信息
    
    仅系统管理员可访问
    """
    monitor = get_monitor()
    process_info = monitor.get_process_info()
    return success(process_info)


@router.post("/metric")
async def record_metric(
    metric_type: str,
    metric_name: str,
    value: float,
    unit: Optional[str] = None,
    metadata: Optional[dict] = None,
    current_user: TokenData = Depends(require_admin()),
    db: AsyncSession = Depends(get_db)
):
    """
    记录性能指标
    
    仅系统管理员可执行
    """
    metric = PerformanceMetric(
        metric_type=metric_type,
        metric_name=metric_name,
        value=value,
        unit=unit,
        metadata=metadata
    )
    db.add(metric)
    await db.commit()
    await db.refresh(metric)
    
    return success(MetricInfo.model_validate(metric).model_dump())


@router.get("/metrics")
async def get_metrics(
    metric_type: Optional[str] = None,
    metric_name: Optional[str] = None,
    hours: int = 24,
    current_user: TokenData = Depends(require_admin()),
    db: AsyncSession = Depends(get_db)
):
    """
    获取性能指标历史
    
    仅系统管理员可访问
    """
    # 构建查询
    query = select(PerformanceMetric)
    
    # 时间范围
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    query = query.where(PerformanceMetric.created_at >= since)
    
    # 类型筛选
    if metric_type:
        query = query.where(PerformanceMetric.metric_type == metric_type)
    
    # 名称筛选
    if metric_name:
        query = query.where(PerformanceMetric.metric_name == metric_name)
    
    # 排序
    query = query.order_by(desc(PerformanceMetric.created_at))
    query = query.limit(1000)  # 限制返回数量
    
    result = await db.execute(query)
    metrics = result.scalars().all()
    
    return success([MetricInfo.model_validate(m).model_dump() for m in metrics])


@router.get("/stats")
async def get_stats(
    hours: int = 24,
    current_user: TokenData = Depends(require_admin()),
    db: AsyncSession = Depends(get_db)
):
    """
    获取统计信息汇总
    
    仅系统管理员可访问
    """
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    
    # 获取各类型指标的平均值
    result = await db.execute(
        select(
            PerformanceMetric.metric_type,
            PerformanceMetric.metric_name,
            func.avg(PerformanceMetric.value).label('avg_value'),
            func.max(PerformanceMetric.value).label('max_value'),
            func.min(PerformanceMetric.value).label('min_value'),
            func.count(PerformanceMetric.id).label('count')
        )
        .where(PerformanceMetric.created_at >= since)
        .group_by(PerformanceMetric.metric_type, PerformanceMetric.metric_name)
    )
    
    stats = []
    for row in result.all():
        stats.append({
            "metric_type": row.metric_type,
            "metric_name": row.metric_name,
            "avg_value": float(row.avg_value),
            "max_value": float(row.max_value),
            "min_value": float(row.min_value),
            "count": row.count
        })
    
    return success(stats)





