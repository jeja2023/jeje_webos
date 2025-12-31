"""
数据备份工具
支持数据库备份和文件存储备份
"""

import os
import subprocess
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
        备份数据库
        
        Args:
            backup_id: 备份ID（用于文件名）
        
        Returns:
            (是否成功, 备份文件路径, 文件大小)
        """
        try:
            # 生成备份文件名
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            backup_filename = f"db_{backup_id}_{timestamp}.sql"
            backup_path = self.backup_dir / "db" / backup_filename
            
            # 构建 mysqldump 命令
            mysqldump_cmd = "mysqldump"
            if settings.mysql_bin_path:
                mysqldump_path = Path(settings.mysql_bin_path) / "mysqldump"
                # Windows下添加.exe后缀
                if os.name == 'nt' and not str(mysqldump_path).endswith('.exe'):
                     mysqldump_path = Path(str(mysqldump_path) + ".exe")
                
                if mysqldump_path.exists():
                    mysqldump_cmd = str(mysqldump_path)
                else:
                    logger.warning(f"配置的 mysqldump 路径不存在: {mysqldump_path}，尝试使用系统 PATH")

            cmd = [
                mysqldump_cmd,
                f"--host={settings.db_host}",
                f"--port={settings.db_port}",
                f"--user={settings.db_user}",
                f"--password={settings.db_password}",
                "--single-transaction",
                "--routines",
                "--triggers",
                settings.db_name
            ]
            
            # 执行备份
            with open(backup_path, "wb") as f:
                result = subprocess.run(
                    cmd,
                    stdout=f,
                    stderr=subprocess.PIPE,
                    check=True
                )
            
            # 获取文件大小
            file_size = backup_path.stat().st_size
            
            logger.info(f"数据库备份成功: {backup_path}, 大小: {file_size} 字节")
            # 返回相对于项目根的路径
            try:
                from pathlib import Path as P
                project_root = P(__file__).parent.parent.parent.resolve()
                relative_path = backup_path.relative_to(project_root)
                return True, str(relative_path), file_size
            except ValueError:
                # 如果无法获取相对路径，返回绝对路径
                return True, str(backup_path), file_size
            
        except FileNotFoundError:
            error_msg = "mysqldump 命令未找到，请确保已安装 MySQL 并将其添加到系统 PATH 环境变量中"
            logger.error(f"数据库备份失败: {error_msg}")
            return False, None, None
        except subprocess.CalledProcessError as e:
            error_msg = e.stderr.decode('utf-8', errors='ignore') if e.stderr else str(e)
            
            # 翻译常见错误
            if "Can't connect to MySQL server" in error_msg:
                error_msg = f"无法连接到 MySQL 服务器（请检查主机和端口）: {error_msg}"
            elif "Access denied" in error_msg:
                error_msg = f"数据库访问被拒绝（请检查账号密码）: {error_msg}"
            elif "Unknown database" in error_msg:
                error_msg = f"数据库不存在: {error_msg}"
                
            logger.error(f"数据库备份失败: {error_msg}")
            return False, None, None
        except Exception as e:
            logger.error(f"数据库备份异常: {e}", exc_info=True)
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
            with tarfile.open(backup_path, "w:gz") as tar:
                tar.add(upload_dir, arcname=upload_dir.name)
            
            # 获取文件大小
            file_size = backup_path.stat().st_size
            
            logger.info(f"文件备份成功: {backup_path}, 大小: {file_size} 字节")
            # 返回相对于项目根的路径
            try:
                from pathlib import Path as P
                project_root = P(__file__).parent.parent.parent.resolve()
                relative_path = backup_path.relative_to(project_root)
                return True, str(relative_path), file_size
            except ValueError:
                # 如果无法获取相对路径，返回绝对路径
                return True, str(backup_path), file_size
            
        except Exception as e:
            logger.error(f"文件备份异常: {e}", exc_info=True)
            return False, None, None
    
    def restore_database(self, backup_path: str) -> Tuple[bool, Optional[str]]:
        """
        恢复数据库
        
        Args:
            backup_path: 备份文件路径
        
        Returns:
            (是否成功, 错误信息)
        """
        try:
            backup_file = Path(backup_path)
            if not backup_file.exists():
                return False, "备份文件不存在"
            
            # 构建 mysql 命令
            mysql_cmd = "mysql"
            if settings.mysql_bin_path:
                mysql_path = Path(settings.mysql_bin_path) / "mysql"
                if os.name == 'nt' and not str(mysql_path).endswith('.exe'):
                     mysql_path = Path(str(mysql_path) + ".exe")
                
                if mysql_path.exists():
                    mysql_cmd = str(mysql_path)

            cmd = [
                mysql_cmd,
                f"--host={settings.db_host}",
                f"--port={settings.db_port}",
                f"--user={settings.db_user}",
                f"--password={settings.db_password}",
                settings.db_name
            ]
            
            # 安全地打印命令（隐藏密码）
            safe_cmd = cmd.copy()
            for i, arg in enumerate(safe_cmd):
                if arg.startswith("--password="):
                    safe_cmd[i] = "--password=******"
            logger.info(f"执行数据库恢复命令: {' '.join(safe_cmd)}")

            # 执行恢复
            with open(backup_file, "rb") as f:
                result = subprocess.run(
                    cmd,
                    stdin=f,
                    stderr=subprocess.PIPE,
                    check=True,
                    timeout=60
                )
            
            logger.info(f"数据库恢复成功: {backup_path}")
            return True, None
            
        except subprocess.TimeoutExpired:
            error_msg = "数据库恢复超时（60秒）"
            logger.error(error_msg)
            return False, error_msg
        except FileNotFoundError:
            error_msg = "mysql 命令未找到，请确保已安装 MySQL 并将其添加到系统 PATH 环境变量中"
            logger.error(f"数据库恢复失败: {error_msg}")
            return False, error_msg
        except subprocess.CalledProcessError as e:
            error_msg = e.stderr.decode('utf-8', errors='ignore') if e.stderr else str(e)
            
            # 翻译常见错误
            if "Can't connect to MySQL server" in error_msg:
                error_msg = f"无法连接到 MySQL 服务器（请检查主机和端口）: {error_msg}"
            elif "Access denied" in error_msg:
                error_msg = f"数据库访问被拒绝（请检查账号密码）: {error_msg}"
            elif "Unknown database" in error_msg:
                error_msg = f"数据库不存在: {error_msg}"
            elif "ERROR" in error_msg and "syntax error" in error_msg.lower():
                 error_msg = f"SQL 语法错误（可能是备份文件损坏）: {error_msg}"

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





