"""
Analysis 模块业务服务层
"""

from typing import List, Dict, Any, Optional
from modules.analysis.analysis_duckdb_service import duckdb_instance
from modules.analysis.analysis_models import AnalysisDataset
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from utils.sql_safety import is_safe_table_name, is_safe_column_name, escape_sql_identifier
import logging
import math
import uuid
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
                # 将 pandas Timestamp 转换为友好的字符串格式
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
        if not is_safe_table_name(table_name):
            raise ValueError(f"不安全的表名: {table_name}")
        safe_table = escape_sql_identifier(table_name)
        df = duckdb_instance.fetch_df(f"DESCRIBE {safe_table}")
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
        
        性能优化：
        - 对于大数据集（>10万行），使用采样比对以提高速度
        - 限制返回结果数量，避免内存溢出
        """
        source = await CompareService.get_dataset_metadata(db, source_id)
        target = await CompareService.get_dataset_metadata(db, target_id)
        
        if not source or not target:
            raise ValueError("数据集记录未找到")
            
        t1 = source.table_name
        t2 = target.table_name
        
        # 验证表名安全性
        if not is_safe_table_name(t1) or not is_safe_table_name(t2):
            raise ValueError("不安全的表名")
        safe_t1 = escape_sql_identifier(t1)
        safe_t2 = escape_sql_identifier(t2)
        
        # 获取共有字段
        cols_s = await CompareService.get_table_columns(t1)
        cols_t = await CompareService.get_table_columns(t2)
        common_cols = list(set(cols_s) & set(cols_t))
        
        if not compare_columns:
            compare_columns = [c for c in common_cols if c not in join_keys]

        # 验证 join_keys 和 compare_columns 安全性
        for k in join_keys:
            if not is_safe_column_name(k):
                raise ValueError(f"不安全的键名: {k}")
            if k not in common_cols:
                raise ValueError(f"键 {k} 不存在于两个数据集的共有字段中")
        for c in compare_columns:
            if not is_safe_column_name(c):
                raise ValueError(f"不安全的列名: {c}")
        
        # 使用转义后的标识符
        safe_join_keys = [escape_sql_identifier(k) for k in join_keys]
        safe_compare_cols = [escape_sql_identifier(c) for c in compare_columns]
        
        join_on = " AND ".join([f"s.{sk} = t.{sk}" for sk in safe_join_keys])
        
        # 性能优化：对于大数据集，使用采样
        # 如果两个数据集都很大，使用采样比对以提高速度
        use_sampling = False
        sample_size = 50000  # 采样大小
        if (source.row_count and source.row_count > 100000) or (target.row_count and target.row_count > 100000):
            use_sampling = True
            logger.info(f"数据集较大，使用采样比对（采样大小: {sample_size}）")
        
        # 1. 仅源数据集（Source Only）
        # 使用 UUID 后缀避免并发时临时表名冲突
        _uid = uuid.uuid4().hex[:8]
        safe_sample_t1 = None
        safe_sample_t2 = None
        
        try:
            if use_sampling:
                # 使用采样表进行比对
                sample_t1 = f"{t1}_sample_{_uid}"
                sample_t2 = f"{t2}_sample_{_uid}"
                safe_sample_t1 = escape_sql_identifier(sample_t1)
                safe_sample_t2 = escape_sql_identifier(sample_t2)
                duckdb_instance.query(f"CREATE TEMP TABLE {safe_sample_t1} AS SELECT * FROM {safe_t1} USING SAMPLE {int(sample_size)}")
                duckdb_instance.query(f"CREATE TEMP TABLE {safe_sample_t2} AS SELECT * FROM {safe_t2} USING SAMPLE {int(sample_size)}")
                sql_source_only_base = f"""
                    FROM {safe_sample_t1} s 
                    LEFT JOIN {safe_sample_t2} t ON {join_on}
                    WHERE {" AND ".join([f"t.{sk} IS NULL" for sk in safe_join_keys])}
                """
            else:
                sql_source_only_base = f"""
                    FROM {safe_t1} s 
                    LEFT JOIN {safe_t2} t ON {join_on}
                    WHERE {" AND ".join([f"t.{sk} IS NULL" for sk in safe_join_keys])}
                """
            
            source_only_count = int(duckdb_instance.fetch_df(f"SELECT COUNT(*) as cnt {sql_source_only_base}").iloc[0]['cnt'])
            source_only_df = duckdb_instance.fetch_df(f"SELECT s.* {sql_source_only_base} LIMIT 1000")
            source_only_data = clean_for_json(source_only_df.to_dict(orient='records'))

            # 2. 仅目标数据集（Target Only）
            if use_sampling:
                sql_target_only_base = f"""
                    FROM {safe_sample_t2} t 
                    LEFT JOIN {safe_sample_t1} s ON {join_on}
                    WHERE {" AND ".join([f"s.{sk} IS NULL" for sk in safe_join_keys])}
                """
            else:
                sql_target_only_base = f"""
                    FROM {safe_t2} t 
                    LEFT JOIN {safe_t1} s ON {join_on}
                    WHERE {" AND ".join([f"s.{sk} IS NULL" for sk in safe_join_keys])}
                """
            
            target_only_count = int(duckdb_instance.fetch_df(f"SELECT COUNT(*) as cnt {sql_target_only_base}").iloc[0]['cnt'])
            target_only_df = duckdb_instance.fetch_df(f"SELECT t.* {sql_target_only_base} LIMIT 1000")
            target_only_data = clean_for_json(target_only_df.to_dict(orient='records'))

            # 3. 相同数据（Same）
            if compare_columns:
                same_conditions = [f"(s.{sc} = t.{sc} OR (s.{sc} IS NULL AND t.{sc} IS NULL))" for sc in safe_compare_cols]
                if use_sampling:
                    sql_same_base = f"""
                        FROM {safe_sample_t1} s 
                        INNER JOIN {safe_sample_t2} t ON {join_on}
                        WHERE {" AND ".join(same_conditions)}
                    """
                else:
                    sql_same_base = f"""
                        FROM {safe_t1} s 
                        INNER JOIN {safe_t2} t ON {join_on}
                        WHERE {" AND ".join(same_conditions)}
                    """
            else:
                if use_sampling:
                    sql_same_base = f"""
                        FROM {safe_sample_t1} s 
                        INNER JOIN {safe_sample_t2} t ON {join_on}
                    """
                else:
                    sql_same_base = f"""
                        FROM {safe_t1} s 
                        INNER JOIN {safe_t2} t ON {join_on}
                    """
            
            same_count = int(duckdb_instance.fetch_df(f"SELECT COUNT(*) as cnt {sql_same_base}").iloc[0]['cnt'])
            same_df = duckdb_instance.fetch_df(f"SELECT s.* {sql_same_base} LIMIT 1000")
            same_data = clean_for_json(same_df.to_dict(orient='records'))

            # 4. 差异数据（Different）
            different_data = []
            different_count = 0
            if compare_columns:
                diff_conditions = [f"(s.{sc} != t.{sc} OR (s.{sc} IS NULL AND t.{sc} IS NOT NULL) OR (s.{sc} IS NOT NULL AND t.{sc} IS NULL))" for sc in safe_compare_cols]
                if use_sampling:
                    sql_diff_base = f"""
                        FROM {safe_sample_t1} s 
                        INNER JOIN {safe_sample_t2} t ON {join_on}
                        WHERE {" OR ".join(diff_conditions)}
                    """
                else:
                    sql_diff_base = f"""
                        FROM {safe_t1} s 
                        INNER JOIN {safe_t2} t ON {join_on}
                        WHERE {" OR ".join(diff_conditions)}
                    """
                different_count = int(duckdb_instance.fetch_df(f"SELECT COUNT(*) as cnt {sql_diff_base}").iloc[0]['cnt'])
                sql_different = f"""
                    SELECT s.*, 
                           {", ".join([f"t.{sc} AS _target_{c}" for sc, c in zip(safe_compare_cols, compare_columns)])}
                    {sql_diff_base}
                    LIMIT 1000
                """
                different_df = duckdb_instance.fetch_df(sql_different)
                different_data = clean_for_json(different_df.to_dict(orient='records'))
        finally:
            # 确保无论是否异常，临时采样表都会被清理
            if use_sampling and safe_sample_t1 and safe_sample_t2:
                try:
                    duckdb_instance.query(f"DROP TABLE IF EXISTS {safe_sample_t1}")
                    duckdb_instance.query(f"DROP TABLE IF EXISTS {safe_sample_t2}")
                except Exception as e:
                    logger.debug(f"清理采样临时表失败: {e}")
        
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

