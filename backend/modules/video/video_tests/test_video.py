# -*- coding: utf-8 -*-
"""
视频模块测试
覆盖：模型、服务层 CRUD、API 路由端点
"""
import pytest
from httpx import AsyncClient
from modules.video.video_models import VideoCollection, Video
from modules.video.video_schemas import CollectionCreate


class TestVideoModels:
    def test_collection_model(self):
        assert VideoCollection.__tablename__ == "video_collections"
    def test_video_model(self):
        assert "video" in Video.__tablename__


class TestVideoService:
    @pytest.mark.asyncio
    async def test_create_collection(self, db_session):
        from modules.video.video_services import VideoService
        coll = await VideoService.create_collection(db_session, user_id=1, data=CollectionCreate(
            name="我的视频集", description="测试描述"
        ))
        assert coll.id is not None
        assert coll.name == "我的视频集"

    @pytest.mark.asyncio
    async def test_get_collection_list(self, db_session):
        from modules.video.video_services import VideoService
        await VideoService.create_collection(db_session, user_id=1, data=CollectionCreate(name="集合1"))
        colls, total = await VideoService.get_collection_list(db_session, user_id=1)
        assert total >= 1

    @pytest.mark.asyncio
    async def test_update_collection(self, db_session):
        from modules.video.video_services import VideoService
        from modules.video.video_schemas import CollectionUpdate
        coll = await VideoService.create_collection(db_session, user_id=1, data=CollectionCreate(name="原始名"))
        updated = await VideoService.update_collection(db_session, coll.id, data=CollectionUpdate(name="新名"), user_id=1)
        assert updated.name == "新名"

    @pytest.mark.asyncio
    async def test_delete_collection(self, db_session):
        from modules.video.video_services import VideoService
        coll = await VideoService.create_collection(db_session, user_id=1, data=CollectionCreate(name="待删除"))
        result = await VideoService.delete_collection(db_session, coll.id, user_id=1)
        assert result is True

    @pytest.mark.asyncio
    async def test_format_duration(self, db_session):
        from modules.video.video_services import VideoService
        # 验证核心逻辑
        assert "0" in VideoService.format_duration(0)
        assert "05" in VideoService.format_duration(65)
        assert "1:01" in VideoService.format_duration(3661)
        # None 可能返回 "" 或 "0:00"
        result_none = VideoService.format_duration(None)
        assert result_none is not None


@pytest.mark.asyncio
class TestVideoAPI:
    async def test_get_collections(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/video/")
        assert resp.status_code == 200

    async def test_create_collection(self, admin_client: AsyncClient):
        resp = await admin_client.post("/api/v1/video/", json={"name": "API视频集", "description": "测试"})
        assert resp.status_code == 200

    async def test_collection_lifecycle(self, admin_client: AsyncClient):
        cr = await admin_client.post("/api/v1/video/", json={"name": "生命周期", "description": "测试"})
        cid = cr.json()["data"]["id"]
        get_r = await admin_client.get(f"/api/v1/video/{cid}")
        assert get_r.status_code == 200
        up_r = await admin_client.put(f"/api/v1/video/{cid}", json={"name": "已更新"})
        assert up_r.status_code == 200
        del_r = await admin_client.delete(f"/api/v1/video/{cid}")
        assert del_r.status_code == 200


class TestVideoManifest:
    def test_manifest(self):
        from modules.video.video_manifest import manifest
        assert manifest.id == "video"
        assert manifest.enabled is True
