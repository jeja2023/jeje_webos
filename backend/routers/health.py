"""
健康检查路由
提供系统健康状态和监控端点
"""

import logging
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from core.config import get_settings
from core.database import engine
from core.cache import Cache
from core.middleware import get_request_stats
from core.rate_limit import get_rate_limiter
from core.security import get_current_user, TokenData

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(tags=["健康检查"])


class HealthStatus(BaseModel):
    """健康状态响应"""
    status: str  # healthy, degraded, unhealthy
    version: str
    timestamp: str
    uptime_seconds: float
    components: dict


class ComponentHealth(BaseModel):
    """组件健康状态"""
    status: str
    message: Optional[str] = None
    latency_ms: Optional[float] = None


# 系统启动时间
_start_time = datetime.utcnow()


async def check_database() -> ComponentHealth:
    """检查数据库连接"""
    import time
    start = time.time()
    
    try:
        from sqlalchemy import text
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        
        latency = (time.time() - start) * 1000
        return ComponentHealth(
            status="healthy",
            message="数据库连接正常",
            latency_ms=round(latency, 2)
        )
    except Exception as e:
        logger.error(f"数据库健康检查失败: {e}")
        return ComponentHealth(
            status="unhealthy",
            message=f"数据库连接失败: {str(e)}"
        )


async def check_redis() -> ComponentHealth:
    """检查Redis连接"""
    import time
    start = time.time()
    
    try:
        # 尝试执行一个简单操作
        exists = await Cache.exists("__health_check__")
        latency = (time.time() - start) * 1000
        
        return ComponentHealth(
            status="healthy",
            message="Redis连接正常",
            latency_ms=round(latency, 2)
        )
    except RuntimeError:
        # Redis未初始化
        return ComponentHealth(
            status="degraded",
            message="Redis未启用（可选组件）"
        )
    except Exception as e:
        logger.error(f"Redis健康检查失败: {e}")
        return ComponentHealth(
            status="degraded",
            message=f"Redis连接失败: {str(e)}"
        )


def check_disk_space() -> ComponentHealth:
    """检查磁盘空间"""
    try:
        import psutil
        import os
        
        # 获取backend目录所在磁盘
        backend_path = os.path.dirname(os.path.dirname(__file__))
        disk = psutil.disk_usage(backend_path)
        
        # 计算使用率
        used_percent = disk.percent
        free_gb = disk.free / (1024 ** 3)
        
        if used_percent > 95:
            return ComponentHealth(
                status="unhealthy",
                message=f"磁盘空间严重不足: {used_percent}% 已使用，剩余 {free_gb:.1f}GB"
            )
        elif used_percent > 85:
            return ComponentHealth(
                status="degraded",
                message=f"磁盘空间不足: {used_percent}% 已使用，剩余 {free_gb:.1f}GB"
            )
        else:
            return ComponentHealth(
                status="healthy",
                message=f"磁盘空间正常: {used_percent}% 已使用，剩余 {free_gb:.1f}GB"
            )
    except Exception as e:
        return ComponentHealth(
            status="degraded",
            message=f"无法检查磁盘空间: {str(e)}"
        )


def check_memory() -> ComponentHealth:
    """检查内存使用"""
    try:
        import psutil
        
        memory = psutil.virtual_memory()
        used_percent = memory.percent
        available_gb = memory.available / (1024 ** 3)
        
        if used_percent > 95:
            return ComponentHealth(
                status="unhealthy",
                message=f"内存严重不足: {used_percent}% 已使用，可用 {available_gb:.1f}GB"
            )
        elif used_percent > 85:
            return ComponentHealth(
                status="degraded",
                message=f"内存不足: {used_percent}% 已使用，可用 {available_gb:.1f}GB"
            )
        else:
            return ComponentHealth(
                status="healthy",
                message=f"内存正常: {used_percent}% 已使用，可用 {available_gb:.1f}GB"
            )
    except Exception as e:
        return ComponentHealth(
            status="degraded",
            message=f"无法检查内存: {str(e)}"
        )


@router.get("/health", response_model=HealthStatus)
async def health_check():
    """
    健康检查端点
    
    返回系统整体健康状态和各组件状态
    用于负载均衡器和监控系统
    """
    # 检查各组件
    db_health = await check_database()
    redis_health = await check_redis()
    disk_health = check_disk_space()
    memory_health = check_memory()
    
    components = {
        "database": db_health.model_dump(),
        "redis": redis_health.model_dump(),
        "disk": disk_health.model_dump(),
        "memory": memory_health.model_dump()
    }
    
    # 确定整体状态
    statuses = [db_health.status, redis_health.status, disk_health.status, memory_health.status]
    
    if "unhealthy" in statuses:
        # 数据库不健康则整体不健康
        if db_health.status == "unhealthy":
            overall_status = "unhealthy"
        else:
            overall_status = "degraded"
    elif "degraded" in statuses:
        overall_status = "degraded"
    else:
        overall_status = "healthy"
    
    # 计算运行时间
    uptime = (datetime.utcnow() - _start_time).total_seconds()
    
    return HealthStatus(
        status=overall_status,
        version=settings.app_version,
        timestamp=datetime.utcnow().isoformat(),
        uptime_seconds=round(uptime, 2),
        components=components
    )


@router.get("/health/live")
async def liveness_probe():
    """
    存活探针
    
    用于 Kubernetes 等容器编排系统的存活检查
    只检查应用是否在运行，不检查依赖组件
    """
    return {"status": "alive"}


@router.get("/health/ready")
async def readiness_probe():
    """
    就绪探针
    
    用于 Kubernetes 等容器编排系统的就绪检查
    检查应用是否准备好接收流量
    """
    # 检查数据库连接
    db_health = await check_database()
    
    if db_health.status == "unhealthy":
        return {
            "status": "not_ready",
            "reason": "数据库连接失败"
        }
    
    return {"status": "ready"}


@router.get("/health/stats")
async def get_stats(user: TokenData = Depends(get_current_user)):
    """
    获取请求统计信息
    
    需要登录
    返回请求统计、速率限制状态等
    """
    stats = get_request_stats()
    limiter = get_rate_limiter()
    
    return {
        "code": 0,
        "message": "success",
        "data": {
            "request_stats": stats.get_summary(),
            "rate_limit_stats": limiter.get_stats()
        }
    }


@router.post("/health/stats/reset")
async def reset_stats(user: TokenData = Depends(get_current_user)):
    """
    重置统计信息
    
    需要管理员权限
    """
    if user.role != "admin":
        return {
            "code": 403,
            "message": "需要管理员权限",
            "data": None
        }
    
    stats = get_request_stats()
    stats.reset()
    
    return {
        "code": 0,
        "message": "统计已重置",
        "data": None
    }

