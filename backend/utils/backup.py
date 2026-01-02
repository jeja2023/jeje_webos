"""
数据备份工具
支持数据库备份和文件存储备份
"""

import os
import shutil
import tarfile
import logging
from pathlib import Path
from datetime import datetime
from typing import Optional, Tuple

from core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class BackupManager:
    """备份管理器"""
    
    def __init__(self):
        # 使用统一的 StorageManager 获取系统备份目录
        from utils.storage import get_storage_manager
        self.storage = get_storage_manager()
        self.backup_dir = self.storage.get_system_dir("backups")
        
        # 分类子目录：数据库和文件
        (self.backup_dir / "db").mkdir(parents=True, exist_ok=True)
        (self.backup_dir / "files").mkdir(parents=True, exist_ok=True)
    
    def backup_database(self, backup_id: str) -> Tuple[bool, Optional[str], Optional[int]]:
        """
        备份数据库（使用纯 Python 方案，基于 pymysql）
        
        Args:
            backup_id: 备份ID（用于文件名）
        
        Returns:
            (是否成功, 备份文件路径, 文件大小)
        """
        return self._backup_database_python(backup_id)
    
    def _backup_database_python(self, backup_id: str) -> Tuple[bool, Optional[str], Optional[int]]:
        """
        使用纯 Python (pymysql) 进行数据库备份
        
        Args:
            backup_id: 备份ID（用于文件名）
        
        Returns:
            (是否成功, 备份文件路径, 文件大小)
        """
        try:
            import pymysql
            
            # 生成备份文件名
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_filename = f"db_{backup_id}_{timestamp}.sql"
            backup_path = self.backup_dir / "db" / backup_filename
            
            # 连接数据库
            connection = pymysql.connect(
                host=settings.db_host,
                port=settings.db_port,
                user=settings.db_user,
                password=settings.db_password,
                database=settings.db_name,
                charset='utf8mb4',
                cursorclass=pymysql.cursors.DictCursor
            )
            
            try:
                with open(backup_path, 'w', encoding='utf-8') as f:
                    # 写入文件头
                    f.write(f"-- JeJe WebOS 数据库备份\n")
                    f.write(f"-- 备份时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
                    f.write(f"-- 数据库: {settings.db_name}\n")
                    f.write(f"-- 主机: {settings.db_host}:{settings.db_port}\n")
                    f.write(f"-- 用户: {settings.db_user}\n")
                    f.write(f"SET NAMES utf8mb4;\n")
                    f.write(f"SET FOREIGN_KEY_CHECKS=0;\n\n")
                    
                    cursor = connection.cursor()
                    
                    cursor.execute("SHOW TABLES")
                    tables = [list(row.values())[0] for row in cursor.fetchall()]
                    for table in tables:
                        f.write(f"-- ----------------------------\n")
                        f.write(f"-- 表结构: {table}\n")
                        f.write(f"-- ----------------------------\n")
                        
                        # 获取表结构
                        cursor.execute(f"SHOW CREATE TABLE `{table}`")
                        create_table = cursor.fetchone()
                        if create_table:
                            f.write(f"DROP TABLE IF EXISTS `{table}`;\n")
                            f.write(f"{create_table['Create Table']};\n\n")
                        
                        # 获取表数据
                        cursor.execute(f"SELECT * FROM `{table}`")
                        rows = cursor.fetchall()
                        
                        if rows:
                            f.write(f"-- ----------------------------\n")
                            f.write(f"-- 表数据: {table} ({len(rows)} 条记录)\n")
                            f.write(f"-- ----------------------------\n")
                            
                            # 获取列名
                            columns = list(rows[0].keys())
                            columns_str = ', '.join([f"`{col}`" for col in columns])
                            
                            # 写入数据
                            for row in rows:
                                values = []
                                for col in columns:
                                    value = row[col]
                                    if value is None:
                                        values.append('NULL')
                                    elif isinstance(value, (int, float)):
                                        values.append(str(value))
                                    elif isinstance(value, bool):
                                        values.append('1' if value else '0')
                                    else:
                                        # 转义字符串
                                        escaped = str(value).replace('\\', '\\\\').replace("'", "\\'").replace('\n', '\\n').replace('\r', '\\r')
                                        values.append(f"'{escaped}'")
                                
                                values_str = ', '.join(values)
                                f.write(f"INSERT INTO `{table}` ({columns_str}) VALUES ({values_str});\n")
                            
                            f.write("\n")
                    
                    f.write(f"-- ----------------------------\n")
                    f.write(f"-- 存储过程和函数\n")
                    f.write(f"-- ----------------------------\n")
                    
                    try:
                        cursor.execute("SHOW PROCEDURE STATUS WHERE Db = %s", (settings.db_name,))
                        procedures = cursor.fetchall()
                        for proc in procedures:
                            try:
                                cursor.execute(f"SHOW CREATE PROCEDURE `{proc['Name']}`")
                                create_proc = cursor.fetchone()
                                if create_proc:
                                    f.write(f"DELIMITER ;;\n")
                                    f.write(f"{create_proc['Create Procedure']};;\n")
                                    f.write(f"DELIMITER ;\n\n")
                            except Exception as e:
                                logger.warning(f"备份存储过程 {proc['Name']} 失败: {e}")
                                continue
                    except Exception as e:
                        logger.warning(f"获取存储过程列表失败: {e}")
                    
                    try:
                        cursor.execute("SHOW FUNCTION STATUS WHERE Db = %s", (settings.db_name,))
                        functions = cursor.fetchall()
                        for func in functions:
                            try:
                                cursor.execute(f"SHOW CREATE FUNCTION `{func['Name']}`")
                                create_func = cursor.fetchone()
                                if create_func:
                                    f.write(f"DELIMITER ;;\n")
                                    f.write(f"{create_func['Create Function']};;\n")
                                    f.write(f"DELIMITER ;\n\n")
                            except Exception as e:
                                logger.warning(f"备份函数 {func['Name']} 失败: {e}")
                                continue
                    except Exception as e:
                        logger.warning(f"获取函数列表失败: {e}")
                    
                    f.write(f"-- ----------------------------\n")
                    f.write(f"-- 触发器\n")
                    f.write(f"-- ----------------------------\n")
                    
                    try:
                        cursor.execute("SHOW TRIGGERS")
                        triggers = cursor.fetchall()
                        for trigger in triggers:
                            try:
                                cursor.execute(f"SHOW CREATE TRIGGER `{trigger['Trigger']}`")
                                create_trigger = cursor.fetchone()
                                if create_trigger:
                                    f.write(f"{create_trigger['SQL Original Statement']};\n\n")
                            except Exception as e:
                                logger.warning(f"备份触发器 {trigger['Trigger']} 失败: {e}")
                                continue
                    except Exception as e:
                        logger.warning(f"获取触发器列表失败: {e}")
                    
                    f.write(f"SET FOREIGN_KEY_CHECKS=1;\n")
                    
                    cursor.close()
                
                # 获取文件大小
                file_size = backup_path.stat().st_size
                
                logger.info(f"数据库备份成功: {backup_path}, 大小: {file_size} 字节")
                try:
                    from pathlib import Path as P
                    project_root = P(__file__).parent.parent.parent.resolve()
                    relative_path = backup_path.relative_to(project_root)
                    return True, str(relative_path), file_size
                except ValueError:
                    return True, str(backup_path), file_size
                    
            finally:
                connection.close()
                
        except ImportError:
            error_msg = (
                "pymysql 未安装，无法进行数据库备份。\n"
                "解决方案：\n"
                "1. 安装 pymysql: pip install pymysql\n"
                "2. 或者运行: pip install -r requirements.txt"
            )
            logger.error(f"数据库备份失败: {error_msg}")
            return False, None, None
        except Exception as e:
            logger.error(f"数据库备份失败: {e}", exc_info=True)
            return False, None, None
    
    def backup_files(self, backup_id: str) -> Tuple[bool, Optional[str], Optional[int]]:
        """
        备份文件存储
        
        Args:
            backup_id: 备份ID（用于文件名）
        
        Returns:
            (是否成功, 备份文件路径, 文件大小)
        """
        try:
            # 生成备份文件名
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_filename = f"files_{backup_id}_{timestamp}.tar.gz"
            backup_path = self.backup_dir / "files" / backup_filename
            
            # 获取上传目录（绝对路径）
            upload_dir = Path(settings.upload_dir).resolve()
            
            # 如果上传目录不存在，创建一个空目录
            if not upload_dir.exists():
                logger.info(f"上传目录不存在，创建空目录: {upload_dir}")
                upload_dir.mkdir(parents=True, exist_ok=True)
            
            # 创建压缩包
            # 手动遍历文件，跳过无法访问的文件（如正在使用的数据库文件）
            def add_with_filter(tar, base_path, arcname_base):
                """递归添加文件，跳过无法访问的"""
                skipped_count = 0
                added_count = 0
                
                try:
                    for item in base_path.rglob("*"):
                        try:
                            if item.is_file():
                                try:
                                    with open(item, "rb") as f:
                                        f.read(1)
                                except (PermissionError, OSError) as e:
                                    # 文件被锁定或无法访问，跳过
                                    logger.warning(f"跳过无法访问的文件: {item} (原因: {e})")
                                    skipped_count += 1
                                    continue
                                
                                # 计算相对路径
                                try:
                                    rel_path = item.relative_to(base_path)
                                    # 使用正斜杠作为路径分隔符（tar格式要求）
                                    arcname = f"{arcname_base}/{rel_path.as_posix()}" if arcname_base else rel_path.as_posix()
                                    tar.add(item, arcname=arcname, recursive=False)
                                    added_count += 1
                                except ValueError:
                                    # 如果无法计算相对路径，跳过
                                    logger.warning(f"无法计算相对路径: {item}")
                                    skipped_count += 1
                                    continue
                            elif item.is_dir():
                                # 目录会自动创建，不需要特殊处理
                                pass
                        except Exception as e:
                            logger.warning(f"处理文件时出错 {item}: {e}，跳过")
                            skipped_count += 1
                            continue
                    
                    if skipped_count > 0:
                        logger.info(f"文件备份完成：成功 {added_count} 个，跳过 {skipped_count} 个无法访问的文件")
                    else:
                        logger.info(f"文件备份完成：成功 {added_count} 个文件")
                except Exception as e:
                    logger.error(f"遍历文件时出错: {e}", exc_info=True)
                    raise
            
            with tarfile.open(backup_path, "w:gz") as tar:
                add_with_filter(tar, upload_dir, upload_dir.name)
            
            # 获取文件大小
            file_size = backup_path.stat().st_size
            
            logger.info(f"文件备份成功: {backup_path}, 大小: {file_size} 字节")
            try:
                from pathlib import Path as P
                project_root = P(__file__).parent.parent.parent.resolve()
                relative_path = backup_path.relative_to(project_root)
                return True, str(relative_path), file_size
            except ValueError:
                return True, str(backup_path), file_size
            
        except Exception as e:
            logger.error(f"文件备份异常: {e}", exc_info=True)
            return False, None, None
    
    def restore_database(self, backup_path: str) -> Tuple[bool, Optional[str]]:
        """
        恢复数据库（使用纯 Python 方案，基于 pymysql）
        
        Args:
            backup_path: 备份文件路径
        
        Returns:
            (是否成功, 错误信息)
        """
        try:
            import pymysql
            import re
            
            backup_file = Path(backup_path)
            if not backup_file.exists():
                return False, "备份文件不存在"
            
            # 连接数据库
            connection = pymysql.connect(
                host=settings.db_host,
                port=settings.db_port,
                user=settings.db_user,
                password=settings.db_password,
                database=settings.db_name,
                charset='utf8mb4',
                cursorclass=pymysql.cursors.DictCursor
            )
            
            try:
                # 读取 SQL 文件
                with open(backup_file, 'r', encoding='utf-8') as f:
                    sql_content = f.read()
                
                lines = []
                for line in sql_content.split('\n'):
                    line = line.strip()
                    if line and not line.startswith('--'):
                        lines.append(line)
                sql_statements = []
                current_delimiter = ';'
                current_statement = []
                
                for line in lines:
                    if line.upper().startswith('DELIMITER'):
                        if current_statement:
                            sql_statements.append(' '.join(current_statement))
                            current_statement = []
                        parts = line.split()
                        if len(parts) > 1:
                            current_delimiter = parts[1]
                    elif line.endswith(current_delimiter):
                        line = line[:-len(current_delimiter)].strip()
                        if line:
                            current_statement.append(line)
                        if current_statement:
                            sql_statements.append(' '.join(current_statement))
                            current_statement = []
                    else:
                        if line:
                            current_statement.append(line)
                
                if current_statement:
                    sql_statements.append(' '.join(current_statement))
                
                # 执行 SQL 语句
                cursor = connection.cursor()
                executed_count = 0
                
                for sql in sql_statements:
                    sql = sql.strip()
                    if not sql or sql.upper().startswith('SET ') or sql.upper().startswith('USE '):
                        continue
                    
                    try:
                        cursor.execute(sql)
                        executed_count += 1
                    except Exception as e:
                        logger.warning(f"执行 SQL 语句时出错（已跳过）: {sql[:100]}... 错误: {e}")
                        continue
                
                connection.commit()
                cursor.close()
                
                logger.info(f"数据库恢复成功: {backup_path}，执行了 {executed_count} 条 SQL 语句")
                return True, None
                
            finally:
                connection.close()
                
        except ImportError:
            error_msg = (
                "pymysql 未安装，无法进行数据库恢复。\n"
                "解决方案：\n"
                "1. 安装 pymysql: pip install pymysql\n"
                "2. 或者运行: pip install -r requirements.txt"
            )
            logger.error(f"数据库恢复失败: {error_msg}")
            return False, error_msg
        except pymysql.Error as e:
            error_msg = str(e)
            if "Can't connect to MySQL server" in error_msg:
                error_msg = f"无法连接到 MySQL 服务器（请检查主机和端口）: {error_msg}"
            elif "Access denied" in error_msg:
                error_msg = f"数据库访问被拒绝（请检查账号密码）: {error_msg}"
            elif "Unknown database" in error_msg:
                error_msg = f"数据库不存在: {error_msg}"
            logger.error(f"数据库恢复失败: {error_msg}")
            return False, error_msg
        except Exception as e:
            logger.error(f"数据库恢复异常: {e}", exc_info=True)
            return False, str(e)
    
    def restore_files(self, backup_path: str) -> Tuple[bool, Optional[str]]:
        """
        恢复文件存储
        
        Args:
            backup_path: 备份文件路径
        
        Returns:
            (是否成功, 错误信息)
        """
        try:
            backup_file = Path(backup_path)
            if not backup_file.exists():
                return False, "备份文件不存在"
            
            # 获取上传目录（绝对路径）
            upload_dir = Path(settings.upload_dir).resolve()
            
            # 解压备份文件
            with tarfile.open(backup_file, "r:gz") as tar:
                # 先备份现有文件（如果存在）
                if upload_dir.exists():
                    old_backup = upload_dir.parent / f"{upload_dir.name}.old"
                    if old_backup.exists():
                        shutil.rmtree(old_backup)
                    shutil.move(str(upload_dir), str(old_backup))
                
                # 解压
                tar.extractall(upload_dir.parent)
            
            logger.info(f"文件恢复成功: {backup_path}")
            return True, None
            
        except Exception as e:
            logger.error(f"文件恢复异常: {e}", exc_info=True)
            return False, str(e)
    
    def delete_backup(self, backup_path: str) -> bool:
        """
        删除备份文件
        
        Args:
            backup_path: 备份文件路径
        
        Returns:
            是否删除成功
        """
        try:
            backup_file = Path(backup_path)
            if backup_file.exists():
                backup_file.unlink()
                logger.info(f"备份文件已删除: {backup_path}")
                return True
            return False
        except Exception as e:
            logger.error(f"删除备份文件失败: {backup_path}: {e}")
            return False


# 全局备份管理器实例
_backup_manager: Optional[BackupManager] = None


def get_backup_manager() -> BackupManager:
    """获取备份管理器实例"""
    global _backup_manager
    if _backup_manager is None:
        _backup_manager = BackupManager()
    return _backup_manager





