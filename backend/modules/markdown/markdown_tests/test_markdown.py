# -*- coding: utf-8 -*-
"""
Markdown 模块测试用例
"""

import pytest
from modules.markdown.markdown_services import MarkdownService
from modules.markdown.markdown_schemas import MarkdownDocCreate, MarkdownDocUpdate


class TestMarkdownService:
    """Markdown 服务测试"""
    
    @pytest.mark.asyncio
    async def test_create_doc(self, db_session, sample_user_id):
        """测试创建文档"""
        data = MarkdownDocCreate(
            title="测试文档",
            content="# 标题\n\n这是一段测试内容",
            is_public=False
        )
        result = await MarkdownService.create_doc(db_session, sample_user_id, data)
        
        assert result is not None
        assert result.title == "测试文档"
        assert result.user_id == sample_user_id
        assert result.is_public == False
        assert result.summary  # 自动生成摘要
    
    @pytest.mark.asyncio
    async def test_get_doc_by_id(self, db_session, sample_user_id):
        """测试获取文档"""
        # 先创建
        data = MarkdownDocCreate(title="获取测试", content="测试内容")
        doc = await MarkdownService.create_doc(db_session, sample_user_id, data)
        
        # 再获取
        result = await MarkdownService.get_doc_by_id(db_session, doc.id, sample_user_id)
        
        assert result is not None
        assert result.id == doc.id
        assert result.title == "获取测试"
    
    @pytest.mark.asyncio
    async def test_get_doc_not_found(self, db_session, sample_user_id):
        """测试获取不存在的文档"""
        result = await MarkdownService.get_doc_by_id(db_session, 99999, sample_user_id)
        assert result is None
    
    @pytest.mark.asyncio
    async def test_update_doc(self, db_session, sample_user_id):
        """测试更新文档"""
        # 先创建
        data = MarkdownDocCreate(title="更新前", content="原始内容")
        doc = await MarkdownService.create_doc(db_session, sample_user_id, data)
        
        # 再更新
        update_data = MarkdownDocUpdate(title="更新后", content="新内容")
        result = await MarkdownService.update_doc(db_session, doc.id, sample_user_id, update_data)
        
        assert result is not None
        assert result.title == "更新后"
        assert result.content == "新内容"
    
    @pytest.mark.asyncio
    async def test_delete_doc(self, db_session, sample_user_id):
        """测试删除文档"""
        # 先创建
        data = MarkdownDocCreate(title="待删除", content="删除测试")
        doc = await MarkdownService.create_doc(db_session, sample_user_id, data)
        
        # 再删除
        result = await MarkdownService.delete_doc(db_session, doc.id, sample_user_id)
        assert result == True
        
        # 验证已删除
        check = await MarkdownService.get_doc_by_id(db_session, doc.id, sample_user_id)
        assert check is None
    
    @pytest.mark.asyncio
    async def test_toggle_star(self, db_session, sample_user_id):
        """测试收藏切换"""
        # 先创建
        data = MarkdownDocCreate(title="收藏测试", content="测试")
        doc = await MarkdownService.create_doc(db_session, sample_user_id, data)
        assert doc.is_starred == False
        
        # 收藏
        result = await MarkdownService.toggle_star(db_session, doc.id, sample_user_id)
        assert result.is_starred == True
        
        # 取消收藏
        result = await MarkdownService.toggle_star(db_session, doc.id, sample_user_id)
        assert result.is_starred == False
    
    @pytest.mark.asyncio
    async def test_get_doc_list(self, db_session, sample_user_id):
        """测试获取文档列表"""
        # 创建几个文档
        for i in range(3):
            data = MarkdownDocCreate(title=f"列表测试{i}", content=f"内容{i}")
            await MarkdownService.create_doc(db_session, sample_user_id, data)
        
        # 获取列表
        docs, total = await MarkdownService.get_doc_list(db_session, sample_user_id)
        
        assert total >= 3
        assert len(docs) >= 3
    
    @pytest.mark.asyncio
    async def test_get_statistics(self, db_session, sample_user_id):
        """测试获取统计信息"""
        stats = await MarkdownService.get_statistics(db_session, sample_user_id)
        
        assert 'total_docs' in stats
        assert 'starred_docs' in stats
        assert 'public_docs' in stats
        assert 'total_views' in stats
