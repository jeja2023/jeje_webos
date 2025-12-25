from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from .analysis_models import AnalysisChart
from .analysis_schemas import AnalysisChartCreate, AnalysisChartUpdate

class AnalysisChartService:
    @staticmethod
    async def list_charts(db: AsyncSession) -> List[AnalysisChart]:
        res = await db.execute(select(AnalysisChart).order_by(AnalysisChart.created_at.desc()))
        return res.scalars().all()

    @staticmethod
    async def get_chart(db: AsyncSession, chart_id: int) -> AnalysisChart:
        result = await db.execute(select(AnalysisChart).where(AnalysisChart.id == chart_id))
        chart = result.scalar_one_or_none()
        if not chart:
            raise Exception("图表不存在")
        return chart

    @staticmethod
    async def create_chart(db: AsyncSession, data: AnalysisChartCreate) -> AnalysisChart:
        chart = AnalysisChart(
            name=data.name,
            dataset_id=data.dataset_id,
            chart_type=data.chart_type,
            config=data.config,
            description=data.description
        )
        db.add(chart)
        await db.commit()
        await db.refresh(chart)
        return chart

    @staticmethod
    async def update_chart(db: AsyncSession, chart_id: int, data: AnalysisChartUpdate) -> AnalysisChart:
        chart = await AnalysisChartService.get_chart(db, chart_id)
        
        if data.name is not None:
            chart.name = data.name
        if data.dataset_id is not None:
            chart.dataset_id = data.dataset_id
        if data.chart_type is not None:
            chart.chart_type = data.chart_type
        if data.config is not None:
            chart.config = data.config
        if data.description is not None:
            chart.description = data.description
            
        await db.commit()
        await db.refresh(chart)
        return chart

    @staticmethod
    async def delete_chart(db: AsyncSession, chart_id: int):
        chart = await AnalysisChartService.get_chart(db, chart_id)
        await db.delete(chart)
        await db.commit()
