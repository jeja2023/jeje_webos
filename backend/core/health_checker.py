"""
健康检查模块
提供系统健康状态检测，支持 Kubernetes、Docker 等容器编排
"""

import time
import logging
from typing import Dict, Any, Optional
from datetime import datetime, timezone
from dataclasses import dataclass, field
from enum import Enum

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from core.config import get_settings
from core.database import async_session

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(tags=["健康检查"])


class HealthStatus(str, Enum):
    """健康状态枚举"""
    HEALTHY = "healthy"
    DEGRADED = "degraded"  # 部分服务不可用
    UNHEALTHY = "unhealthy"


@dataclass
class ComponentHealth:
    """组件健康状态"""
    name: str
    status: HealthStatus
    latency_ms: float = 0
    message: str = ""
    details: Dict[str, Any] = field(default_factory=dict)


class HealthChecker:
    """健康检查器"""
    
    def __init__(self):
        self._start_time = time.time()
    
    @property
    def uptime_seconds(self) -> int:
        """获取运行时长（秒）"""
        return int(time.time() - self._start_time)
    
    async def check_database(self) -> ComponentHealth:
        """检查数据库连接"""
        start = time.time()
        try:
            async with async_session() as session:
                await session.execute(text("SELECT 1"))
            
            latency = (time.time() - start) * 1000
            return ComponentHealth(
                name="database",
                status=HealthStatus.HEALTHY,
                latency_ms=round(latency, 2),
                message="MySQL 连接正常",
                details={"host": settings.db_host, "database": settings.db_name}
            )
        except Exception as e:
            latency = (time.time() - start) * 1000
            logger.error(f"数据库健康检查失败: {e}")
            return ComponentHealth(
                name="database",
                status=HealthStatus.UNHEALTHY,
                latency_ms=round(latency, 2),
                message=f"数据库连接失败: {str(e)[:100]}"
            )
    
    async def check_redis(self) -> ComponentHealth:
        """检查 Redis 连接"""
        start = time.time()
        try:
            from core.cache import _redis_client
            
            if _redis_client is None:
                return ComponentHealth(
                    name="redis",
                    status=HealthStatus.DEGRADED,
                    message="Redis 未配置或未启用"
                )
            
            await _redis_client.ping()
            latency = (time.time() - start) * 1000
            
            return ComponentHealth(
                name="redis",
                status=HealthStatus.HEALTHY,
                latency_ms=round(latency, 2),
                message="Redis 连接正常",
                details={"host": settings.redis_host, "port": settings.redis_port}
            )
        except Exception as e:
            latency = (time.time() - start) * 1000
            logger.error(f"Redis 健康检查失败: {e}")
            return ComponentHealth(
                name="redis",
                status=HealthStatus.DEGRADED,
                latency_ms=round(latency, 2),
                message=f"Redis 连接失败: {str(e)[:100]}"
            )
    
    async def check_disk(self) -> ComponentHealth:
        """检查磁盘空间"""
        try:
            import shutil
            import os
            
            # 检查存储目录
            storage_path = os.path.join(os.path.dirname(__file__), "..", "storage")
            if not os.path.exists(storage_path):
                storage_path = "."
            
            total, used, free = shutil.disk_usage(storage_path)
            
            # 转换为 GB
            total_gb = round(total / (1024 ** 3), 2)
            used_gb = round(used / (1024 ** 3), 2)
            free_gb = round(free / (1024 ** 3), 2)
            usage_percent = round((used / total) * 100, 1)
            
            # 判断状态
            if usage_percent > 95:
                status = HealthStatus.UNHEALTHY
                message = "磁盘空间严重不足"
            elif usage_percent > 85:
                status = HealthStatus.DEGRADED
                message = "磁盘空间不足，请清理"
            else:
                status = HealthStatus.HEALTHY
                message = "磁盘空间充足"
            
            return ComponentHealth(
                name="disk",
                status=status,
                message=message,
                details={
                    "total_gb": total_gb,
                    "used_gb": used_gb,
                    "free_gb": free_gb,
                    "usage_percent": usage_percent
                }
            )
        except Exception as e:
            logger.error(f"磁盘健康检查失败: {e}")
            return ComponentHealth(
                name="disk",
                status=HealthStatus.DEGRADED,
                message=f"无法检查磁盘状态: {str(e)[:100]}"
            )
    
    async def check_memory(self) -> ComponentHealth:
        """检查内存使用"""
        try:
            import psutil
            
            memory = psutil.virtual_memory()
            usage_percent = memory.percent
            
            # 转换为 GB
            total_gb = round(memory.total / (1024 ** 3), 2)
            available_gb = round(memory.available / (1024 ** 3), 2)
            
            # 判断状态
            if usage_percent > 95:
                status = HealthStatus.UNHEALTHY
                message = "内存使用率过高"
            elif usage_percent > 85:
                status = HealthStatus.DEGRADED
                message = "内存使用率较高"
            else:
                status = HealthStatus.HEALTHY
                message = "内存使用正常"
            
            return ComponentHealth(
                name="memory",
                status=status,
                message=message,
                details={
                    "total_gb": total_gb,
                    "available_gb": available_gb,
                    "usage_percent": usage_percent
                }
            )
        except Exception as e:
            logger.error(f"内存健康检查失败: {e}")
            return ComponentHealth(
                name="memory",
                status=HealthStatus.DEGRADED,
                message=f"无法检查内存状态: {str(e)[:100]}"
            )
    
    async def get_full_health(self) -> Dict[str, Any]:
        """获取完整健康状态"""
        # 并行检查所有组件
        db_health = await self.check_database()
        redis_health = await self.check_redis()
        disk_health = await self.check_disk()
        memory_health = await self.check_memory()
        
        components = [db_health, redis_health, disk_health, memory_health]
        
        # 计算整体状态
        if any(c.status == HealthStatus.UNHEALTHY for c in components):
            overall_status = HealthStatus.UNHEALTHY
        elif any(c.status == HealthStatus.DEGRADED for c in components):
            overall_status = HealthStatus.DEGRADED
        else:
            overall_status = HealthStatus.HEALTHY
        
        return {
            "status": overall_status,
            "version": settings.app_version,
            "uptime_seconds": self.uptime_seconds,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "components": {
                c.name: {
                    "status": c.status,
                    "latency_ms": c.latency_ms,
                    "message": c.message,
                    "details": c.details
                }
                for c in components
            }
        }


# 全局健康检查器实例
health_checker = HealthChecker()


@router.get("/health")
async def health_check():
    """
    健康检查端点（简单版）
    
    用于 Kubernetes liveness probe 或负载均衡健康检查
    只检查最基本的服务可用性
    """
    try:
        # 只检查数据库（最关键的依赖）
        db_health = await health_checker.check_database()
        
        if db_health.status == HealthStatus.UNHEALTHY:
            return {
                "status": "unhealthy",
                "message": db_health.message
            }
        
        return {
            "status": "healthy",
            "version": settings.app_version,
            "uptime": health_checker.uptime_seconds
        }
    except Exception as e:
        logger.error(f"健康检查失败: {e}")
        return {
            "status": "unhealthy",
            "message": str(e)
        }


@router.get("/health/ready")
async def readiness_check():
    """
    就绪检查端点
    
    用于 Kubernetes readiness probe
    检查所有关键服务是否就绪
    """
    health = await health_checker.get_full_health()
    
    # 如果数据库不可用，返回 503
    if health["components"]["database"]["status"] == HealthStatus.UNHEALTHY:
        from fastapi.responses import JSONResponse
        return JSONResponse(
            status_code=503,
            content={
                "status": "not_ready",
                "message": "数据库服务不可用",
                "details": health
            }
        )
    
    return {
        "status": "ready" if health["status"] != HealthStatus.UNHEALTHY else "not_ready",
        "details": health
    }


@router.get("/health/live")
async def liveness_check():
    """
    存活检查端点
    
    用于 Kubernetes liveness probe
    只检查应用本身是否响应
    """
    return {
        "status": "alive",
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


@router.get("/health/detailed")
async def detailed_health():
    """
    详细健康检查端点
    
    返回所有组件的详细健康状态
    适用于监控仪表板
    """
    return await health_checker.get_full_health()







