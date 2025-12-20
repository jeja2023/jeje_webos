from typing import List, Dict, Any, Optional
import uuid
import logging
import pandas as pd
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from .analysis_models import AnalysisDataset
from .analysis_duckdb_service import duckdb_instance

logger = logging.getLogger(__name__)

class CleaningService:
    @staticmethod
    async def get_dataset(db: AsyncSession, dataset_id: int) -> AnalysisDataset:
        result = await db.execute(select(AnalysisDataset).where(AnalysisDataset.id == dataset_id))
        dataset = result.scalar_one_or_none()
        if not dataset:
            raise ValueError("数据集不存在")
        return dataset

    @staticmethod
    async def apply_cleaning(db: AsyncSession, req: Any) -> AnalysisDataset:
        """应用数据清洗操作"""
        dataset = await CleaningService.get_dataset(db, req.dataset_id)
        table_name = dataset.table_name
        
        # 将数据读入 DataFrame 进行清洗 (对于极大数据集建议直接用 SQL，这里先用 Pandas 实现通用逻辑)
        df = duckdb_instance.fetch_df(f"SELECT * FROM {table_name}")
        
        op = req.operation
        cols = req.columns
        params = req.params or {}
        
        if op == "drop_missing":
            df = df.dropna(subset=cols)
        elif op == "fill_missing":
            val = params.get("value")
            strategy = params.get("strategy", "constant")
            if strategy == "mean":
                df[cols] = df[cols].fillna(df[cols].mean())
            elif strategy == "median":
                df[cols] = df[cols].fillna(df[cols].median())
            elif strategy == "mode":
                df[cols] = df[cols].fillna(df[cols].mode().iloc[0])
            else:
                df[cols] = df[cols].fillna(val)
        elif op == "drop_duplicates":
            df = df.drop_duplicates(subset=cols)
        elif op == "convert_type":
            target_type = params.get("type", "string")
            for col in cols:
                if target_type == "numeric":
                    df[col] = pd.to_numeric(df[col], errors='coerce')
                elif target_type == "datetime":
                    df[col] = pd.to_datetime(df[col], errors='coerce')
                else:
                    df[col] = df[col].astype(str)
        else:
            raise ValueError(f"不支持的操作: {op}")
            
        # 保存结果
        new_table_name = f"dataset_{uuid.uuid4().hex[:8]}"
        duckdb_instance.conn.execute(f"CREATE TABLE {new_table_name} AS SELECT * FROM df")
        
        # 统计新行数
        row_count = len(df)
        
        # 决定是覆盖还是新建
        if req.new_dataset_name:
            new_dataset = AnalysisDataset(
                name=req.new_dataset_name,
                source_type=dataset.source_type,
                table_name=new_table_name,
                row_count=row_count,
                config=dataset.config.copy() if dataset.config else {}
            )
            db.add(new_dataset)
            await db.commit()
            await db.refresh(new_dataset)
            return new_dataset
        else:
            # 覆盖原数据集
            old_table = dataset.table_name
            dataset.table_name = new_table_name
            dataset.row_count = row_count
            await db.commit()
            # 异步删除旧表
            try:
                duckdb_instance.conn.execute(f"DROP TABLE IF EXISTS {old_table}")
            except:
                pass
            return dataset
