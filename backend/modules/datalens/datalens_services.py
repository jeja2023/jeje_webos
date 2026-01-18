"""
DataLens 数据透镜模块 - 业务逻辑层
处理数据源连接、查询执行、视图管理等核心业务逻辑
"""

import json
import logging
from datetime import datetime
import os
import sys
import time
import math
import pandas as pd
import numpy as np
from decimal import Decimal
from urllib.parse import quote_plus
from sqlalchemy import select, func, delete, and_, or_, create_engine, text, inspect, desc
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List, Dict, Any, Tuple

from utils.storage import get_storage_manager
from .datalens_models import LensDataSource, LensCategory, LensView, LensFavorite, LensRecentView
from .datalens_schemas import (
    DataSourceCreate, DataSourceUpdate, DataSourceType,
    CategoryCreate, CategoryUpdate,
    ViewCreate, ViewUpdate, ViewDataRequest, ViewDataResponse,
    QueryType
)
from sqlalchemy.orm.attributes import flag_modified
from .datalens_optimizations import (
    ConnectionPoolManager, _file_cache, _query_cache,
    validate_sql, sanitize_identifier, execute_with_timeout,
    monitor_query_performance, QueryTimeoutError, QueryExecutionError,
    DataSourceConnectionError
)

logger = logging.getLogger(__name__)

# 获取存储管理器实例
def _get_storage():
    return get_storage_manager()

# 统一解析路径：如果是相对路径，则补全 storage 根目录
def _resolve_path(path: str) -> str:
    if not path:
        return ""
    if os.path.isabs(path):
        return path
    # 补全 storage 根目录
    return str(_get_storage().root_dir / path)

# 文件数据源内存缓存已迁移到 datalens_optimizations.py 中的 LRUFileCache


def _build_db_url(source_type: str, conn_config: Dict[str, Any]) -> str:
    """构造数据库连接 URL"""
    if source_type == DataSourceType.MYSQL:
        encoded_pwd = quote_plus(conn_config.get("password", ""))
        return f"mysql+pymysql://{conn_config.get('user', 'root')}:{encoded_pwd}@{conn_config.get('host', 'localhost')}:{conn_config.get('port', 3306)}/{conn_config.get('database', '')}"
    elif source_type == DataSourceType.POSTGRES:
        encoded_pwd = quote_plus(conn_config.get("password", ""))
        return f"postgresql+psycopg2://{conn_config.get('user', 'postgres')}:{encoded_pwd}@{conn_config.get('host', 'localhost')}:{conn_config.get('port', 5432)}/{conn_config.get('database', '')}"
    elif source_type == DataSourceType.SQLITE:
        return f"sqlite:///{conn_config.get('file_path', '')}"
    else:
        raise ValueError(f"不支持的数据库类型: {source_type}")


def _get_cached_df(file_path: str, source_type: str, file_config: Dict[str, Any]):
    """获取缓存的 DataFrame，如果过期或不存在则重新加载（使用 LRU 缓存）"""
    
    # 解析路径
    abs_path = _resolve_path(file_path)
    
    # 检查缓存
    cached_df = _file_cache.get(abs_path)
    if cached_df is not None:
        # 检查文件修改时间，如果文件变了也失效
        if os.path.exists(abs_path):
            mtime = os.path.getmtime(abs_path)
            # 获取缓存时间戳
            cache_time = _file_cache.get_timestamp(abs_path)
            # 如果文件修改时间比缓存时间新，则重新加载
            if mtime <= cache_time:
                return cached_df
    
    # 重新加载
    if source_type == DataSourceType.CSV:
        df = pd.read_csv(abs_path, encoding=file_config.get("encoding", "utf-8"))
    else:  # Excel
        sheet_name = file_config.get("sheet_name") or 0
        df = pd.read_excel(abs_path, sheet_name=sheet_name)
        if isinstance(df, dict):
            df = list(df.values())[0]
    
    # 存入缓存
    _file_cache.put(abs_path, df)
    return df

def _sanitize_dataframe(df):
    """
    清洗 DataFrame 数据，使其支持 JSON 序列化
    1. 将日期时间转换为字符串
    2. 将二进制数据 (bytes) 转换为 Hex 字符串
    3. 处理 Decimal, Numpy 等非标 JSON 类型
    4. 处理 NaN 和 Infinity 等无法 JSON 序列化的浮点数
    """
    
    if df.empty:
        return df
    
    # 复制数据框避免警告
    df = df.copy()
    
    # 首先处理所有数值列中的 NaN 和 Infinity
    for col in df.columns:
        if pd.api.types.is_float_dtype(df[col]) or pd.api.types.is_integer_dtype(df[col]):
            # 将 NaN 和 Infinity 替换为 None
            df[col] = df[col].apply(lambda x: None if (pd.isna(x) or (isinstance(x, float) and (math.isnan(x) or math.isinf(x)))) else x)
        
        # 处理日期时间
        elif pd.api.types.is_datetime64_any_dtype(df[col]):
            df[col] = df[col].apply(lambda x: str(x).replace('T', ' ') if pd.notna(x) else None)
        
        # 处理 Object 类型 (bytes, decimal, list, etc.)
        elif df[col].dtype == object:
            # 获取第一个非空值用于探针
            non_nulls = df[col].dropna()
            if not non_nulls.empty:
                first_val = non_nulls.iloc[0]
                
                # Bytes -> Hex
                if isinstance(first_val, bytes):
                    df[col] = df[col].apply(lambda x: x.hex() if isinstance(x, bytes) else x)
                # Decimal -> Float (并处理 NaN)
                elif isinstance(first_val, Decimal):
                    def safe_decimal_to_float(x):
                        if isinstance(x, Decimal):
                            f = float(x)
                            return None if (math.isnan(f) or math.isinf(f)) else f
                        return x
                    df[col] = df[col].apply(safe_decimal_to_float)
                # List/Numpy -> String
                elif isinstance(first_val, (np.ndarray, list)):
                    df[col] = df[col].apply(lambda x: str(x) if x is not None else None)
            
            # 对 Object 列也检查是否有 float NaN (可能是混合类型列)
            df[col] = df[col].apply(lambda x: None if (isinstance(x, float) and (math.isnan(x) or math.isinf(x))) else x)
                
    return df



def _build_sort_clause(request, db_type: str = "mysql") -> str:
    """
    构建排序 SQL 子句
    支持多字段排序，兼容单字段排序
    """
    sort_parts = []
    
    # 优先使用多字段排序
    if request.sorts:
        for sort_item in request.sorts:
            field = sort_item.get("field", "")
            order = sort_item.get("order", "asc").upper()
            if field and order in ("ASC", "DESC"):
                # 处理带表名的字段别名
                safe_field = field.replace(".", "__") if "." in field else field
                # 根据数据库类型使用不同的引用符号
                if db_type == "mysql":
                    sort_parts.append(f"`{safe_field}` {order}")
                else:
                    sort_parts.append(f'"{safe_field}" {order}')
    # 兼容单字段排序
    elif request.sort_field:
        order = "DESC" if request.sort_order == "desc" else "ASC"
        safe_field = request.sort_field.replace(".", "__") if "." in request.sort_field else request.sort_field
        if db_type == "mysql":
            sort_parts.append(f"`{safe_field}` {order}")
        else:
            sort_parts.append(f'"{safe_field}" {order}')
    
    if sort_parts:
        return " ORDER BY " + ", ".join(sort_parts)
    return ""


def _build_filter_clause(filters: Dict[str, Any], db_type: str = "mysql") -> Tuple[str, Dict[str, Any]]:
    """
    构建筛选条件 SQL 子句
    支持的操作符: eq, ne, gt, gte, lt, lte, like, notlike, in, notin, isnull, notnull
    返回: (SQL子句, 参数字典)
    """
    if not filters:
        return "", {}
    
    clauses = []
    params = {}
    param_index = 0
    
    for field, condition in filters.items():
        # 处理带表名的字段别名 (persons.name -> persons__name)
        safe_field = field.replace(".", "__") if "." in field else field
        
        if not isinstance(condition, dict):
            # 简单等于条件
            param_name = f"filter_{param_index}"
            if db_type == "mysql":
                clauses.append(f"`{safe_field}` = :{param_name}")
            else:
                clauses.append(f'"{safe_field}" = :{param_name}')
            params[param_name] = condition
            param_index += 1
            continue
        
        op = condition.get("op", "eq").lower()
        value = condition.get("value")
        param_name = f"filter_{param_index}"
        
        # 根据数据库类型选择字段引用符
        field_ref = f"`{safe_field}`" if db_type == "mysql" else f'"{safe_field}"'
        
        if op == "eq":
            clauses.append(f"{field_ref} = :{param_name}")
            params[param_name] = value
        elif op == "ne":
            clauses.append(f"{field_ref} != :{param_name}")
            params[param_name] = value
        elif op == "gt":
            clauses.append(f"{field_ref} > :{param_name}")
            params[param_name] = value
        elif op == "gte":
            clauses.append(f"{field_ref} >= :{param_name}")
            params[param_name] = value
        elif op == "lt":
            clauses.append(f"{field_ref} < :{param_name}")
            params[param_name] = value
        elif op == "lte":
            clauses.append(f"{field_ref} <= :{param_name}")
            params[param_name] = value
        elif op == "like":
            clauses.append(f"{field_ref} LIKE :{param_name}")
            params[param_name] = f"%{value}%"
        elif op == "notlike":
            clauses.append(f"{field_ref} NOT LIKE :{param_name}")
            params[param_name] = f"%{value}%"
        elif op == "in":
            if isinstance(value, list) and value:
                placeholders = []
                for i, v in enumerate(value):
                    p_name = f"{param_name}_{i}"
                    placeholders.append(f":{p_name}")
                    params[p_name] = v
                clauses.append(f"{field_ref} IN ({', '.join(placeholders)})")
        elif op == "notin":
            if isinstance(value, list) and value:
                placeholders = []
                for i, v in enumerate(value):
                    p_name = f"{param_name}_{i}"
                    placeholders.append(f":{p_name}")
                    params[p_name] = v
                clauses.append(f"{field_ref} NOT IN ({', '.join(placeholders)})")
        elif op == "isnull":
            clauses.append(f"{field_ref} IS NULL")
        elif op == "notnull":
            clauses.append(f"{field_ref} IS NOT NULL")
        
        param_index += 1
    
    if clauses:
        return " WHERE " + " AND ".join(clauses), params
    return "", {}


def _apply_dataframe_filters(df, filters: Dict[str, Any]):
    """
    对 DataFrame 应用筛选条件（用于CSV/Excel等文件数据源）
    """
    import pandas as pd
    
    if not filters or df.empty:
        return df
    
    mask = pd.Series([True] * len(df), index=df.index)
    
    for field, condition in filters.items():
        if field not in df.columns:
            continue
        
        if not isinstance(condition, dict):
            # 简单等于条件
            mask &= (df[field] == condition)
            continue
        
        op = condition.get("op", "eq").lower()
        value = condition.get("value")
        
        if op == "eq":
            mask &= (df[field] == value)
        elif op == "ne":
            mask &= (df[field] != value)
        elif op == "gt":
            mask &= (df[field] > value)
        elif op == "gte":
            mask &= (df[field] >= value)
        elif op == "lt":
            mask &= (df[field] < value)
        elif op == "lte":
            mask &= (df[field] <= value)
        elif op == "like":
            mask &= df[field].astype(str).str.contains(str(value), case=False, na=False)
        elif op == "notlike":
            mask &= ~df[field].astype(str).str.contains(str(value), case=False, na=False)
        elif op == "in":
            if isinstance(value, list):
                mask &= df[field].isin(value)
        elif op == "notin":
            if isinstance(value, list):
                mask &= ~df[field].isin(value)
        elif op == "isnull":
            mask &= df[field].isna()
        elif op == "notnull":
            mask &= df[field].notna()
    
    return df[mask]


def _apply_dataframe_sorts(df, request):
    """
    对 DataFrame 应用多字段排序（用于CSV/Excel等文件数据源）
    """
    if df.empty:
        return df
    
    sort_fields = []
    sort_orders = []
    
    # 优先使用多字段排序
    if request.sorts:
        for sort_item in request.sorts:
            field = sort_item.get("field", "")
            order = sort_item.get("order", "asc").lower()
            if field and field in df.columns:
                sort_fields.append(field)
                sort_orders.append(order == "asc")
    # 兼容单字段排序
    elif request.sort_field and request.sort_field in df.columns:
        sort_fields.append(request.sort_field)
        sort_orders.append(request.sort_order != "desc")
    
    if sort_fields:
        df = df.sort_values(by=sort_fields, ascending=sort_orders)
    
    return df


# ==================== 数据源连接器 ====================

class DataSourceConnector:
    """数据源连接器基类"""

    @staticmethod
    async def test_connection(source_type: str, config: Dict[str, Any]) -> Tuple[bool, str]:
        """
        测试数据源连接
        返回: (是否成功, 消息)
        """
        try:
            if source_type == DataSourceType.MYSQL:
                return await DataSourceConnector._test_mysql(config)
            elif source_type == DataSourceType.POSTGRES:
                return await DataSourceConnector._test_postgres(config)
            elif source_type == DataSourceType.SQLITE:
                return await DataSourceConnector._test_sqlite(config)
            elif source_type == DataSourceType.SQLSERVER:
                return await DataSourceConnector._test_sqlserver(config)
            elif source_type == DataSourceType.ORACLE:
                return await DataSourceConnector._test_oracle(config)
            elif source_type == DataSourceType.CSV:
                return await DataSourceConnector._test_csv(config)
            elif source_type == DataSourceType.EXCEL:
                return await DataSourceConnector._test_excel(config)
            elif source_type == DataSourceType.API:
                return await DataSourceConnector._test_api(config)
            else:
                return False, f"不支持的数据源类型: {source_type}"
        except Exception as e:
            logger.error(f"测试连接失败: {e}")
            return False, str(e)

    @staticmethod
    async def _test_mysql(config: Dict[str, Any]) -> Tuple[bool, str]:
        """测试 MySQL 连接"""
        import aiomysql
        try:
            conn = await aiomysql.connect(
                host=config.get("host", "localhost"),
                port=config.get("port", 3306),
                user=config.get("user", "root"),
                password=config.get("password", ""),
                db=config.get("database", ""),
                connect_timeout=10
            )
            await conn.ensure_closed()
            return True, "MySQL 连接成功"
        except Exception as e:
            return False, f"MySQL 连接失败: {e}"

    @staticmethod
    async def _test_postgres(config: Dict[str, Any]) -> Tuple[bool, str]:
        """测试 PostgreSQL 连接"""
        try:
            import asyncpg
            conn = await asyncpg.connect(
                host=config.get("host", "localhost"),
                port=config.get("port", 5432),
                user=config.get("user", "postgres"),
                password=config.get("password", ""),
                database=config.get("database", ""),
                timeout=10
            )
            await conn.close()
            return True, "PostgreSQL 连接成功"
        except ImportError:
            return False, "缺少 asyncpg 依赖，请安装: pip install asyncpg"
        except Exception as e:
            return False, f"PostgreSQL 连接失败: {e}"

    @staticmethod
    async def _test_sqlite(config: Dict[str, Any]) -> Tuple[bool, str]:
        """测试 SQLite 连接"""
        try:
            import aiosqlite
            file_path = config.get("file_path", "")
            if not file_path:
                return False, "请提供 SQLite 文件路径"
            # 解析路径
            abs_path = _resolve_path(file_path)
            if not os.path.exists(abs_path):
                return False, f"文件不存在: {abs_path}"
            async with aiosqlite.connect(abs_path) as db:
                await db.execute("SELECT 1")
            return True, "SQLite 连接成功"
        except ImportError:
            return False, "缺少 aiosqlite 依赖，请安装: pip install aiosqlite"
        except Exception as e:
            return False, f"SQLite 连接失败: {e}"

    @staticmethod
    async def _test_sqlserver(config: Dict[str, Any]) -> Tuple[bool, str]:
        """测试 SQL Server 连接"""
        try:
            import pyodbc
            conn_str = (
                f"DRIVER={{ODBC Driver 17 for SQL Server}};"
                f"SERVER={config.get('host', 'localhost')},{config.get('port', 1433)};"
                f"DATABASE={config.get('database', '')};"
                f"UID={config.get('user', '')};"
                f"PWD={config.get('password', '')}"
            )
            conn = pyodbc.connect(conn_str, timeout=10)
            conn.close()
            return True, "SQL Server 连接成功"
        except ImportError:
            return False, "缺少 pyodbc 依赖，请安装: pip install pyodbc"
        except Exception as e:
            return False, f"SQL Server 连接失败: {e}"

    @staticmethod
    async def _test_oracle(config: Dict[str, Any]) -> Tuple[bool, str]:
        """测试 Oracle 连接"""
        try:
            import oracledb
            dsn = f"{config.get('host', 'localhost')}:{config.get('port', 1521)}/{config.get('service_name', 'ORCL')}"
            conn = oracledb.connect(
                user=config.get("user", ""),
                password=config.get("password", ""),
                dsn=dsn
            )
            conn.close()
            return True, "Oracle 连接成功"
        except ImportError:
            return False, "缺少 oracledb 依赖，请安装: pip install oracledb"
        except Exception as e:
            return False, f"Oracle 连接失败: {e}"

    @staticmethod
    async def _test_csv(config: Dict[str, Any]) -> Tuple[bool, str]:
        """测试 CSV 文件读取"""
        try:
            file_path = config.get("file_path", "")
            if not file_path:
                return False, "请提供 CSV 文件路径"
            # 解析路径
            abs_path = _resolve_path(file_path)
            if not os.path.exists(abs_path):
                return False, f"文件不存在: {abs_path}"
            # 尝试读取前几行
            df = pd.read_csv(abs_path, nrows=5, encoding=config.get("encoding", "utf-8"))
            return True, f"CSV 文件读取成功，共 {len(df.columns)} 列"
        except Exception as e:
            return False, f"CSV 文件读取失败: {e}"

    @staticmethod
    async def _test_excel(config: Dict[str, Any]) -> Tuple[bool, str]:
        """测试 Excel 文件读取"""
        try:
            file_path = config.get("file_path", "")
            if not file_path:
                return False, "请提供 Excel 文件路径"
            # 解析路径
            abs_path = _resolve_path(file_path)
            if not os.path.exists(abs_path):
                return False, f"文件不存在: {abs_path}"
            sheet_name = config.get("sheet_name") or 0  # 默认第一个工作表
            df = pd.read_excel(abs_path, sheet_name=sheet_name, nrows=5)
            # 如果返回字典（多工作表），取第一个
            if isinstance(df, dict):
                df = list(df.values())[0]
            return True, f"Excel 文件读取成功，共 {len(df.columns)} 列"
        except Exception as e:
            return False, f"Excel 文件读取失败: {e}"

    @staticmethod
    async def _test_api(config: Dict[str, Any]) -> Tuple[bool, str]:
        """测试 API 连接"""
        try:
            import httpx
            url = config.get("url", "")
            if not url:
                return False, "请提供 API URL"
            method = config.get("method", "GET").upper()
            headers = config.get("headers", {})
            timeout = config.get("timeout", 10)

            async with httpx.AsyncClient(timeout=timeout) as client:
                if method == "GET":
                    response = await client.get(url, headers=headers)
                elif method == "POST":
                    response = await client.post(url, headers=headers, json=config.get("body", {}))
                else:
                    return False, f"不支持的请求方法: {method}"

                if response.status_code == 200:
                    return True, f"API 连接成功，状态码: {response.status_code}"
                else:
                    return False, f"API 返回非 200 状态码: {response.status_code}"
        except ImportError:
            return False, "缺少 httpx 依赖，请安装: pip install httpx"
        except Exception as e:
            return False, f"API 连接失败: {e}"


# ==================== 查询执行器 ====================

class QueryExecutor:
    """查询执行器"""

    @staticmethod
    def stream_execute(
        datasource: LensDataSource,
        query_type: str,
        query_config: Dict[str, Any],
        batch_size: int = 1000
    ):
        """
        流式执行查询，返回生成器生成记录
        """
        source_type = datasource.type
        
        # 获取连接配置
        conn_config = json.loads(datasource.connection_config) if datasource.connection_config else {}
        file_config = json.loads(datasource.file_config) if datasource.file_config else {}
        api_config = json.loads(datasource.api_config) if datasource.api_config else {}

        # 构建基础查询 SQL
        if source_type in [DataSourceType.MYSQL, DataSourceType.POSTGRES, DataSourceType.SQLITE,
                           DataSourceType.SQLSERVER, DataSourceType.ORACLE]:
            if query_type == QueryType.SQL:
                base_sql = query_config.get("sql", "SELECT 1")
            else:
                table = query_config.get("table", "")
                columns = query_config.get("columns", ["*"])
                where = query_config.get("where", "")
                col_str = ", ".join(columns) if isinstance(columns, list) else columns
                base_sql = f"SELECT {col_str} FROM {table}"
                if where:
                    base_sql += f" WHERE {where}"

            # 使用 SQLAlchemy 执行并流式获取数据（使用连接池）
            try:
                url = _build_db_url(source_type, conn_config)
            except ValueError:
                 raise ValueError(f"流式导出暂不支持该数据库类型: {source_type}")

            engine = ConnectionPoolManager.get_engine(source_type, conn_config, url)
            
            # 使用 pandas 的 chunksize 或 SQLAlchemy 的 execution_options
            with engine.connect() as conn:
                # 获取第一行以确定列名
                result = conn.execute(text(f"SELECT * FROM ({base_sql}) AS t LIMIT 0"))
                yield result.keys() # 首先返回列名列表

                # 分块读取
                for chunk in pd.read_sql(text(base_sql), conn, chunksize=batch_size):
                    chunk = _sanitize_dataframe(chunk)
                    for row in chunk.to_dict(orient="records"):
                        yield row
            
            # 不再 dispose，使用连接池管理

        elif source_type in [DataSourceType.CSV, DataSourceType.EXCEL]:
            import pandas as pd
            file_path = _resolve_path(file_config.get("file_path", ""))
            
            if source_type == DataSourceType.CSV:
                # 流式读取 CSV
                reader = pd.read_csv(
                    file_path, 
                    encoding=file_config.get("encoding", "utf-8"), 
                    chunksize=batch_size
                )
                first = True
                for chunk in reader:
                    if first:
                        yield chunk.columns.tolist()
                        first = False
                    chunk = _sanitize_dataframe(chunk)
                    for row in chunk.to_dict(orient="records"):
                        yield row
            else:
                # Excel 较难流式读取，先一次性取回
                sheet_name = file_config.get("sheet_name") or 0
                df = pd.read_excel(file_path, sheet_name=sheet_name)
                if isinstance(df, dict):
                    df = list(df.values())[0]
                yield df.columns.tolist()
                df = _sanitize_dataframe(df)
                for row in df.to_dict(orient="records"):
                    yield row
        else:
            raise ValueError(f"不支持导出数据源类型: {source_type}")

    @staticmethod
    @monitor_query_performance
    async def execute(
        datasource: LensDataSource,
        query_type: str,
        query_config: Dict[str, Any],
        request: ViewDataRequest
    ) -> ViewDataResponse:
        """
        执行查询（带缓存和性能监控）
        """
        source_type = datasource.type

        # 获取连接配置
        if datasource.connection_config:
            conn_config = json.loads(datasource.connection_config)
        else:
            conn_config = {}

        if datasource.file_config:
            file_config = json.loads(datasource.file_config)
        else:
            file_config = {}

        if datasource.api_config:
            api_config = json.loads(datasource.api_config)
        else:
            api_config = {}

        # 检查查询缓存（仅对数据库查询启用缓存）
        if source_type in [DataSourceType.MYSQL, DataSourceType.POSTGRES, DataSourceType.SQLITE,
                           DataSourceType.SQLSERVER, DataSourceType.ORACLE]:
            cached_result = _query_cache.get(datasource.id, query_type, query_config, request)
            if cached_result is not None:
                logger.debug(f"查询缓存命中: datasource_id={datasource.id}")
                return cached_result

        # 根据数据源类型执行查询
        try:
            if source_type in [DataSourceType.MYSQL, DataSourceType.POSTGRES, DataSourceType.SQLITE,
                               DataSourceType.SQLSERVER, DataSourceType.ORACLE]:
                result = await execute_with_timeout(
                    QueryExecutor._execute_sql_query(
                        source_type, conn_config, query_type, query_config, request
                    ),
                    timeout=30
                )
            elif source_type in [DataSourceType.CSV, DataSourceType.EXCEL]:
                result = await QueryExecutor._execute_file_query(
                    source_type, file_config, query_config, request
                )
            elif source_type == DataSourceType.API:
                result = await QueryExecutor._execute_api_query(
                    api_config, query_config, request
                )
            else:
                raise ValueError(f"不支持的数据源类型: {source_type}")
            
            # 缓存结果（仅对数据库查询）
            if source_type in [DataSourceType.MYSQL, DataSourceType.POSTGRES, DataSourceType.SQLITE,
                               DataSourceType.SQLSERVER, DataSourceType.ORACLE]:
                _query_cache.put(datasource.id, query_type, query_config, request, result)
            
            return result
        except QueryTimeoutError:
            raise
        except Exception as e:
            logger.error(f"查询执行失败: {e}", exc_info=True)
            raise QueryExecutionError(f"查询执行失败: {str(e)}")

    @staticmethod
    def _validate_join_on(join_on: str) -> bool:
        """
        验证 JOIN ON 条件安全性
        仅允许: 字母、数字、下划线、点、空格、等号
        例如: t1.id = t2.uid
        """
        import re
        # 验证 JOIN ON 条件格式（仅支持 a.b = c.d 形式）
        if not join_on:
            return True
        # 简单正则匹配，防止 SQL 注入
        pattern = r"^[a-zA-Z0-9_.]+\s*=\s*[a-zA-Z0-9_.]+$"
        return bool(re.match(pattern, join_on.strip()))

    @staticmethod
    async def _execute_sql_query(
        source_type: str,
        conn_config: Dict[str, Any],
        query_type: str,
        query_config: Dict[str, Any],
        request: ViewDataRequest
    ) -> ViewDataResponse:
        """执行 SQL 数据库查询"""
        # 确定数据库类型
        db_type = "mysql" if source_type == DataSourceType.MYSQL else "postgres"

        # 构建基础 SQL（添加 SQL 安全验证）
        if query_type == QueryType.SQL:
            base_sql = query_config.get("sql", "SELECT 1")
            # 验证 SQL 安全性
            if not validate_sql(base_sql):
                raise QueryExecutionError("SQL 语句包含危险操作，仅允许 SELECT 查询")
        else:
            # TABLE 模式，构建 SQL（支持多表关联）
            main_table = query_config.get("table", "")
            # 验证表名安全性
            if main_table:
                main_table = sanitize_identifier(main_table)
            
            # 处理列字段，支持带表名的列名，并自动处理重名冲突
            columns = query_config.get("columns", ["*"])
            col_list = []
            if isinstance(columns, list):
                for col in columns:
                    if isinstance(col, dict):
                        field = col.get("field", "*")
                        alias = col.get("alias")
                        col_list.append(f"{field} AS {alias}" if alias else field)
                    elif isinstance(col, str) and "." in col:
                        # 自动为带表名的字段增加别名，防止子查询重名错误
                        # 例如: persons.id -> persons.id AS persons__id
                        safe_alias = col.replace(".", "__")
                        col_list.append(f"{col} AS {safe_alias}")
                    else:
                        col_list.append(col)
            else:
                col_list = [columns]
            
            col_str = ", ".join(col_list)
            
            # 处理表名转义
            if db_type == "mysql":
                table_ref = f"`{main_table}`"
            else:
                table_ref = f'"{main_table}"'
            
            base_sql = f"SELECT {col_str} FROM {table_ref}"
            
            # 处理 JOIN
            joins = query_config.get("joins", [])
            if joins:
                for join in joins:
                    join_type = join.get("type", "LEFT JOIN")
                    join_table = join.get("table", "")
                    join_on = join.get("on", "")
                    
                    # 验证 join_on 安全性
                    if join_on and not QueryExecutor._validate_join_on(join_on):
                        logger.warning(f"检测到潜在的 JOIN ON 注入尝试: {join_on}")
                        # 忽略不安全的 ON 条件，或者抛出错误
                        continue

                    join_table_ref = f"`{join_table}`" if db_type == "mysql" else f'"{join_table}"'
                    if join_table and join_on:
                        base_sql += f" {join_type} {join_table_ref} ON {join_on}"
            
            # 处理基础筛选 (View 自身的筛选配置)
            # 优先使用 structured filters
            view_filters = query_config.get("filters")
            view_where = ""
            
            if isinstance(view_filters, list) and view_filters:
                # 前端传递的是 string 数组 ["col='val'", ...] 或者 对象数组？
                # datalens_editor.js 简单模式传递的是: filters: ["field = 'val'", ...] 字符串数组
                # 这使得_build_filter_clause 难以直接复用（它期望 dict {field: {op, val}}）
                
                # Editor 传递的 filters 其实是 WHERE 子句片段数组
                # 我们需要验证这些片段
                safe_filters = []
                for f in view_filters:
                    # 简单验证: 必须包含 =, !=, >, <, LIKE, IS NULL 等
                    # 且不包含 ; -- /* 等
                    if validate_sql("SELECT * FROM t WHERE " + f):
                        safe_filters.append(f)
                
                if safe_filters:
                    view_where = " AND ".join(safe_filters)
            else:
                # 兼容旧格式或直接字符串
                where_str = query_config.get("where", "")
                if where_str and validate_sql("SELECT * FROM t WHERE " + where_str):
                    view_where = where_str

            if view_where:
                base_sql += f" WHERE {view_where}"

            # 最终验证生成的 SQL (Double Check)
            if not validate_sql(base_sql):
                 raise QueryExecutionError("生成的 SQL 语句包含潜在风险")

        # 包装成子查询以便后续添加筛选和排序
        wrapped_sql = f"SELECT * FROM ({base_sql}) AS base_query"
        
        # 构建筛选条件
        filter_params = {}
        if request.filters:
            filter_clause, filter_params = _build_filter_clause(request.filters, db_type)
            if filter_clause:
                wrapped_sql += filter_clause
        
        # 构建排序
        sort_clause = _build_sort_clause(request, db_type)
        if sort_clause:
            wrapped_sql += sort_clause

        base_sql = wrapped_sql

        # 根据数据源类型执行（使用连接池）
        if source_type == DataSourceType.MYSQL:
            url = _build_db_url(source_type, conn_config)
            engine = ConnectionPoolManager.get_engine(source_type, conn_config, url)

            # 搜索支持：如果是搜索模式，我们需要知道列名
            if request.search:
                try:
                    with engine.connect() as conn:
                        sample = conn.execute(text(f"SELECT * FROM ({base_sql}) AS t LIMIT 0"))
                        cols = sample.keys()
                        if cols:
                            search_clauses = [f"CAST(`{c}` AS CHAR) LIKE :search" for c in cols]
                            base_sql = f"SELECT * FROM ({base_sql}) AS search_t WHERE {' OR '.join(search_clauses)}"
                except Exception as e:
                    logger.warning(f"MySQL 搜索构造失败: {e}")

            # 计算总数的 SQL
            count_sql = f"SELECT COUNT(*) as cnt FROM ({base_sql}) AS count_query"
            # 添加分页
            offset = (request.page - 1) * request.page_size
            paginated_sql = f"{base_sql} LIMIT {request.page_size} OFFSET {offset}"

            # 合并筛选参数和搜索参数
            params = {**filter_params}
            if request.search:
                params["search"] = f"%{request.search}%"

            # 获取总数
            with engine.connect() as conn:
                result = conn.execute(text(count_sql), params)
                total = result.scalar() or 0

            # 获取数据
            df = pd.read_sql(text(paginated_sql), engine, params=params)
            # 不再 dispose，使用连接池管理

        elif source_type == DataSourceType.POSTGRES:
            url = _build_db_url(source_type, conn_config)
            engine = ConnectionPoolManager.get_engine(source_type, conn_config, url)

            if request.search:
                try:
                    with engine.connect() as conn:
                        sample = conn.execute(text(f"SELECT * FROM ({base_sql}) AS t LIMIT 0"))
                        cols = sample.keys()
                        if cols:
                            # Postgres 使用双引号引用标识符，CAST 到 TEXT
                            search_clauses = [f"CAST(\"{c}\" AS TEXT) LIKE :search" for c in cols]
                            base_sql = f"SELECT * FROM ({base_sql}) AS search_t WHERE {' OR '.join(search_clauses)}"
                except Exception as e:
                    logger.warning(f"Postgres 搜索构造失败: {e}")

            count_sql = f"SELECT COUNT(*) as cnt FROM ({base_sql}) AS count_query"
            offset = (request.page - 1) * request.page_size
            paginated_sql = f"{base_sql} LIMIT {request.page_size} OFFSET {offset}"
            
            # 合并筛选参数和搜索参数
            params = {**filter_params}
            if request.search:
                params["search"] = f"%{request.search}%"

            with engine.connect() as conn:
                result = conn.execute(text(count_sql), params)
                total = result.scalar() or 0

            df = pd.read_sql(text(paginated_sql), engine, params=params)
            # 不再 dispose，使用连接池管理

        elif source_type == DataSourceType.SQLITE:
            import sqlite3
            file_path = conn_config.get("file_path", "")
            conn = sqlite3.connect(file_path)

            if request.search:
                try:
                    cursor = conn.cursor()
                    cursor.execute(f"SELECT * FROM ({base_sql}) AS t LIMIT 0")
                    cols = [d[0] for d in cursor.description]
                    if cols:
                        search_clauses = [f"CAST(\"{c}\" AS TEXT) LIKE ?" for c in cols]
                        base_sql = f"SELECT * FROM ({base_sql}) AS search_t WHERE {' OR '.join(search_clauses)}"
                except Exception as e:
                    logger.warning(f"SQLite 搜索构造失败: {e}")

            count_sql = f"SELECT COUNT(*) as cnt FROM ({base_sql}) AS count_query"
            offset = (request.page - 1) * request.page_size
            paginated_sql = f"SELECT * FROM ({base_sql}) LIMIT {request.page_size} OFFSET {offset}"
            
            # 获取总数
            cursor = conn.cursor()
            if request.search:
                params = (f"%{request.search}%",) * len(cols)
                cursor.execute(count_sql, params)
                total = cursor.fetchone()[0]
                df = pd.read_sql(paginated_sql, conn, params=params)
            else:
                cursor.execute(count_sql)
                total = cursor.fetchone()[0]
                df = pd.read_sql(paginated_sql, conn)
            
            conn.close()

        else:
            raise ValueError(f"暂不支持的数据库类型: {source_type}")

        # 构建列定义
        columns = [{"field": col, "title": col} for col in df.columns.tolist()]

        # 构建数据（先处理日期时间列，避免格式转换）
        df = _sanitize_dataframe(df)
        
        # 使用 pandas 的方法将所有 NaN 替换为 None
        df = df.where(pd.notnull(df), None)
        
        data = df.to_dict(orient="records")
        
        # 递归清理数据中的 float NaN 值
        def clean_nan(obj):
            import math
            if isinstance(obj, dict):
                return {k: clean_nan(v) for k, v in obj.items()}
            elif isinstance(obj, list):
                return [clean_nan(item) for item in obj]
            elif isinstance(obj, float):
                if math.isnan(obj) or math.isinf(obj):
                    return None
            return obj
        
        data = clean_nan(data)

        return ViewDataResponse(
            columns=columns,
            data=data,
            total=total,
            page=request.page,
            page_size=request.page_size
        )


    @staticmethod
    async def _execute_file_query(
        source_type: str,
        file_config: Dict[str, Any],
        query_config: Dict[str, Any],
        request: ViewDataRequest
    ) -> ViewDataResponse:
        """执行文件查询"""
        import pandas as pd

        file_path = file_config.get("file_path", "")
        df = _get_cached_df(file_path, source_type, file_config)

        # 应用筛选条件
        if request.filters:
            df = _apply_dataframe_filters(df, request.filters)

        # 应用搜索
        if request.search:
            mask = df.apply(lambda row: row.astype(str).str.contains(request.search, case=False).any(), axis=1)
            df = df[mask]

        # 应用排序（支持多字段）
        df = _apply_dataframe_sorts(df, request)

        total = len(df)

        # 分页
        start = (request.page - 1) * request.page_size
        end = start + request.page_size
        df_page = df.iloc[start:end]

        # 构建列定义
        columns = [{"field": col, "title": col} for col in df_page.columns.tolist()]

        # 构建数据（先处理日期时间列，避免格式转换）
        df_page = _sanitize_dataframe(df_page)
        data = df_page.to_dict(orient="records")

        return ViewDataResponse(
            columns=columns,
            data=data,
            total=total,
            page=request.page,
            page_size=request.page_size
        )

    @staticmethod
    async def _execute_api_query(
        api_config: Dict[str, Any],
        query_config: Dict[str, Any],
        request: ViewDataRequest
    ) -> ViewDataResponse:
        """执行 API 查询"""
        import httpx
        import pandas as pd

        url = api_config.get("url", "")
        method = api_config.get("method", "GET").upper()
        headers = api_config.get("headers", {})

        # 合并查询参数
        params = {**api_config.get("params", {}), **query_config.get("params", {})}
        params["page"] = request.page
        params["page_size"] = request.page_size

        async with httpx.AsyncClient(timeout=30) as client:
            if method == "GET":
                response = await client.get(url, headers=headers, params=params)
            else:
                response = await client.post(url, headers=headers, json=params)

        data = response.json()

        # 尝试解析常见的 API 响应格式
        if isinstance(data, list):
            items = data
            total = len(items)
        elif isinstance(data, dict):
            # 常见格式: {data: [...], total: 100} 或 {items: [...], total: 100}
            items = data.get("data") or data.get("items") or data.get("results") or []
            total = data.get("total") or data.get("count") or len(items)
        else:
            items = []
            total = 0

        if items:
            df = pd.DataFrame(items)
            # 处理日期时间列，避免格式转换
            df = _sanitize_dataframe(df)
            columns = [{"field": col, "title": col} for col in df.columns.tolist()]
            data_list = df.to_dict(orient="records")
        else:
            columns = []
            data_list = []

        return ViewDataResponse(
            columns=columns,
            data=data_list,
            total=total,
            page=request.page,
            page_size=request.page_size
        )


# ==================== 数据源服务 ====================

class DataSourceService:
    """数据源服务"""

    @staticmethod
    async def get_list(db: AsyncSession, user_id: int, is_admin: bool = False) -> List[LensDataSource]:
        """获取数据源列表"""
        stmt = select(LensDataSource).order_by(LensDataSource.created_at.desc())
        if not is_admin:
            stmt = stmt.where(LensDataSource.created_by == user_id)
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def get_by_id(db: AsyncSession, source_id: int) -> Optional[LensDataSource]:
        """根据 ID 获取数据源"""
        result = await db.execute(select(LensDataSource).where(LensDataSource.id == source_id))
        return result.scalar_one_or_none()

    @staticmethod
    async def create(db: AsyncSession, data: DataSourceCreate, user_id: int) -> LensDataSource:
        """创建数据源"""
        source = LensDataSource(
            name=data.name,
            type=data.type.value,
            description=data.description,
            connection_config=json.dumps(data.connection_config) if data.connection_config else None,
            file_config=json.dumps(data.file_config) if data.file_config else None,
            api_config=json.dumps(data.api_config) if data.api_config else None,
            created_by=user_id
        )
        db.add(source)
        await db.flush()
        await db.refresh(source)
        return source

    @staticmethod
    async def update(db: AsyncSession, source: LensDataSource, data: DataSourceUpdate) -> LensDataSource:
        """更新数据源"""
        if data.name is not None:
            source.name = data.name
        if data.description is not None:
            source.description = data.description
        if data.connection_config is not None:
            source.connection_config = json.dumps(data.connection_config)
        if data.file_config is not None:
            source.file_config = json.dumps(data.file_config)
        if data.api_config is not None:
            source.api_config = json.dumps(data.api_config)
        if data.is_active is not None:
            source.is_active = data.is_active
        source.updated_at = datetime.now()
        await db.flush()
        await db.refresh(source)
        return source

    @staticmethod
    async def delete(db: AsyncSession, source: LensDataSource) -> None:
        """删除数据源"""
        await db.delete(source)
        await db.flush()

    @staticmethod
    async def test_connection(source_type: str, config: Dict[str, Any]) -> Tuple[bool, str]:
        """测试连接"""
        return await DataSourceConnector.test_connection(source_type, config)

    @staticmethod
    async def get_tables(source: LensDataSource) -> List[str]:
        """获取数据源的表列表"""
        source_type = source.type
        conn_config = json.loads(source.connection_config) if source.connection_config else {}
        file_config = json.loads(source.file_config) if source.file_config else {}

        if source_type == DataSourceType.MYSQL:
            url = _build_db_url(source_type, conn_config)
            engine = create_engine(url)
            inspector = inspect(engine)
            tables = inspector.get_table_names()
            engine.dispose()
            return tables

        elif source_type == DataSourceType.POSTGRES:
            url = _build_db_url(source_type, conn_config)
            engine = create_engine(url)
            inspector = inspect(engine)
            tables = inspector.get_table_names()
            engine.dispose()
            return tables

        elif source_type == DataSourceType.SQLITE:
            import sqlite3
            file_path = conn_config.get("file_path", "")
            conn = sqlite3.connect(file_path)
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
            tables = [row[0] for row in cursor.fetchall()]
            conn.close()
            return tables

        elif source_type in [DataSourceType.CSV, DataSourceType.EXCEL]:
            # 文件类型返回文件名作为"表名"
            file_path = file_config.get("file_path", "")
            import os
            return [os.path.basename(file_path)] if file_path else []

        else:
            return []

    @staticmethod
    async def get_columns(source: LensDataSource, table_name: str) -> List[Dict[str, Any]]:
        """获取数据源指定表的字段列表"""
        source_type = source.type
        conn_config = json.loads(source.connection_config) if source.connection_config else {}
        file_config = json.loads(source.file_config) if source.file_config else {}

        if source_type == DataSourceType.MYSQL:
            url = _build_db_url(source_type, conn_config)
            engine = create_engine(url)
            inspector = inspect(engine)
            columns = inspector.get_columns(table_name)
            engine.dispose()
            return [{"name": c["name"], "type": str(c["type"])} for c in columns]

        elif source_type == DataSourceType.POSTGRES:
            url = _build_db_url(source_type, conn_config)
            engine = create_engine(url)
            inspector = inspect(engine)
            columns = inspector.get_columns(table_name)
            engine.dispose()
            return [{"name": c["name"], "type": str(c["type"])} for c in columns]

        elif source_type == DataSourceType.SQLITE:
            import sqlite3
            file_path = conn_config.get("file_path", "")
            conn = sqlite3.connect(file_path)
            cursor = conn.cursor()
            cursor.execute(f"PRAGMA table_info({table_name})")
            columns = [{"name": row[1], "type": row[2]} for row in cursor.fetchall()]
            conn.close()
            return columns

        elif source_type in [DataSourceType.CSV, DataSourceType.EXCEL]:
            import pandas as pd
            import os
            file_path = file_config.get("file_path", "")
            if not file_path or not os.path.exists(file_path):
                raise ValueError(f"文件不存在或路径无效: {file_path}")
            if source_type == DataSourceType.CSV:
                df = pd.read_csv(file_path, nrows=1, encoding=file_config.get("encoding", "utf-8"))
            else:
                sheet_name = file_config.get("sheet_name") or 0
                df = pd.read_excel(file_path, nrows=1, sheet_name=sheet_name)
                if isinstance(df, dict):
                    df = list(df.values())[0]
            return [{"name": col, "type": str(df[col].dtype)} for col in df.columns]

        else:
            return []


# ==================== 分类服务 ====================

class CategoryService:
    """分类服务"""

    @staticmethod
    async def get_list(db: AsyncSession) -> List[Dict[str, Any]]:
        """获取分类列表（带视图数量）"""
        # 获取所有分类
        result = await db.execute(select(LensCategory).order_by(LensCategory.order, LensCategory.id))
        categories = list(result.scalars().all())

        # 获取每个分类的视图数量
        count_stmt = select(
            LensView.category_id,
            func.count(LensView.id).label("view_count")
        ).group_by(LensView.category_id)
        count_result = await db.execute(count_stmt)
        count_map = {row.category_id: row.view_count for row in count_result}

        # 构建响应
        return [
            {
                **{c: getattr(cat, c) for c in ["id", "name", "icon", "color", "order", "parent_id", "created_at", "updated_at"]},
                "view_count": count_map.get(cat.id, 0)
            }
            for cat in categories
        ]

    @staticmethod
    async def get_by_id(db: AsyncSession, category_id: int) -> Optional[LensCategory]:
        """根据 ID 获取分类"""
        result = await db.execute(select(LensCategory).where(LensCategory.id == category_id))
        return result.scalar_one_or_none()

    @staticmethod
    async def create(db: AsyncSession, data: CategoryCreate) -> LensCategory:
        """创建分类"""
        category = LensCategory(
            name=data.name,
            icon=data.icon,
            color=data.color,
            order=data.order,
            parent_id=data.parent_id
        )
        db.add(category)
        await db.flush()
        await db.refresh(category)
        return category

    @staticmethod
    async def update(db: AsyncSession, category: LensCategory, data: CategoryUpdate) -> LensCategory:
        """更新分类"""
        for field in ["name", "icon", "color", "order", "parent_id"]:
            value = getattr(data, field, None)
            if value is not None:
                setattr(category, field, value)
        category.updated_at = datetime.now()
        await db.flush()
        await db.refresh(category)
        return category

    @staticmethod
    async def delete(db: AsyncSession, category: LensCategory) -> None:
        """删除分类"""
        # 将该分类下的视图设为无分类
        await db.execute(
            LensView.__table__.update()
            .where(LensView.category_id == category.id)
            .values(category_id=None)
        )
        await db.delete(category)
        await db.flush()


# ==================== 视图服务 ====================

class ViewService:
    """视图服务"""

    @staticmethod
    async def get_list(
        db: AsyncSession,
        user_id: int,
        is_admin: bool = False,
        category_id: Optional[int] = None,
        search: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """获取视图列表"""
        # 基础查询
        stmt = select(LensView).order_by(LensView.updated_at.desc())

        # 权限过滤：非管理员只能看到公开的或自己创建的
        if not is_admin:
            stmt = stmt.where(
                or_(LensView.is_public == True, LensView.created_by == user_id)
            )

        # 分类过滤
        if category_id is not None:
            stmt = stmt.where(LensView.category_id == category_id)

        # 搜索过滤
        if search:
            stmt = stmt.where(
                or_(
                    LensView.name.contains(search),
                    LensView.description.contains(search)
                )
            )

        result = await db.execute(stmt)
        views = list(result.scalars().all())

        # 获取用户收藏列表
        fav_stmt = select(LensFavorite.view_id).where(LensFavorite.user_id == user_id)
        fav_result = await db.execute(fav_stmt)
        favorited_ids = {row[0] for row in fav_result}

        # 获取分类信息
        cat_stmt = select(LensCategory.id, LensCategory.name)
        cat_result = await db.execute(cat_stmt)
        cat_map = {row.id: row.name for row in cat_result}

        # 获取数据源信息
        ds_stmt = select(LensDataSource.id, LensDataSource.name)
        ds_result = await db.execute(ds_stmt)
        ds_map = {row.id: row.name for row in ds_result}

        # 获取创建者用户名
        user_ids = list(set(v.created_by for v in views if v.created_by))
        user_map = {}
        if user_ids:
            try:
                from models.account import User
                user_stmt = select(User.id, User.username).where(User.id.in_(user_ids))
                user_result = await db.execute(user_stmt)
                user_map = {row.id: row.username for row in user_result}
            except Exception as e:
                logger.warning(f"获取用户名失败: {e}")

        # 构建响应
        return [
            {
                "id": v.id,
                "name": v.name,
                "description": v.description,
                "icon": v.icon,
                "category_id": v.category_id,
                "category_name": cat_map.get(v.category_id),
                "datasource_id": v.datasource_id,
                "datasource_name": ds_map.get(v.datasource_id),
                "query_type": v.query_type,
                "query_config": json.loads(v.query_config) if v.query_config else None,
                "display_config": json.loads(v.display_config) if v.display_config else None,
                "status_config": json.loads(v.status_config) if v.status_config else None,
                "chart_config": json.loads(v.chart_config) if v.chart_config else None,
                "required_permission": v.required_permission,
                "is_public": v.is_public,
                "view_count": v.view_count,
                "created_by": v.created_by,
                "creator_name": user_map.get(v.created_by, f"用户{v.created_by}"),
                "created_at": v.created_at,
                "updated_at": v.updated_at,
                "is_favorited": v.id in favorited_ids
            }
            for v in views
        ]

    @staticmethod
    async def get_by_id(db: AsyncSession, view_id: int) -> Optional[LensView]:
        """根据 ID 获取视图"""
        result = await db.execute(select(LensView).where(LensView.id == view_id))
        return result.scalar_one_or_none()

    @staticmethod
    async def create(db: AsyncSession, data: ViewCreate, user_id: int) -> LensView:
        """创建视图"""
        view = LensView(
            name=data.name,
            description=data.description,
            icon=data.icon,
            category_id=data.category_id,
            datasource_id=data.datasource_id,
            query_type=data.query_type.value,
            query_config=json.dumps(data.query_config) if data.query_config else None,
            display_config=json.dumps(data.display_config) if data.display_config else None,
            status_config=json.dumps(data.status_config) if data.status_config else None,
            chart_config=json.dumps(data.chart_config) if data.chart_config else None,
            required_permission=data.required_permission,
            is_public=data.is_public,
            created_by=user_id
        )
        db.add(view)
        await db.flush()
        await db.refresh(view)
        return view

    @staticmethod
    async def update(db: AsyncSession, view: LensView, data: ViewUpdate) -> LensView:
        """更新视图"""
        for field in ["name", "description", "icon", "category_id", "datasource_id",
                      "required_permission", "is_public"]:
            value = getattr(data, field, None)
            if value is not None:
                setattr(view, field, value)

        if data.query_type is not None:
            view.query_type = data.query_type.value
        if data.query_config is not None:
            view.query_config = json.dumps(data.query_config)
        if data.display_config is not None:
            view.display_config = json.dumps(data.display_config)
        if data.status_config is not None:
            view.status_config = json.dumps(data.status_config)
        if data.chart_config is not None:
            view.chart_config = json.dumps(data.chart_config)

        view.updated_at = datetime.now()
        await db.flush()
        await db.refresh(view)
        return view

    @staticmethod
    async def delete(db: AsyncSession, view: LensView) -> None:
        """删除视图"""
        view_id = view.id
        
        # 删除相关的收藏和最近访问记录
        await db.execute(delete(LensFavorite).where(LensFavorite.view_id == view_id))
        await db.execute(delete(LensRecentView).where(LensRecentView.view_id == view_id))
        await db.flush()
        
        # 同步清理所有用户设置中的快捷方式
        # 这种操作在大规模用户下可能性能较差，但在目前系统规模下是安全的
        from models import User
        result = await db.execute(select(User))
        users = result.scalars().all()
        for u in users:
            if u.settings and "start_menu_shortcuts" in u.settings:
                shortcuts = u.settings["start_menu_shortcuts"]
                if not isinstance(shortcuts, list): continue
                
                # 过滤掉指向该视图的快捷方式
                new_shortcuts = [
                    s for s in shortcuts 
                    if not (isinstance(s, dict) and s.get("type") == "datalens" and s.get("view_id") == view_id)
                ]
                
                if len(new_shortcuts) != len(shortcuts):
                    # 更新用户设置
                    updated_settings = dict(u.settings)
                    updated_settings["start_menu_shortcuts"] = new_shortcuts
                    u.settings = updated_settings
                    flag_modified(u, "settings")
        
        await db.delete(view)
        await db.flush()

    @staticmethod
    async def increment_view_count(db: AsyncSession, view: LensView) -> None:
        """增加访问次数"""
        view.view_count += 1
        await db.flush()

    @staticmethod
    async def execute_query(
        db: AsyncSession,
        view: LensView,
        request: ViewDataRequest
    ) -> ViewDataResponse:
        """执行视图查询"""
        # 获取数据源
        datasource = await DataSourceService.get_by_id(db, view.datasource_id)
        if not datasource:
            raise ValueError("数据源不存在或已被删除")

        # 解析查询配置
        query_config = json.loads(view.query_config) if view.query_config else {}

        # 执行查询
        return await QueryExecutor.execute(datasource, view.query_type, query_config, request)

    @staticmethod
    async def stream_export_csv(db: AsyncSession, view: LensView):
        """流式导出 CSV 格式数据"""
        import io
        import csv

        datasource = await DataSourceService.get_by_id(db, view.datasource_id)
        if not datasource:
            raise ValueError("数据源不存在")

        query_config = json.loads(view.query_config) if view.query_config else {}
        
        # 增加访问次数
        await ViewService.increment_view_count(db, view)

        # 构建生成器
        async def generate():
            # BOM 用于 Excel 中文支持
            yield "\uFEFF".encode("utf-8")
            
            output = io.StringIO()
            writer = csv.writer(output)
            
            first = True
            fields = []
            
            # 使用 QueryExecutor 进行流式获取
            generator = QueryExecutor.stream_execute(datasource, view.query_type, query_config)
            
            for item in generator:
                if first:
                    # 第一项是列名
                    fields = item
                    writer.writerow(fields)
                    first = False
                else:
                    # 后续项是记录字典
                    row = [item.get(field, "") for field in fields]
                    writer.writerow(row)
                
                # 读取内容并清空缓冲
                yield output.getvalue().encode("utf-8")
                output.seek(0)
                output.truncate(0)

        return generate()


# ==================== 收藏服务 ====================

class FavoriteService:
    """收藏服务"""

    @staticmethod
    async def get_list(db: AsyncSession, user_id: int) -> List[Dict[str, Any]]:
        """获取收藏列表"""
        stmt = (
            select(LensFavorite, LensView, LensCategory)
            .join(LensView, LensFavorite.view_id == LensView.id)
            .outerjoin(LensCategory, LensView.category_id == LensCategory.id)
            .where(LensFavorite.user_id == user_id)
            .order_by(LensFavorite.created_at.desc())
        )
        result = await db.execute(stmt)
        rows = result.all()

        return [
            {
                "id": view.id,  # 这里的 ID 改为 View ID 以便前端卡片操作
                "favorite_id": fav.id,
                "name": view.name,
                "description": view.description,
                "icon": view.icon,
                "category_id": view.category_id,
                "category_name": cat.name if cat else None,
                "created_at": view.created_at,
                "updated_at": view.updated_at,
                "is_favorited": True,
                "creator_name": f"用户{view.created_by}" # 简化处理，或进一步 Join User
            }
            for fav, view, cat in rows
        ]

    @staticmethod
    async def add(db: AsyncSession, user_id: int, view_id: int) -> LensFavorite:
        """添加收藏"""
        # 检查是否已收藏
        stmt = select(LensFavorite).where(
            and_(LensFavorite.user_id == user_id, LensFavorite.view_id == view_id)
        )
        existing = await db.execute(stmt)
        if existing.scalar_one_or_none():
            raise ValueError("已收藏该视图")

        fav = LensFavorite(user_id=user_id, view_id=view_id)
        db.add(fav)
        await db.flush()
        await db.refresh(fav)
        return fav

    @staticmethod
    async def remove(db: AsyncSession, user_id: int, view_id: int) -> None:
        """取消收藏"""
        await db.execute(
            delete(LensFavorite).where(
                and_(LensFavorite.user_id == user_id, LensFavorite.view_id == view_id)
            )
        )


# ==================== 最近访问服务 ====================

class RecentViewService:
    """最近访问服务"""

    @staticmethod
    async def get_list(db: AsyncSession, user_id: int, limit: int = 10) -> List[Dict[str, Any]]:
        """获取最近访问列表"""
        stmt = (
            select(LensRecentView, LensView, LensCategory)
            .join(LensView, LensRecentView.view_id == LensView.id)
            .outerjoin(LensCategory, LensView.category_id == LensCategory.id)
            .where(LensRecentView.user_id == user_id)
            .order_by(LensRecentView.accessed_at.desc())
            .limit(limit)
        )
        result = await db.execute(stmt)
        rows = result.all()

        return [
            {
                "id": view.id, # 这里的 ID 改为 View ID 以便前端卡片操作
                "recent_id": recent.id,
                "name": view.name,
                "description": view.description,
                "icon": view.icon,
                "category_id": view.category_id,
                "category_name": cat.name if cat else None,
                "created_at": view.created_at,
                "updated_at": view.updated_at,
                "accessed_at": recent.accessed_at,
                "creator_name": f"用户{view.created_by}" # 简化处理
            }
            for recent, view, cat in rows
        ]

    @staticmethod
    async def record(db: AsyncSession, user_id: int, view_id: int) -> None:
        """记录访问"""
        # 删除该用户对该视图的旧记录
        await db.execute(
            delete(LensRecentView).where(
                and_(LensRecentView.user_id == user_id, LensRecentView.view_id == view_id)
            )
        )

        # 添加新记录
        recent = LensRecentView(user_id=user_id, view_id=view_id)
        db.add(recent)

        # 保留最近 50 条记录 - 使用兼容 MySQL 的方式
        # 先查询需要删除的 ID
        result = await db.execute(
            select(LensRecentView.id)
            .where(LensRecentView.user_id == user_id)
            .order_by(LensRecentView.accessed_at.desc())
            .offset(50)
        )
        ids_to_delete = [row[0] for row in result.fetchall()]
        
        # 如果有需要删除的记录，执行删除
        if ids_to_delete:
            await db.execute(
                delete(LensRecentView).where(LensRecentView.id.in_(ids_to_delete))
            )


# ==================== Hub 服务 ====================

class HubService:
    """Hub 首页服务"""

    @staticmethod
    async def get_overview(db: AsyncSession, user_id: int, is_admin: bool = False) -> Dict[str, Any]:
        """获取首页概览"""
        # 视图总数
        view_stmt = select(func.count(LensView.id))
        if not is_admin:
            view_stmt = view_stmt.where(
                or_(LensView.is_public == True, LensView.created_by == user_id)
            )
        view_result = await db.execute(view_stmt)
        total_views = view_result.scalar() or 0

        # 数据源总数
        ds_stmt = select(func.count(LensDataSource.id))
        if not is_admin:
            ds_stmt = ds_stmt.where(LensDataSource.created_by == user_id)
        ds_result = await db.execute(ds_stmt)
        total_datasources = ds_result.scalar() or 0

        # 分类总数
        cat_result = await db.execute(select(func.count(LensCategory.id)))
        total_categories = cat_result.scalar() or 0

        # 最近访问
        recent_views = await RecentViewService.get_list(db, user_id, limit=5)

        # 收藏列表
        favorites = await FavoriteService.get_list(db, user_id)

        return {
            "total_views": total_views,
            "total_datasources": total_datasources,
            "total_categories": total_categories,
            "recent_views": recent_views,
            "favorites": favorites[:5]  # 只返回前5个
        }
