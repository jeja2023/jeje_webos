from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Response, Form
from fastapi.responses import StreamingResponse, FileResponse
import uuid
import json
import logging
import pandas as pd
import numpy as np
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Dict, Any

from core.database import get_db
from core.security import get_current_user, TokenData, require_permission
from schemas.response import success, error
from .analysis_schemas import (
    DatasetCreate, DatasetUpdate, DatasetResponse,
    ImportFileRequest, ImportPreviewRequest, BatchImportFileRequest,
    ImportDatabaseRequest, DbTablesRequest,
    CompareRequest, CleaningRequest,
    ModelingSummaryRequest, ModelingCorrelationRequest, ModelingAggregateRequest,
    ModelingSqlRequest,
    ModelCreate, ModelUpdate, ModelResponse, ModelSaveGraphRequest,
    ETLExecuteNodeRequest, ETLPreviewNodeRequest,
    DashboardCreate, DashboardUpdate, DashboardResponse,
    SmartTableCreate, SmartTableUpdate, SmartTableResponse,
    SmartTableDataRow, SmartTableDataUpdate,
    SmartReportCreate, SmartReportUpdate, SmartReportResponse,
    SmartReportUpdateContentRequest,
    AnalysisChartCreate, AnalysisChartUpdate, AnalysisChartResponse,
    SmartReportRecordCreate, SmartReportRecordResponse,
    GenerateReportRequest
)
from .analysis_import_service import ImportService
from .analysis_compare_service import CompareService
from .analysis_cleaning_service import CleaningService
from .analysis_modeling_service import ModelingService
from .analysis_duckdb_service import duckdb_instance
from .analysis_models import AnalysisDataset
from .analysis_bi_service import BIService
from .analysis_etl_service import ETLExecutionService
from .analysis_smart_table_service import SmartTableService
from .analysis_smart_report_service import SmartReportService
from .analysis_chart_service import AnalysisChartService

from sqlalchemy import select

logger = logging.getLogger(__name__)

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

@router.post("/import/preview")
async def import_preview(
    req: ImportPreviewRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:import"))
):
    """文件预览"""
    try:
        result = await ImportService.preview_file(db, req.file_id, req.source)
        return success(result)
    except Exception as e:
        return error(message=str(e))

@router.post("/import/batch-files")
async def import_batch_files(
    req: BatchImportFileRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:import"))
):
    """批量文件导入"""
    results = []
    errors = []
    for item in req.items:
        try:
            dataset = await ImportService.import_from_file(
                db, item.name, item.file_id, item.options, source=item.source
            )
            results.append({
                "id": dataset.id,
                "name": dataset.name,
                "row_count": dataset.row_count
            })
        except Exception as e:
            errors.append({"name": item.name, "error": str(e)})
    
    return success({
        "success": results,
        "failed": errors,
        "count": len(results),
        "total": len(req.items)
    }, "处理完成")

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
    sorts: Optional[str] = None, # JSON格式的多字段排序 [{field, order}]
    filters: Optional[str] = None, # JSON格式的筛选条件 {field: {op, value}}
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:view"))
):
    """获取数据集内容（支持分页、多字段排序、搜索、筛选）"""
    import json
    
    # 1. 获取表名
    res = await db.execute(select(AnalysisDataset).where(AnalysisDataset.id == dataset_id))
    dataset = res.scalar_one_or_none()
    if not dataset:
        return error("数据集不存在")

    table_name = dataset.table_name
    
    # 1.5. 检查表是否存在（在查询前检查）
    try:
        if not duckdb_instance.table_exists(table_name):
            return error(f"数据集表不存在，表名: {table_name}。可能数据已被删除，请重新导入数据。")
    except Exception as e:
        logger.error(f"检查表存在性失败: {e}")
        return error(f"无法访问数据集: {str(e)}")
    
    # 2. 构造排序 SQL
    order_by = ""
    # 优先使用 sorts 参数（多字段排序数组）
    if sorts:
        try:
            sorts_list = json.loads(sorts)
            sort_parts = []
            for s in sorts_list:
                field = s.get('field', '')
                order = s.get('order', 'asc')
                if field and field.replace('_', '').isalnum():
                    sort_parts.append(f'"{field}" {order}')
            if sort_parts:
                order_by = f"ORDER BY {', '.join(sort_parts)}"
        except:
            pass
    # 回退到旧的 sort 参数
    elif sort:
        sort_parts = []
        for part in sort.split(','):
            field, order = part.split(':') if ':' in part else (part, 'asc')
            if field.replace('_', '').isalnum():
                sort_parts.append(f'"{field}" {order}')
        if sort_parts:
            order_by = f"ORDER BY {', '.join(sort_parts)}"

    # 3. 构造筛选条件
    where_conditions = []
    
    # 解析 filters 参数
    if filters:
        try:
            filters_dict = json.loads(filters)
            for field, cond in filters_dict.items():
                if not field or not field.replace('_', '').isalnum():
                    continue
                    
                op = cond.get('op', 'eq') if isinstance(cond, dict) else 'eq'
                value = cond.get('value', '') if isinstance(cond, dict) else str(cond)
                
                # 转义单引号防注入
                value_escaped = str(value).replace("'", "''")
                
                if op == 'eq':
                    where_conditions.append(f'"{field}" = \'{value_escaped}\'')
                elif op == 'ne':
                    where_conditions.append(f'"{field}" != \'{value_escaped}\'')
                elif op == 'gt':
                    where_conditions.append(f'TRY_CAST("{field}" AS DOUBLE) > {value_escaped}')
                elif op == 'gte':
                    where_conditions.append(f'TRY_CAST("{field}" AS DOUBLE) >= {value_escaped}')
                elif op == 'lt':
                    where_conditions.append(f'TRY_CAST("{field}" AS DOUBLE) < {value_escaped}')
                elif op == 'lte':
                    where_conditions.append(f'TRY_CAST("{field}" AS DOUBLE) <= {value_escaped}')
                elif op == 'like':
                    where_conditions.append(f'CAST("{field}" AS VARCHAR) ILIKE \'%{value_escaped}%\'')
                elif op == 'notlike':
                    where_conditions.append(f'CAST("{field}" AS VARCHAR) NOT ILIKE \'%{value_escaped}%\'')
                elif op == 'isnull':
                    where_conditions.append(f'"{field}" IS NULL')
                elif op == 'notnull':
                    where_conditions.append(f'"{field}" IS NOT NULL')
        except Exception as e:
            pass  # 解析失败时忽略筛选条件

    # 4. 添加搜索条件
    if search and search.strip():
        try:
            cols_df = duckdb_instance.fetch_df(f"DESCRIBE {table_name}")
            cols = cols_df['column_name'].tolist()
            search_escaped = search.replace("'", "''")
            like_conditions = [f'CAST("{col}" AS VARCHAR) ILIKE \'%{search_escaped}%\'' for col in cols]
            where_conditions.append(f"({' OR '.join(like_conditions)})")
        except:
            pass

    # 5. 构建 WHERE 子句
    where_clause = ""
    if where_conditions:
        where_clause = f"WHERE {' AND '.join(where_conditions)}"

    # 6. 获取过滤后的总数
    try:
        count_sql = f"SELECT COUNT(*) as cnt FROM {table_name} {where_clause}"
        count_df = duckdb_instance.fetch_df(count_sql)
        filtered_total = int(count_df['cnt'].iloc[0])
    except Exception as e:
        logger.warning(f"获取过滤总数失败，使用数据集行数: {e}")
        filtered_total = dataset.row_count
    
    # 7. 分页查询
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
        logger.error(f"查询数据集数据失败: {e}")
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
    if deleted:
        return success(None, "删除成功")
    return error("数据集不存在")

@router.put("/datasets/{dataset_id}")
async def update_dataset(
    dataset_id: int,
    req: DatasetUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:import"))
):
    """更新数据集信息"""
    try:
        updated = await ImportService.update_dataset(db, dataset_id, req.model_dump(exclude_unset=True))
        return success({
            "id": updated.id,
            "name": updated.name,
            "table_name": updated.table_name,
            "row_count": updated.row_count,
            "config": updated.config
        }, "更新成功")
    except Exception as e:
        return error(str(e))

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
        result = await ModelingService.execute_sql(db, req.sql, req.save_as, req.limit)
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



# ============ 智能表格 ============

@router.get("/smart-tables")
async def list_smart_tables(
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:view"))
):
    """获取所有智能表格列表"""
    try:
        items = await SmartTableService.get_tables(db)
        return success([SmartTableResponse.model_validate(i).model_dump() for i in items])
    except Exception as e:
        return error(str(e))

@router.get("/smart-tables/{table_id}")
async def get_smart_table(
    table_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:view"))
):
    """获取单个智能表格详情"""
    try:
        item = await SmartTableService.get_table_by_id(db, table_id)
        if not item:
            return error("表格不存在", code=404)
        return success(SmartTableResponse.model_validate(item).model_dump())
    except Exception as e:
        return error(str(e))

@router.post("/smart-tables")
async def create_smart_table(
    req: SmartTableCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:model"))
):
    """创建智能表格"""
    try:
        item = await SmartTableService.create_table(db, req)
        return success(SmartTableResponse.model_validate(item).model_dump())
    except Exception as e:
        return error(str(e))

@router.put("/smart-tables/{table_id}")
async def update_smart_table(
    table_id: int,
    req: SmartTableUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:model"))
):
    """更新智能表格定义"""
    try:
        item = await SmartTableService.update_table(db, table_id, req)
        return success(SmartTableResponse.model_validate(item).model_dump())
    except Exception as e:
        return error(str(e))

@router.delete("/smart-tables/{table_id}")
async def delete_smart_table(
    table_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:model"))
):
    """删除智能表格"""
    try:
        await SmartTableService.delete_table(db, table_id)
        return success(None, "删除成功")
    except Exception as e:
        return error(str(e))

@router.post("/smart-tables/{table_id}/sync")
async def sync_smart_table(
    table_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:model"))
):
    """将智能表格数据同步到数据集"""
    try:
        dataset = await SmartTableService.sync_to_dataset(db, table_id)
        from .analysis_schemas import DatasetResponse # assuming it exists
        return success({"dataset_id": dataset.id, "table_name": dataset.table_name}, "同步成功")
    except Exception as e:
        return error(str(e))
@router.get("/smart-tables/{table_id}/data")
async def get_smart_table_data(
    table_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:view"))
):
    """获取智能表格数据"""
    try:
        data = await SmartTableService.get_table_data(db, table_id)
        return success(data)
    except Exception as e:
        return error(str(e))

@router.post("/smart-tables/{table_id}/data")
async def add_smart_table_row(
    table_id: int,
    req_data: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:model"))
):
    """添加一行数据到智能表格"""
    try:
        await SmartTableService.add_row(db, table_id, req_data)
        return success(None, "添加成功")
    except Exception as e:
        return error(str(e))

@router.put("/smart-tables/data/{row_id}")
async def update_smart_table_row(
    row_id: int,
    req_data: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:model"))
):
    """更新智能表格中的一行数据"""
    try:
        await SmartTableService.update_row(db, row_id, req_data)
        return success(None, "更新成功")
    except Exception as e:
        return error(str(e))

@router.delete("/smart-tables/data/{row_id}")
async def delete_smart_table_row(
    row_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:model"))
):
    """删除智能表格中的一行数据"""
    try:
        await SmartTableService.delete_row(db, row_id)
        return success(None, "删除成功")
    except Exception as e:
        return error(str(e))


# ============ 智能报告 ============

@router.get("/smart-reports")
async def list_smart_reports(
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:view"))
):
    """获取所有智能报告列表"""
    try:
        items = await SmartReportService.get_reports(db)
        return success([SmartReportResponse.model_validate(i).model_dump() for i in items])
    except Exception as e:
        return error(str(e))

@router.post("/smart-reports")
async def create_smart_report(
    req: SmartReportCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:model"))
):
    """创建空白报告模板"""
    try:
        item = await SmartReportService.create_report(db, req.name)
        return success(SmartReportResponse.model_validate(item).model_dump(), "模板创建成功")
    except Exception as e:
        return error(str(e))

# 移除上传 Word 模板的功能，转为在线 Markdown 设计
@router.post("/smart-reports/upload", include_in_schema=False)
async def upload_smart_report_template_deprecated():
    return error("该功能已弃用，请使用在线 Markdown 编辑器设计报告")

@router.post("/smart-reports/{report_id}/update-content")
async def update_smart_report_content(
    report_id: int,
    req: SmartReportUpdateContentRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:model"))
):
    """保存在线编辑器设计的模板内容和变量"""
    try:
        item = await SmartReportService.update_template_content(
            db, report_id, 
            content_md=req.content_md,
            content_html=req.content_html, 
            template_vars=req.template_vars,
            dataset_id=req.dataset_id, 
            data_row=req.data_row
        )
        return success(SmartReportResponse.model_validate(item).model_dump(), "模板保存成功")
    except Exception as e:
        return error(str(e))

@router.put("/smart-reports/{report_id}")
async def update_smart_report(
    report_id: int,
    req: SmartReportUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:model"))
):
    """更新智能报告信息（重命名）"""
    try:
        item = await SmartReportService.update_report(db, report_id, req.name)
        return success(SmartReportResponse.model_validate(item).model_dump())
    except Exception as e:
        return error(str(e))

@router.delete("/smart-reports/{report_id}")
async def delete_smart_report(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:model"))
):
    """删除智能报告模版"""
    try:
        await SmartReportService.delete_report(db, report_id)
        return success(None, "删除成功")
    except Exception as e:
        return error(str(e))


@router.post("/smart-reports/{report_id}/rescan-variables")
async def rescan_report_variables(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:model"))
):
    """重新扫描模板变量 (Markdown)"""
    try:
        report = await SmartReportService.get_report(db, report_id)
        if not report:
            return error("报告模板不存在", code=404)
            
        import re
        content = report.content_md or ""
        vars = list(set(re.findall(r"\{\{([^}]+)\}\}", content)))
        
        report.template_vars = vars
        await db.commit()
        await db.refresh(report)
        
        return success({"vars": vars}, "重新扫描完成")
    except Exception as e:
        return error(str(e))

@router.post("/smart-reports/{report_id}/generate")
async def generate_smart_report(
    report_id: int,
    req: GenerateReportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:view"))
):
    """根据模版和数据生成报告"""
    try:
        result = await SmartReportService.generate_report(
            db, 
            report_id, 
            req.data, 
            save_record=req.save_record, 
            record_name=req.record_name,
            content_md=req.content_md,  # 传入处理后的内容（包含图表图片）
            user_id=current_user.user_id  # 传入用户ID用于目录隔离
        )
        
        # 返回文件名，前端通过单独的 download 接口下载
        return success(result)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return error(str(e))

@router.post("/smart-reports/{report_id}/preview")
async def preview_smart_report(
    report_id: int,
    req: GenerateReportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:view"))
):
    """预览报告（填充变量后返回内容，不生成文件）"""
    try:
        result = await SmartReportService.preview_report(db, report_id, req.data)
        return success(result)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return error(str(e))

@router.get("/smart-reports/download/temp/{file_path:path}")
async def download_temp_report(
    file_path: str,
    current_user: TokenData = Depends(require_permission("analysis:view"))
):
    """下载临时生成的报告（支持子目录路径，如 report_39/xxx.pdf）"""
    try:
        from utils.storage import get_storage_manager
        from urllib.parse import quote
        import os
        
        storage_manager = get_storage_manager()
        # 强制用户隔离：临时文件必须位于用户自己的 temp 目录下
        storage_dir = storage_manager.get_module_dir("report", "temp", user_id=current_user.user_id)
        
        # 处理 file_path，它可能包含 user_{id} 前缀（如果来自 generate_report 的 pdf_relative_path）
        # 我们的目标是相对于 storage_dir (已经包含 user_{id}) 解析
        inner_path = file_path
        user_prefix = f"user_{current_user.user_id}/"
        if inner_path.startswith(user_prefix):
            inner_path = inner_path[len(user_prefix):]
            
        full_path = storage_dir / inner_path
        
        # 安全检查：确保路径在用户的存储目录内
        try:
            full_path.resolve().relative_to(storage_dir.resolve())
        except ValueError:
            return error(403, "非法路径或无权访问他人临时文件")
        
        if not full_path.exists():
            return error(404, "文件不存在或已过期")
        
        # 验证文件是否为 PDF
        if not file_path.endswith(".pdf"):
            return error(400, "不支持的文件类型")
        
        # 获取文件名用于下载
        filename = os.path.basename(file_path)
        encoded_filename = quote(filename)
        
        return FileResponse(
            path=str(full_path),
            filename=filename,
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename*=UTF-8\'\'{encoded_filename}',
                "Content-Type": "application/pdf"
            }
        )
    except Exception as e:
        import logging
        logger = logging.getLogger(__name__)
        logger.error(f"下载报告失败: {e}", exc_info=True)
        return error(str(e))

@router.get("/smart-reports/{report_id}/records")
async def list_report_records(
    report_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:view"))
):
    """获取报告的所有生成记录"""
    try:
        items = await SmartReportService.get_records(db, report_id)
        return success([SmartReportRecordResponse.model_validate(i).model_dump() for i in items])
    except Exception as e:
        return error(str(e))

@router.get("/smart-reports/records/{record_id}/download-docx")
async def download_record_docx(
    record_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:view"))
):
    """下载归档的 DOCX"""
    try:
        record = await SmartReportService.get_record(db, record_id)
        if not record:
            return error("记录不存在", code=404)
            
        if not record.docx_file_path:
            return error("该记录没有文件", code=404)
            
        from utils.storage import get_storage_manager
        storage_manager = get_storage_manager()
        # 归档文件存储在 archive 根目录下，record.docx_file_path 包含了 user_id 子路径
        storage_dir = storage_manager.get_module_dir("report", "archive")
        file_path = storage_dir / record.docx_file_path
        
        # 安全检查
        if not current_user.role in ("admin", "manager"):
             # 非管理员只能访问自己的归档文件
             if not record.docx_file_path.startswith(f"user_{current_user.user_id}/"):
                 return error(403, "无权访问此归档文件")

        if not file_path.exists():
            return error(404, "文件已丢失", code=404)
            
        return FileResponse(
            path=file_path,
            filename=f"{record.name}.docx",
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        )
    except Exception as e:
        return error(str(e))

@router.get("/smart-reports/records/{record_id}/download-pdf")
async def download_record_pdf(
    record_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:view"))
):
    """下载归档的 PDF (如果有)"""
    try:
        record = await SmartReportService.get_record(db, record_id)
        if not record:
            return error("记录不存在", code=404)
            
        if not record.pdf_file_path:
            return error("该记录未生成 PDF", code=404)
            
        from utils.storage import get_storage_manager
        storage_manager = get_storage_manager()
        storage_dir = storage_manager.get_module_dir("report", "archive")
        file_path = storage_dir / record.pdf_file_path
        
        # 安全检查
        if not current_user.role in ("admin", "manager"):
             # 非管理员只能访问自己的归档文件
             if not record.pdf_file_path.startswith(f"user_{current_user.user_id}/"):
                 return error(403, "无权访问此归档文件")

        if not file_path.exists():
            return error(404, "文件已丢失", code=404)
            
        return FileResponse(
            path=file_path,
            filename=f"{record.name}.pdf",
            media_type="application/pdf"
        )
    except Exception as e:
        return error(str(e))

@router.delete("/smart-reports/records/{record_id}")
async def delete_report_record(
    record_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:model"))
):
    """删除报告记录"""
    try:
        await SmartReportService.delete_record(db, record_id)
        return success(None, "删除成功")
    except Exception as e:
        return error(str(e))


# ============ 图表管理 ============

@router.get("/charts")
async def list_charts(
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:view"))
):
    """获取所有保存的图表"""
    try:
        items = await AnalysisChartService.list_charts(db)
        return success([AnalysisChartResponse.model_validate(i).model_dump() for i in items])
    except Exception as e:
        return error(str(e))

@router.get("/charts/{chart_id}")
async def get_chart(
    chart_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:view"))
):
    """获取单个图表详情"""
    try:
        item = await AnalysisChartService.get_chart(db, chart_id)
        return success(AnalysisChartResponse.model_validate(item).model_dump())
    except Exception as e:
        return error(str(e))

@router.post("/charts")
async def create_chart(
    req: AnalysisChartCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:model"))
):
    """保存图表"""
    try:
        item = await AnalysisChartService.create_chart(db, req)
        return success(AnalysisChartResponse.model_validate(item).model_dump())
    except Exception as e:
        return error(str(e))

@router.put("/charts/{chart_id}")
async def update_chart(
    chart_id: int,
    req: AnalysisChartUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:model"))
):
    """更新图表配置"""
    try:
        item = await AnalysisChartService.update_chart(db, chart_id, req)
        return success(AnalysisChartResponse.model_validate(item).model_dump())
    except Exception as e:
        return error(str(e))

@router.delete("/charts/{chart_id}")
async def delete_chart(
    chart_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis:model"))
):
    """删除图表"""
    try:
        await AnalysisChartService.delete_chart(db, chart_id)
        return success(None, "删除成功")
    except Exception as e:
        return error(str(e))
