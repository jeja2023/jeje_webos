import os
import uuid
import pandas as pd
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from modules.analysis.analysis_duckdb_service import duckdb_instance
from modules.analysis.analysis_models import AnalysisDataset
from models.storage import FileRecord
from utils.storage import get_storage_manager
import logging

logger = logging.getLogger(__name__)

class ImportService:
    @staticmethod
    async def import_from_file(db: AsyncSession, name: str, file_id: int, options: dict = None):
        """从上传的文件导入数据到 DuckDB"""
        # 1. 获取文件记录
        result = await db.execute(select(FileRecord).where(FileRecord.id == file_id))
        file_record = result.scalar_one_or_none()
        if not file_record:
            raise ValueError("文件记录不存在")
            
        # 2. 获取实际文件路径
        storage = get_storage_manager()
        file_path = storage.get_file_path(file_record.storage_path)
        if not file_path or not os.path.exists(file_path):
            raise ValueError("物理文件不存在")
            
        # 3. 生成表名 (DuckDB 内部表名)
        table_name = f"dataset_{uuid.uuid4().hex[:8]}"
        
        # 4. 使用 DuckDB 读取文件
        ext = os.path.splitext(file_record.filename)[1].lower()
        try:
            if ext == '.csv':
                # DuckDB 读取 CSV 极其高效
                duckdb_instance.query(f"CREATE TABLE {table_name} AS SELECT * FROM read_csv_auto(?)", [str(file_path)])
            elif ext in ['.xlsx', '.xls']:
                # 需要 openpyxl。DuckDB 原生对 Excel 支持有限，使用 pandas 中转
                df = pd.read_excel(file_path)
                # DuckDB 可以直接查询 Python 中的 DataFrame 对象
                duckdb_instance.conn.execute(f"CREATE TABLE {table_name} AS SELECT * FROM df")
            else:
                raise ValueError(f"不支持的文件格式: {ext}")
                
            # 获取实际行数
            count_res = duckdb_instance.fetch_all(f"SELECT count(*) FROM {table_name}")
            row_count = count_res[0][0] if count_res else 0
            
            # 5. 保存元数据到 MySQL (JeJe WebOS 主数据库)
            dataset = AnalysisDataset(
                name=name,
                source_type="file",
                table_name=table_name,
                row_count=row_count,
                config={
                    "file_id": file_id, 
                    "original_filename": file_record.filename,
                    "mime_type": file_record.mime_type
                }
            )
            db.add(dataset)
            await db.commit()
            await db.refresh(dataset)
            return dataset
        except Exception as e:
            logger.error(f"导入失败: {e}")
            raise ValueError(f"数据导入失败: {str(e)}")

    @staticmethod
    async def import_from_database(db: AsyncSession, name: str, connection_url: str, query: str, options: dict = None):
        """从外部数据库导入数据到 DuckDB"""
        # 使用 SQLAlchemy + Pandas 进行中转（通用性强）
        from sqlalchemy import create_engine
        try:
            engine = create_engine(connection_url)
            # 这里的 query 可以是 SQL 语句同步获取数据
            df = pd.read_sql(query, engine)
            
            if df.empty:
                raise ValueError("查询结果为空，未导入任何数据")

            table_name = f"dataset_{uuid.uuid4().hex[:8]}"
            duckdb_instance.conn.execute(f"CREATE TABLE {table_name} AS SELECT * FROM df")
            
            row_count = len(df)
            
            dataset = AnalysisDataset(
                name=name,
                source_type="database",
                table_name=table_name,
                row_count=row_count,
                config={
                    "connection_url": connection_url, 
                    "query": query
                }
            )
            db.add(dataset)
            await db.commit()
            await db.refresh(dataset)
            return dataset
        except Exception as e:
            logger.error(f"数据库读取失败: {e}")
            raise ValueError(f"外部数据库读取失败: {str(e)}")

    @staticmethod
    async def list_datasets(db: AsyncSession):
        """列出所有数据集"""
        result = await db.execute(select(AnalysisDataset).order_by(AnalysisDataset.created_at.desc()))
        return result.scalars().all()

    @staticmethod
    async def delete_dataset(db: AsyncSession, dataset_id: int):
        """删除数据集（同时从 DuckDB 中删除物理表）"""
        result = await db.execute(select(AnalysisDataset).where(AnalysisDataset.id == dataset_id))
        dataset = result.scalar_one_or_none()
        if not dataset:
            return False
            
        try:
            duckdb_instance.query(f"DROP TABLE IF EXISTS {dataset.table_name}")
        except Exception as e:
            logger.warning(f"从 DuckDB 删除表失败: {e}")

        await db.delete(dataset)
        await db.commit()
        return True
