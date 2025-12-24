from typing import List, Dict, Any, Optional
import logging
import pandas as pd
import numpy as np
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from .analysis_models import AnalysisDataset, AnalysisModel
from .analysis_schemas import ModelCreate, ModelUpdate
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
        # 优化：对于大数据集，使用采样进行相关性分析，避免 OOM 并提高速度
        sql = f"SELECT * FROM {dataset.table_name}"
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
        # 处理时间列格式，仅替换 'T'
        for col in df.select_dtypes(include=['datetime64', 'datetimetz']).columns:
            df[col] = df[col].astype(str).str.replace('T', ' ', regex=False)
            
        # 转换为列表，处理 NaN/Inf 为 JSON 兼容的 null
        return df.replace([np.inf, -np.inf], np.nan).astype(object).where(pd.notnull(df), None).to_dict(orient='records')

    @staticmethod
    async def execute_sql(db: AsyncSession, sql: str, save_as: Optional[str] = None) -> Dict[str, Any]:
        """执行自定义SQL查询"""
        # 安全检查：禁止危险操作
        sql_upper = sql.upper().strip()
        forbidden_keywords = ['DROP', 'DELETE', 'TRUNCATE', 'ALTER', 'CREATE DATABASE', 'INSERT', 'UPDATE']
        for keyword in forbidden_keywords:
            if keyword in sql_upper:
                raise ValueError(f"禁止使用 {keyword} 操作")
        
        try:
            df = duckdb_instance.fetch_df(sql)
            # 处理时间列格式，仅替换 'T'
            for col in df.select_dtypes(include=['datetime64', 'datetimetz']).columns:
                df[col] = df[col].astype(str).str.replace('T', ' ', regex=False)

            result = {
                "columns": df.columns.tolist(),
                "rows": df.replace([np.inf, -np.inf], np.nan).astype(object).where(pd.notnull(df), None).to_dict(orient='records'),
                "row_count": len(df)
            }
            
            # 如果需要保存为新数据集
            if save_as:
                table_name = f"user_sql_{save_as}_{int(pd.Timestamp.now().timestamp())}"
                # 创建表并保存
                duckdb_instance.conn.execute(f"CREATE TABLE {table_name} AS {sql}")
                
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
            logger.error(f"SQL执行失败: {e}")
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
            raise ValueError("Model not found")
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
        await db.commit()
        return True
