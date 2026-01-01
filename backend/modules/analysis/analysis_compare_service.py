from typing import List, Dict, Any, Optional
from modules.analysis.analysis_duckdb_service import duckdb_instance
from modules.analysis.analysis_models import AnalysisDataset
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import logging
import math
from datetime import datetime, date
import pandas as pd

logger = logging.getLogger(__name__)

def clean_for_json(records: List[Dict]) -> List[Dict]:
    """清理数据使其可以安全地 JSON 序列化（处理 NaN、Inf、时间类型等）"""
    cleaned = []
    for row in records:
        clean_row = {}
        for key, value in row.items():
            if value is None:
                clean_row[key] = None
            elif isinstance(value, float):
                if math.isnan(value) or math.isinf(value):
                    clean_row[key] = None
                else:
                    clean_row[key] = value
            elif isinstance(value, pd.Timestamp):
                # pandas Timestamp 转换为友好的字符串格式
                clean_row[key] = value.strftime('%Y-%m-%d %H:%M:%S')
            elif isinstance(value, datetime):
                clean_row[key] = value.strftime('%Y-%m-%d %H:%M:%S')
            elif isinstance(value, date):
                clean_row[key] = value.strftime('%Y-%m-%d')
            else:
                clean_row[key] = value
        cleaned.append(clean_row)
    return cleaned

class CompareService:
    @staticmethod
    async def get_dataset_metadata(db: AsyncSession, dataset_id: int) -> Optional[AnalysisDataset]:
        result = await db.execute(select(AnalysisDataset).where(AnalysisDataset.id == dataset_id))
        return result.scalar_one_or_none()

    @staticmethod
    async def get_table_columns(table_name: str) -> List[str]:
        """获取 DuckDB 表的字段列表"""
        df = duckdb_instance.fetch_df(f"DESCRIBE {table_name}")
        return df['column_name'].tolist()

    @staticmethod
    async def compare_datasets(
        db: AsyncSession, 
        source_id: int, 
        target_id: int, 
        join_keys: List[str], 
        compare_columns: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        比对两个数据集
        返回：相同数据、仅源数据集、仅目标数据集、差异数据（基于 join_keys）
        """
        source = await CompareService.get_dataset_metadata(db, source_id)
        target = await CompareService.get_dataset_metadata(db, target_id)
        
        if not source or not target:
            raise ValueError("数据集记录未找到")
            
        t1 = source.table_name
        t2 = target.table_name
        
        # 获取共有字段
        cols_s = await CompareService.get_table_columns(t1)
        cols_t = await CompareService.get_table_columns(t2)
        common_cols = list(set(cols_s) & set(cols_t))
        
        if not compare_columns:
            compare_columns = [c for c in common_cols if c not in join_keys]

        join_on = " AND ".join([f"s.{k} = t.{k}" for k in join_keys])
        
        # 1. 仅源数据集（Source Only）
        sql_source_only_base = f"""
            FROM {t1} s 
            LEFT JOIN {t2} t ON {join_on}
            WHERE {" AND ".join([f"t.{k} IS NULL" for k in join_keys])}
        """
        source_only_count = int(duckdb_instance.fetch_df(f"SELECT COUNT(*) as cnt {sql_source_only_base}").iloc[0]['cnt'])
        source_only_df = duckdb_instance.fetch_df(f"SELECT s.* {sql_source_only_base} LIMIT 1000")
        source_only_data = clean_for_json(source_only_df.to_dict(orient='records'))

        # 2. 仅目标数据集（Target Only）
        sql_target_only_base = f"""
            FROM {t2} t 
            LEFT JOIN {t1} s ON {join_on}
            WHERE {" AND ".join([f"s.{k} IS NULL" for k in join_keys])}
        """
        target_only_count = int(duckdb_instance.fetch_df(f"SELECT COUNT(*) as cnt {sql_target_only_base}").iloc[0]['cnt'])
        target_only_df = duckdb_instance.fetch_df(f"SELECT t.* {sql_target_only_base} LIMIT 1000")
        target_only_data = clean_for_json(target_only_df.to_dict(orient='records'))

        # 3. 相同数据（Same）
        if compare_columns:
            same_conditions = [f"(s.{c} = t.{c} OR (s.{c} IS NULL AND t.{c} IS NULL))" for c in compare_columns]
            sql_same_base = f"""
                FROM {t1} s 
                INNER JOIN {t2} t ON {join_on}
                WHERE {" AND ".join(same_conditions)}
            """
        else:
            sql_same_base = f"""
                FROM {t1} s 
                INNER JOIN {t2} t ON {join_on}
            """
        
        same_count = int(duckdb_instance.fetch_df(f"SELECT COUNT(*) as cnt {sql_same_base}").iloc[0]['cnt'])
        same_df = duckdb_instance.fetch_df(f"SELECT s.* {sql_same_base} LIMIT 1000")
        same_data = clean_for_json(same_df.to_dict(orient='records'))

        # 4. 差异数据（Different）
        different_data = []
        different_count = 0
        if compare_columns:
            diff_conditions = [f"(s.{c} != t.{c} OR (s.{c} IS NULL AND t.{c} IS NOT NULL) OR (s.{c} IS NOT NULL AND t.{c} IS NULL))" for c in compare_columns]
            sql_diff_base = f"""
                FROM {t1} s 
                INNER JOIN {t2} t ON {join_on}
                WHERE {" OR ".join(diff_conditions)}
            """
            different_count = int(duckdb_instance.fetch_df(f"SELECT COUNT(*) as cnt {sql_diff_base}").iloc[0]['cnt'])
            sql_different = f"""
                SELECT s.*, 
                       {", ".join([f"t.{c} AS _target_{c}" for c in compare_columns])}
                {sql_diff_base}
                LIMIT 1000
            """
            different_df = duckdb_instance.fetch_df(sql_different)
            different_data = clean_for_json(different_df.to_dict(orient='records'))

        return {
            "same": same_data,
            "source_only": source_only_data,
            "target_only": target_only_data,
            "different": different_data,
            "columns": common_cols,
            "compare_columns": compare_columns,
            "join_keys": join_keys,
            "summary": {
                "same_count": same_count,
                "source_only_count": source_only_count,
                "target_only_count": target_only_count,
                "different_count": different_count
            }
        }

