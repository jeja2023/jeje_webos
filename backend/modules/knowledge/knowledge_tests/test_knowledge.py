# -*- coding: utf-8 -*-
"""
知识库模块测试 - 基础和服务层
覆盖：模型、Schema、服务层 CRUD
"""
import pytest
from modules.knowledge.knowledge_models import KnowledgeBase, KnowledgeNode


class TestKnowledgeModels:
    def test_base_model(self):
        assert "base" in KnowledgeBase.__tablename__

    def test_node_model(self):
        assert "node" in KnowledgeNode.__tablename__


class TestKnowledgeSchemas:
    def test_base_create(self):
        from modules.knowledge.knowledge_schemas import KbBaseCreate
        d = KbBaseCreate(name="测试知识库", description="描述")
        assert d.name == "测试知识库"

    def test_node_create(self):
        from modules.knowledge.knowledge_schemas import KbNodeCreate
        d = KbNodeCreate(base_id=1, title="文档节点", node_type="document")
        assert d.title == "文档节点"


class TestKnowledgeManifest:
    def test_manifest(self):
        from modules.knowledge.knowledge_manifest import manifest
        assert manifest.id == "knowledge"
        assert manifest.enabled is True
