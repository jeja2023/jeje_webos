# -*- coding: utf-8 -*-
"""
BI 仪表盘服务
处理仪表盘的 CRUD 逻辑
"""

from typing import List, Dict, Any, Optional
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from .analysis_models import AnalysisDashboard
from .analysis_schemas import DashboardCreate, DashboardUpdate

logger = logging.getLogger(__name__)

class BIService:
    @staticmethod
    async def list_dashboards(db: AsyncSession) -> List[AnalysisDashboard]:
        """列出所有仪表盘"""
        res = await db.execute(select(AnalysisDashboard).order_by(AnalysisDashboard.updated_at.desc()))
        return res.scalars().all()

    @staticmethod
    async def get_dashboard(db: AsyncSession, dashboard_id: int) -> AnalysisDashboard:
        """获取单个仪表盘详情"""
        result = await db.execute(select(AnalysisDashboard).where(AnalysisDashboard.id == dashboard_id))
        dashboard = result.scalar_one_or_none()
        if not dashboard:
            raise ValueError("仪表盘不存在")
        return dashboard

    @staticmethod
    async def create_dashboard(db: AsyncSession, data: DashboardCreate) -> AnalysisDashboard:
        """创建仪表盘"""
        dashboard = AnalysisDashboard(**data.model_dump())
        db.add(dashboard)
        await db.commit()
        await db.refresh(dashboard)
        return dashboard

    @staticmethod
    async def update_dashboard(db: AsyncSession, dashboard_id: int, data: DashboardUpdate) -> AnalysisDashboard:
        """更新仪表盘配置"""
        dashboard = await BIService.get_dashboard(db, dashboard_id)
        
        for k, v in data.model_dump(exclude_unset=True).items():
            setattr(dashboard, k, v)
        
        await db.commit()
        await db.refresh(dashboard)
        return dashboard

    @staticmethod
    async def delete_dashboard(db: AsyncSession, dashboard_id: int) -> bool:
        """删除仪表盘"""
        dashboard = await BIService.get_dashboard(db, dashboard_id)
        await db.delete(dashboard)
        await db.flush()
        await db.commit()
        return True
