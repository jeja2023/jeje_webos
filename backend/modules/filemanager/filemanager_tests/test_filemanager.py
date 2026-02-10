# -*- coding: utf-8 -*-
"""
文件管理器模块测试
覆盖：模型、Schema、服务层 CRUD、API 路由端点
"""
import pytest
from httpx import AsyncClient
from modules.filemanager.filemanager_models import VirtualFolder, VirtualFile
from modules.filemanager.filemanager_schemas import FolderCreate, FileUpdate


class TestFilemanagerModels:
    def test_folder_model(self):
        assert "folder" in VirtualFolder.__tablename__
    def test_file_model(self):
        assert "file" in VirtualFile.__tablename__


class TestFilemanagerSchemas:
    def test_folder_create(self):
        d = FolderCreate(name="测试文件夹")
        assert d.name == "测试文件夹"
    def test_file_update(self):
        d = FileUpdate(name="新文件名")
        assert d.name == "新文件名"


class TestFilemanagerService:
    @pytest.mark.asyncio
    async def test_create_folder(self, db_session):
        from modules.filemanager.filemanager_services import FileManagerService
        svc = FileManagerService(db_session, user_id=1)
        folder = await svc.create_folder(FolderCreate(name="新文件夹"))
        assert folder.id is not None
        assert folder.name == "新文件夹"

    @pytest.mark.asyncio
    async def test_get_folder(self, db_session):
        from modules.filemanager.filemanager_services import FileManagerService
        svc = FileManagerService(db_session, user_id=1)
        folder = await svc.create_folder(FolderCreate(name="查询测试"))
        fetched = await svc.get_folder(folder.id)
        assert fetched is not None

    @pytest.mark.asyncio
    async def test_delete_folder(self, db_session):
        from modules.filemanager.filemanager_services import FileManagerService
        svc = FileManagerService(db_session, user_id=1)
        folder = await svc.create_folder(FolderCreate(name="待删除"))
        result = await svc.delete_folder(folder.id)
        assert result is True

    @pytest.mark.asyncio
    async def test_create_nested_folder(self, db_session):
        from modules.filemanager.filemanager_services import FileManagerService
        svc = FileManagerService(db_session, user_id=1)
        parent = await svc.create_folder(FolderCreate(name="父目录"))
        child = await svc.create_folder(FolderCreate(name="子目录", parent_id=parent.id))
        assert child.parent_id == parent.id

    @pytest.mark.asyncio
    async def test_get_folder_tree(self, db_session):
        from modules.filemanager.filemanager_services import FileManagerService
        svc = FileManagerService(db_session, user_id=1)
        await svc.create_folder(FolderCreate(name="树测试"))
        tree = await svc.get_folder_tree()
        assert isinstance(tree, list)

    @pytest.mark.asyncio
    async def test_get_storage_stats(self, db_session):
        from modules.filemanager.filemanager_services import FileManagerService
        svc = FileManagerService(db_session, user_id=1)
        stats = await svc.get_storage_stats()
        # 可能返回 dict 或 Pydantic 模型
        assert stats is not None

    @pytest.mark.asyncio
    async def test_search_empty(self, db_session):
        from modules.filemanager.filemanager_services import FileManagerService
        svc = FileManagerService(db_session, user_id=1)
        results = await svc.search("不存在的文件_xyz")
        assert results is not None


@pytest.mark.asyncio
class TestFilemanagerAPI:
    async def test_get_browse(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/filemanager/browse")
        assert resp.status_code == 200

    async def test_get_folder_tree(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/filemanager/folders/tree")
        assert resp.status_code == 200

    async def test_create_folder(self, admin_client: AsyncClient):
        resp = await admin_client.post("/api/v1/filemanager/folders", json={"name": "API文件夹"})
        assert resp.status_code == 200

    async def test_folder_lifecycle(self, admin_client: AsyncClient):
        cr = await admin_client.post("/api/v1/filemanager/folders", json={"name": "生命周期"})
        assert cr.status_code == 200
        fid = cr.json()["data"]["id"]
        up = await admin_client.put(f"/api/v1/filemanager/folders/{fid}", json={"name": "已更新"})
        assert up.status_code == 200
        dl = await admin_client.delete(f"/api/v1/filemanager/folders/{fid}")
        assert dl.status_code == 200

    async def test_get_storage_stats(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/filemanager/stats")
        assert resp.status_code == 200

    async def test_search(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/filemanager/search", params={"keyword": "test"})
        assert resp.status_code == 200

    async def test_get_starred(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/filemanager/starred")
        assert resp.status_code == 200


class TestFilemanagerManifest:
    def test_manifest(self):
        from modules.filemanager.filemanager_manifest import manifest
        assert manifest.id == "filemanager"
        assert manifest.enabled is True
