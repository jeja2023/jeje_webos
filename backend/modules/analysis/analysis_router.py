from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
import uuid
import pandas as pd
import numpy as np
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Dict, Any

from core.database import get_db
from core.security import get_current_user, TokenData, require_permission
from schemas.response import success, error
from .analysis_schemas import (
    DatasetResponse, ImportFileRequest, 
    ImportDatabaseRequest, DbTablesRequest, CompareRequest
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
    ModelingCorrelationRequest, ModelingAggregateRequest,
    ModelingSqlRequest,
    ModelCreate, ModelUpdate, ModelResponse, ModelSaveGraphRequest,
    ETLExecuteNodeRequest, ETLPreviewNodeRequest,
    DashboardCreate, DashboardUpdate, DashboardResponse
)
from .analysis_bi_service import BIService
from .analysis_etl_service import ETLExecutionService

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
        dataset = await ImportService.import_from_file(
            db, req.name, req.file_id, req.options, source=req.source
        )
        return success({
            "id": dataset.id,
            "name": dataset.name,
            "table_name": dataset.table_name,
            "row_count": dataset.row_count
        }, "导入成功")
    except Exception as e:
        return error(message=str(e))

@router.post("/import/database")
async def import_database(
    req: ImportDatabaseRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:import"))
):
    """从外部数据库导入（支持测试连接模式）"""
    try:
        # 测试连接模式
        if req.test_only:
            from sqlalchemy import create_engine, text
            engine = create_engine(req.connection_url, pool_pre_ping=True)
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            engine.dispose()
            return success({"connected": True}, "连接成功")
        
        # 正常导入模式
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

@router.post("/import/db-tables")
async def get_db_tables(
    req: DbTablesRequest,
    current_user: TokenData = Depends(require_permission("analysis:import"))
):
    """获取数据库中的所有表名"""
    try:
        from sqlalchemy import create_engine, inspect
        
        engine = create_engine(req.connection_url, pool_pre_ping=True)
        inspector = inspect(engine)
        tables = inspector.get_table_names()
        engine.dispose()
        
        return success({"tables": tables}, f"发现 {len(tables)} 个表")
    except Exception as e:
        return error(f"连接失败: {str(e)}")

@router.get("/datasets/{dataset_id}/data")
async def get_dataset_data(
    dataset_id: int,
    page: int = 1,
    size: int = 50,
    sort: Optional[str] = None, # 格式: field1:asc,field2:desc
    search: Optional[str] = None, # 搜索关键词
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:view"))
):
    """获取数据集内容（支持分页、多字段排序、搜索）"""
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
                sort_parts.append(f'"{field}" {order}')
        if sort_parts:
            order_by = f"ORDER BY {', '.join(sort_parts)}"

    # 3. 构造搜索条件
    where_clause = ""
    if search and search.strip():
        # 获取所有列名
        try:
            cols_df = duckdb_instance.fetch_df(f"DESCRIBE {table_name}")
            cols = cols_df['column_name'].tolist()
            # 构建 LIKE 条件（对所有字符串列）
            search_escaped = search.replace("'", "''")
            like_conditions = [f'CAST("{col}" AS VARCHAR) ILIKE \'%{search_escaped}%\'' for col in cols]
            where_clause = f"WHERE ({' OR '.join(like_conditions)})"
        except:
            pass

    # 4. 获取过滤后的总数
    try:
        count_sql = f"SELECT COUNT(*) as cnt FROM {table_name} {where_clause}"
        count_df = duckdb_instance.fetch_df(count_sql)
        filtered_total = int(count_df['cnt'].iloc[0])
    except:
        filtered_total = dataset.row_count

    # 5. 分页查询
    offset = (page - 1) * size
    sql = f"SELECT * FROM {table_name} {where_clause} {order_by} LIMIT {size} OFFSET {offset}"
    
    try:
        df = duckdb_instance.fetch_df(sql)
        
        # 自动处理日期时间列显示，仅替换 'T'，不强制改变格式精度
        for col in df.select_dtypes(include=['datetime64', 'datetimetz']).columns:
            df[col] = df[col].astype(str).str.replace('T', ' ', regex=False)

        # 转换为列表，处理 NaN/Inf 为 JSON 兼容的 null
        records = df.replace([np.inf, -np.inf], np.nan).astype(object).where(pd.notnull(df), None).to_dict(orient='records')
        
        return success({
            "items": records,
            "total": dataset.row_count,
            "filtered_total": filtered_total,
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
        result = await CleaningService.apply_cleaning(db, req)
        msg = "清洗预览完成" if req.save_mode == "preview" else "清洗成功"
        return success(result, msg)
    except Exception as e:
        return error(message=str(e))

@router.post("/clean/export")
async def export_cleaned_data(
    req: CleaningRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:clean"))
):
    """导出清洗后的数据（不保存也可以导出）"""
    try:
        import urllib.parse
        
        output = await CleaningService.export_cleaning(db, req)
        filename = f"cleaned_data_{uuid.uuid4().hex[:8]}.csv"
        
        return StreamingResponse(
            output,
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename={urllib.parse.quote(filename)}"
            }
        )
    except Exception as e:
        return error(message=str(e))

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

@router.post("/model/sql")
async def execute_sql(
    req: ModelingSqlRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:model"))
):
    """SQL建模 - 执行自定义SQL查询"""
    try:
        result = await ModelingService.execute_sql(db, req.sql, req.save_as)
        return success(result)
    except Exception as e:
        return error(str(e))

@router.get("/tables")
async def list_tables(
    current_user: TokenData = Depends(require_permission("analysis:view"))
):
    """获取可用的表名列表（供SQL建模使用）"""
    try:
        df = duckdb_instance.fetch_df("SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'")
        return success(df['table_name'].tolist())
    except Exception as e:
        return error(str(e))

# --- ETL 模型管理 ---
@router.get("/models")
async def list_models(
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:model"))
):
    """获取所有模型"""
    models = await ModelingService.list_models(db)
    # 使用 Pydantic 转换
    data = [ModelResponse.model_validate(m).model_dump() for m in models]
    return success(data)

@router.post("/models")
async def create_model(
    req: ModelCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:model"))
):
    """创建新模型"""
    try:
        model = await ModelingService.create_model(db, req)
        return success(ModelResponse.model_validate(model).model_dump())
    except Exception as e:
        return error(str(e))

@router.get("/models/{model_id}")
async def get_model(
    model_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:model"))
):
    """获取模型详情"""
    try:
        model = await ModelingService.get_model(db, model_id)
        return success(ModelResponse.model_validate(model).model_dump())
    except Exception as e:
        return error(str(e))

@router.put("/models/{model_id}")
async def update_model(
    model_id: int,
    req: ModelUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:model"))
):
    """更新模型基本信息"""
    try:
        model = await ModelingService.update_model(db, model_id, req)
        return success(ModelResponse.model_validate(model).model_dump())
    except Exception as e:
        return error(str(e))

@router.post("/models/{model_id}/graph")
async def save_model_graph(
    model_id: int,
    req: ModelSaveGraphRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:model"))
):
    """保存模型图配置"""
    try:
        model = await ModelingService.save_model_graph(db, model_id, req.graph_config, req.status)
        return success(ModelResponse.model_validate(model).model_dump())
    except Exception as e:
        return error(str(e))

@router.delete("/models/{model_id}")
async def delete_model(
    model_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:model"))
):
    """删除模型"""
    try:
        await ModelingService.delete_model(db, model_id)
        return success(None, "删除成功")
    except Exception as e:
        return error(str(e))


# ============ ETL 节点执行 ============


@router.post("/etl/execute")
async def execute_etl_node(
    req: ETLExecuteNodeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:model"))
):
    """
    执行单个 ETL 节点
    
    执行指定节点及其所有上游依赖，缓存结果供后续预览使用。
    """
    try:
        # 获取节点配置
        nodes = req.graph_config.get('nodes', [])
        node = None
        for n in nodes:
            if n.get('id') == req.node_id:
                node = n
                break
        
        if not node:
            return error(message=f"找不到节点: {req.node_id}")
        
        # 执行节点
        result = await ETLExecutionService.execute_node(
            db, req.model_id, node, req.graph_config
        )
        
        if result.get('success'):
            return success(result, "节点执行成功")
        else:
            return error(message=result.get('error', '执行失败'))
            
    except Exception as e:
        import traceback
        traceback.print_exc()
        return error(message=f"执行失败: {str(e)}")


@router.post("/models/{model_id}/execute")
async def execute_model(
    model_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:model"))
):
    """
    执行整个模型
    只运行所有输出(Sink)节点，用于刷新最终结果。
    """
    try:
        result = await ETLExecutionService.execute_model(db, model_id)
        if result["success"] == result["total"] and result["total"] > 0:
             return success(result, "模型执行成功")
        elif result["success"] > 0:
             return success(result, f"部分成功 ({result['success']}/{result['total']})")
        else:
             return error(message=f"执行失败: {result['details'][0]['message'] if result['details'] else '未知错误'}")
             
    except Exception as e:
        import traceback
        traceback.print_exc()
        return error(message=f"执行失败: {str(e)}")

@router.post("/etl/preview")
async def preview_etl_node(
    req: ETLPreviewNodeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:model"))
):
    """
    预览 ETL 节点结果
    
    仅返回已执行节点的缓存结果，不触发新的执行。
    """
    try:
        cached_df = ETLExecutionService.get_cached_result(req.model_id, req.node_id)
        
        if cached_df is None:
            return error(message="节点尚未执行，请先运行此节点")
        
        # 返回预览数据
        preview_rows = min(50, len(cached_df))
        preview_df = cached_df.head(preview_rows)
        preview_data = ETLExecutionService._df_to_records(preview_df)
        
        return success({
            "node_id": req.node_id,
            "row_count": len(cached_df),
            "column_count": len(cached_df.columns),
            "columns": cached_df.columns.tolist(),
            "preview": preview_data,
            "preview_count": preview_rows
        })
        
    except Exception as e:
        return error(message=f"预览失败: {str(e)}")


@router.post("/etl/clear-cache")
async def clear_etl_cache(
    model_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:model"))
):
    """清除 ETL 节点执行缓存"""
    try:
        ETLExecutionService.clear_cache(model_id)
        return success(None, "缓存已清除")
    except Exception as e:
        return error(message=str(e))


# ============ BI 仪表盘 ============

@router.get("/dashboards")
async def list_dashboards(
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:view"))
):
    """获取所有仪表盘列表"""
    try:
        items = await BIService.list_dashboards(db)
        return success([DashboardResponse.model_validate(i).model_dump() for i in items])
    except Exception as e:
        import traceback
        traceback.print_exc()
        return error(str(e))

@router.post("/dashboards")
async def create_dashboard(
    req: DashboardCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:model"))
):
    """创建仪表盘"""
    try:
        item = await BIService.create_dashboard(db, req)
        return success(DashboardResponse.model_validate(item).model_dump())
    except Exception as e:
        return error(str(e))

@router.get("/dashboards/{dashboard_id}")
async def get_dashboard(
    dashboard_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:view"))
):
    """获取仪表盘详情"""
    try:
        item = await BIService.get_dashboard(db, dashboard_id)
        return success(DashboardResponse.model_validate(item).model_dump())
    except Exception as e:
        return error(str(e))

@router.put("/dashboards/{dashboard_id}")
async def update_dashboard(
    dashboard_id: int,
    req: DashboardUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:model"))
):
    """更新仪表盘内容"""
    try:
        item = await BIService.update_dashboard(db, dashboard_id, req)
        return success(DashboardResponse.model_validate(item).model_dump())
    except Exception as e:
        return error(str(e))

@router.delete("/dashboards/{dashboard_id}")
async def delete_dashboard(
    dashboard_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:model"))
):
    """删除仪表盘"""
    try:
        await BIService.delete_dashboard(db, dashboard_id)
        return success(None, "删除成功")
    except Exception as e:
        return error(str(e))


