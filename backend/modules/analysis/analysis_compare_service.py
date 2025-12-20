from typing import List, Dict, Any, Optional
from modules.analysis.analysis_duckdb_service import duckdb_instance
from modules.analysis.analysis_models import AnalysisDataset
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import logging

logger = logging.getLogger(__name__)

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
        返回：新增行、变更行、删除行（基于 join_keys）
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

        # 1. 找出 source 中有但 target 中没有的 (新增/New in Source)
        join_on = " AND ".join([f"s.{k} = t.{k}" for k in join_keys])
        sql_added = f"""
            SELECT s.* FROM {t1} s 
            LEFT JOIN {t2} t ON {join_on}
            WHERE {" AND ".join([f"t.{k} IS NULL" for k in join_keys])}
            LIMIT 1000
        """
        added_data = duckdb_instance.fetch_df(sql_added).to_dict(orient='records')

        # 2. 找出 target 中有但 source 中没有的 (已删除/Missing in Source)
        sql_deleted = f"""
            SELECT t.* FROM {t2} t 
            LEFT JOIN {t1} s ON {join_on}
            WHERE {" AND ".join([f"s.{k} IS NULL" for k in join_keys])}
            LIMIT 1000
        """
        deleted_data = duckdb_instance.fetch_df(sql_deleted).to_dict(orient='records')

        # 3. 找出 key 相同但字段值不同的 (变更/Changed)
        diff_conditions = []
        for c in compare_columns:
            # 考虑空值情况
            diff_conditions.append(f"s.{c} != t.{c}")
            
        sql_changed = f"""
            SELECT s.*, 
                   {", ".join([f"t.{c} AS _target_{c}" for c in compare_columns])}
            FROM {t1} s 
            INNER JOIN {t2} t ON {join_on}
            WHERE {" OR ".join(diff_conditions)}
            LIMIT 1000
        """
        changed_data = duckdb_instance.fetch_df(sql_changed).to_dict(orient='records')

        return {
            "added": added_data,
            "deleted": deleted_data,
            "changed": changed_data,
            "summary": {
                "added_count": len(added_data),
                "deleted_count": len(deleted_data),
                "changed_count": len(changed_data)
            }
        }
