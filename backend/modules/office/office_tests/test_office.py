# -*- coding: utf-8 -*-
"""
协同办公模块测试
"""

import pytest
from unittest.mock import AsyncMock, MagicMock
from modules.office.office_schemas import DocumentCreate, DocType
from modules.office.office_services import OfficeService


class TestOfficeService:
    """协同办公服务测试"""
    
    @pytest.mark.asyncio
    async def test_get_default_content_doc(self):
        """测试获取文档默认内容"""
        content = OfficeService._get_default_content("doc")
        assert content is not None
        assert "doc" in content
        assert "paragraph" in content
    
    @pytest.mark.asyncio
    async def test_get_default_content_sheet(self):
        """测试获取表格默认内容"""
        content = OfficeService._get_default_content("sheet")
        assert content is not None
        assert "Sheet1" in content
        assert "celldata" in content
    
    @pytest.mark.asyncio
    async def test_create_document_data(self):
        """测试创建文档数据模型"""
        data = DocumentCreate(
            title="测试文档",
            doc_type=DocType.DOC,
            content=None,
            folder_id=None,
            is_template=False
        )
        
        assert data.title == "测试文档"
        assert data.doc_type == DocType.DOC
        assert data.is_template is False
    
    @pytest.mark.asyncio
    async def test_create_sheet_data(self):
        """测试创建表格数据模型"""
        data = DocumentCreate(
            title="测试表格",
            doc_type=DocType.SHEET,
            content=None,
            folder_id=None,
            is_template=False
        )
        
        assert data.title == "测试表格"
        assert data.doc_type == DocType.SHEET
