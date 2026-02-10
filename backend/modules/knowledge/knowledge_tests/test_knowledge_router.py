# -*- coding: utf-8 -*-
"""
知识库模块路由测试
覆盖：知识库 CRUD、节点 CRUD、搜索
注意：合并多个操作到单个测试方法中减少 fixture 开销，提升速度
"""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
class TestKnowledgeBaseAPI:
    async def test_base_full_lifecycle(self, admin_client: AsyncClient):
        """测试知识库完整生命周期（创建→列表→详情→更新→删除）"""
        # 创建
        cr = await admin_client.post("/api/v1/knowledge/bases", json={
            "name": "API知识库", "description": "API测试"
        })
        assert cr.status_code == 200
        bid = cr.json()["data"]["id"]

        # 获取列表
        list_r = await admin_client.get("/api/v1/knowledge/bases")
        assert list_r.status_code == 200

        # 查看详情
        get_r = await admin_client.get(f"/api/v1/knowledge/bases/{bid}")
        assert get_r.status_code == 200

        # 获取节点
        nodes_r = await admin_client.get(f"/api/v1/knowledge/bases/{bid}/nodes")
        assert nodes_r.status_code == 200

        # 更新
        up_r = await admin_client.put(f"/api/v1/knowledge/bases/{bid}", json={"name": "已更新"})
        assert up_r.status_code == 200

        # 删除
        del_r = await admin_client.delete(f"/api/v1/knowledge/bases/{bid}")
        assert del_r.status_code == 200


@pytest.mark.asyncio
class TestKnowledgeNodeAPI:
    async def test_node_full_lifecycle(self, admin_client: AsyncClient):
        """测试节点完整生命周期（创建知识库→创建节点→查看→更新→删除）"""
        # 创建知识库
        base_r = await admin_client.post("/api/v1/knowledge/bases", json={"name": "节点测试库"})
        assert base_r.status_code == 200
        bid = base_r.json()["data"]["id"]

        # 创建节点
        cr = await admin_client.post("/api/v1/knowledge/nodes", json={
            "base_id": bid, "title": "API节点", "node_type": "document", "content": "内容"
        })
        assert cr.status_code == 200
        nid = cr.json()["data"]["id"]

        # 查看
        get_r = await admin_client.get(f"/api/v1/knowledge/nodes/{nid}")
        assert get_r.status_code == 200

        # 更新
        up_r = await admin_client.put(f"/api/v1/knowledge/nodes/{nid}", json={"title": "已更新节点"})
        assert up_r.status_code == 200

        # 删除
        del_r = await admin_client.delete(f"/api/v1/knowledge/nodes/{nid}")
        assert del_r.status_code == 200


@pytest.mark.asyncio
class TestKnowledgeSearchAPI:
    async def test_search(self, admin_client: AsyncClient):
        """测试搜索功能"""
        resp = await admin_client.get("/api/v1/knowledge/search", params={"q": "test"})
        assert resp.status_code == 200
