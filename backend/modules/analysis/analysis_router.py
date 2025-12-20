from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Dict, Any

from core.database import get_db
from core.security import get_current_user, TokenData, require_permission
from schemas.response import success, error
from .analysis_schemas import (
    DatasetResponse, ImportFileRequest, 
    ImportDatabaseRequest, CompareRequest
)
from .analysis_import_service import ImportService
from .analysis_compare_service import CompareService
from .analysis_cleaning_service import CleaningService
from .analysis_modeling_service import ModelingService
from .analysis_duckdb_service import duckdb_instance
from .analysis_models import AnalysisDataset
from .analysis_schemas import (
    DatasetResponse, ImportFileRequest, 
    ImportDatabaseRequest, CompareRequest,
    CleaningRequest, ModelingSummaryRequest,
    ModelingCorrelationRequest, ModelingAggregateRequest
)
from sqlalchemy import select

router = APIRouter()

@router.get("/datasets")
async def list_datasets(
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user)
):
    """获取所有数据集列表"""
    datasets = await ImportService.list_datasets(db)
    return success([
        {
            "id": d.id,
            "name": d.name,
            "source_type": d.source_type,
            "table_name": d.table_name,
            "row_count": d.row_count,
            "created_at": d.created_at
        } for d in datasets
    ])

@router.post("/import/file")
async def import_file(
    req: ImportFileRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:import"))
):
    """从已上传文件导入"""
    try:
        dataset = await ImportService.import_from_file(db, req.name, req.file_id, req.options)
        return success({
            "id": dataset.id,
            "name": dataset.name,
            "table_name": dataset.table_name,
            "row_count": dataset.row_count
        }, "导入成功")
    except Exception as e:
        return error(str(e))

@router.post("/import/database")
async def import_database(
    req: ImportDatabaseRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:import"))
):
    """从外部数据库导入"""
    try:
        dataset = await ImportService.import_from_database(
            db, req.name, req.connection_url, req.query, req.options
        )
        return success({
            "id": dataset.id,
            "name": dataset.name,
            "table_name": dataset.table_name,
            "row_count": dataset.row_count
        }, "导入成功")
    except Exception as e:
        return error(str(e))

@router.get("/datasets/{dataset_id}/data")
async def get_dataset_data(
    dataset_id: int,
    page: int = 1,
    size: int = 50,
    sort: Optional[str] = None, # 格式: field1:asc,field2:desc
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:view"))
):
    """获取数据集内容（支持分页、多字段排序）"""
    # 1. 获取表名
    res = await db.execute(select(AnalysisDataset).where(AnalysisDataset.id == dataset_id))
    dataset = res.scalar_one_or_none()
    if not dataset:
        return error("数据集不存在")

    table_name = dataset.table_name
    
    # 2. 构造排序 SQL
    order_by = ""
    if sort:
        sort_parts = []
        for part in sort.split(','):
            field, order = part.split(':') if ':' in part else (part, 'asc')
            # 简单防注入：检查字段名是否只含字母数字下划线
            if field.replace('_', '').isalnum():
                sort_parts.append(f"{field} {order}")
        if sort_parts:
            order_by = f"ORDER BY {', '.join(sort_parts)}"

    # 3. 分页查询
    offset = (page - 1) * size
    sql = f"SELECT * FROM {table_name} {order_by} LIMIT {size} OFFSET {offset}"
    
    try:
        df = duckdb_instance.fetch_df(sql)
        # 转换为列表，处理 NaN/None
        records = df.where(df.notnull(), None).to_dict(orient='records')
        
        return success({
            "items": records,
            "total": dataset.row_count,
            "page": page,
            "size": size,
            "columns": df.columns.tolist()
        })
    except Exception as e:
        return error(f"查询失败: {str(e)}")

@router.post("/compare")
async def compare(
    req: CompareRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:compare"))
):
    """数据比对"""
    try:
        result = await CompareService.compare_datasets(
            db, req.source_id, req.target_id, req.join_keys, req.compare_columns
        )
        return success(result)
    except Exception as e:
        return error(str(e))

@router.delete("/datasets/{dataset_id}")
async def delete_dataset(
    dataset_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:import"))
):
    """删除数据集"""
    deleted = await ImportService.delete_dataset(db, dataset_id)
    if deleted:
        return success(None, "删除成功")
    return error("数据集不存在")

# --- 数据清洗 ---
@router.post("/clean")
async def clean_data(
    req: CleaningRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:clean"))
):
    """执行数据清洗"""
    try:
        dataset = await CleaningService.apply_cleaning(db, req)
        return success({
            "id": dataset.id,
            "name": dataset.name,
            "row_count": dataset.row_count
        }, "清洗成功")
    except Exception as e:
        return error(str(e))

# --- 数据建模 ---
@router.post("/model/summary")
async def get_summary(
    req: ModelingSummaryRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:model"))
):
    """描述性统计"""
    try:
        result = await ModelingService.get_summary(db, req.dataset_id, req.columns)
        return success(result)
    except Exception as e:
        return error(str(e))

@router.post("/model/correlation")
async def get_correlation(
    req: ModelingCorrelationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:model"))
):
    """相关性分析"""
    try:
        result = await ModelingService.get_correlation(db, req.dataset_id, req.columns)
        return success(result)
    except Exception as e:
        return error(str(e))

@router.post("/model/aggregate")
async def get_aggregate(
    req: ModelingAggregateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:model"))
):
    """数据聚合"""
    try:
        result = await ModelingService.get_aggregation(db, req.dataset_id, req.group_by, req.aggregates)
        return success(result)
    except Exception as e:
        return error(str(e))
