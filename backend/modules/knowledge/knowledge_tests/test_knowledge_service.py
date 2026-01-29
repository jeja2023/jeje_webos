import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from sqlalchemy.ext.asyncio import AsyncSession
from modules.knowledge.knowledge_services import KnowledgeService
from modules.knowledge.knowledge_schemas import KbBaseCreate, KbBaseUpdate, KbNodeCreate, KbNodeUpdate
from modules.knowledge.knowledge_models import KnowledgeBase, KnowledgeNode

class TestKnowledgeService:
    """KnowledgeService 单元测试"""

    @pytest.mark.asyncio
    @patch("modules.knowledge.knowledge_services.vector_store")
    async def test_create_base(self, mock_vector, db_session: AsyncSession):
        """测试创建知识库"""
        user_id = 1
        data = KbBaseCreate(name="测试知识库", description="测试描述")
        
        kb = await KnowledgeService.create_base(db_session, user_id, data)
        
        assert kb.name == "测试知识库"
        assert kb.owner_id == user_id
        assert kb.id is not None

    @pytest.mark.asyncio
    async def test_get_bases(self, db_session: AsyncSession):
        """测试获取知识库列表"""
        user_id = 1
        # 先创建一个
        await KnowledgeService.create_base(db_session, user_id, KbBaseCreate(name="KB 1"))
        await KnowledgeService.create_base(db_session, user_id, KbBaseCreate(name="KB 2"))
        
        bases = await KnowledgeService.get_bases(db_session, user_id)
        assert len(bases) >= 2
        assert any(b.name == "KB 1" for b in bases)

    @pytest.mark.asyncio
    async def test_update_base(self, db_session: AsyncSession):
        """测试更新知识库"""
        user_id = 1
        kb = await KnowledgeService.create_base(db_session, user_id, KbBaseCreate(name="旧名称"))
        
        update_data = KbBaseUpdate(name="新名称", description="新描述")
        updated_kb = await KnowledgeService.update_base(db_session, kb.id, update_data)
        
        assert updated_kb.name == "新名称"
        assert updated_kb.description == "新描述"

    @pytest.mark.asyncio
    @patch("modules.knowledge.knowledge_services.vector_store")
    @patch("modules.knowledge.knowledge_services.shutil.rmtree")
    async def test_delete_base(self, mock_rmtree, mock_vector, db_session: AsyncSession):
        """测试删除知识库"""
        user_id = 1
        kb = await KnowledgeService.create_base(db_session, user_id, KbBaseCreate(name="待删除"))
        
        # delete_base 目前不返回值，我们验证它执行成功且查不到数据即可
        await KnowledgeService.delete_base(db_session, kb.id)
        
        # 验证是否已删除
        kb_after = await KnowledgeService.get_base(db_session, kb.id)
        assert kb_after is None

    @pytest.mark.asyncio
    async def test_create_node(self, db_session: AsyncSession):
        """测试创建节点"""
        user_id = 1
        kb = await KnowledgeService.create_base(db_session, user_id, KbBaseCreate(name="KB for node"))
        
        node_data = KbNodeCreate(
            base_id=kb.id,
            title="测试文档",
            node_type="document",
            content="这是测试内容"
        )
        
        node = await KnowledgeService.create_node(db_session, user_id, node_data)
        assert node.title == "测试文档"
        assert node.content == "这是测试内容"
        assert node.base_id == kb.id

    @pytest.mark.asyncio
    @patch("modules.knowledge.knowledge_services.vector_store")
    async def test_delete_node(self, mock_vector, db_session: AsyncSession):
        """测试删除节点"""
        user_id = 1
        kb = await KnowledgeService.create_base(db_session, user_id, KbBaseCreate(name="KB"))
        node = await KnowledgeService.create_node(db_session, user_id, KbNodeCreate(
            base_id=kb.id, title="删除我", node_type="document"
        ))
        
        # delete_node 目前不返回值
        await KnowledgeService.delete_node(db_session, node.id)
        
        # 验证向量库删除被调用
        mock_vector.delete_by_node_id.assert_called_with(node.id)
        
        # 验证数据库节点已删除
        node_after = await KnowledgeService.get_node(db_session, node.id)
        assert node_after is None
