import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from modules.knowledge.knowledge_models import KnowledgeBase, KnowledgeNode

@pytest.mark.asyncio
class TestKnowledgeRouter:
    """KnowledgeRouter API 测试"""

    async def test_base_lifecycle(self, user_client: AsyncClient):
        """测试知识库完整生命周期 API"""
        
        # 1. 创建知识库
        create_resp = await user_client.post(
            "/api/v1/knowledge/bases",
            json={"name": "API测试库", "description": "来自路由测试"}
        )
        assert create_resp.status_code == 200
        data = create_resp.json()
        assert data["code"] == 200
        kb_id = data["data"]["id"]
        
        # 2. 获取列表
        list_resp = await user_client.get("/api/v1/knowledge/bases")
        assert list_resp.status_code == 200
        assert any(kb["id"] == kb_id for kb in list_resp.json()["data"])
        
        # 3. 更新知识库
        update_resp = await user_client.put(
            f"/api/v1/knowledge/bases/{kb_id}",
            json={"name": "API更新后的库"}
        )
        assert update_resp.status_code == 200
        assert update_resp.json()["data"]["name"] == "API更新后的库"
        
        # 4. 删除知识库
        del_resp = await user_client.delete(f"/api/v1/knowledge/bases/{kb_id}")
        assert del_resp.status_code == 200
        
        # 验证已删除
        detail_resp = await user_client.get(f"/api/v1/knowledge/bases/{kb_id}")
        # 根据 router 实现，不存在返回 200 + code: 404
        assert detail_resp.status_code == 200
        assert detail_resp.json()["code"] == 404

    async def test_node_operations(self, user_client: AsyncClient):
        """测试知识节点操作 API"""
        
        # 先创建一个库
        kb_resp = await user_client.post(
            "/api/v1/knowledge/bases",
            json={"name": "节点测试库"}
        )
        kb_id = kb_resp.json()["data"]["id"]
        
        # 1. 创建节点
        node_resp = await user_client.post(
            "/api/v1/knowledge/nodes",
            json={
                "base_id": kb_id,
                "title": "测试文档",
                "node_type": "document",
                "content": "文档内容"
            }
        )
        assert node_resp.status_code == 200
        node_id = node_resp.json()["data"]["id"]
        
        # 2. 获取节点详情
        get_resp = await user_client.get(f"/api/v1/knowledge/nodes/{node_id}")
        assert get_resp.status_code == 200
        assert get_resp.json()["data"]["title"] == "测试文档"
        
        # 3. 更新节点
        patch_resp = await user_client.put(
            f"/api/v1/knowledge/nodes/{node_id}",
            json={"title": "修改后的标题", "content": "修改后的内容"}
        )
        assert patch_resp.status_code == 200
        
        # 4. 删除节点
        del_resp = await user_client.delete(f"/api/v1/knowledge/nodes/{node_id}")
        assert del_resp.status_code == 200
