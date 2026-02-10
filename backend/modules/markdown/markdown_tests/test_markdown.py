# -*- coding: utf-8 -*-
"""
Markdown 模块测试 - 服务层
覆盖：文档 CRUD、收藏、统计、模板
"""
import pytest
from modules.markdown.markdown_models import MarkdownDoc


class TestMarkdownModels:
    def test_doc_model(self):
        assert "doc" in MarkdownDoc.__tablename__


class TestMarkdownService:
    @pytest.mark.asyncio
    async def test_create_doc(self, db_session):
        from modules.markdown.markdown_services import MarkdownService
        from modules.markdown.markdown_schemas import MarkdownDocCreate
        doc = await MarkdownService.create_doc(db_session, user_id=1, data=MarkdownDocCreate(
            title="测试文档", content="# Hello"
        ))
        assert doc.id is not None
        assert doc.title == "测试文档"

    @pytest.mark.asyncio
    async def test_get_doc_by_id(self, db_session):
        from modules.markdown.markdown_services import MarkdownService
        from modules.markdown.markdown_schemas import MarkdownDocCreate
        doc = await MarkdownService.create_doc(db_session, user_id=1, data=MarkdownDocCreate(
            title="查询测试", content="内容"
        ))
        fetched = await MarkdownService.get_doc_by_id(db_session, doc.id, user_id=1)
        assert fetched is not None

    @pytest.mark.asyncio
    async def test_get_doc_not_found(self, db_session):
        from modules.markdown.markdown_services import MarkdownService
        fetched = await MarkdownService.get_doc_by_id(db_session, 99999, user_id=1)
        assert fetched is None

    @pytest.mark.asyncio
    async def test_update_doc(self, db_session):
        from modules.markdown.markdown_services import MarkdownService
        from modules.markdown.markdown_schemas import MarkdownDocCreate, MarkdownDocUpdate
        doc = await MarkdownService.create_doc(db_session, user_id=1, data=MarkdownDocCreate(
            title="原始", content="c"
        ))
        updated = await MarkdownService.update_doc(db_session, doc.id, user_id=1, data=MarkdownDocUpdate(
            title="更新"
        ))
        assert updated.title == "更新"

    @pytest.mark.asyncio
    async def test_delete_doc(self, db_session):
        from modules.markdown.markdown_services import MarkdownService
        from modules.markdown.markdown_schemas import MarkdownDocCreate
        doc = await MarkdownService.create_doc(db_session, user_id=1, data=MarkdownDocCreate(
            title="待删", content="c"
        ))
        result = await MarkdownService.delete_doc(db_session, doc.id, user_id=1)
        assert result is True

    @pytest.mark.asyncio
    async def test_toggle_star(self, db_session):
        from modules.markdown.markdown_services import MarkdownService
        from modules.markdown.markdown_schemas import MarkdownDocCreate
        doc = await MarkdownService.create_doc(db_session, user_id=1, data=MarkdownDocCreate(
            title="收藏", content="c"
        ))
        toggled = await MarkdownService.toggle_star(db_session, doc.id, user_id=1)
        assert toggled is not None

    @pytest.mark.asyncio
    async def test_get_doc_list(self, db_session):
        from modules.markdown.markdown_services import MarkdownService
        from modules.markdown.markdown_schemas import MarkdownDocCreate
        await MarkdownService.create_doc(db_session, user_id=1, data=MarkdownDocCreate(
            title="列表1", content="c1"
        ))
        docs, total = await MarkdownService.get_doc_list(db_session, user_id=1)
        assert total >= 1

    @pytest.mark.asyncio
    async def test_get_statistics(self, db_session):
        from modules.markdown.markdown_services import MarkdownService
        stats = await MarkdownService.get_statistics(db_session, user_id=1)
        assert isinstance(stats, dict)

    @pytest.mark.asyncio
    async def test_get_templates(self, db_session):
        from modules.markdown.markdown_services import MarkdownService
        templates = await MarkdownService.get_templates(db_session, user_id=1)
        assert isinstance(templates, list)

    @pytest.mark.asyncio
    async def test_create_template(self, db_session):
        from modules.markdown.markdown_services import MarkdownService
        from modules.markdown.markdown_schemas import MarkdownTemplateCreate
        tmpl = await MarkdownService.create_template(db_session, user_id=1, data=MarkdownTemplateCreate(
            name="会议纪要", content="# 会议纪要\n## 日期"
        ))
        assert tmpl.id is not None

    @pytest.mark.asyncio
    async def test_delete_template(self, db_session):
        from modules.markdown.markdown_services import MarkdownService
        from modules.markdown.markdown_schemas import MarkdownTemplateCreate
        tmpl = await MarkdownService.create_template(db_session, user_id=1, data=MarkdownTemplateCreate(
            name="待删除", content="c"
        ))
        result = await MarkdownService.delete_template(db_session, tmpl.id, user_id=1)
        assert result is True


class TestMarkdownManifest:
    def test_manifest(self):
        from modules.markdown.markdown_manifest import manifest
        assert manifest.id == "markdown"
        assert manifest.enabled is True
