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
    
    def backup_full(self, backup_id: str) -> Tuple[bool, Optional[str], Optional[int]]:
        """
        全量备份：将数据库(MySQL)、分析数据库(DuckDB)和上传文件统一打包
        
        Args:
            backup_id: 备份ID
        
        Returns:
            (是否成功, 备份文件路径, 文件大小)
        """
        try:
            import tempfile
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            full_filename = f"full_bundle_{backup_id}_{timestamp}.tar.gz"
            full_path = self.backup_dir / "files" / full_filename # 存放在 files 目录下或根目录
            
            with tempfile.TemporaryDirectory() as tmp_dir:
                tmp_path = Path(tmp_dir)
                
                # 1. 导出 MySQL 数据库
                mysql_success, mysql_path, mysql_size = self._backup_database_python(f"{backup_id}_tmp")
                if not mysql_success:
                    return False, "MySQL 备份失败", None
                
                mysql_full_path = Path(mysql_path)
                if not mysql_full_path.is_absolute():
                    from pathlib import Path as P
                    project_root = P(__file__).parent.parent.parent.resolve()
                    mysql_full_path = project_root / mysql_path
                
                # 2. 准备分析数据库副本 (DuckDB)
                analysis_db_path = Path(settings.upload_dir).resolve() / "modules" / "analysis" / "analysis.db"
                tmp_analysis_path = tmp_path / "analysis.db"
                has_analysis = False
                
                if analysis_db_path.exists():
                    try:
                        from modules.analysis.analysis_duckdb_service import duckdb_instance
                        with duckdb_instance._lock:
                            if duckdb_instance._conn:
                                duckdb_instance.conn.execute("CHECKPOINT")
                                duckdb_instance.close()
                                logger.info("全量备份：已释放 analysis.db 锁定")
                            shutil.copy2(analysis_db_path, tmp_analysis_path)
                            has_analysis = True
                    except Exception as e:
                        logger.warning(f"全量备份：获取 analysis.db 副本失败: {e}")

                # 3. 开始统一打包
                upload_dir = Path(settings.upload_dir).resolve()
                rel_backup_dir = None
                try:
                    rel_backup_dir = self.storage.get_system_dir("backups").relative_to(upload_dir).as_posix()
                except ValueError: pass
                
                EXCLUDE_DIR_NAMES = {"ai_models", "map_tiles", "temp", "backups", "transfer_temp", "logs"}
                INCLUDE_DIR_NAMES = {"uploads", "outputs"}

                added_count = 0
                with tarfile.open(full_path, "w:gz") as tar:
                    # A. 添加 MySQL SQL 文件
                    if mysql_full_path.exists():
                        tar.add(mysql_full_path, arcname=f"database/{mysql_full_path.name}")
                        mysql_full_path.unlink() # 打包后删除临时 SQL
                    
                    # B. 添加 Analysis 数据库
                    if has_analysis and tmp_analysis_path.exists():
                        tar.add(tmp_analysis_path, arcname="database/analysis.db")
                    
                    # C. 添加上传文件
                    for item in upload_dir.rglob("*"):
                        if not item.is_file(): continue
                        
                        # 排除逻辑 (复用 backup_files 逻辑)
                        try:
                            rel = item.relative_to(upload_dir)
                            posix_rel = rel.as_posix()
                            if rel_backup_dir and posix_rel.startswith(rel_backup_dir): continue
                            
                            is_allowed = False
                            if rel.parts[0] == "public": is_allowed = True
                            else:
                                for part in rel.parts:
                                    if part in EXCLUDE_DIR_NAMES:
                                        is_allowed = False
                                        break
                                    if part in INCLUDE_DIR_NAMES: is_allowed = True
                            
                            # analysis.db 本身已经在 database 目录下处理过了，这里为了清晰可以排除它
                            if item.name == "analysis.db": continue
                            
                            if is_allowed:
                                try:
                                    with open(item, "rb") as f: f.read(1) # 测试读取锁
                                    arcname = f"storage/{posix_rel}"
                                    tar.add(item, arcname=arcname, recursive=False)
                                    added_count += 1
                                except: pass
                        except ValueError: continue

            file_size = full_path.stat().st_size
            logger.info(f"全量打包备份成功: {full_filename}, 大小: {file_size} 字节, 包含数据文件: {added_count}")
            
            try:
                from pathlib import Path as P
                project_root = P(__file__).parent.parent.parent.resolve()
                return True, str(full_path.relative_to(project_root)), file_size
            except:
                return True, str(full_path), file_size

        except Exception as e:
            logger.error(f"全量打包备份失败: {e}", exc_info=True)
            return False, str(e), None

    def encrypt_file(self, file_path: Path, password: str) -> Tuple[bool, Optional[str]]:
        """
        使用 AES 加密文件
        
        Args:
            file_path: 要加密的文件路径
            password: 加密密码
        
        Returns:
            (是否成功, 加密后的文件路径或错误信息)
        """
        try:
            from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
            from cryptography.hazmat.primitives import padding
            from cryptography.hazmat.backends import default_backend
            import hashlib
            import secrets
            
            # 从密码生成密钥（PBKDF2 安全派生，防 GPU 暴力破解）
            key = hashlib.pbkdf2_hmac('sha256', password.encode(), b'jeje_backup_salt_v1', iterations=480000)
            
            # 生成随机 IV
            iv = secrets.token_bytes(16)
            
            # 读取原文件
            with open(file_path, 'rb') as f:
                plaintext = f.read()
            
            # 填充数据
            padder = padding.PKCS7(128).padder()
            padded_data = padder.update(plaintext) + padder.finalize()
            
            # 加密
            cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
            encryptor = cipher.encryptor()
            ciphertext = encryptor.update(padded_data) + encryptor.finalize()
            
            # 写入加密文件（格式：IV + 密文）
            encrypted_path = file_path.with_suffix(file_path.suffix + '.enc')
            with open(encrypted_path, 'wb') as f:
                f.write(iv + ciphertext)
            
            # 删除原文件
            file_path.unlink()
            
            logger.info(f"文件加密成功: {file_path} -> {encrypted_path}")
            return True, str(encrypted_path)
            
        except ImportError:
            logger.error("cryptography 库未安装，无法进行加密")
            return False, "cryptography 库未安装，请运行: pip install cryptography"
        except Exception as e:
            logger.error(f"文件加密失败: {e}", exc_info=True)
            return False, str(e)
    
    def decrypt_file(self, encrypted_path: Path, password: str) -> Tuple[bool, Optional[str]]:
        """
        解密 AES 加密的文件
        
        Args:
            encrypted_path: 加密文件路径
            password: 解密密码
        
        Returns:
            (是否成功, 解密后的文件路径或错误信息)
        """
        try:
            from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
            from cryptography.hazmat.primitives import padding
            from cryptography.hazmat.backends import default_backend
            import hashlib
            
            # 从密码生成密钥（PBKDF2 安全派生，与 encrypt_file 保持一致）
            key = hashlib.pbkdf2_hmac('sha256', password.encode(), b'jeje_backup_salt_v1', iterations=480000)
            
            # 读取加密文件
            with open(encrypted_path, 'rb') as f:
                data = f.read()
            
            # 提取 IV 和密文
            iv = data[:16]
            ciphertext = data[16:]
            
            # 解密
            cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
            decryptor = cipher.decryptor()
            padded_data = decryptor.update(ciphertext) + decryptor.finalize()
            
            # 移除填充
            unpadder = padding.PKCS7(128).unpadder()
            plaintext = unpadder.update(padded_data) + unpadder.finalize()
            
            # 写入解密文件
            decrypted_path = encrypted_path.with_suffix('')  # 移除 .enc 后缀
            with open(decrypted_path, 'wb') as f:
                f.write(plaintext)
            
            logger.info(f"文件解密成功: {encrypted_path} -> {decrypted_path}")
            return True, str(decrypted_path)
            
        except ImportError:
            return False, "cryptography 库未安装，请运行: pip install cryptography"
        except Exception as e:
            logger.error(f"文件解密失败: {e}", exc_info=True)
            # 密码错误通常表现为 padding 错误
            if "padding" in str(e).lower():
                return False, "解密失败：密码错误"
            return False, str(e)
    
    def backup_database(self, backup_id: str, include_analysis: bool = False) -> Tuple[bool, Optional[str], Optional[int]]:
        """
        备份数据库
        
        Args:
            backup_id: 备份ID
            include_analysis: 是否包含分析数据库 (DuckDB)
        
        Returns:
            (是否成功, 备份文件路径, 文件大小)
        """
        # 1. 备份主数据库 (MySQL)
        mysql_success, mysql_path, mysql_size = self._backup_database_python(backup_id)
        if not mysql_success:
            return False, None, None
            
        # 2. 如果不包含分析数据库，直接返回 MySQL 备份结果
        if not include_analysis:
            return True, mysql_path, mysql_size
            
        # 3. 检查分析数据库 (DuckDB)
        analysis_db_path = Path(settings.upload_dir).resolve() / "modules" / "analysis" / "analysis.db"
        
        if not analysis_db_path.exists():
            # 即使要求包含但文件不存在，也只返回 MySQL 结果
            return mysql_success, mysql_path, mysql_size
            
        # 4. 如果存在且要求包含，则合并打包
        try:
            import tempfile
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            combined_filename = f"db_bundle_{backup_id}_{timestamp}.tar.gz"
            combined_path = self.backup_dir / "db" / combined_filename
            
            # 准备临时目录用于存放分析数据库副本，避免长时间锁定
            with tempfile.TemporaryDirectory() as tmp_dir:
                tmp_analysis_path = Path(tmp_dir) / "analysis.db"
                
                # 对 analysis.db 执行 CHECKPOINT 并关闭连接以释放 Windows 文件锁
                try:
                    from modules.analysis.analysis_duckdb_service import duckdb_instance
                    with duckdb_instance._lock:
                        if duckdb_instance._conn:
                            duckdb_instance.conn.execute("CHECKPOINT")
                            duckdb_instance.close()
                            logger.info("已对 analysis.db 执行 CHECKPOINT 并关闭连接以进行备份")
                        
                        # 在锁保护下快速复制文件到临时位置
                        if analysis_db_path.exists():
                            shutil.copy2(analysis_db_path, tmp_analysis_path)
                except Exception as e:
                    logger.warning(f"分析数据库预处理失败: {e}")
                    # 如果复制失败且文件仍存在，尝试直接打包（可能仍会失败，但作为最后尝试）
                    if not tmp_analysis_path.exists() and analysis_db_path.exists():
                        tmp_analysis_path = analysis_db_path

                with tarfile.open(combined_path, "w:gz") as tar:
                    # 获取 mysql_path 的绝对路径
                    mysql_full_path = Path(mysql_path)
                    if not mysql_full_path.is_absolute():
                        from pathlib import Path as P
                        project_root = P(__file__).parent.parent.parent.resolve()
                        mysql_full_path = project_root / mysql_path
                    
                    # 添加 MySQL 备份 (SQL 文件)
                    if mysql_full_path.exists():
                        tar.add(mysql_full_path, arcname=mysql_full_path.name)
                    
                    # 添加 Analysis 数据库 (副本文件)
                    if tmp_analysis_path.exists():
                        tar.add(tmp_analysis_path, arcname="analysis.db")
                
            # 删除临时生成的 MySQL SQL 文件（已包含在压缩包中）
            if mysql_full_path.exists():
                mysql_full_path.unlink()
                
            combined_size = combined_path.stat().st_size
            
            # 返回相对于项目根目录的路径
            try:
                from pathlib import Path as P
                project_root = P(__file__).parent.parent.parent.resolve()
                rel_path = combined_path.relative_to(project_root)
                return True, str(rel_path), combined_size
            except ValueError:
                return True, str(combined_path), combined_size
                
        except Exception as e:
            logger.error(f"合并数据库备份失败: {e}", exc_info=True)
            # 降级处理：如果打包失败，至少返回 MySQL 的备份路径
            return True, mysql_path, mysql_size

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
                        # 安全验证：确保表名只包含合法字符
                        import re as _re
                        if not _re.match(r'^[a-zA-Z0-9_]+$', table):
                            logger.warning(f"跳过非法表名: {table}")
                            continue
                        
                        f.write(f"-- ----------------------------\n")
                        f.write(f"-- 表结构: {table}\n")
                        f.write(f"-- ----------------------------\n")
                        
                        # 获取表结构
                        cursor.execute(f"SHOW CREATE TABLE `{table}`")
                        create_table = cursor.fetchone()
                        if create_table:
                            f.write(f"DROP TABLE IF EXISTS `{table}`;\n")
                            f.write(f"{create_table['Create Table']};\n\n")
                        
                        # 获取表数据（分批读取，防止大表 OOM）
                        # 先获取总行数用于注释
                        cursor.execute(f"SELECT COUNT(*) AS cnt FROM `{table}`")
                        total_rows = cursor.fetchone()['cnt']
                        
                        if total_rows > 0:
                            f.write(f"-- ----------------------------\n")
                            f.write(f"-- 表数据: {table} ({total_rows} 条记录)\n")
                            f.write(f"-- ----------------------------\n")
                            
                            # 分批查询，每批 5000 行，避免大表一次性载入内存
                            batch_size = 5000
                            columns = None
                            columns_str = None
                            offset = 0
                            
                            while True:
                                cursor.execute(f"SELECT * FROM `{table}` LIMIT {batch_size} OFFSET {offset}")
                                batch = cursor.fetchall()
                                if not batch:
                                    break
                                
                                # 首批获取列名
                                if columns is None:
                                    columns = list(batch[0].keys())
                                    columns_str = ', '.join([f"`{col}`" for col in columns])
                                
                                for row in batch:
                                    values = []
                                    for col in columns:
                                        value = row[col]
                                        if value is None:
                                            values.append('NULL')
                                        elif isinstance(value, bool):
                                            values.append('1' if value else '0')
                                        elif isinstance(value, (int, float)):
                                            values.append(str(value))
                                        else:
                                            # 转义字符串（增强版：处理更多特殊字符）
                                            escaped = str(value).replace('\\', '\\\\').replace("'", "\\'").replace('"', '\\"').replace('\n', '\\n').replace('\r', '\\r').replace('\x00', '').replace('\x1a', '\\Z')
                                            values.append(f"'{escaped}'")
                                    
                                    values_str = ', '.join(values)
                                    f.write(f"INSERT INTO `{table}` ({columns_str}) VALUES ({values_str});\n")
                                
                                offset += batch_size
                                # 如果本批不满，说明已读完
                                if len(batch) < batch_size:
                                    break
                            
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

            # 配置过滤规则
            # 1. 绝对排除路径（相对于 upload_dir）
            try:
                rel_backup_dir = self.storage.get_system_dir("backups").relative_to(upload_dir).as_posix()
            except ValueError:
                rel_backup_dir = None
                
            EXCLUDE_DIR_NAMES = {"ai_models", "map_tiles", "temp", "backups", "transfer_temp", "logs"}
            INCLUDE_DIR_NAMES = {"uploads", "outputs"}
            SPECIAL_FILES = set()  # analysis.db 已移至数据库备份分类
            
            def is_item_allowed(item_path: Path):
                try:
                    rel = item_path.relative_to(upload_dir)
                except ValueError:
                    return False
                
                parts = rel.parts
                posix_rel = rel.as_posix()
                
                # 排除备份目录本身
                if rel_backup_dir and posix_rel.startswith(rel_backup_dir):
                    return False
                
                # 文件夹名称排除（针对模型、地图等大文件或临时文件）
                for part in parts:
                    if part in EXCLUDE_DIR_NAMES:
                        return False
                
                # 特殊允许文件
                if item_path.name in SPECIAL_FILES:
                    return True
                
                # 允许 public 目录下的内容（头像、公共附件等）
                if parts[0] == "public":
                    return True
                
                # 其他目录（如 modules）仅允许业务数据目录 uploads 和 outputs
                for part in parts:
                    if part in INCLUDE_DIR_NAMES:
                        return True
                        
                return False

            # 创建压缩包
            skipped_count = 0
            added_count = 0
            

            with tarfile.open(backup_path, "w:gz") as tar:
                # 遍历 upload_dir 
                for item in upload_dir.rglob("*"):
                    if not item.is_file():
                        continue
                    
                    if not is_item_allowed(item):
                        continue
                        
                    try:
                        # 检查文件是否可读（处理 Windows 锁定）
                        with open(item, "rb") as f:
                            f.read(1)
                            
                        # 计算压缩包内的路径
                        rel_path = item.relative_to(upload_dir)
                        arcname = f"{upload_dir.name}/{rel_path.as_posix()}"
                        tar.add(item, arcname=arcname, recursive=False)
                        added_count += 1
                        
                    except (PermissionError, OSError) as e:
                        # 文件被锁定或无法访问，跳过
                        logger.warning(f"跳过无法访问的文件: {item} (原因: {e})")
                        skipped_count += 1
                    except Exception as e:
                        logger.warning(f"处理文件时出错 {item}: {e}，跳过")
                        skipped_count += 1
            
            # 获取文件大小
            file_size = backup_path.stat().st_size
            
            if skipped_count > 0:
                logger.info(f"文件备份完成：成功 {added_count} 个，跳过 {skipped_count} 个文件")
            else:
                logger.info(f"文件备份完成：成功 {added_count} 个文件")
                
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
        恢复数据库（支持 SQL 文件或包含 analysis.db 的压缩包）
        
        Args:
            backup_path: 备份文件路径
        
        Returns:
            (是否成功, 错误信息)
        """
        try:
            backup_file = Path(backup_path)
            if not backup_file.exists():
                # 尝试相对于项目根目录寻找
                from pathlib import Path as P
                project_root = P(__file__).parent.parent.parent.resolve()
                if (project_root / backup_path).exists():
                    backup_file = project_root / backup_path
                else:
                    return False, f"备份文件不存在: {backup_path}"

            # 1. 检查是否为打包的备份 (.tar.gz)
            if backup_file.name.endswith(".tar.gz"):
                logger.info(f"检测到打包的数据库备份，准备恢复: {backup_file.name}")
                return self._restore_database_bundle(backup_file)
            
            # 2. 原有的单一 SQL 文件恢复逻辑
            return self._restore_sql_database(backup_file)
            
        except Exception as e:
            logger.error(f"数据库恢复异常: {e}", exc_info=True)
            return False, str(e)

    def _restore_database_bundle(self, bundle_path: Path) -> Tuple[bool, Optional[str]]:
        """恢复包含 MySQL 和 DuckDB 的备份包"""
        try:
            import tempfile
            with tarfile.open(bundle_path, "r:gz") as tar:
                # 寻找关键文件
                sql_member = None
                analysis_member = None
                for member in tar.getmembers():
                    if member.name.endswith(".sql"):
                        sql_member = member
                    elif member.name == "analysis.db":
                        analysis_member = member
                
                if not sql_member and not analysis_member:
                    return False, "备份包中没有有效的数据库文件"

                # A. 恢复 Analysis 数据库 (DuckDB)
                if analysis_member:
                    logger.info("正在从备份包恢复分析数据库 (analysis.db)...")
                    analysis_db_dir = Path(settings.upload_dir).resolve() / "modules" / "analysis"
                    analysis_db_path = analysis_db_dir / "analysis.db"
                    
                    # 确保目录存在
                    analysis_db_dir.mkdir(parents=True, exist_ok=True)
                    
                    # 恢复前主动关闭当前连接，避免文件锁定
                    try:
                        from modules.analysis.analysis_duckdb_service import duckdb_instance
                        duckdb_instance.close()
                        logger.info("已关闭当前分析数据库连接以进行恢复")
                    except Exception as e:
                        logger.debug(f"尝试关闭分析数据库连接时出错 (可能未连接): {e}")

                    # 备份旧文件并替换
                    if analysis_db_path.exists():
                        old_path = analysis_db_path.with_suffix(".db.old")
                        if old_path.exists(): old_path.unlink()
                        analysis_db_path.rename(old_path)
                    
                    # 解压到临时目录再移动到目标位置
                    with tempfile.TemporaryDirectory() as tmpdir:
                        tar.extract(analysis_member, path=tmpdir)
                        shutil.move(os.path.join(tmpdir, analysis_member.name), str(analysis_db_path))
                    logger.info("分析数据库恢复成功")

                # B. 恢复 MySQL 数据库
                if sql_member:
                    logger.info(f"正在从备份包恢复 MySQL 数据库: {sql_member.name}")
                    with tempfile.TemporaryDirectory() as tmpdir:
                        tar.extract(sql_member, path=tmpdir)
                        sql_path = Path(tmpdir) / sql_member.name
                        ok, err = self._restore_sql_database(sql_path)
                        if not ok: return False, f"MySQL 恢复失败: {err}"
                    logger.info("MySQL 数据库恢复成功")
            
            return True, None
        except Exception as e:
            logger.error(f"恢复数据库包失败: {e}", exc_info=True)
            return False, f"恢复数据库包异常: {e}"

    def _restore_sql_database(self, backup_file: Path) -> Tuple[bool, Optional[str]]:
        """执行单一 SQL 文件的恢复逻辑 (原 restore_database 的主体)"""
        try:
            import pymysql
            
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
                
                logger.info(f"SQL 数据库恢复完成，执行了 {executed_count} 条 SQL 语句")
                return True, None
                
            finally:
                connection.close()
                
        except ImportError:
            return False, "pymysql 未安装"
        except Exception as e:
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
            
            # 解压备份文件（安全模式：过滤恶意路径）
            with tarfile.open(backup_file, "r:gz") as tar:
                # 安全过滤：防止路径穿越攻击（CVE-2007-4559）和 symlink 跳出
                def is_safe_member(member: tarfile.TarInfo, target_dir: Path) -> bool:
                    """检查 tar 成员是否安全（无路径穿越、无 symlink 跳出）"""
                    # 拒绝符号链接和硬链接（防止 symlink 指向目标目录外的文件）
                    if member.issym() or member.islnk():
                        logger.warning(f"跳过 tar 中的链接文件: {member.name}")
                        return False
                    # 拒绝设备文件等特殊类型
                    if not (member.isfile() or member.isdir()):
                        logger.warning(f"跳过 tar 中的特殊文件类型: {member.name}")
                        return False
                    # 计算解压后的绝对路径
                    member_path = (target_dir / member.name).resolve()
                    # 使用 relative_to 严格判断路径包含关系
                    try:
                        member_path.relative_to(target_dir.resolve())
                        return True
                    except ValueError:
                        return False
                
                # 获取安全的成员列表
                safe_members = []
                for member in tar.getmembers():
                    if is_safe_member(member, upload_dir.parent):
                        safe_members.append(member)
                    else:
                        logger.warning(f"跳过不安全的 tar 成员（可能的路径穿越）: {member.name}")
                
                if not safe_members:
                    return False, "备份文件中没有有效内容"
                
                # 先备份现有文件（如果存在）
                if upload_dir.exists():
                    old_backup = upload_dir.parent / f"{upload_dir.name}.old"
                    if old_backup.exists():
                        shutil.rmtree(old_backup)
                    shutil.move(str(upload_dir), str(old_backup))
                
                # 只解压安全的成员
                tar.extractall(upload_dir.parent, members=safe_members)
            
            logger.info(f"文件恢复成功: {backup_path}")
            return True, None
            
        except Exception as e:
            logger.error(f"文件恢复异常: {e}", exc_info=True)
            return False, str(e)
    
    def delete_backup(self, backup_path: str) -> bool:
        """
        删除备份文件（含路径安全校验）
        
        Args:
            backup_path: 备份文件路径
        
        Returns:
            是否删除成功
        """
        try:
            backup_file = Path(backup_path).resolve()
            
            # 路径安全校验：必须在备份目录内
            backup_base = self.backup_dir.resolve() if hasattr(self, 'backup_dir') else None
            if backup_base:
                try:
                    backup_file.relative_to(backup_base)
                except ValueError:
                    logger.warning(f"备份删除路径遍历尝试被阻止: {backup_path}")
                    return False
            
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





