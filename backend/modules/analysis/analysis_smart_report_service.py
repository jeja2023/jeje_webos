from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from .analysis_models import AnalysisSmartReport, AnalysisDataset
from .analysis_schemas import SmartReportCreate, SmartReportUpdate
from .analysis_duckdb_service import duckdb_instance

class SmartReportService:
    @staticmethod
    async def get_reports(db: AsyncSession) -> List[AnalysisSmartReport]:
        res = await db.execute(select(AnalysisSmartReport).order_by(AnalysisSmartReport.created_at.desc()))
        return res.scalars().all()

    @staticmethod
    async def create_report(db: AsyncSession, data: SmartReportCreate) -> AnalysisSmartReport:
        report = AnalysisSmartReport(
            name=data.name,
            template=data.template,
            dataset_id=data.dataset_id
        )
        db.add(report)
        await db.commit()
        await db.refresh(report)
        return report

    @staticmethod
    async def update_report(db: AsyncSession, report_id: int, data: SmartReportUpdate) -> AnalysisSmartReport:
        result = await db.execute(select(AnalysisSmartReport).where(AnalysisSmartReport.id == report_id))
        report = result.scalar_one_or_none()
        if not report:
            raise Exception("报告不存在")
        if data.name is not None:
            report.name = data.name
        if data.template is not None:
            report.template = data.template
        if data.dataset_id is not None:
            report.dataset_id = data.dataset_id
        await db.commit()
        await db.refresh(report)
        return report

    @staticmethod
    async def delete_report(db: AsyncSession, report_id: int):
        result = await db.execute(select(AnalysisSmartReport).where(AnalysisSmartReport.id == report_id))
        report = result.scalar_one_or_none()
        if report:
            await db.delete(report)
            await db.commit()

    @staticmethod
    async def generate_report(db: AsyncSession, report_id: int) -> str:
        result = await db.execute(select(AnalysisSmartReport).where(AnalysisSmartReport.id == report_id))
        report = result.scalar_one_or_none()
        if not report:
            raise Exception("报告不存在")
        
        if not report.dataset_id:
            return report.template

        res_ds = await db.execute(select(AnalysisDataset).where(AnalysisDataset.id == report.dataset_id))
        dataset = res_ds.scalar_one_or_none()
        if not dataset:
            return report.template

        # 获取数据
        sql = f"SELECT * FROM {dataset.table_name} LIMIT 1"
        try:
            df = duckdb_instance.fetch_df(sql)
            if df.empty:
                return report.template
            
            row = df.iloc[0].to_dict()
            content = report.template
            
            # 替换 {{key}}
            for key, val in row.items():
                content = content.replace(f"{{{{{key}}}}}", str(val))
                
            return content
        except:
            return report.template
