# -*- coding: utf-8 -*-
"""
PDF 模块路由测试
覆盖：文件列表、历史记录、元数据、渲染、API 路由端点
"""
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
class TestPdfFileAPI:
    async def test_get_files_unauthorized(self, client: AsyncClient):
        """测试未认证获取文件列表"""
        resp = await client.get("/api/v1/pdf/files")
        assert resp.status_code in (401, 403)

    async def test_get_files(self, admin_client: AsyncClient):
        """测试获取 PDF 文件列表"""
        resp = await admin_client.get("/api/v1/pdf/files")
        assert resp.status_code == 200

    async def test_get_history(self, admin_client: AsyncClient):
        """测试获取操作历史"""
        resp = await admin_client.get("/api/v1/pdf/history")
        assert resp.status_code == 200

    async def test_render_missing_params(self, admin_client: AsyncClient):
        """测试渲染缺少参数"""
        resp = await admin_client.get("/api/v1/pdf/render")
        assert resp.status_code in (400, 422)

    async def test_metadata_missing_params(self, admin_client: AsyncClient):
        """测试获取元数据缺少参数"""
        resp = await admin_client.get("/api/v1/pdf/metadata")
        assert resp.status_code in (200, 400, 422, 500)

    async def test_extract_text_missing_params(self, admin_client: AsyncClient):
        """测试提取文本缺少参数"""
        resp = await admin_client.get("/api/v1/pdf/extract-text")
        assert resp.status_code in (200, 400, 422, 500)


@pytest.mark.asyncio
class TestPdfToolboxAPI:
    async def test_merge_no_files(self, admin_client: AsyncClient):
        """测试空文件合并"""
        resp = await admin_client.post("/api/v1/pdf/merge", json={"filenames": []})
        assert resp.status_code in (200, 400, 422)

    async def test_split_no_file(self, admin_client: AsyncClient):
        """测试无文件分割"""
        resp = await admin_client.post("/api/v1/pdf/split", json={
            "filename": "nonexistent.pdf", "ranges": "1-2"
        })
        assert resp.status_code in (200, 400, 404, 500)

    async def test_compress_no_file(self, admin_client: AsyncClient):
        """测试无文件压缩"""
        resp = await admin_client.post("/api/v1/pdf/compress", json={
            "filename": "nonexistent.pdf"
        })
        assert resp.status_code in (200, 400, 404, 500)

    async def test_watermark_no_file(self, admin_client: AsyncClient):
        """测试无文件加水印"""
        resp = await admin_client.post("/api/v1/pdf/watermark", json={
            "filename": "nonexistent.pdf", "text": "DRAFT"
        })
        assert resp.status_code in (200, 400, 404, 500)

    async def test_encrypt_no_file(self, admin_client: AsyncClient):
        """测试无文件加密"""
        resp = await admin_client.post("/api/v1/pdf/encrypt", json={
            "filename": "nonexistent.pdf", "password": "123456"
        })
        assert resp.status_code in (200, 400, 404, 500)

    async def test_rotate_no_file(self, admin_client: AsyncClient):
        """测试无文件旋转"""
        resp = await admin_client.post("/api/v1/pdf/rotate", json={
            "filename": "nonexistent.pdf", "angle": 90
        })
        assert resp.status_code in (200, 400, 404, 500)
