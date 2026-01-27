import pytest
from httpx import AsyncClient

@pytest.mark.asyncio
class TestPdfRouter:
    """PDF 模块路由测试"""

    async def test_get_pdf_files_unauthorized(self, client: AsyncClient):
        """测试未授权访问文件列表"""
        response = await client.get("/api/v1/pdf/files")
        assert response.status_code == 401

    async def test_get_pdf_files_success(self, user_client: AsyncClient):
        """测试获取文件列表成功"""
        response = await user_client.get("/api/v1/pdf/files")
        # 确保目录存在，否则可能返回 200 []
        assert response.status_code == 200
        data = response.json()
        assert data["code"] == 0
        assert "files" in data["data"]
        assert isinstance(data["data"]["files"], list)

    async def test_get_pdf_history_success(self, user_client: AsyncClient):
        """测试获取操作历史成功"""
        response = await user_client.get("/api/v1/pdf/history")
        assert response.status_code == 200
        data = response.json()
        assert data["code"] == 0
        assert "items" in data["data"]

    async def test_render_page_missing_params(self, user_client: AsyncClient):
        """测试渲染页面缺少参数"""
        response = await user_client.get("/api/v1/pdf/render?page=0")
        # 缺少 file_id 或 path，由 FastAPI 验证或逻辑抛出 400
        assert response.status_code == 400

    async def test_delete_file_unauthorized(self, client: AsyncClient):
        """测试未授权删除文件"""
        response = await client.delete("/api/v1/pdf/files/test.pdf")
        assert response.status_code == 401
