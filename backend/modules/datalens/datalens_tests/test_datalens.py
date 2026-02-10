# -*- coding: utf-8 -*-
"""
数据透镜模块测试
覆盖：模型、Schema、连接器、服务层、API 路由端点
"""
import pytest
from httpx import AsyncClient
from modules.datalens.datalens_models import LensDataSource, LensCategory, LensView
from modules.datalens.datalens_schemas import DataSourceCreate, ViewCreate, CategoryCreate


class TestDatalensModels:
    def test_datasource_model(self):
        assert LensDataSource.__tablename__ == "lens_datasources"
    def test_category_model(self):
        assert LensCategory.__tablename__ == "lens_categories"
    def test_view_model(self):
        assert LensView.__tablename__ == "lens_views"


class TestDatalensSchemas:
    def test_datasource_create(self):
        d = DataSourceCreate(name="测试源", type="csv", connection_config={"path": "/tmp/test.csv"})
        assert d.name == "测试源"
    def test_category_create(self):
        d = CategoryCreate(name="运营数据")
        assert d.name == "运营数据"
    def test_view_create(self):
        d = ViewCreate(
            name="测试视图", datasource_id=1, query_type="table",
            query_config={"table": "users"}
        )
        assert d.name == "测试视图"


class TestDataSourceConnector:
    def test_connector_exists(self):
        from modules.datalens.datalens_services import DataSourceConnector
        assert hasattr(DataSourceConnector, 'test_connection')

    @pytest.mark.asyncio
    async def test_test_connection_invalid(self):
        from modules.datalens.datalens_services import DataSourceConnector
        success, msg = await DataSourceConnector.test_connection("unknown_type", {})
        assert success is False


class TestDatalensService:
    @pytest.mark.asyncio
    async def test_create_category(self, db_session):
        from modules.datalens.datalens_services import CategoryService
        cat = await CategoryService.create(db_session, data=CategoryCreate(name="API分类"))
        assert cat.id is not None

    @pytest.mark.asyncio
    async def test_get_categories(self, db_session):
        from modules.datalens.datalens_services import CategoryService
        await CategoryService.create(db_session, data=CategoryCreate(name="列表分类"))
        cats = await CategoryService.get_list(db_session)
        assert len(cats) >= 1

    @pytest.mark.asyncio
    async def test_delete_category(self, db_session):
        from modules.datalens.datalens_services import CategoryService
        cat = await CategoryService.create(db_session, data=CategoryCreate(name="待删除"))
        result = await CategoryService.delete(db_session, cat)
        assert result is True or result is None  # 不同实现可能返回不同值


@pytest.mark.asyncio
class TestDatalensAPI:
    async def test_get_hub(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/lens/hub")
        assert resp.status_code == 200

    async def test_get_sources(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/lens/sources")
        assert resp.status_code == 200

    async def test_get_categories(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/lens/categories")
        assert resp.status_code == 200

    async def test_create_category(self, admin_client: AsyncClient):
        resp = await admin_client.post("/api/v1/lens/categories", json={"name": "API分类"})
        assert resp.status_code == 200

    async def test_get_views(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/lens/views")
        assert resp.status_code == 200

    async def test_get_favorites(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/lens/favorites")
        assert resp.status_code == 200

    async def test_get_recent(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/lens/recent")
        assert resp.status_code == 200


class TestDatalensManifest:
    def test_manifest(self):
        from modules.datalens.datalens_manifest import manifest
        assert manifest.id == "datalens"
        assert manifest.enabled is True
