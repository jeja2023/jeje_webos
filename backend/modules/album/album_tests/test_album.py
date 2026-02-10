# -*- coding: utf-8 -*-
"""
相册模块测试
覆盖：模型、服务层 CRUD、API 路由端点
"""
import pytest
from httpx import AsyncClient
from modules.album.album_models import Album, AlbumPhoto
from modules.album.album_schemas import AlbumCreate


class TestAlbumModels:
    def test_album_model(self):
        assert "album" in Album.__tablename__
    def test_photo_model(self):
        assert AlbumPhoto.__tablename__ == "album_photos"


class TestAlbumService:
    @pytest.mark.asyncio
    async def test_create_album(self, db_session):
        from modules.album.album_services import AlbumService
        album = await AlbumService.create_album(db_session, user_id=1, data=AlbumCreate(
            name="旅行相册", description="2024年旅行照片"
        ))
        assert album.id is not None
        assert album.name == "旅行相册"

    @pytest.mark.asyncio
    async def test_get_album_list(self, db_session):
        from modules.album.album_services import AlbumService
        await AlbumService.create_album(db_session, user_id=1, data=AlbumCreate(name="列表测试"))
        albums, total = await AlbumService.get_album_list(db_session, user_id=1)
        assert total >= 1

    @pytest.mark.asyncio
    async def test_update_album(self, db_session):
        from modules.album.album_services import AlbumService
        from modules.album.album_schemas import AlbumUpdate
        album = await AlbumService.create_album(db_session, user_id=1, data=AlbumCreate(name="原始"))
        updated = await AlbumService.update_album(db_session, album.id, data=AlbumUpdate(name="更新"), user_id=1)
        assert updated.name == "更新"

    @pytest.mark.asyncio
    async def test_delete_album(self, db_session):
        from modules.album.album_services import AlbumService
        album = await AlbumService.create_album(db_session, user_id=1, data=AlbumCreate(name="待删除"))
        result = await AlbumService.delete_album(db_session, album.id, user_id=1)
        assert result is True

    @pytest.mark.asyncio
    async def test_get_album_by_id(self, db_session):
        from modules.album.album_services import AlbumService
        album = await AlbumService.create_album(db_session, user_id=1, data=AlbumCreate(name="详情测试"))
        fetched = await AlbumService.get_album_by_id(db_session, album.id, user_id=1)
        assert fetched is not None
        assert fetched.name == "详情测试"


@pytest.mark.asyncio
class TestAlbumAPI:
    async def test_get_albums(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/album/")
        assert resp.status_code == 200

    async def test_create_album(self, admin_client: AsyncClient):
        resp = await admin_client.post("/api/v1/album/", json={
            "name": "API相册", "description": "API测试"
        })
        assert resp.status_code == 200

    async def test_album_lifecycle(self, admin_client: AsyncClient):
        cr = await admin_client.post("/api/v1/album/", json={"name": "生命周期", "description": "测试"})
        aid = cr.json()["data"]["id"]
        get_r = await admin_client.get(f"/api/v1/album/{aid}")
        assert get_r.status_code == 200
        up_r = await admin_client.put(f"/api/v1/album/{aid}", json={"name": "已更新"})
        assert up_r.status_code == 200
        del_r = await admin_client.delete(f"/api/v1/album/{aid}")
        assert del_r.status_code == 200


class TestAlbumManifest:
    def test_manifest(self):
        from modules.album.album_manifest import manifest
        assert manifest.id == "album"
        assert manifest.enabled is True
