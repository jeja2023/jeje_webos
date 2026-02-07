"""
文件存储 API 测试
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models.storage import FileRecord
from models.account import User
import io
from unittest.mock import patch

class TestStorageAPI:
    """存储 API 测试"""

    @pytest.mark.asyncio
    @patch("core.rate_limit.rate_limiter.check", return_value=(True, {"remaining": 100, "limit": 200, "reset": 60}))
    async def test_upload_file(self, mock_check, admin_client: AsyncClient, db_session: AsyncSession):
        """测试文件上传"""
        file_content = b"fake file content"
        files = {"file": ("test.txt", io.BytesIO(file_content), "text/plain")}
        
        # 使用 admin_client 以确保有权限
        response = await admin_client.post("/api/v1/storage/upload", files=files)
        assert response.status_code == 200
        data = response.json()
        assert data["data"]["filename"] == "test.txt"
        assert data["data"]["file_size"] == len(file_content)

    @pytest.mark.asyncio
    @patch("core.rate_limit.rate_limiter.check", return_value=(True, {"remaining": 100, "limit": 200, "reset": 60}))
    async def test_list_files(self, mock_check, admin_client: AsyncClient, db_session: AsyncSession, test_admin_data: dict):
        """测试获取文件列表"""
        # 获取管理员 ID
        result = await db_session.execute(select(User).where(User.username == test_admin_data["username"]))
        user = result.scalar_one()
        
        # 准备一个文件记录
        f = FileRecord(
            uploader_id=user.id,
            filename="list_test.txt",
            storage_path="test/path",
            file_size=100,
            mime_type="text/plain",
            category="attachment"
        )
        db_session.add(f)
        await db_session.commit()
        
        # 路径：/api/v1/storage -> /api/v1/storage/list
        response = await admin_client.get("/api/v1/storage/list")
        assert response.status_code == 200
        data = response.json()
        assert any(item["filename"] == "list_test.txt" for item in data["data"]["items"])

    @pytest.mark.asyncio
    @patch("core.rate_limit.rate_limiter.check", return_value=(True, {"remaining": 100, "limit": 200, "reset": 60}))
    async def test_get_file_info(self, mock_check, admin_client: AsyncClient, db_session: AsyncSession, test_admin_data: dict):
        """测试获取文件信息"""
        result = await db_session.execute(select(User).where(User.username == test_admin_data["username"]))
        user = result.scalar_one()
        
        f = FileRecord(
            uploader_id=user.id,
            filename="info_test.txt",
            storage_path="test/path",
            file_size=100,
            mime_type="text/plain",
            category="attachment"
        )
        db_session.add(f)
        await db_session.commit()
        await db_session.refresh(f)
        
        # 路径：/api/v1/storage/{id} -> /api/v1/storage/info/{id}
        response = await admin_client.get(f"/api/v1/storage/info/{f.id}")
        assert response.status_code == 200
        assert response.json()["data"]["filename"] == "info_test.txt"

    @pytest.mark.asyncio
    @patch("core.rate_limit.rate_limiter.check", return_value=(True, {"remaining": 100, "limit": 200, "reset": 60}))
    async def test_delete_file(self, mock_check, admin_client: AsyncClient, db_session: AsyncSession, test_admin_data: dict):
        """测试删除文件"""
        result = await db_session.execute(select(User).where(User.username == test_admin_data["username"]))
        user = result.scalar_one()
        
        f = FileRecord(
            uploader_id=user.id,
            filename="del_test.txt",
            storage_path="test/path",
            file_size=100,
            mime_type="text/plain",
            category="attachment"
        )
        db_session.add(f)
        await db_session.commit()
        await db_session.refresh(f)
        
        response = await admin_client.delete(f"/api/v1/storage/{f.id}")
        assert response.status_code == 200
        
        # 验证数据库记录
        result = await db_session.execute(select(FileRecord).where(FileRecord.id == f.id))
        assert result.scalar_one_or_none() is None

    @pytest.mark.asyncio
    @patch("core.rate_limit.rate_limiter.check", return_value=(True, {"remaining": 100, "limit": 200, "reset": 60}))
    async def test_download_file(self, mock_check, admin_client: AsyncClient, db_session: AsyncSession, test_admin_data: dict):
        """测试下载文件"""
        from utils.storage import get_storage_manager
        from pathlib import Path
        
        # 从 Client Header 中获取 Token
        auth_header = admin_client.headers.get("Authorization")
        token = auth_header.split(" ")[1]
        
        # 获取管理员 ID
        result = await db_session.execute(select(User).where(User.username == test_admin_data["username"]))
        user = result.scalar_one()
        
        # 准备文件内容
        filename = "download_test.txt"
        content = b"content to download"
        
        # 使用 StorageManager 生成路径并写入文件
        storage = get_storage_manager()
        relative_path, full_path = storage.generate_filename(filename, user.id, "attachment")
        
        path = Path(full_path)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        
        # 创建数据库记录
        f = FileRecord(
            uploader_id=user.id,
            filename=filename,
            storage_path=relative_path,
            file_size=len(content),
            mime_type="text/plain",
            category="attachment"
        )
        db_session.add(f)
        await db_session.commit()
        await db_session.refresh(f)
        
        # 请求下载 (注意: download 接口只接受 URL Query Token)
        response = await admin_client.get(f"/api/v1/storage/download/{f.id}?token={token}")
        assert response.status_code == 200
        assert response.content == content
