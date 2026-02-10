# -*- coding: utf-8 -*-
"""
Markdown 模块路由测试
覆盖：文档 CRUD API、收藏、统计、模板 API
"""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
class TestMarkdownDocAPI:
    async def test_get_docs(self, admin_client: AsyncClient):
        """测试获取文档列表"""
        resp = await admin_client.get("/api/v1/markdown/docs")
        assert resp.status_code == 200

    async def test_create_doc(self, admin_client: AsyncClient):
        """测试创建文档"""
        resp = await admin_client.post("/api/v1/markdown/docs", json={
            "title": "API文档", "content": "# API Test"
        })
        assert resp.status_code == 200

    async def test_doc_lifecycle(self, admin_client: AsyncClient):
        """测试文档完整生命周期"""
        cr = await admin_client.post("/api/v1/markdown/docs", json={
            "title": "生命周期", "content": "# Test"
        })
        assert cr.status_code == 200
        did = cr.json()["data"]["id"]
        # 查看
        get_r = await admin_client.get(f"/api/v1/markdown/docs/{did}")
        assert get_r.status_code == 200
        # 更新
        up_r = await admin_client.put(f"/api/v1/markdown/docs/{did}", json={"title": "已更新"})
        assert up_r.status_code == 200
        # 收藏
        star_r = await admin_client.post(f"/api/v1/markdown/docs/{did}/star")
        assert star_r.status_code == 200
        # 删除
        del_r = await admin_client.delete(f"/api/v1/markdown/docs/{did}")
        assert del_r.status_code == 200

    async def test_get_statistics(self, admin_client: AsyncClient):
        """测试获取统计信息"""
        resp = await admin_client.get("/api/v1/markdown/statistics")
        assert resp.status_code == 200

    async def test_unauthorized_access(self, client: AsyncClient):
        """测试未认证访问"""
        resp = await client.get("/api/v1/markdown/docs")
        assert resp.status_code in (401, 403)


@pytest.mark.asyncio
class TestMarkdownTemplateAPI:
    async def test_get_templates(self, admin_client: AsyncClient):
        """测试获取模板列表"""
        resp = await admin_client.get("/api/v1/markdown/templates")
        assert resp.status_code == 200

    async def test_create_template(self, admin_client: AsyncClient):
        """测试创建模板"""
        resp = await admin_client.post("/api/v1/markdown/templates", json={
            "name": "API模板", "content": "# Template"
        })
        assert resp.status_code == 200

    async def test_delete_template(self, admin_client: AsyncClient):
        """测试删除模板"""
        cr = await admin_client.post("/api/v1/markdown/templates", json={
            "name": "待删除模板", "content": "# Delete me"
        })
        assert cr.status_code == 200
        tid = cr.json()["data"]["id"]
        resp = await admin_client.delete(f"/api/v1/markdown/templates/{tid}")
        assert resp.status_code == 200
