import os
import uuid
import pandas as pd
from typing import List, Dict, Any, Optional
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
    async def preview_file(db: AsyncSession, file_id: int, source: str = "upload") -> Dict[str, Any]:
        """
        预览文件内容（返回前10行数据）
        
        Args:
            db: 数据库会话
            file_id: 文件ID
            source: 文件来源（"upload" 或 "filemanager"）
        
        Returns:
            包含列名、预览数据和文件名的字典
        """
        storage_path = None
        original_filename = None
        
        if source == "filemanager":
            from modules.filemanager.filemanager_models import VirtualFile
            result = await db.execute(select(VirtualFile).where(VirtualFile.id == file_id))
            virtual_file = result.scalar_one_or_none()
            if not virtual_file:
                raise ValueError(f"文件不存在 (ID: {file_id})")
            storage_path = virtual_file.storage_path
            original_filename = virtual_file.name
        elif source == "upload" or source == "" or source is None:
            result = await db.execute(select(FileRecord).where(FileRecord.id == file_id))
            file_record = result.scalar_one_or_none()
            if not file_record:
                raise ValueError(f"文件不存在 (ID: {file_id})")
            storage_path = file_record.storage_path
            original_filename = file_record.filename
        else:
             raise ValueError(f"未知的来源类型: {source}")

        storage = get_storage_manager()
        file_path = storage.get_file_path(storage_path)
        if not file_path or not os.path.exists(file_path):
            raise ValueError("物理文件不存在")

        ext = os.path.splitext(original_filename)[1].lower()
        try:
            if ext == '.csv':
                df = pd.read_csv(file_path, nrows=10)
            elif ext in ['.xlsx', '.xls']:
                engine = 'openpyxl' if ext == '.xlsx' else 'xlrd'
                df = pd.read_excel(file_path, engine=engine, nrows=10)
            else:
                raise ValueError(f"不支持的格式: {ext}")
            
            # 格式化日期时间列
            for col in df.select_dtypes(include=['datetime64', 'datetimetz']).columns:
                df[col] = df[col].astype(str)

            return {
                "columns": df.columns.tolist(),
                "preview": df.where(pd.notnull(df), None).to_dict(orient='records'),
                "filename": original_filename
            }
        except Exception as e:
            raise ValueError(f"预览失败: {str(e)}")

    @staticmethod
    async def import_from_file(
        db: AsyncSession, 
        name: str, 
        file_id: int, 
        options: Optional[Dict[str, Any]] = None, 
        source: str = "upload"
    ) -> AnalysisDataset:
        """
        从上传的文件导入数据到 DuckDB
        
        Args:
            db: 数据库会话
            name: 数据集名称
            file_id: 文件ID
            options: 导入选项
            source: 文件来源，'upload'=新上传(sys_files)，'filemanager'=文件管理(fm_files)
        
        Returns:
            创建的数据集对象
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
        
        # 2.5. 检查文件大小（限制为 500MB）
        file_size = os.path.getsize(file_path)
        max_file_size = 500 * 1024 * 1024  # 500MB
        if file_size > max_file_size:
            file_size_mb = file_size / (1024 * 1024)
            raise ValueError(f"文件过大（{file_size_mb:.2f}MB），超过限制（500MB）。请使用较小的文件或分批导入。")
            
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
            logger.error(f"文件导入失败: {e}", exc_info=True)
            raise ValueError(f"数据导入失败: {str(e)}")

    @staticmethod
    async def import_from_database(
        db: AsyncSession, 
        name: str, 
        connection_url: str, 
        query: str, 
        options: Optional[Dict[str, Any]] = None
    ) -> AnalysisDataset:
        """
        从外部数据库导入数据到 DuckDB
        
        Args:
            db: 数据库会话
            name: 数据集名称
            connection_url: 数据库连接URL
            query: SQL查询语句
            options: 导入选项
        
        Returns:
            创建的数据集对象
        """
        # 使用 SQLAlchemy + Pandas 进行中转（通用性强）
        from sqlalchemy import create_engine
        engine = None
        try:
            engine = create_engine(connection_url, pool_pre_ping=True)
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
            logger.error(f"数据库读取失败: {e}", exc_info=True)
            raise ValueError(f"外部数据库读取失败: {str(e)}")
        finally:
            # 确保连接正确关闭
            if engine:
                try:
                    engine.dispose()
                except Exception as e:
                    logger.warning(f"关闭数据库连接失败: {e}")

    @staticmethod
    async def list_datasets(db: AsyncSession) -> List[AnalysisDataset]:
        """
        列出所有数据集
        
        Args:
            db: 数据库会话
        
        Returns:
            数据集列表
        """
        result = await db.execute(select(AnalysisDataset).order_by(AnalysisDataset.created_at.desc()))
        return result.scalars().all()

    @staticmethod
    async def delete_dataset(db: AsyncSession, dataset_id: int) -> bool:
        """
        删除数据集（同时从 DuckDB 中删除物理表）
        
        Args:
            db: 数据库会话
            dataset_id: 数据集ID
        
        Returns:
            是否删除成功
        """
        result = await db.execute(select(AnalysisDataset).where(AnalysisDataset.id == dataset_id))
        dataset = result.scalar_one_or_none()
        if not dataset:
            return False
            
        try:
            duckdb_instance.query(f"DROP TABLE IF EXISTS {dataset.table_name}")
        except Exception as e:
            logger.warning(f"从 DuckDB 删除表失败: {e}")

        await db.delete(dataset)
        await db.flush()
        await db.commit()
        return True

    @staticmethod
    async def update_dataset(
        db: AsyncSession, 
        dataset_id: int, 
        updates: Dict[str, Any]
    ) -> AnalysisDataset:
        """
        更新数据集信息
        
        Args:
            db: 数据库会话
            dataset_id: 数据集ID
            updates: 更新字段字典
        
        Returns:
            更新后的数据集对象
        """
        result = await db.execute(select(AnalysisDataset).where(AnalysisDataset.id == dataset_id))
        dataset = result.scalar_one_or_none()
        if not dataset:
            raise ValueError("数据集不存在")

        # 更新基本字段
        if 'name' in updates and updates['name'] is not None:
            dataset.name = updates['name']
        
        # 处理 description (存储在 config 中)
        if 'description' in updates and updates['description'] is not None:
            if not dataset.config:
                dataset.config = {}
            # 创建新字典以触发 SQLAlchemy JSON 变更检测
            new_config = dataset.config.copy()
            new_config['description'] = updates['description']
            dataset.config = new_config

        dataset.updated_at = pd.Timestamp.now()
        await db.commit()
        await db.refresh(dataset)
        return dataset
