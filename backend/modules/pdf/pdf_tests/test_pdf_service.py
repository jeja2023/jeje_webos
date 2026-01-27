# -*- coding: utf-8 -*-
"""
PDF 模块服务层测试用例
"""

import os
import pytest
import fitz
from pathlib import Path
from modules.pdf.pdf_services import PdfService
from modules.pdf.pdf_schemas import (
    PdfMergeRequest, PdfSplitRequest, PdfWatermarkRequest,
    PdfCompressRequest, PdfImagesToPdfRequest
)

class TestPdfService:
    """PDF 模块服务层测试"""

    @pytest.fixture
    async def sample_user_id(self, db_session, test_user_data):
        from tests.test_conftest import create_test_user
        user = await create_test_user(db_session, test_user_data)
        return user["id"]

    @pytest.fixture
    def pdf_file(self, tmp_workspace, sample_user_id):
        """创建一个基础 PDF 文件并存入模拟存储"""
        # 获取 PDF 模块的上传目录
        from utils.storage import get_storage_manager
        storage = get_storage_manager()
        user_upload_dir = storage.get_module_dir("pdf", "uploads", sample_user_id)
        
        pdf_name = "test.pdf"
        pdf_path = user_upload_dir / pdf_name
        
        doc = fitz.open()
        page = doc.new_page(width=500, height=500)
        page.insert_text((50, 50), "Hello PDF Component")
        doc.save(str(pdf_path))
        doc.close()
        
        # 返回逻辑相对路径
        return f"modules/pdf/uploads/user_{sample_user_id}/{pdf_name}"

    @pytest.mark.asyncio
    async def test_get_metadata(self, pdf_file, tmp_workspace):
        """测试获取 PDF 元数据"""
        from utils.storage import get_storage_manager
        storage = get_storage_manager()
        abs_path = storage.get_file_path(pdf_file)
        
        meta = await PdfService.get_metadata(str(abs_path))
        assert meta.page_count == 1
        assert meta.size_bytes > 0

    @pytest.mark.asyncio
    async def test_render_page(self, pdf_file, tmp_workspace):
        """测试渲染 PDF 页面"""
        from utils.storage import get_storage_manager
        storage = get_storage_manager()
        abs_path = storage.get_file_path(pdf_file)
        
        img_data = await PdfService.render_page(str(abs_path), 0)
        assert img_data.startswith(b"\x89PNG")

    @pytest.mark.asyncio
    async def test_merge_pdfs(self, db_session, sample_user_id, pdf_file):
        """测试合并 PDF"""
        request = PdfMergeRequest(
            paths=[pdf_file, pdf_file],
            output_name="merged_test.pdf"
        )
        output_path_str = await PdfService.merge_pdfs(db_session, sample_user_id, request)
        assert os.path.exists(output_path_str)
        
        # 验证结果
        doc = fitz.open(output_path_str)
        assert doc.page_count == 2
        doc.close()

    @pytest.mark.asyncio
    async def test_split_pdf(self, db_session, sample_user_id, pdf_file):
        """测试拆分 PDF"""
        # 1. 先合并一个 2 页的
        req_merge = PdfMergeRequest(paths=[pdf_file, pdf_file], output_name="two_pages.pdf")
        await PdfService.merge_pdfs(db_session, sample_user_id, req_merge)
        
        # 2. 拆分
        rel_path = f"modules/pdf/outputs/user_{sample_user_id}/two_pages.pdf"
        request = PdfSplitRequest(
            path=rel_path,
            page_ranges="1",
            output_name="split_test.pdf"
        )
        output_path_str = await PdfService.split_pdf(db_session, sample_user_id, request)
        assert os.path.exists(output_path_str)
        
        doc = fitz.open(output_path_str)
        assert doc.page_count == 1
        doc.close()

    @pytest.mark.asyncio
    async def test_add_watermark(self, db_session, sample_user_id, pdf_file):
        """测试添加水印"""
        request = PdfWatermarkRequest(
            path=pdf_file,
            text="TOP SECRET",
            fontsize=30,
            opacity=0.5,
            color=(1, 0, 0),
            output_name="watermarked_test.pdf"
        )
        output_path_str = await PdfService.add_watermark(db_session, sample_user_id, request)
        assert os.path.exists(output_path_str)
        
    @pytest.mark.asyncio
    async def test_extract_text(self, pdf_file, tmp_workspace):
        """测试提取文本"""
        from utils.storage import get_storage_manager
        storage = get_storage_manager()
        abs_path = storage.get_file_path(pdf_file)
        
        text = await PdfService.extract_text(str(abs_path))
        assert "Hello PDF Component" in text
