"""
Analysis 模块业务服务层
"""

import os
import duckdb
import logging
import threading
from typing import List, Dict, Any, Optional
import pandas as pd

logger = logging.getLogger(__name__)

class DuckDBService:
    _instance = None
    _conn = None
    _initialized = False
    _lock = threading.RLock()  # 使用可重入锁，避免 query/fetch 方法内调用 ensure_connection 时死锁

    def __new__(cls):
        with cls._lock:
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
        # 数据库文件存放于 storage/modules/analysis/
        self.db_dir = storage.get_module_dir("analysis", "")
        self.db_path = os.path.join(self.db_dir, "analysis.db")
        
        # 注册退出时关闭连接
        import atexit
        atexit.register(self.close)


    def ensure_connection(self):
        """确保连接已建立（用于初始化时创建数据库文件）"""
        if self._conn is not None:
            return self._conn
        
        with self._lock:
            # 双重检查锁定
            if self._conn is not None:
                return self._conn
            import time
            max_retries = 5
            retry_delay = 1.0  # 秒
            
            for attempt in range(max_retries):
                try:
                    # DuckDB 默认是线程安全的，但在 Windows 上由于文件锁定，不支持多进程同时读写同一文件
                    self._conn = duckdb.connect(self.db_path)
                    logger.info(f"DuckDB 数据库已连接: {self.db_path}")
                    break
                except Exception as e:
                    err_msg = str(e)
                    if "IO Error" in err_msg and "already open" in err_msg:
                        if attempt < max_retries - 1:
                            logger.warning(f"DuckDB 文件锁冲突，等待 {retry_delay} 秒后重试... (尝试 {attempt + 1}/{max_retries})")
                            time.sleep(retry_delay)
                            continue
                        else:
                            logger.error(f"❌ DuckDB 文件锁冲突！数据库文件被另一个进程占用。")
                            logger.error(f"请检查并关闭多余的 Python 后端进程。")
                            raise RuntimeError("数据库文件被锁定，请确保只运行了一个后端实例。")
                    logger.error(f"DuckDB 连接失败: {e}")
                    raise
        return self._conn
    
    @property
    def conn(self):
        """获取数据库连接（延迟初始化）"""
        return self.ensure_connection()

    def query(self, sql: str, params: Any = None):
        """执行查询并返回结果（线程安全）"""
        with self._lock:
            if params:
                return self.conn.execute(sql, params)
            return self.conn.execute(sql)

    def fetch_all(self, sql: str, params: Any = None) -> List[tuple]:
        """执行查询并返回元组列表（线程安全）"""
        with self._lock:
            rel = self.conn.execute(sql, params) if params else self.conn.execute(sql)
            return rel.fetchall()

    def fetch_df(self, sql: str, params: Any = None) -> pd.DataFrame:
        """执行查询并返回 DataFrame（线程安全）"""
        with self._lock:
            rel = self.conn.execute(sql, params) if params else self.conn.execute(sql)
            return rel.df()

    def table_exists(self, table_name: str) -> bool:
        """检查表是否存在"""
        res = self.fetch_all("SELECT count(*) FROM information_schema.tables WHERE table_name = ?", [table_name])
        return res[0][0] > 0

    def register(self, name: str, obj: Any):
        """将 Python 对象注册为虚拟表"""
        with self._lock:
            self.conn.register(name, obj)

    def unregister(self, name: str):
        """注销虚拟表"""
        with self._lock:
            self.conn.unregister(name)

    def close(self):
        with self._lock:
            if self._conn:
                self._conn.close()
                self._conn = None

# 创建单例实例
duckdb_instance = DuckDBService()
