import pytest
from fastapi.testclient import TestClient
from main import app
from core.security import create_token, TokenData

client = TestClient(app)

@pytest.mark.asyncio
class TestPdfRouter:
    """PDF 模块路由测试"""

    @pytest.fixture
    def auth_header(self):
        """测试用认证头"""
        token_data = TokenData(user_id=1, username="test_user", role="user")
        token = create_token(token_data)
        return {"Authorization": f"Bearer {token}"}

    async def test_get_pdf_files_unauthorized(self):
        """测试未授权访问文件列表"""
        response = client.get("/api/v1/pdf/files")
        assert response.status_code == 401

    async def test_get_pdf_files_success(self, auth_header):
        """测试获取文件列表成功"""
        response = client.get("/api/v1/pdf/files", headers=auth_header)
        assert response.status_code == 200
        data = response.json()
        assert data["code"] == 0
        assert "files" in data["data"]
        assert isinstance(data["data"]["files"], list)

    async def test_get_pdf_history_success(self, auth_header):
        """测试获取操作历史成功"""
        response = client.get("/api/v1/pdf/history", headers=auth_header)
        assert response.status_code == 200
        data = response.json()
        assert data["code"] == 0
        assert "items" in data["data"]

    async def test_render_page_missing_params(self, auth_header):
        """测试渲染页面缺少参数"""
        response = client.get("/api/v1/pdf/render?page=0", headers=auth_header)
        # 应该返回 400 或报错，因为缺少 file_id 或 path
        assert response.status_code in (400, 500)

    async def test_delete_file_unauthorized(self):
        """测试未授权删除文件"""
        response = client.delete("/api/v1/pdf/files/test.pdf")
        assert response.status_code == 401
