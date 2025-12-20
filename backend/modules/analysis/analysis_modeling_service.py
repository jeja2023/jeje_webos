from typing import List, Dict, Any, Optional
import logging
import pandas as pd
import numpy as np
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from .analysis_models import AnalysisDataset
from .analysis_duckdb_service import duckdb_instance

logger = logging.getLogger(__name__)

class ModelingService:
    @staticmethod
    async def get_dataset(db: AsyncSession, dataset_id: int) -> AnalysisDataset:
        result = await db.execute(select(AnalysisDataset).where(AnalysisDataset.id == dataset_id))
        dataset = result.scalar_one_or_none()
        if not dataset:
            raise ValueError("数据集不存在")
        return dataset

    @staticmethod
    async def get_summary(db: AsyncSession, dataset_id: int, columns: Optional[List[str]] = None) -> Dict[str, Any]:
        """获取描述性统计"""
        dataset = await ModelingService.get_dataset(db, dataset_id)
        cols_str = "*" if not columns else ", ".join(columns)
        df = duckdb_instance.fetch_df(f"SELECT {cols_str} FROM {dataset.table_name}")
        
        summary = df.describe(include='all').replace({np.nan: None}).to_dict()
        # 补充缺失值统计
        missing = df.isnull().sum().to_dict()
        
        return {
            "stats": summary,
            "missing": missing
        }

    @staticmethod
    async def get_correlation(db: AsyncSession, dataset_id: int, columns: Optional[List[str]] = None) -> Dict[str, Any]:
        """获取相关性矩阵"""
        dataset = await ModelingService.get_dataset(db, dataset_id)
        # 只选取数值型列
        df = duckdb_instance.fetch_df(f"SELECT * FROM {dataset.table_name}")
        numeric_df = df.select_dtypes(include=[np.number])
        
        if columns:
            numeric_df = numeric_df[[c for c in columns if c in numeric_df.columns]]
            
        if numeric_df.empty:
            return {"matrix": {}, "message": "没有找到数值型字段"}
            
        corr_matrix = numeric_df.corr().replace({np.nan: None}).to_dict()
        return {"matrix": corr_matrix}

    @staticmethod
    async def get_aggregation(db: AsyncSession, dataset_id: int, group_by: List[str], aggregates: Dict[str, str]) -> List[Dict[str, Any]]:
        """数据聚合"""
        dataset = await ModelingService.get_dataset(db, dataset_id)
        
        agg_parts = []
        for col, func in aggregates.items():
            agg_parts.append(f"{func}({col}) as {func}_{col}")
            
        sql = f"""
            SELECT {", ".join(group_by)}, {", ".join(agg_parts)}
            FROM {dataset.table_name}
            GROUP BY {", ".join(group_by)}
            ORDER BY {group_by[0]}
        """
        
        df = duckdb_instance.fetch_df(sql)
        return df.to_dict(orient='records')
