"""
数据备份 API 测试
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models.backup import BackupRecord, BackupSchedule
from unittest.mock import patch, MagicMock

class TestBackupAPI:
    """备份 API 测试"""

    @pytest.mark.asyncio
    async def test_list_backups_admin(self, admin_client: AsyncClient, db_session: AsyncSession):
        """测试管理员获取备份列表"""
        # 准备一个备份记录
        b = BackupRecord(
            backup_type="full",
            status="success",
            file_size=1024
        )
        db_session.add(b)
        await db_session.commit()
        
        # 路径：/api/v1/backup -> /api/v1/backup/list
        response = await admin_client.get("/api/v1/backup/list")
        assert response.status_code == 200
        data = response.json()
        assert "items" in data["data"]

    @pytest.mark.asyncio
    @patch("utils.backup_executor.execute_backup_task_sync")
    async def test_create_backup(self, mock_execute, admin_client: AsyncClient):
        """测试管理员创建备份"""
        data = {
            "backup_type": "full",
            "include_files": True,
            "comment": "测试手工备份"
        }
        # 路径：POST /api/v1/backup -> POST /api/v1/backup/create
        response = await admin_client.post("/api/v1/backup/create", json=data)
        assert response.status_code == 200
        assert "任务已创建" in response.json()["message"]

    @pytest.mark.asyncio
    async def test_list_schedules(self, admin_client: AsyncClient, db_session: AsyncSession):
        """测试获取调度列表"""
        s = BackupSchedule(
            name="每日备份",
            backup_type="full",
            schedule_type="daily",
            schedule_time="00:00",
            is_enabled=True
        )
        db_session.add(s)
        await db_session.commit()
        
        response = await admin_client.get("/api/v1/backup/schedules")
        assert response.status_code == 200
        data = response.json()
        # 检查结构：response.json()["data"]["items"] 
        assert any(item["name"] == "每日备份" for item in data["data"]["items"])

    @pytest.mark.asyncio
    async def test_create_schedule(self, admin_client: AsyncClient):
        """测试创建调度"""
        data = {
            "name": "新调度",
            "backup_type": "database",
            "schedule_type": "daily",
            "schedule_time": "01:00",
            "retention_days": 5
        }
        response = await admin_client.post("/api/v1/backup/schedules", json=data)
        assert response.status_code == 200
        assert response.json()["data"]["name"] == "新调度"

    @pytest.mark.asyncio
    async def test_delete_backup(self, admin_client: AsyncClient, db_session: AsyncSession):
        """测试删除备份"""
        b = BackupRecord(backup_type="full", status="success")
        db_session.add(b)
        await db_session.commit()
        await db_session.refresh(b)
        
        # 模拟文件不存在或已删除
        with patch("utils.backup.get_backup_manager") as mock_manager:
            mock_manager.return_value.delete_backup.return_value = True
            response = await admin_client.delete(f"/api/v1/backup/{b.id}")
            assert response.status_code == 200
            
        result = await db_session.execute(select(BackupRecord).where(BackupRecord.id == b.id))
        assert result.scalar_one_or_none() is None
