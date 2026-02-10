"""
Analysis 模块业务服务层
"""

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
from utils.sql_safety import escape_sql_identifier
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
        # 预览也进行大小限制，避免大文件导致内存压力
        preview_max_size = 200 * 1024 * 1024  # 200MB
        try:
            if os.path.getsize(file_path) > preview_max_size:
                raise ValueError("文件过大，预览失败，请直接导入或使用较小文件")
        except OSError:
            raise ValueError("无法读取文件大小")

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
        safe_tn = escape_sql_identifier(table_name)
        
        # 4. 使用 DuckDB 读取文件
        ext = os.path.splitext(original_filename)[1].lower()
        try:
            if ext == '.csv':
                # DuckDB 读取 CSV，使用 sample_size=-1 确保扫描全量以正确推断类型，保留原始样式
                duckdb_instance.query(f"CREATE TABLE {safe_tn} AS SELECT * FROM read_csv_auto(?, sample_size=-1)", [str(file_path)])
            elif ext in ['.xlsx', '.xls']:
                # 根据格式选择引擎：.xlsx 用 openpyxl，.xls 用 xlrd
                engine = 'openpyxl' if ext == '.xlsx' else 'xlrd'
                df = pd.read_excel(file_path, engine=engine)
                # 手动注册到 DuckDB，解决封装后无法直接读取 df 变量的问题
                duckdb_instance.register("df", df)
                duckdb_instance.query(f"CREATE TABLE {safe_tn} AS SELECT * FROM df")
                duckdb_instance.unregister("df")
            else:
                raise ValueError(f"不支持的文件格式: {ext}")
                
            # 获取实际行数
            count_res = duckdb_instance.fetch_all(f"SELECT count(*) FROM {safe_tn}")
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
    def _validate_connection_url(connection_url: str) -> None:
        """
        验证外部数据库连接 URL 安全性（防止 SSRF）
        
        规则:
        - 仅允许 mysql/postgresql/mssql 协议
        - 禁止 sqlite/file 等本地协议
        - 禁止内网地址（10.x.x.x, 192.168.x.x, 127.x.x.x, localhost）
        """
        import re
        from urllib.parse import urlparse
        
        url_lower = connection_url.lower().strip()
        
        # 白名单：仅允许的数据库协议
        allowed_schemes = ['mysql', 'mysql+pymysql', 'mysql+mysqlconnector',
                           'postgresql', 'postgresql+psycopg2', 'postgresql+asyncpg',
                           'mssql', 'mssql+pymssql', 'mssql+pyodbc']
        
        scheme = url_lower.split('://')[0] if '://' in url_lower else ''
        if scheme not in allowed_schemes:
            raise ValueError(f"不支持的数据库类型: {scheme}。仅支持 MySQL、PostgreSQL、MSSQL")
        
        # 解析主机名
        try:
            parsed = urlparse(connection_url)
            hostname = (parsed.hostname or '').lower()
        except Exception:
            raise ValueError("无效的数据库连接 URL 格式")
        
        # 禁止本地和内网地址
        forbidden_hosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1']
        if hostname in forbidden_hosts:
            raise ValueError("禁止连接本地数据库地址")
        
        # 禁止内网 IP 段 / DNS Rebinding
        import ipaddress
        import socket
        try:
            ip = ipaddress.ip_address(hostname)
            if ip.is_private or ip.is_loopback or ip.is_reserved or ip.is_link_local or ip.is_multicast:
                raise ValueError("禁止连接内网或保留地址")
        except ValueError as ve:
            if "禁止" in str(ve):
                raise
            # 非 IP 格式的主机名，解析 DNS 并检查解析后的所有 IP
            try:
                addr_infos = socket.getaddrinfo(hostname, None)
                resolved_ips = {info[4][0] for info in addr_infos}
                if not resolved_ips:
                    raise ValueError(f"无法解析主机名: {hostname}")
                for resolved_ip in resolved_ips:
                    ip_obj = ipaddress.ip_address(resolved_ip)
                    if ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_reserved or ip_obj.is_link_local or ip_obj.is_multicast:
                        raise ValueError("禁止连接内网或保留地址（DNS 解析后）")
            except socket.gaierror:
                raise ValueError(f"无法解析主机名: {hostname}")
    
    @staticmethod
    def _validate_query_readonly(query: str) -> None:
        """验证外部数据库查询仅为只读 SELECT"""
        import re
        stripped = query.strip().rstrip(';').strip()
        if ';' in stripped:
            raise ValueError("禁止执行多条 SQL 语句")
        if not re.match(r'^\s*(SELECT|WITH)\b', stripped, re.IGNORECASE):
            raise ValueError("仅允许 SELECT 查询语句")
        forbidden = re.compile(r'\b(DROP|DELETE|TRUNCATE|ALTER|INSERT|UPDATE|CREATE|EXEC)\b', re.IGNORECASE)
        if forbidden.search(stripped):
            raise ValueError("查询语句中包含禁止的操作关键字")

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
        # 安全验证：防止 SSRF 和 SQL 注入
        ImportService._validate_connection_url(connection_url)
        ImportService._validate_query_readonly(query)
        
        # 使用 SQLAlchemy + Pandas 进行中转（通用性强）
        from sqlalchemy import create_engine
        engine = None
        try:
            engine = create_engine(
                connection_url, 
                pool_pre_ping=True,
                connect_args={"connect_timeout": 10}  # 连接超时 10 秒
            )
            # 这里的 query 可以是 SQL 语句同步获取数据
            df = pd.read_sql(query, engine)
            
            if df.empty:
                raise ValueError("查询结果为空，未导入任何数据")

            table_name = f"dataset_{uuid.uuid4().hex[:8]}"
            safe_tn = escape_sql_identifier(table_name)
            
            # 手动注册到 DuckDB，解决封装后无法直接读取 df 变量的问题
            duckdb_instance.register("df", df)
            duckdb_instance.query(f"CREATE TABLE {safe_tn} AS SELECT * FROM df")
            duckdb_instance.unregister("df")
            
            row_count = len(df)
            
            dataset = AnalysisDataset(
                name=name,
                source_type="database",
                table_name=table_name,
                row_count=row_count,
                config={
                    "connection_url": "***已脱敏***",  # 不明文存储连接凭据
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
            from utils.sql_safety import is_safe_table_name, escape_sql_identifier
            # 始终使用 escape_sql_identifier 转义，确保安全
            safe_tn = escape_sql_identifier(dataset.table_name)
            duckdb_instance.query(f"DROP TABLE IF EXISTS {safe_tn}")
        except Exception as e:
            logger.warning(f"从 DuckDB 删除表失败: {e}")

        await db.delete(dataset)
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

        from utils.timezone import get_beijing_time
        dataset.updated_at = get_beijing_time()
        await db.commit()
        await db.refresh(dataset)
        return dataset
