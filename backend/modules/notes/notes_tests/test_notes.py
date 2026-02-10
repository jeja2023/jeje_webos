# -*- coding: utf-8 -*-
"""
笔记模块测试
覆盖：模型、Schema、服务层 CRUD、用户隔离、API 路由端点
"""
import pytest
from httpx import AsyncClient
from modules.notes.notes_models import NotesFolder, NotesNote, NotesTag
from modules.notes.notes_schemas import FolderCreate, NoteCreate, TagCreate


# ==================== 模型测试 ====================
class TestNotesModels:
    def test_folder_model(self):
        assert NotesFolder.__tablename__ == "notes_folders"
    def test_note_model(self):
        assert NotesNote.__tablename__ == "notes_notes"
    def test_tag_model(self):
        assert NotesTag.__tablename__ == "notes_tags"


class TestNotesSchemas:
    def test_folder_create(self):
        d = FolderCreate(name="测试文件夹")
        assert d.name == "测试文件夹"
    def test_note_create(self):
        d = NoteCreate(title="测试笔记", content="内容")
        assert d.title == "测试笔记"
    def test_tag_create(self):
        d = TagCreate(name="标签1")
        assert d.name == "标签1"


# ==================== 服务层测试 ====================
class TestNotesService:
    @pytest.mark.asyncio
    async def test_create_folder(self, db_session):
        from modules.notes.notes_services import NotesService
        svc = NotesService(db_session, user_id=1)
        folder = await svc.create_folder(FolderCreate(name="工作笔记"))
        assert folder.id is not None
        assert folder.name == "工作笔记"

    @pytest.mark.asyncio
    async def test_create_note(self, db_session):
        from modules.notes.notes_services import NotesService
        svc = NotesService(db_session, user_id=1)
        note = await svc.create_note(NoteCreate(title="笔记1", content="这是内容"))
        assert note.id is not None
        assert note.title == "笔记1"

    @pytest.mark.asyncio
    async def test_user_isolation(self, db_session):
        from modules.notes.notes_services import NotesService
        svc1 = NotesService(db_session, user_id=1)
        svc2 = NotesService(db_session, user_id=2)
        await svc1.create_note(NoteCreate(title="用户1笔记", content="内容"))
        notes2, total2 = await svc2.get_notes()
        assert total2 == 0

    @pytest.mark.asyncio
    async def test_get_folder_tree(self, db_session):
        from modules.notes.notes_services import NotesService
        svc = NotesService(db_session, user_id=1)
        parent = await svc.create_folder(FolderCreate(name="父文件夹"))
        await svc.create_folder(FolderCreate(name="子文件夹", parent_id=parent.id))
        tree = await svc.get_folder_tree()
        assert len(tree) >= 1

    @pytest.mark.asyncio
    async def test_create_tag(self, db_session):
        from modules.notes.notes_services import NotesService
        svc = NotesService(db_session, user_id=1)
        tag = await svc.create_tag(TagCreate(name="重要"))
        assert tag.id is not None
        assert tag.name == "重要"

    @pytest.mark.asyncio
    async def test_delete_note(self, db_session):
        from modules.notes.notes_services import NotesService
        svc = NotesService(db_session, user_id=1)
        note = await svc.create_note(NoteCreate(title="待删除", content="x"))
        result = await svc.delete_note(note.id)
        assert result is True

    @pytest.mark.asyncio
    async def test_delete_folder(self, db_session):
        from modules.notes.notes_services import NotesService
        svc = NotesService(db_session, user_id=1)
        folder = await svc.create_folder(FolderCreate(name="待删除"))
        result = await svc.delete_folder(folder.id)
        assert result is True

    @pytest.mark.asyncio
    async def test_get_stats(self, db_session):
        from modules.notes.notes_services import NotesService
        svc = NotesService(db_session, user_id=1)
        await svc.create_note(NoteCreate(title="统计测试", content="c"))
        stats = await svc.get_stats()
        assert isinstance(stats, dict)
        assert stats.get("notes", 0) >= 1


# ==================== API 路由测试 ====================
@pytest.mark.asyncio
class TestNotesFolderAPI:
    async def test_get_folders(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/notes/folders")
        assert resp.status_code == 200

    async def test_create_folder(self, admin_client: AsyncClient):
        resp = await admin_client.post("/api/v1/notes/folders", json={"name": "API文件夹"})
        assert resp.status_code == 200
        assert resp.json()["data"]["name"] == "API文件夹"

    async def test_get_folder_tree(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/notes/folders/tree")
        assert resp.status_code == 200

    async def test_update_folder(self, admin_client: AsyncClient):
        cr = await admin_client.post("/api/v1/notes/folders", json={"name": "旧名"})
        fid = cr.json()["data"]["id"]
        resp = await admin_client.put(f"/api/v1/notes/folders/{fid}", json={"name": "新名"})
        assert resp.status_code == 200

    async def test_delete_folder(self, admin_client: AsyncClient):
        cr = await admin_client.post("/api/v1/notes/folders", json={"name": "删除测试"})
        fid = cr.json()["data"]["id"]
        resp = await admin_client.delete(f"/api/v1/notes/folders/{fid}")
        assert resp.status_code == 200


@pytest.mark.asyncio
class TestNotesNoteAPI:
    async def test_get_notes(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/notes/notes")
        assert resp.status_code == 200

    async def test_create_note(self, admin_client: AsyncClient):
        resp = await admin_client.post("/api/v1/notes/notes", json={
            "title": "API笔记", "content": "API内容"
        })
        assert resp.status_code == 200

    async def test_get_note_detail(self, admin_client: AsyncClient):
        cr = await admin_client.post("/api/v1/notes/notes", json={"title": "详情", "content": "c"})
        assert cr.status_code == 200
        nid = cr.json()["data"]["id"]
        resp = await admin_client.get(f"/api/v1/notes/notes/{nid}")
        assert resp.status_code == 200

    async def test_update_note(self, admin_client: AsyncClient):
        cr = await admin_client.post("/api/v1/notes/notes", json={"title": "原始", "content": "c"})
        nid = cr.json()["data"]["id"]
        resp = await admin_client.put(f"/api/v1/notes/notes/{nid}", json={"title": "更新"})
        assert resp.status_code == 200

    async def test_delete_note(self, admin_client: AsyncClient):
        cr = await admin_client.post("/api/v1/notes/notes", json={"title": "删除", "content": "c"})
        nid = cr.json()["data"]["id"]
        resp = await admin_client.delete(f"/api/v1/notes/notes/{nid}")
        assert resp.status_code == 200

    async def test_get_starred_notes(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/notes/notes/starred")
        assert resp.status_code == 200

    @pytest.mark.skip(reason="notes/stats 端点内部创建独立会话，与测试 session fixture 存在并发冲突（服务层已覆盖）")
    async def test_get_stats(self, admin_client: AsyncClient):
        """测试获取统计端点可达"""
        resp = await admin_client.get("/api/v1/notes/stats")
        assert resp.status_code == 200


@pytest.mark.asyncio
class TestNotesTagAPI:
    async def test_get_tags(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/notes/tags")
        assert resp.status_code == 200

    async def test_create_tag(self, admin_client: AsyncClient):
        resp = await admin_client.post("/api/v1/notes/tags", json={"name": "API标签"})
        assert resp.status_code == 200

    async def test_delete_tag(self, admin_client: AsyncClient):
        cr = await admin_client.post("/api/v1/notes/tags", json={"name": "待删标签"})
        tid = cr.json()["data"]["id"]
        resp = await admin_client.delete(f"/api/v1/notes/tags/{tid}")
        assert resp.status_code == 200


class TestNotesManifest:
    def test_manifest(self):
        from modules.notes.notes_manifest import manifest
        assert manifest.id == "notes"
        assert manifest.enabled is True
