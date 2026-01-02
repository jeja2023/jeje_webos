"""
DataLens 数据透镜模块 - 优化工具
包含连接池管理、缓存机制、性能监控等优化功能
"""

import json
import time
import hashlib
import asyncio
import threading
import logging
from collections import OrderedDict
from typing import Optional, Dict, Any, Callable
from functools import wraps
from contextlib import asynccontextmanager
from sqlalchemy import create_engine, Engine, text
from sqlalchemy.pool import QueuePool

from .datalens_schemas import ViewDataRequest, ViewDataResponse

logger = logging.getLogger(__name__)


# ==================== 异常类 ====================

class DataLensException(Exception):
    """数据透镜模块基础异常"""
    pass


class DataSourceConnectionError(DataLensException):
    """数据源连接错误"""
    pass


class QueryExecutionError(DataLensException):
    """查询执行错误"""
    pass


class PermissionDeniedError(DataLensException):
    """权限拒绝错误"""
    pass


class QueryTimeoutError(QueryExecutionError):
    """查询超时错误"""
    pass


# ==================== 连接池管理器 ====================

class ConnectionPoolManager:
    """数据库连接池管理器"""
    _pools: Dict[str, Engine] = {}
    _lock = threading.RLock()
    
    @staticmethod
    def get_pool_key(source_type: str, conn_config: Dict[str, Any]) -> str:
        """生成连接池键"""
        # 使用配置的哈希值作为键的一部分
        config_str = json.dumps(conn_config, sort_keys=True)
        config_hash = hashlib.md5(config_str.encode()).hexdigest()[:8]
        return f"{source_type}_{config_hash}"
    
    @staticmethod
    def get_engine(source_type: str, conn_config: Dict[str, Any], db_url: str) -> Engine:
        """获取或创建连接池"""
        pool_key = ConnectionPoolManager.get_pool_key(source_type, conn_config)
        
        if pool_key not in ConnectionPoolManager._pools:
            with ConnectionPoolManager._lock:
                # 双重检查
                if pool_key not in ConnectionPoolManager._pools:
                    try:
                        engine = create_engine(
                            db_url,
                            poolclass=QueuePool,
                            pool_size=5,  # 连接池大小
                            max_overflow=10,  # 最大溢出连接数
                            pool_pre_ping=True,  # 连接前检查
                            pool_recycle=3600,  # 连接回收时间（秒）
                            echo=False
                        )
                        ConnectionPoolManager._pools[pool_key] = engine
                        logger.info(f"创建连接池: {pool_key}")
                    except Exception as e:
                        logger.error(f"创建连接池失败: {e}")
                        raise DataSourceConnectionError(f"创建连接池失败: {e}")
        
        return ConnectionPoolManager._pools[pool_key]
    
    @staticmethod
    def close_pool(pool_key: str):
        """关闭指定连接池"""
        with ConnectionPoolManager._lock:
            if pool_key in ConnectionPoolManager._pools:
                try:
                    ConnectionPoolManager._pools[pool_key].dispose()
                    logger.info(f"关闭连接池: {pool_key}")
                except Exception as e:
                    logger.warning(f"关闭连接池失败: {e}")
                finally:
                    del ConnectionPoolManager._pools[pool_key]
    
    @staticmethod
    def close_all():
        """关闭所有连接池"""
        with ConnectionPoolManager._lock:
            for pool_key, engine in list(ConnectionPoolManager._pools.items()):
                try:
                    engine.dispose()
                    logger.info(f"关闭连接池: {pool_key}")
                except Exception as e:
                    logger.warning(f"关闭连接池失败: {e}")
            ConnectionPoolManager._pools.clear()
    
    @staticmethod
    async def health_check():
        """检查所有连接池的健康状态"""
        unhealthy_pools = []
        with ConnectionPoolManager._lock:
            for pool_key, engine in list(ConnectionPoolManager._pools.items()):
                try:
                    with engine.connect() as conn:
                        conn.execute(text("SELECT 1"))
                    logger.debug(f"连接池 {pool_key} 健康检查通过")
                except Exception as e:
                    logger.warning(f"连接池 {pool_key} 健康检查失败: {e}")
                    unhealthy_pools.append(pool_key)
        
        # 移除不健康的连接池
        for pool_key in unhealthy_pools:
            ConnectionPoolManager.close_pool(pool_key)


# ==================== LRU 文件缓存 ====================

class LRUFileCache:
    """LRU 文件缓存"""
    def __init__(self, max_size: int = 20, ttl: int = 300):
        self.max_size = max_size  # 最大缓存文件数
        self.ttl = ttl  # 缓存过期时间（秒）
        self._cache = OrderedDict()
        self._timestamps = {}
        self._lock = threading.RLock()
    
    def get(self, file_path: str) -> Optional[Any]:
        """获取缓存的 DataFrame"""
        with self._lock:
            if file_path not in self._cache:
                return None
            
            # 检查是否过期
            timestamp = self._timestamps.get(file_path, 0)
            if time.time() - timestamp > self.ttl:
                self._remove(file_path)
                return None
            
            # 移动到末尾（最近使用）
            df = self._cache.pop(file_path)
            self._cache[file_path] = df
            return df.copy()
    
    def put(self, file_path: str, df: Any):
        """添加缓存"""
        with self._lock:
            # 如果已存在，先移除
            if file_path in self._cache:
                self._cache.pop(file_path)
            
            # 如果超过最大大小，移除最旧的
            while len(self._cache) >= self.max_size:
                oldest_key = next(iter(self._cache))
                self._remove(oldest_key)
            
            self._cache[file_path] = df
            self._timestamps[file_path] = time.time()
    
    def get_timestamp(self, file_path: str) -> float:
        """获取缓存时间戳"""
        with self._lock:
            return self._timestamps.get(file_path, 0)
    
    def _remove(self, file_path: str):
        """移除缓存"""
        self._cache.pop(file_path, None)
        self._timestamps.pop(file_path, None)
    
    def clear(self):
        """清空缓存"""
        with self._lock:
            self._cache.clear()
            self._timestamps.clear()


# 全局文件缓存实例
_file_cache = LRUFileCache(max_size=20, ttl=300)


# ==================== 查询结果缓存 ====================

class QueryResultCache:
    """查询结果缓存"""
    def __init__(self, max_size: int = 200, ttl: int = 120):
        self.max_size = max_size
        self.ttl = ttl
        self._cache = {}
        self._lock = threading.RLock()
    
    def _generate_key(
        self, 
        datasource_id: int, 
        query_type: str, 
        query_config: Dict, 
        request: ViewDataRequest
    ) -> str:
        """生成缓存键"""
        cache_data = {
            "datasource_id": datasource_id,
            "query_type": query_type,
            "query_config": query_config,
            "page": request.page,
            "page_size": request.page_size,
            "filters": request.filters,
            "sorts": request.sorts,
            "search": request.search
        }
        cache_str = json.dumps(cache_data, sort_keys=True, default=str)
        return hashlib.md5(cache_str.encode()).hexdigest()
    
    def get(
        self, 
        datasource_id: int, 
        query_type: str, 
        query_config: Dict, 
        request: ViewDataRequest
    ) -> Optional[ViewDataResponse]:
        """获取缓存"""
        key = self._generate_key(datasource_id, query_type, query_config, request)
        with self._lock:
            if key not in self._cache:
                return None
            
            entry = self._cache[key]
            if time.time() - entry["timestamp"] > self.ttl:
                del self._cache[key]
                return None
            
            return entry["result"]
    
    def put(
        self, 
        datasource_id: int, 
        query_type: str, 
        query_config: Dict, 
        request: ViewDataRequest,
        result: ViewDataResponse
    ):
        """添加缓存"""
        key = self._generate_key(datasource_id, query_type, query_config, request)
        with self._lock:
            if len(self._cache) >= self.max_size:
                # 移除最旧的缓存
                oldest_key = min(self._cache.keys(), key=lambda k: self._cache[k]["timestamp"])
                del self._cache[oldest_key]
            
            self._cache[key] = {
                "result": result,
                "timestamp": time.time()
            }
    
    def clear(self):
        """清空缓存"""
        with self._lock:
            self._cache.clear()


# 全局查询缓存实例
_query_cache = QueryResultCache(max_size=200, ttl=120)


# ==================== SQL 安全验证 ====================

def validate_sql(sql: str) -> bool:
    """验证 SQL 是否安全"""
    import re
    
    # 转换为小写以便检查
    sql_lower = sql.lower().strip()
    
    # 只允许 SELECT 语句
    if not sql_lower.startswith("select"):
        return False
    
    # 禁止危险关键字
    dangerous_keywords = [
        "drop", "delete", "update", "insert", "alter",
        "create", "truncate", "exec", "execute", "grant",
        "revoke", "commit", "rollback", "call", "declare"
    ]
    
    for keyword in dangerous_keywords:
        if re.search(rf"\b{keyword}\b", sql_lower):
            return False
    
    return True


def sanitize_identifier(identifier: str) -> str:
    """清理标识符（表名、字段名）"""
    import re
    
    # 只允许字母、数字、下划线和点
    if not re.match(r"^[a-zA-Z0-9_.]+$", identifier):
        raise ValueError(f"无效的标识符: {identifier}")
    return identifier


# ==================== 查询超时控制 ====================

@asynccontextmanager
async def query_timeout(timeout: int = 30):
    """查询超时上下文管理器"""
    try:
        yield
    except asyncio.TimeoutError:
        raise QueryTimeoutError(f"查询超时（{timeout}秒）")
    finally:
        pass


async def execute_with_timeout(coro, timeout: int = 30):
    """执行带超时的协程"""
    try:
        return await asyncio.wait_for(coro, timeout=timeout)
    except asyncio.TimeoutError:
        raise QueryTimeoutError(f"查询超时（{timeout}秒）")


# ==================== 性能监控装饰器 ====================

def monitor_query_performance(func: Callable):
    """查询性能监控装饰器"""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        start_time = time.time()
        try:
            result = await func(*args, **kwargs)
            duration = time.time() - start_time
            
            # 记录慢查询（超过 5 秒）
            if duration > 5:
                logger.warning(
                    f"慢查询检测: {func.__name__} 耗时 {duration:.2f}秒",
                    extra={
                        "function": func.__name__,
                        "duration": duration,
                        "args_count": len(args),
                    }
                )
            else:
                logger.debug(f"查询完成: {func.__name__} 耗时 {duration:.2f}秒")
            
            return result
        except Exception as e:
            duration = time.time() - start_time
            logger.error(
                f"查询失败: {func.__name__} 耗时 {duration:.2f}秒, 错误: {e}",
                exc_info=True
            )
            raise
    
    return wrapper


# ==================== 权限检查装饰器 ====================

def check_datasource_permission(func: Callable):
    """数据源权限检查装饰器"""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        # 这个装饰器需要在路由层使用，因为需要访问 db 和 user
        # 这里只是定义，实际使用在 router 中
        return await func(*args, **kwargs)
    return wrapper


def check_view_permission(func: Callable):
    """视图权限检查装饰器"""
    @wraps(func)
    async def wrapper(*args, **kwargs):
        # 这个装饰器需要在路由层使用
        return await func(*args, **kwargs)
    return wrapper

