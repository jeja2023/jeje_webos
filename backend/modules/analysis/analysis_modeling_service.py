"""
Analysis 模块业务服务层
"""

from typing import List, Dict, Any, Optional
import logging
import re
import pandas as pd
import numpy as np
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from .analysis_models import AnalysisDataset, AnalysisModel
from .analysis_schemas import ModelCreate, ModelUpdate
from .analysis_duckdb_service import duckdb_instance
from utils.sql_safety import is_safe_table_name, is_safe_column_name, escape_sql_identifier, validate_and_escape_identifiers

logger = logging.getLogger(__name__)

# ========== SQL 安全白名单 ==========
ALLOWED_AGG_FUNCTIONS = {'sum', 'avg', 'count', 'max', 'min', 'stddev', 'variance', 'median'}
ALLOWED_SORT_ORDERS = {'asc', 'desc'}

# DuckDB 危险命令白名单：仅允许 SELECT / WITH 开头
_SQL_SAFE_PATTERN = re.compile(r'^\s*(SELECT|WITH)\b', re.IGNORECASE)
# 禁止的 DuckDB 特有危险命令
_SQL_FORBIDDEN_COMMANDS = re.compile(
    r'\b(DROP|DELETE|TRUNCATE|ALTER|INSERT|UPDATE|CREATE|COPY|EXPORT|IMPORT|ATTACH|LOAD|INSTALL|CALL|PRAGMA)\b',
    re.IGNORECASE
)
# 禁止的 DuckDB 文件读取函数（防止通过 SELECT 绕过读取服务器任意文件）
_SQL_FORBIDDEN_FUNCTIONS = re.compile(
    r'\b(read_csv|read_csv_auto|read_parquet|read_json|read_json_auto|read_text|read_blob|'
    r'read_ndjson|read_ndjson_auto|read_ndjson_objects|glob|ST_Read|'
    r'http_get|httpfs|parquet_scan|parquet_metadata|iceberg_scan)\s*\(',
    re.IGNORECASE
)


def _validate_sql_readonly(sql: str) -> None:
    """验证 SQL 语句只包含只读查询（白名单方式）"""
    stripped = sql.strip().rstrip(';').strip()
    
    # 禁止多语句（分号分隔）
    if ';' in stripped:
        raise ValueError("禁止执行多条 SQL 语句")
    
    # 白名单：必须以 SELECT 或 WITH 开头
    if not _SQL_SAFE_PATTERN.match(stripped):
        raise ValueError("仅允许 SELECT 查询语句")
    
    # 黑名单补充检查：禁止危险命令关键字（防止子查询中嵌入）
    if _SQL_FORBIDDEN_COMMANDS.search(stripped):
        raise ValueError("SQL 语句中包含禁止的操作关键字")
    
    # 禁止 DuckDB 文件读取函数（防止任意文件读取攻击）
    if _SQL_FORBIDDEN_FUNCTIONS.search(stripped):
        raise ValueError("SQL 语句中包含禁止的文件读取函数")


def _validate_columns(columns: List[str]) -> List[str]:
    """验证并转义列名列表"""
    return validate_and_escape_identifiers(columns, "列")


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
        if not is_safe_table_name(dataset.table_name):
            raise ValueError("不安全的表名")
        safe_table = escape_sql_identifier(dataset.table_name)
        cols_str = "*" if not columns else ", ".join(_validate_columns(columns))
        # 大数据集采样保护：超过 100K 行时自动采样，防止 OOM
        row_count_result = duckdb_instance.fetch_df(f"SELECT COUNT(*) as cnt FROM {safe_table}")
        total_rows = int(row_count_result.iloc[0]['cnt']) if len(row_count_result) > 0 else 0
        sample_clause = " USING SAMPLE 100000 ROWS" if total_rows > 100000 else ""
        df = duckdb_instance.fetch_df(f"SELECT {cols_str} FROM {safe_table}{sample_clause}")
        
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
        if not is_safe_table_name(dataset.table_name):
            raise ValueError("不安全的表名")
        safe_table = escape_sql_identifier(dataset.table_name)
        # 只选取数值型列
        # 优化：对于大数据集，使用采样进行相关性分析，避免 OOM 并提高速度
        sql = f"SELECT * FROM {safe_table}"
        if dataset.row_count and dataset.row_count > 20000:
            sql += " USING SAMPLE 20000"
            
        df = duckdb_instance.fetch_df(sql)
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
        if not is_safe_table_name(dataset.table_name):
            raise ValueError("不安全的表名")
        safe_table = escape_sql_identifier(dataset.table_name)
        
        # 验证并转义 group_by 列名
        safe_group_by = _validate_columns(group_by)
        
        # 验证聚合函数和列名
        agg_parts = []
        for col, func in aggregates.items():
            if not is_safe_column_name(col):
                raise ValueError(f"不安全的列名: {col}")
            func_lower = func.lower().strip()
            if func_lower not in ALLOWED_AGG_FUNCTIONS:
                raise ValueError(f"不支持的聚合函数: {func}，允许的函数: {', '.join(ALLOWED_AGG_FUNCTIONS)}")
            safe_col = escape_sql_identifier(col)
            safe_alias = escape_sql_identifier(f"{func_lower}_{col}")
            agg_parts.append(f"{func_lower}({safe_col}) as {safe_alias}")
            
        sql = f"""
            SELECT {", ".join(safe_group_by)}, {", ".join(agg_parts)}
            FROM {safe_table}
            GROUP BY {", ".join(safe_group_by)}
            ORDER BY {safe_group_by[0]}
        """
        
        df = duckdb_instance.fetch_df(sql)
        # 处理时间列格式，仅替换 'T'
        for col in df.select_dtypes(include=['datetime64', 'datetimetz']).columns:
            df[col] = df[col].astype(str).str.replace('T', ' ', regex=False)
            
        # 转换为列表，处理 NaN/Inf 为 JSON 兼容的 null
        replaced = df.replace([np.inf, -np.inf], np.nan)
        return replaced.astype(object).where(pd.notnull(replaced), None).to_dict(orient='records')

    @staticmethod
    async def execute_sql(db: AsyncSession, sql: str, save_as: Optional[str] = None, limit: int = 1000) -> Dict[str, Any]:
        """执行自定义SQL查询"""
        # 安全检查：白名单方式，仅允许 SELECT 查询
        _validate_sql_readonly(sql)
        
        try:
            # 如果是预览模式（不保存为数据集），则强制限制返回行数，防止 OOM
            execute_sql = sql
            if not save_as:
                # 使用子查询方式限制行数，避免直接修改用户 SQL 可能导致的语法错误
                # 同时也避免了解析 SQL 查找 LIMIT 关键字的复杂性
                execute_sql = f"SELECT * FROM ({sql}) LIMIT {limit}"
                
            df = duckdb_instance.fetch_df(execute_sql)
            
            # 处理时间列格式，仅替换 'T'
            for col in df.select_dtypes(include=['datetime64', 'datetimetz']).columns:
                df[col] = df[col].astype(str).str.replace('T', ' ', regex=False)

            result = {
                "columns": df.columns.tolist(),
                "rows": df.replace([np.inf, -np.inf], np.nan).pipe(lambda d: d.astype(object).where(pd.notnull(d), None)).to_dict(orient='records'),
                "row_count": len(df)
            }
            
            # 如果需要保存为新数据集
            if save_as:
                # 检查结果行数，限制为 100 万行
                max_rows = 1000000  # 100万行
                if len(df) > max_rows:
                    raise ValueError(f"查询结果过大（{len(df):,} 行），超过限制（{max_rows:,} 行）。请添加筛选条件或使用 LIMIT 子句限制结果数量。")
                
                # 验证 save_as 参数安全性（防止 SQL 注入）
                if not is_safe_table_name(save_as):
                    raise ValueError(f"不安全的数据集名称: {save_as}，只允许字母、数字和下划线")
                
                table_name = f"user_sql_{save_as}_{int(pd.Timestamp.now().timestamp())}"
                safe_table_name = escape_sql_identifier(table_name)
                # 创建表并保存（使用原始 SQL，保存全量数据）
                duckdb_instance.query(f"CREATE TABLE {safe_table_name} AS {sql}")
                
                # 记录到数据集表
                from .analysis_models import AnalysisDataset
                new_dataset = AnalysisDataset(
                    name=save_as,
                    source_type="sql",
                    table_name=table_name,
                    row_count=len(df),
                    config={"original_sql": sql}
                )
                db.add(new_dataset)
                await db.commit()
                await db.refresh(new_dataset)
                
                result["saved_dataset"] = {
                    "id": new_dataset.id,
                    "name": new_dataset.name,
                    "table_name": new_dataset.table_name
                }
                logger.info(f"SQL建模结果已保存为数据集: {save_as}")
            
            return result
        except Exception as e:
            logger.error(f"SQL执行失败: {e}", exc_info=True)
            raise ValueError(f"SQL执行失败: {str(e)}")

    # --- 模型 CRUD ---
    @staticmethod
    async def list_models(db: AsyncSession) -> List[AnalysisModel]:
        """列出所有模型"""
        res = await db.execute(select(AnalysisModel).order_by(AnalysisModel.updated_at.desc()))
        return res.scalars().all()

    @staticmethod
    async def create_model(db: AsyncSession, data: ModelCreate) -> AnalysisModel:
        """创建模型"""
        model = AnalysisModel(**data.model_dump())
        db.add(model)
        await db.commit()
        await db.refresh(model)
        return model

    @staticmethod
    async def get_model(db: AsyncSession, model_id: int) -> AnalysisModel:
        """获取单个模型详情"""
        result = await db.execute(select(AnalysisModel).where(AnalysisModel.id == model_id))
        model = result.scalar_one_or_none()
        if not model:
            raise ValueError("模型不存在")
        return model

    @staticmethod
    async def update_model(db: AsyncSession, model_id: int, data: ModelUpdate) -> AnalysisModel:
        """更新模型信息"""
        model = await ModelingService.get_model(db, model_id)
        
        for k, v in data.model_dump(exclude_unset=True).items():
            setattr(model, k, v)
        
        await db.commit()
        await db.refresh(model)
        return model
        
    @staticmethod
    async def save_model_graph(db: AsyncSession, model_id: int, graph_config: Dict, status: Optional[str] = None) -> AnalysisModel:
        """保存模型图配置"""
        model = await ModelingService.get_model(db, model_id)
            
        model.graph_config = graph_config
        if status:
            model.status = status
            
        await db.commit()
        await db.refresh(model)
        return model

    @staticmethod
    async def delete_model(db: AsyncSession, model_id: int) -> bool:
        """删除模型"""
        model = await ModelingService.get_model(db, model_id)
        await db.delete(model)
        await db.flush()
        await db.commit()
        return True
