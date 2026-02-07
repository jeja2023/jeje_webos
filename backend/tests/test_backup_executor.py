
import pytest
from datetime import datetime
from unittest.mock import MagicMock, patch
from utils.backup_executor import calculate_next_run
from models.backup import BackupRecord, BackupStatus, BackupType
import utils.backup_executor

class TestBackupExecutor:
    
    def test_calculate_next_run(self):
        """测试下次执行时间计算"""
        # 假设当前时间固定
        with patch('utils.backup_executor.get_beijing_time') as mock_now:
            mock_now.return_value = datetime(2023, 1, 1, 10, 0, 0)
            
            # 1. 每日执行
            next_run = calculate_next_run("daily", "12:00")
            assert next_run == datetime(2023, 1, 1, 12, 0, 0)
            
            next_run = calculate_next_run("daily", "09:00")
            assert next_run == datetime(2023, 1, 2, 9, 0, 0)
            
            # 2. 每周执行
            next_run = calculate_next_run("weekly", "10:00", schedule_day=1)
            assert next_run == datetime(2023, 1, 2, 10, 0, 0)
            
            # 3. 每月执行
            next_run = calculate_next_run("monthly", "10:00", schedule_day=2)
            assert next_run == datetime(2023, 1, 2, 10, 0, 0)

    @patch('utils.backup_executor.get_settings')
    @patch('utils.backup_executor.get_backup_manager')
    @patch('utils.backup_executor.sessionmaker')
    @patch('utils.backup_executor.create_engine')
    def test_execute_backup_task_sync_success(self, mock_create_engine, mock_sessionmaker, mock_get_manager, mock_settings):
        """测试备份任务执行成功"""
        from utils.backup_executor import execute_backup_task_sync

        # 1. 设置模拟对象
        mock_settings.return_value.db_url_sync = "sqlite:///:memory:"
        
        mock_db_session = MagicMock()
        mock_sessionmaker.return_value = MagicMock(return_value=mock_db_session)
        
        mock_backup = MagicMock(spec=BackupRecord)
        mock_backup.id = 123
        mock_backup.file_path = None
        mock_backup.status = BackupStatus.PENDING.value
        
        mock_query = mock_db_session.query.return_value
        mock_filter = mock_query.filter.return_value
        mock_filter.first.return_value = mock_backup
        
        mock_manager_instance = MagicMock()
        mock_get_manager.return_value = mock_manager_instance
        # 模拟成功备份
        mock_manager_instance.backup_database.return_value = (True, "/backup/db.sql", 1024)
        mock_manager_instance.backup_files.return_value = (True, "/backup/files.tar.gz", 2048)
        
        # 2. 执行函数
        execute_backup_task_sync(123, BackupType.FULL.value)
        
        # 3. 断言
        mock_manager_instance.backup_database.assert_called()
        assert mock_backup.status == BackupStatus.SUCCESS.value
        assert "/backup/db.sql" in mock_backup.file_path
        
        mock_db_session.commit.assert_called()

    @patch('utils.backup_executor.get_settings')
    @patch('utils.backup_executor.get_backup_manager')
    @patch('utils.backup_executor.sessionmaker')
    @patch('utils.backup_executor.create_engine')
    def test_execute_backup_task_sync_failure(self, mock_create_engine, mock_sessionmaker, mock_get_manager, mock_settings):
        """测试备份任务执行失败"""
        from utils.backup_executor import execute_backup_task_sync
        
        # 1. 设置模拟对象
        mock_settings.return_value.db_url_sync = "sqlite:///:memory:"
        
        mock_db_session = MagicMock()
        mock_sessionmaker.return_value = MagicMock(return_value=mock_db_session)
        
        mock_backup = MagicMock(spec=BackupRecord)
        mock_backup.id = 123
        mock_backup.file_path = None
        
        mock_db_session.query.return_value.filter.return_value.first.return_value = mock_backup
        
        mock_manager_instance = MagicMock()
        mock_get_manager.return_value = mock_manager_instance
        # 模拟失败
        mock_manager_instance.backup_database.return_value = (False, None, None)
        
        # 2. 执行函数
        # 显式调用 database 备份逻辑
        execute_backup_task_sync(123, BackupType.DATABASE.value)
        
        # 3. 断言
        mock_manager_instance.backup_database.assert_called()
        
        # 如果 DB 备份失败，状态应为 FAILED
        assert mock_backup.status == BackupStatus.FAILED.value
        assert "数据库备份失败" in mock_backup.error_message
        
        mock_db_session.commit.assert_called()
