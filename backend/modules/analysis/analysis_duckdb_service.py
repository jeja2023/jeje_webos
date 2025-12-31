import os
import duckdb
import logging
from typing import List, Dict, Any, Optional
import pandas as pd

logger = logging.getLogger(__name__)

class DuckDBService:
    _instance = None
    _conn = None
    _initialized = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(DuckDBService, cls).__new__(cls)
        return cls._instance

    def __init__(self):
        if DuckDBService._initialized:
            return
        DuckDBService._initialized = True
        
        # 使用 StorageManager 获取标准化存储路径
        from utils.storage import get_storage_manager
        storage = get_storage_manager()
        self.db_dir = storage.get_module_dir("analysis")
        self.db_path = os.path.join(self.db_dir, "analysis.db")
        
        # 使用 DEBUG 级别避免在 Uvicorn reloader 中重复输出
        logger.debug(f"DuckDB 存储初始化: {self.db_path}")

    def ensure_connection(self):
        """确保连接已建立（用于初始化时创建数据库文件）"""
        if self._conn is None:
            try:
                # DuckDB 默认是线程安全的，但在高并发写时由于是文件锁定，建议谨慎
                # 如果文件不存在，DuckDB 会自动创建
                self._conn = duckdb.connect(self.db_path)
                logger.info(f"DuckDB 数据库已创建/连接: {self.db_path}")
            except Exception as e:
                logger.error(f"DuckDB 连接失败: {e}")
                raise
        return self._conn
    
    @property
    def conn(self):
        """获取数据库连接（延迟初始化）"""
        return self.ensure_connection()

    def query(self, sql: str, params: Any = None):
        """执行查询并返回结果"""
        if params:
            return self.conn.execute(sql, params)
        return self.conn.execute(sql)

    def fetch_all(self, sql: str, params: Any = None) -> List[Dict[str, Any]]:
        """执行查询并返回字典列表"""
        rel = self.query(sql, params)
        return rel.fetchall()

    def fetch_df(self, sql: str, params: Any = None) -> pd.DataFrame:
        """执行查询并返回 DataFrame"""
        rel = self.query(sql, params)
        return rel.df()

    def table_exists(self, table_name: str) -> bool:
        """检查表是否存在"""
        res = self.fetch_all("SELECT count(*) FROM information_schema.tables WHERE table_name = ?", [table_name])
        return res[0][0] > 0

    def close(self):
        if self._conn:
            self._conn.close()
            self._conn = None

# 创建单例实例
duckdb_instance = DuckDBService()
