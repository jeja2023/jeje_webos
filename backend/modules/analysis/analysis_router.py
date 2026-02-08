"""
Analysis 模块API路由
"""

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Response, Form
from fastapi.responses import StreamingResponse, FileResponse
import uuid
import json
import logging
import pandas as pd
import numpy as np
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional, Dict, Any
from datetime import datetime

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
    AnalysisChartCreate, AnalysisChartUpdate, AnalysisChartResponse,
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

from .analysis_chart_service import AnalysisChartService

from sqlalchemy import select

logger = logging.getLogger(__name__)

router = APIRouter()


# ============ 公共工具函数 ============

def validate_name(name: str, max_length: int = 100, min_length: int = 1) -> tuple[bool, str]:
    """
    验证名称格式
    
    Args:
        name: 名称字符串
        max_length: 最大长度
        min_length: 最小长度
    
    Returns:
        (是否有效, 错误信息)
    """
    if not name or not isinstance(name, str):
        return False, "名称不能为空"
    
    name = name.strip()
    if len(name) < min_length:
        return False, f"名称长度不能少于 {min_length} 个字符"
    
    if len(name) > max_length:
        return False, f"名称长度不能超过 {max_length} 个字符"
    
    # 检查是否包含危险字符
    dangerous_chars = ['<', '>', '"', "'", '&', '\n', '\r', '\t']
    for char in dangerous_chars:
        if char in name:
            return False, f"名称不能包含特殊字符: {char}"
    
    return True, ""


def format_error_message(error: Exception, default_message: str = "操作失败") -> str:
    """
    将技术性错误转换为用户友好的错误信息
    
    Args:
        error: 异常对象
        default_message: 默认错误信息
    
    Returns:
        用户友好的错误信息
    """
    error_str = str(error)
    
    # 常见错误信息映射
    error_mappings = {
        "not found": "资源不存在",
        "already exists": "资源已存在",
        "permission denied": "权限不足",
        "timeout": "操作超时，请稍后重试",
        "connection": "连接失败，请检查网络",
        "invalid": "输入数据格式不正确",
        "required": "缺少必要参数",
        "duplicate": "数据重复",
        "foreign key": "数据关联错误",
        "constraint": "数据约束错误"
    }
    
    error_lower = error_str.lower()
    for key, friendly_msg in error_mappings.items():
        if key in error_lower:
            return friendly_msg
    
    # 如果错误信息太长，截断
    if len(error_str) > 200:
        return f"{default_message}：{error_str[:200]}..."
    
    return f"{default_message}：{error_str}" if error_str else default_message


def format_datetime_columns(df: pd.DataFrame) -> pd.DataFrame:
    """
    格式化 DataFrame 中的日期时间列（公共函数）
    
    Args:
        df: pandas DataFrame
    
    Returns:
        格式化后的 DataFrame
    """
    for col in df.select_dtypes(include=['datetime64', 'datetimetz']).columns:
        df[col] = df[col].astype(str).str.replace('T', ' ', regex=False)
    return df


def format_dataframe_for_json(df: pd.DataFrame) -> list[dict]:
    """
    将 DataFrame 转换为 JSON 兼容的字典列表（公共函数）
    
    Args:
        df: pandas DataFrame
    
    Returns:
        字典列表
    """
    return df.replace([np.inf, -np.inf], np.nan).astype(object).where(pd.notnull(df), None).to_dict(orient='records')

@router.get("/datasets")
async def list_datasets(
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.view"))
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

@router.post("/upload", response_model=dict, summary="上传分析文件")
async def upload_analysis_file(
    file: UploadFile = File(...),
    user: TokenData = Depends(get_current_user)
):
    """上传文件到分析模块的私有存储目录"""
    from utils.storage import get_storage_manager
    storage = get_storage_manager()
    
    # 验证后缀
    ext = os.path.splitext(file.filename)[1].lower()
    if ext not in ['.csv', '.xlsx', '.xls']:
        return error("只支持 .csv, .xlsx, .xls 格式的文件")

    # 获取私有上传目录
    uploads_dir = storage.get_module_dir("analysis", "uploads", user.user_id)
    
    # 保存文件
    save_path = uploads_dir / file.filename
    # 处理同名覆盖问题
    counter = 1
    while save_path.exists():
        name, extension = os.path.splitext(file.filename)
        save_path = uploads_dir / f"{name}_{counter}{extension}"
        counter += 1
        
    content = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)

    return success({
        "name": save_path.name,
        "path": str(save_path.relative_to(storage.root_dir)),
        "size": len(content)
    }, "上传成功")

@router.get("/files", response_model=dict, summary="获取分析模块文件列表")
async def list_analysis_files(
    user: TokenData = Depends(get_current_user)
):
    """获取分析模块私有目录下的文件列表"""
    from utils.storage import get_storage_manager
    storage = get_storage_manager()
    uploads_dir = storage.get_module_dir("analysis", "uploads", user.user_id)
    
    files = []
    if uploads_dir.exists():
        for f in uploads_dir.iterdir():
            if f.is_file():
                stat = f.stat()
                files.append({
                    "name": f.name,
                    "size": stat.st_size,
                    "updated_at": stat.st_mtime * 1000,
                    "path": str(f.relative_to(storage.root_dir))
                })
    
    # 按时间倒序
    files.sort(key=lambda x: x["updated_at"], reverse=True)
    return success(files)

@router.post("/import/file")
async def import_file(
    req: ImportFileRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.import"))
):
    """从已上传文件导入"""
    # 输入验证
    is_valid, error_msg = validate_name(req.name, max_length=200)
    if not is_valid:
        return error(error_msg)
    
    import time
    start_time = time.time()
    
    try:
        dataset = await ImportService.import_from_file(
            db, req.name, req.file_id, req.options, source=req.source
        )
        elapsed = time.time() - start_time
        logger.info(f"文件导入成功: {dataset.name}, 行数: {dataset.row_count}, 耗时: {elapsed:.2f}秒")
        return success({
            "id": dataset.id,
            "name": dataset.name,
            "table_name": dataset.table_name,
            "row_count": dataset.row_count
        }, "导入成功")
    except Exception as e:
        elapsed = time.time() - start_time
        logger.error(f"文件导入失败，耗时: {elapsed:.2f}秒, 错误: {e}")
        return error(format_error_message(e, "文件导入失败"))

@router.post("/import/preview")
async def import_preview(
    req: ImportPreviewRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.import"))
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
    current_user: TokenData = Depends(require_permission("analysis.import"))
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
    current_user: TokenData = Depends(require_permission("analysis.import"))
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
        return error(format_error_message(e))

@router.post("/import/db-tables")
async def get_db_tables(
    req: DbTablesRequest,
    current_user: TokenData = Depends(require_permission("analysis.import"))
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
    sorts: Optional[str] = None,  # JSON 格式的多字段排序 [{field, order}]
    filters: Optional[str] = None,  # JSON 格式的筛选条件 {field: {op, value}}
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.view"))
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
        except json.JSONDecodeError:
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
                elif op in ('gt', 'gte', 'lt', 'lte'):
                    # 数值比较操作符：验证并转换值为数字，防止 SQL 注入
                    try:
                        # 尝试转换为浮点数
                        numeric_value = float(value)
                        # 构建安全的 SQL 条件
                        op_symbol = {'gt': '>', 'gte': '>=', 'lt': '<', 'lte': '<='}[op]
                        where_conditions.append(f'TRY_CAST("{field}" AS DOUBLE) {op_symbol} {numeric_value}')
                    except (ValueError, TypeError):
                        # 如果不是数字，跳过此条件并记录警告
                        logger.warning(f"筛选条件值不是有效数字: field={field}, value={value}, op={op}")
                        continue
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
            # 转义单引号防止 SQL 注入
            search_escaped = search.replace("'", "''")
            # 转义百分号和下划线（LIKE 通配符）
            search_escaped = search_escaped.replace('%', '\\%').replace('_', '\\_')
            # 验证列名只包含字母、数字、下划线（防止注入）
            safe_cols = [col for col in cols if col.replace('_', '').replace(' ', '').isalnum() or col.replace(' ', '').replace('_', '').replace('-', '').isalnum()]
            if safe_cols:
                like_conditions = [f'CAST("{col}" AS VARCHAR) ILIKE \'%{search_escaped}%\'' for col in safe_cols]
                where_conditions.append(f"({' OR '.join(like_conditions)})")
        except Exception as e:
            logger.warning(f"构建搜索条件失败: {e}")
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
    
    # 7. 分页查询（添加超时保护）
    offset = (page - 1) * size
    sql = f"SELECT * FROM {table_name} {where_clause} {order_by} LIMIT {size} OFFSET {offset}"
    
    import time
    query_start_time = time.time()
    
    try:
        # 对于大数据集，添加查询超时保护（30秒）
        # DuckDB 本身不支持查询超时，通过异步任务和超时机制实现
        import asyncio
        import concurrent.futures
        query_timeout = 30.0  # 30秒超时
        
        # 如果数据集很大（超过10万行），使用超时保护
        if dataset.row_count and dataset.row_count > 100000:
            try:
                # 在后台线程执行查询，设置超时
                loop = asyncio.get_event_loop()
                with concurrent.futures.ThreadPoolExecutor() as executor:
                    future = loop.run_in_executor(executor, duckdb_instance.fetch_df, sql)
                    df = await asyncio.wait_for(future, timeout=query_timeout)
            except asyncio.TimeoutError:
                query_elapsed = time.time() - query_start_time
                logger.warning(f"查询超时（{query_timeout}秒），数据集: {dataset.name}, 表: {table_name}, 耗时: {query_elapsed:.2f}秒")
                return error(f"查询超时，数据集过大（{dataset.row_count:,} 行）。建议添加筛选条件或创建索引以提高查询速度。")
        else:
            df = duckdb_instance.fetch_df(sql)
        
        query_elapsed = time.time() - query_start_time
        
        # 自动处理日期时间列显示，仅替换 'T'，不强制改变格式精度
        df = format_datetime_columns(df)

        # 转换为列表，处理 NaN/Inf 为 JSON 兼容的 null
        records = format_dataframe_for_json(df)
        
        total_elapsed = time.time() - query_start_time
        logger.info(f"查询数据集数据成功: {dataset.name}, 返回 {len(records)} 条, 查询耗时: {query_elapsed:.2f}秒, 总耗时: {total_elapsed:.2f}秒")
        
        return success({
            "items": records,
            "total": dataset.row_count,
            "filtered_total": filtered_total,
            "page": page,
            "size": size,
            "columns": df.columns.tolist()
        })
    except Exception as e:
        query_elapsed = time.time() - query_start_time if 'query_start_time' in locals() else 0
        logger.error(f"查询数据集数据失败，耗时: {query_elapsed:.2f}秒, 错误: {e}")
        return error(format_error_message(e, "查询数据失败"))

@router.post("/compare")
async def compare(
    req: CompareRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.compare"))
):
    """数据比对"""
    import time
    start_time = time.time()
    
    try:
        result = await CompareService.compare_datasets(
            db, req.source_id, req.target_id, req.join_keys, req.compare_columns
        )
        elapsed = time.time() - start_time
        logger.info(f"数据比对完成，耗时: {elapsed:.2f}秒, 相同: {result['summary']['same_count']}, 差异: {result['summary']['different_count']}")
        return success(result)
    except Exception as e:
        elapsed = time.time() - start_time
        logger.error(f"数据比对失败，耗时: {elapsed:.2f}秒, 错误: {e}")
        return error(format_error_message(e, "数据比对失败"))

@router.delete("/datasets/{dataset_id}")
async def delete_dataset(
    dataset_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.import"))
):
    """删除数据集"""
    deleted = await ImportService.delete_dataset(db, dataset_id)
    if deleted:
        return success(None, "删除成功")
    return error("数据集不存在")

@router.put("/datasets/{dataset_id}")
async def update_dataset(
    dataset_id: int,
    req: DatasetUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.import"))
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
        return error(format_error_message(e))

# --- 数据清洗 ---
@router.post("/clean")
async def clean_data(
    req: CleaningRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.clean"))
):
    """执行数据清洗"""
    import time
    start_time = time.time()
    
    try:
        result = await CleaningService.apply_cleaning(db, req)
        elapsed = time.time() - start_time
        msg = "清洗预览完成" if req.save_mode == "preview" else "清洗成功"
        logger.info(f"数据清洗完成，耗时: {elapsed:.2f}秒, 模式: {req.save_mode}")
        return success(result, msg)
    except Exception as e:
        elapsed = time.time() - start_time
        logger.error(f"数据清洗失败，耗时: {elapsed:.2f}秒, 错误: {e}")
        return error(format_error_message(e, "数据清洗失败"))

@router.post("/clean/export")
async def export_cleaned_data(
    req: CleaningRequest,
    format: str = Query("csv", description="导出格式: csv, excel, json"),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.clean"))
):
    """导出清洗后的数据（支持 CSV、Excel、JSON 格式）"""
    try:
        import urllib.parse
        
        if format not in ['csv', 'excel', 'json']:
            return error("不支持的导出格式，支持: csv, excel, json")
        
        output = await CleaningService.export_cleaning(db, req, format=format)
        
        # 根据格式设置文件名和媒体类型
        ext_map = {
            'csv': ('csv', 'text/csv'),
            'excel': ('xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
            'json': ('json', 'application/json')
        }
        ext, media_type = ext_map[format]
        filename = f"cleaned_data_{uuid.uuid4().hex[:8]}.{ext}"
        
        return StreamingResponse(
            output,
            media_type=media_type,
            headers={
                "Content-Disposition": f"attachment; filename={urllib.parse.quote(filename)}"
            }
        )
    except Exception as e:
        return error(format_error_message(e, "导出数据失败"))

# --- 数据建模 ---
@router.post("/model/summary")
async def get_summary(
    req: ModelingSummaryRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.model"))
):
    """描述性统计"""
    try:
        result = await ModelingService.get_summary(db, req.dataset_id, req.columns)
        return success(result)
    except Exception as e:
        return error(format_error_message(e))

@router.post("/model/correlation")
async def get_correlation(
    req: ModelingCorrelationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.model"))
):
    """相关性分析"""
    try:
        result = await ModelingService.get_correlation(db, req.dataset_id, req.columns)
        return success(result)
    except Exception as e:
        return error(format_error_message(e, "相关性分析失败"))

@router.post("/model/aggregate")
async def get_aggregate(
    req: ModelingAggregateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.model"))
):
    """数据聚合"""
    try:
        result = await ModelingService.get_aggregation(db, req.dataset_id, req.group_by, req.aggregates)
        return success(result)
    except Exception as e:
        return error(format_error_message(e, "数据聚合失败"))

@router.post("/model/sql")
async def execute_sql(
    req: ModelingSqlRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.model"))
):
    """SQL建模 - 执行自定义SQL查询"""
    # 输入验证：SQL 不能为空
    if not req.sql or not req.sql.strip():
        return error("SQL 语句不能为空")
    
    try:
        result = await ModelingService.execute_sql(db, req.sql, req.save_as, req.limit)
        return success(result)
    except Exception as e:
        return error(format_error_message(e, "SQL 执行失败"))

@router.get("/tables")
async def list_tables(
    current_user: TokenData = Depends(require_permission("analysis.view"))
):
    """获取可用的表名列表（供SQL建模使用）"""
    try:
        df = duckdb_instance.fetch_df("SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'")
        return success(df['table_name'].tolist())
    except Exception as e:
        return error(format_error_message(e))

# --- ETL 模型管理 ---
@router.get("/models")
async def list_models(
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.model"))
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
    current_user: TokenData = Depends(require_permission("analysis.model"))
):
    """创建新模型"""
    # 输入验证
    is_valid, error_msg = validate_name(req.name, max_length=200)
    if not is_valid:
        return error(error_msg)
    
    try:
        model = await ModelingService.create_model(db, req)
        return success(ModelResponse.model_validate(model).model_dump())
    except Exception as e:
        return error(format_error_message(e, "创建模型失败"))

@router.get("/models/{model_id}")
async def get_model(
    model_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.model"))
):
    """获取模型详情"""
    try:
        model = await ModelingService.get_model(db, model_id)
        return success(ModelResponse.model_validate(model).model_dump())
    except Exception as e:
        return error(format_error_message(e))

@router.put("/models/{model_id}")
async def update_model(
    model_id: int,
    req: ModelUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.model"))
):
    """更新模型基本信息"""
    try:
        model = await ModelingService.update_model(db, model_id, req)
        return success(ModelResponse.model_validate(model).model_dump())
    except Exception as e:
        return error(format_error_message(e))

@router.post("/models/{model_id}/graph")
async def save_model_graph(
    model_id: int,
    req: ModelSaveGraphRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.model"))
):
    """保存模型图配置"""
    try:
        model = await ModelingService.save_model_graph(db, model_id, req.graph_config, req.status)
        return success(ModelResponse.model_validate(model).model_dump())
    except Exception as e:
        return error(format_error_message(e))

@router.delete("/models/{model_id}")
async def delete_model(
    model_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.model"))
):
    """删除模型"""
    try:
        await ModelingService.delete_model(db, model_id)
        return success(None, "删除成功")
    except Exception as e:
        return error(format_error_message(e))


# ============ ETL 节点执行 ============


@router.post("/etl/execute")
async def execute_etl_node(
    req: ETLExecuteNodeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.model"))
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
        logger.error(f"ETL 节点执行失败: {e}", exc_info=True)
        return error(format_error_message(e, "ETL 节点执行失败"))


@router.post("/models/{model_id}/execute")
async def execute_model(
    model_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.model"))
):
    """
    执行整个模型
    只运行所有输出(Sink)节点，用于刷新最终结果。
    """
    import time
    start_time = time.time()
    
    try:
        result = await ETLExecutionService.execute_model(db, model_id)
        elapsed = time.time() - start_time
        
        if result["success"] == result["total"] and result["total"] > 0:
            logger.info(f"ETL模型执行成功: model_id={model_id}, 输出节点数: {result['total']}, 耗时: {elapsed:.2f}秒")
            return success(result, "模型执行成功")
        elif result["success"] > 0:
            logger.warning(f"ETL模型部分成功: model_id={model_id}, 成功: {result['success']}/{result['total']}, 耗时: {elapsed:.2f}秒")
            return success(result, f"部分成功 ({result['success']}/{result['total']})")
        else:
            error_msg = result['details'][0]['message'] if result.get('details') and len(result['details']) > 0 else '未知错误'
            logger.warning(f"ETL模型执行失败: model_id={model_id}, 耗时: {elapsed:.2f}秒, 错误: {error_msg}")
            return error(message=f"执行失败: {error_msg}")
             
    except Exception as e:
        elapsed = time.time() - start_time
        logger.error(f"ETL模型执行异常: model_id={model_id}, 耗时: {elapsed:.2f}秒, 错误: {e}", exc_info=True)
        return error(format_error_message(e, "ETL模型执行失败"))

@router.post("/etl/preview")
async def preview_etl_node(
    req: ETLPreviewNodeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.model"))
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
    current_user: TokenData = Depends(require_permission("analysis.model"))
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
    current_user: TokenData = Depends(require_permission("analysis.view"))
):
    """获取所有仪表盘列表"""
    try:
        items = await BIService.list_dashboards(db)
        return success([DashboardResponse.model_validate(i).model_dump() for i in items])
    except Exception as e:
        logger.error(f"获取仪表盘列表失败: {e}", exc_info=True)
        return error(format_error_message(e))

@router.post("/dashboards")
async def create_dashboard(
    req: DashboardCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.model"))
):
    """创建仪表盘"""
    # 输入验证
    is_valid, error_msg = validate_name(req.name, max_length=200)
    if not is_valid:
        return error(error_msg)
    
    try:
        item = await BIService.create_dashboard(db, req)
        return success(DashboardResponse.model_validate(item).model_dump())
    except Exception as e:
        return error(format_error_message(e, "创建仪表盘失败"))

@router.get("/dashboards/{dashboard_id}")
async def get_dashboard(
    dashboard_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.view"))
):
    """获取仪表盘详情"""
    try:
        item = await BIService.get_dashboard(db, dashboard_id)
        return success(DashboardResponse.model_validate(item).model_dump())
    except Exception as e:
        return error(format_error_message(e))

@router.put("/dashboards/{dashboard_id}")
async def update_dashboard(
    dashboard_id: int,
    req: DashboardUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.model"))
):
    """更新仪表盘内容"""
    try:
        item = await BIService.update_dashboard(db, dashboard_id, req)
        return success(DashboardResponse.model_validate(item).model_dump())
    except Exception as e:
        return error(format_error_message(e))

@router.delete("/dashboards/{dashboard_id}")
async def delete_dashboard(
    dashboard_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.model"))
):
    """删除仪表盘"""
    try:
        await BIService.delete_dashboard(db, dashboard_id)
        return success(None, "删除成功")
    except Exception as e:
        return error(format_error_message(e))



# ============ 智能表格 ============

@router.get("/smart-tables")
async def list_smart_tables(
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.view"))
):
    """获取所有智能表格列表"""
    try:
        items = await SmartTableService.get_tables(db)
        return success([SmartTableResponse.model_validate(i).model_dump() for i in items])
    except Exception as e:
        return error(format_error_message(e))

@router.get("/smart-tables/{table_id}")
async def get_smart_table(
    table_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.view"))
):
    """获取单个智能表格详情"""
    try:
        item = await SmartTableService.get_table_by_id(db, table_id)
        if not item:
            return error("表格不存在", code=404)
        return success(SmartTableResponse.model_validate(item).model_dump())
    except Exception as e:
        return error(format_error_message(e))

@router.post("/smart-tables")
async def create_smart_table(
    req: SmartTableCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.model"))
):
    """创建智能表格"""
    # 输入验证
    is_valid, error_msg = validate_name(req.name, max_length=200)
    if not is_valid:
        return error(error_msg)
    
    try:
        item = await SmartTableService.create_table(db, req)
        return success(SmartTableResponse.model_validate(item).model_dump())
    except Exception as e:
        return error(format_error_message(e, "创建智能表格失败"))

@router.put("/smart-tables/{table_id}")
async def update_smart_table(
    table_id: int,
    req: SmartTableUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.model"))
):
    """更新智能表格定义"""
    try:
        item = await SmartTableService.update_table(db, table_id, req)
        return success(SmartTableResponse.model_validate(item).model_dump())
    except Exception as e:
        return error(format_error_message(e))

@router.delete("/smart-tables/{table_id}")
async def delete_smart_table(
    table_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.model"))
):
    """删除智能表格"""
    try:
        await SmartTableService.delete_table(db, table_id)
        return success(None, "删除成功")
    except Exception as e:
        return error(format_error_message(e))

@router.post("/smart-tables/{table_id}/sync")
async def sync_smart_table(
    table_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.model"))
):
    """将智能表格数据同步到数据集"""
    try:
        dataset = await SmartTableService.sync_to_dataset(db, table_id)
        from .analysis_schemas import DatasetResponse
        return success({"dataset_id": dataset.id, "table_name": dataset.table_name}, "同步成功")
    except Exception as e:
        return error(format_error_message(e))
@router.get("/smart-tables/{table_id}/data")
async def get_smart_table_data(
    table_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.view"))
):
    """获取智能表格数据"""
    try:
        data = await SmartTableService.get_table_data(db, table_id)
        return success(data)
    except Exception as e:
        return error(format_error_message(e))

@router.post("/smart-tables/{table_id}/data")
async def add_smart_table_row(
    table_id: int,
    req_data: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.model"))
):
    """添加一行数据到智能表格"""
    try:
        await SmartTableService.add_row(db, table_id, req_data)
        return success(None, "添加成功")
    except Exception as e:
        return error(format_error_message(e))

@router.put("/smart-tables/data/{row_id}")
async def update_smart_table_row(
    row_id: int,
    req_data: Dict[str, Any],
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.model"))
):
    """更新智能表格中的一行数据"""
    try:
        await SmartTableService.update_row(db, row_id, req_data)
        return success(None, "更新成功")
    except Exception as e:
        return error(format_error_message(e))

@router.delete("/smart-tables/data/{row_id}")
async def delete_smart_table_row(
    row_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.model"))
):
    """删除智能表格中的一行数据"""
    try:
        await SmartTableService.delete_row(db, row_id)
        return success(None, "删除成功")
    except Exception as e:
        return error(format_error_message(e))





# ============ 图表管理 ============

@router.get("/charts")
async def list_charts(
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.view"))
):
    """获取所有保存的图表"""
    try:
        items = await AnalysisChartService.list_charts(db)
        return success([AnalysisChartResponse.model_validate(i).model_dump() for i in items])
    except Exception as e:
        return error(format_error_message(e))

@router.get("/charts/{chart_id}")
async def get_chart(
    chart_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.view"))
):
    """获取单个图表详情"""
    try:
        item = await AnalysisChartService.get_chart(db, chart_id)
        return success(AnalysisChartResponse.model_validate(item).model_dump())
    except Exception as e:
        return error(format_error_message(e))

@router.post("/charts")
async def create_chart(
    req: AnalysisChartCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.model"))
):
    """保存图表"""
    try:
        item = await AnalysisChartService.create_chart(db, req)
        return success(AnalysisChartResponse.model_validate(item).model_dump())
    except Exception as e:
        return error(format_error_message(e))

@router.put("/charts/{chart_id}")
async def update_chart(
    chart_id: int,
    req: AnalysisChartUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.model"))
):
    """更新图表配置"""
    try:
        item = await AnalysisChartService.update_chart(db, chart_id, req)
        return success(AnalysisChartResponse.model_validate(item).model_dump())
    except Exception as e:
        return error(format_error_message(e))

@router.delete("/charts/{chart_id}")
async def delete_chart(
    chart_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("analysis.model"))
):
    """删除图表"""
    try:
        await AnalysisChartService.delete_chart(db, chart_id)
        return success(None, "删除成功")
    except Exception as e:
        return error(format_error_message(e))
