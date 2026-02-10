# -*- coding: utf-8 -*-
"""
文档清洗模块测试
覆盖：模型、服务层 CRUD、API 路由端点
"""
import pytest
from unittest.mock import patch, AsyncMock
from httpx import AsyncClient
from modules.lm_cleaner.lm_cleaner_models import LmCleaner
from modules.lm_cleaner.lm_cleaner_schemas import LmCleanerCreate


class TestLmCleanerModels:
    def test_item_model(self):
        assert "cleaner" in LmCleaner.__tablename__


class TestLmCleanerService:
    @pytest.mark.asyncio
    async def test_create(self, db_session):
        from modules.lm_cleaner.lm_cleaner_services import LmCleanerService
        item = await LmCleanerService.create(db_session, user_id=1, data=LmCleanerCreate(
            title="测试文档", source_file="test.pdf"
        ))
        assert item.id is not None
        assert item.title == "测试文档"

    @pytest.mark.asyncio
    async def test_get_by_id(self, db_session):
        from modules.lm_cleaner.lm_cleaner_services import LmCleanerService
        item = await LmCleanerService.create(db_session, user_id=1, data=LmCleanerCreate(
            title="查询测试", source_file="q.pdf"
        ))
        fetched = await LmCleanerService.get_by_id(db_session, item.id)
        assert fetched is not None

    @pytest.mark.asyncio
    async def test_get_by_id_not_found(self, db_session):
        from modules.lm_cleaner.lm_cleaner_services import LmCleanerService
        fetched = await LmCleanerService.get_by_id(db_session, 99999)
        assert fetched is None

    @pytest.mark.asyncio
    async def test_get_list(self, db_session):
        from modules.lm_cleaner.lm_cleaner_services import LmCleanerService
        await LmCleanerService.create(db_session, user_id=1, data=LmCleanerCreate(title="列表1", source_file="a.pdf"))
        await LmCleanerService.create(db_session, user_id=1, data=LmCleanerCreate(title="列表2", source_file="b.pdf"))
        items, total = await LmCleanerService.get_list(db_session, user_id=1)
        assert total >= 2

    @pytest.mark.asyncio
    async def test_get_list_with_keyword(self, db_session):
        from modules.lm_cleaner.lm_cleaner_services import LmCleanerService
        await LmCleanerService.create(db_session, user_id=1, data=LmCleanerCreate(
            title="Python教程去水印", source_file="p.pdf"
        ))
        items, total = await LmCleanerService.get_list(db_session, user_id=1, keyword="Python")
        assert total >= 1

    @pytest.mark.asyncio
    async def test_delete(self, db_session):
        from modules.lm_cleaner.lm_cleaner_services import LmCleanerService
        item = await LmCleanerService.create(db_session, user_id=1, data=LmCleanerCreate(
            title="待删除", source_file="d.pdf"
        ))
        result = await LmCleanerService.delete(db_session, item.id)
        assert result is True


@pytest.mark.asyncio
class TestLmCleanerAPI:
    async def test_get_list(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/lm_cleaner")
        assert resp.status_code == 200

    async def test_delete_nonexistent(self, admin_client: AsyncClient):
        resp = await admin_client.delete("/api/v1/lm_cleaner/99999")
        assert resp.status_code in (200, 404)


class TestLmCleanerManifest:
    def test_manifest(self):
        from modules.lm_cleaner.lm_cleaner_manifest import manifest
        assert manifest.id == "lm_cleaner"
        assert manifest.enabled is True
