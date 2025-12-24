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
    async def import_from_file(db: AsyncSession, name: str, file_id: int, options: dict = None, source: str = "upload"):
        """从上传的文件导入数据到 DuckDB
        
        Args:
            source: 文件来源，'upload'=新上传(sys_files)，'filemanager'=文件管理(fm_files)
        """
        storage_path = None
        original_filename = None
        mime_type = None
        
        if source == "filemanager":
            # 从 fm_files 表获取（文件管理模块）
            from modules.filemanager.filemanager_models import VirtualFile
            result = await db.execute(select(VirtualFile).where(VirtualFile.id == file_id))
            virtual_file = result.scalar_one_or_none()
            if not virtual_file:
                raise ValueError(f"文件管理中未找到 ID={file_id} 的文件")
            storage_path = virtual_file.storage_path
            original_filename = virtual_file.name
            mime_type = virtual_file.mime_type
        else:
            # 默认从 sys_files 表获取（新上传的文件）
            result = await db.execute(select(FileRecord).where(FileRecord.id == file_id))
            file_record = result.scalar_one_or_none()
            if not file_record:
                raise ValueError(f"存储记录中未找到 ID={file_id} 的文件")
            storage_path = file_record.storage_path
            original_filename = file_record.filename
            mime_type = file_record.mime_type
            
        # 2. 获取实际文件路径
        storage = get_storage_manager()
        file_path = storage.get_file_path(storage_path)
        if not file_path or not os.path.exists(file_path):
            raise ValueError("物理文件不存在")
            
        # 3. 生成表名 (DuckDB 内部表名)
        table_name = f"dataset_{uuid.uuid4().hex[:8]}"
        
        # 4. 使用 DuckDB 读取文件
        ext = os.path.splitext(original_filename)[1].lower()
        try:
            if ext == '.csv':
                # DuckDB 读取 CSV，使用 sample_size=-1 确保扫描全量以正确推断类型，保留原始样式
                duckdb_instance.query(f"CREATE TABLE {table_name} AS SELECT * FROM read_csv_auto(?, sample_size=-1)", [str(file_path)])
            elif ext in ['.xlsx', '.xls']:
                # 根据格式选择引擎：.xlsx 用 openpyxl，.xls 用 xlrd
                engine = 'openpyxl' if ext == '.xlsx' else 'xlrd'
                df = pd.read_excel(file_path, engine=engine)
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
                    "original_filename": original_filename,
                    "mime_type": mime_type
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
