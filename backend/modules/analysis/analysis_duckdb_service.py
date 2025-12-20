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
        
        # 确定存储路径：项目根目录/storage/analysis/analysis.db
        base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(__file__))))
        self.db_dir = os.path.join(base_dir, "storage", "analysis")
        
        if not os.path.exists(self.db_dir):
            os.makedirs(self.db_dir, exist_ok=True)
            
        self.db_path = os.path.join(self.db_dir, "analysis.db")
        logger.debug(f"DuckDB 存储路径: {self.db_path}")

    @property
    def conn(self):
        if self._conn is None:
            try:
                # DuckDB 默认是线程安全的，但在高并发写时由于是文件锁定，建议谨慎
                self._conn = duckdb.connect(self.db_path)
                logger.info("DuckDB 连接成功")
            except Exception as e:
                logger.error(f"DuckDB 连接失败: {e}")
                raise
        return self._conn

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
