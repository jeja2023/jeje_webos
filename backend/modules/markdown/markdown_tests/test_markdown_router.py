# -*- coding: utf-8 -*-
"""
Markdown 模块路由测试用例
"""

import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
class TestMarkdownRouter:
    """Markdown 模块路由测试"""

    async def test_get_docs_unauthorized(self, client: AsyncClient):
        """测试未授权访问文档列表"""
        response = await client.get("/api/v1/markdown/docs")
        assert response.status_code == 401

    async def test_create_doc(self, user_client: AsyncClient):
        """测试创建文档"""
        data = {
            "title": "Router测试文档",
            "content": "# 测试内容\n\n来自路由测试",
            "is_public": False
        }
        response = await user_client.post("/api/v1/markdown/docs", json=data)
        assert response.status_code == 200
        result = response.json()
        assert result["code"] == 200
        assert result["data"]["title"] == "Router测试文档"
        assert "id" in result["data"]

    async def test_get_doc_detail(self, user_client: AsyncClient):
        """测试获取文档详情"""
        # 1. 创建文档
        create_data = {"title": "详情测试", "content": "详情内容"}
        create_res = await user_client.post("/api/v1/markdown/docs", json=create_data)
        doc_id = create_res.json()["data"]["id"]
        
        # 2. 获取详情
        response = await user_client.get(f"/api/v1/markdown/docs/{doc_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["code"] == 200
        assert data["data"]["id"] == doc_id
        assert data["data"]["title"] == "详情测试"

    async def test_update_doc(self, user_client: AsyncClient):
        """测试更新文档"""
        # 1. 创建文档
        create_data = {"title": "待更新", "content": "原始消息"}
        create_res = await user_client.post("/api/v1/markdown/docs", json=create_data)
        doc_id = create_res.json()["data"]["id"]
        
        # 2. 更新文档
        update_data = {"title": "已更新标题", "content": "新消息内容"}
        response = await user_client.put(f"/api/v1/markdown/docs/{doc_id}", json=update_data)
        assert response.status_code == 200
        data = response.json()
        assert data["code"] == 200
        assert data["data"]["title"] == "已更新标题"
        assert data["data"]["content"] == "新消息内容"

    async def test_delete_doc(self, user_client: AsyncClient):
        """测试删除文档"""
        # 1. 创建文档
        create_data = {"title": "待删除文档", "content": "很快就会消失"}
        create_res = await user_client.post("/api/v1/markdown/docs", json=create_data)
        doc_id = create_res.json()["data"]["id"]
        
        # 2. 删除文档
        response = await user_client.delete(f"/api/v1/markdown/docs/{doc_id}")
        assert response.status_code == 200
        assert response.json()["code"] == 200
        
        # 3. 验证删除 (获取详情应返回 404)
        get_res = await user_client.get(f"/api/v1/markdown/docs/{doc_id}")
        assert get_res.json()["code"] == 404

    async def test_toggle_star(self, user_client: AsyncClient):
        """测试收藏文档"""
        # 1. 创建文档
        create_data = {"title": "收藏测试", "content": "内容"}
        create_res = await user_client.post("/api/v1/markdown/docs", json=create_data)
        doc_id = create_res.json()["data"]["id"]
        
        # 2. 第一次点击 (收藏)
        response = await user_client.post(f"/api/v1/markdown/docs/{doc_id}/star")
        assert response.status_code == 200
        assert response.json()["data"]["is_starred"] == True
        
        # 3. 第二次点击 (取消收藏)
        response = await user_client.post(f"/api/v1/markdown/docs/{doc_id}/star")
        assert response.status_code == 200
        assert response.json()["data"]["is_starred"] == False

    async def test_get_statistics(self, user_client: AsyncClient):
        """测试统计接口"""
        response = await user_client.get("/api/v1/markdown/statistics")
        assert response.status_code == 200
        data = response.json()
        assert data["code"] == 200
        assert "total_docs" in data["data"]
        assert "starred_docs" in data["data"]
