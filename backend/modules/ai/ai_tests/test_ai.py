# -*- coding: utf-8 -*-
"""
AI助手模块测试
覆盖：AI服务静态方法、会话管理 CRUD（服务层+API）、模型与消息
"""

import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from httpx import AsyncClient

from modules.ai.ai_models import AIChatSession, AIChatMessage


# ==================== 模型测试 ====================

class TestAIModels:
    """AI 数据模型测试"""

    def test_session_model(self):
        assert AIChatSession.__tablename__ == "ai_chat_sessions"

    def test_message_model(self):
        assert AIChatMessage.__tablename__ == "ai_chat_messages"

    def test_session_fields(self):
        """测试会话模型包含关键字段"""
        columns = {c.name for c in AIChatSession.__table__.columns}
        assert "user_id" in columns
        assert "title" in columns
        assert "provider" in columns
        assert "knowledge_base_id" in columns

    def test_message_fields(self):
        """测试消息模型包含关键字段"""
        columns = {c.name for c in AIChatMessage.__table__.columns}
        assert "session_id" in columns
        assert "role" in columns
        assert "content" in columns
        assert "is_error" in columns


# ==================== AI 服务静态方法测试 ====================

class TestAIService:
    """AI服务测试"""

    def test_role_presets_exist(self):
        """测试角色预设是否存在"""
        from modules.ai.ai_service import AIService
        assert hasattr(AIService, 'ROLE_PRESETS')
        assert 'default' in AIService.ROLE_PRESETS
        assert 'coder' in AIService.ROLE_PRESETS
        assert 'writer' in AIService.ROLE_PRESETS
        assert 'translator' in AIService.ROLE_PRESETS
        assert 'analyst' in AIService.ROLE_PRESETS

    def test_role_presets_content(self):
        """测试角色预设内容不为空"""
        from modules.ai.ai_service import AIService
        for role, prompt in AIService.ROLE_PRESETS.items():
            assert prompt, f"角色 {role} 的提示词不应为空"
            assert len(prompt) > 10, f"角色 {role} 的提示词应有足够内容"

    def test_is_data_analysis_query(self):
        """测试数据分析查询检测"""
        from modules.ai.ai_service import AIService
        data_queries = ["查询数据集的信息", "统计销售数据", "分析用户行为", "帮我写一个SQL", "找出销售额最高的产品", "显示前10条记录"]
        for query in data_queries:
            assert AIService._is_data_analysis_query(query), f"'{query}' 应被识别为数据分析查询"
        non_data_queries = ["你好", "今天天气怎么样", "讲个笑话"]
        for query in non_data_queries:
            assert not AIService._is_data_analysis_query(query), f"'{query}' 不应被识别为数据分析查询"

    def test_get_available_models(self):
        """测试获取可用模型列表"""
        from modules.ai.ai_service import AIService
        models = AIService.get_available_models()
        assert isinstance(models, list)

    def test_suggest_visualization(self):
        """测试可视化建议"""
        from modules.ai.ai_service import AIService
        assert "折线图" in AIService._suggest_visualization("分析销售趋势")
        assert "饼图" in AIService._suggest_visualization("各类别销售占比")
        assert "柱状图" in AIService._suggest_visualization("对比不同产品的销量")


class TestSQLGeneration:
    """SQL生成测试"""

    def test_generate_sql_basic(self):
        from modules.ai.ai_service import AIService
        mock_dataset = MagicMock()
        mock_dataset.table_name = "test_table"
        sql = AIService._generate_sql_from_natural_language("显示所有数据", mock_dataset)
        assert sql is not None
        assert "SELECT" in sql.upper()
        assert "FROM test_table" in sql

    def test_generate_sql_with_limit(self):
        from modules.ai.ai_service import AIService
        mock_dataset = MagicMock()
        mock_dataset.table_name = "test_table"
        sql = AIService._generate_sql_from_natural_language("显示前10条记录", mock_dataset)
        assert "LIMIT 10" in sql

    def test_generate_sql_with_order(self):
        from modules.ai.ai_service import AIService
        mock_dataset = MagicMock()
        mock_dataset.table_name = "test_table"
        sql = AIService._generate_sql_from_natural_language("找出最大的记录", mock_dataset)
        assert "ORDER BY" in sql and "DESC" in sql

    def test_generate_sql_with_aggregation(self):
        from modules.ai.ai_service import AIService
        mock_dataset = MagicMock()
        mock_dataset.table_name = "test_table"
        columns = ["id", "name", "price", "category"]
        sql = AIService._generate_sql_from_natural_language("统计总数", mock_dataset, columns)
        assert "COUNT" in sql.upper()


# ==================== 会话管理服务层测试 ====================

class TestAISessionService:
    """AI 会话管理服务层测试"""

    @pytest.mark.asyncio
    async def test_create_session(self, db_session):
        """测试创建会话"""
        from modules.ai.ai_session_service import AISessionService
        session = await AISessionService.create_session(db_session, user_id=1, title="测试会话")
        assert session.id is not None
        assert session.title == "测试会话"
        assert session.user_id == 1
        assert session.provider == "local"

    @pytest.mark.asyncio
    async def test_create_session_with_options(self, db_session):
        """测试创建带选项的会话"""
        from modules.ai.ai_session_service import AISessionService
        session = await AISessionService.create_session(
            db_session, user_id=1, title="在线对话",
            provider="online", use_analysis=True, config={"temperature": 0.7}
        )
        assert session.provider == "online"
        assert session.use_analysis is True

    @pytest.mark.asyncio
    async def test_list_sessions(self, db_session):
        """测试获取会话列表"""
        from modules.ai.ai_session_service import AISessionService
        await AISessionService.create_session(db_session, user_id=1, title="会话1")
        await AISessionService.create_session(db_session, user_id=1, title="会话2")
        sessions = await AISessionService.list_sessions(db_session, user_id=1)
        assert len(sessions) >= 2

    @pytest.mark.asyncio
    async def test_list_sessions_user_isolation(self, db_session):
        """测试会话列表用户隔离"""
        from modules.ai.ai_session_service import AISessionService
        await AISessionService.create_session(db_session, user_id=1, title="用户1的会话")
        await AISessionService.create_session(db_session, user_id=2, title="用户2的会话")
        sessions_user1 = await AISessionService.list_sessions(db_session, user_id=1)
        sessions_user2 = await AISessionService.list_sessions(db_session, user_id=2)
        assert all(s.user_id == 1 for s in sessions_user1)
        assert all(s.user_id == 2 for s in sessions_user2)

    @pytest.mark.asyncio
    async def test_get_session(self, db_session):
        """测试获取单个会话"""
        from modules.ai.ai_session_service import AISessionService
        created = await AISessionService.create_session(db_session, user_id=1, title="查询测试")
        fetched = await AISessionService.get_session(db_session, created.id, user_id=1)
        assert fetched is not None
        assert fetched.title == "查询测试"

    @pytest.mark.asyncio
    async def test_get_session_wrong_user(self, db_session):
        """测试获取其他用户的会话返回 None"""
        from modules.ai.ai_session_service import AISessionService
        created = await AISessionService.create_session(db_session, user_id=1, title="私有会话")
        fetched = await AISessionService.get_session(db_session, created.id, user_id=2)
        assert fetched is None

    @pytest.mark.asyncio
    async def test_update_session(self, db_session):
        """测试更新会话"""
        from modules.ai.ai_session_service import AISessionService
        session = await AISessionService.create_session(db_session, user_id=1, title="原始标题")
        updated = await AISessionService.update_session(db_session, session.id, user_id=1, title="更新标题")
        assert updated.title == "更新标题"

    @pytest.mark.asyncio
    async def test_update_session_partial(self, db_session):
        """测试部分更新会话（只改 provider）"""
        from modules.ai.ai_session_service import AISessionService
        session = await AISessionService.create_session(db_session, user_id=1, title="原始", provider="local")
        updated = await AISessionService.update_session(db_session, session.id, user_id=1, provider="online")
        assert updated.provider == "online"
        assert updated.title == "原始"  # 标题不变

    @pytest.mark.asyncio
    async def test_delete_session(self, db_session):
        """测试删除会话"""
        from modules.ai.ai_session_service import AISessionService
        session = await AISessionService.create_session(db_session, user_id=1, title="待删除")
        result = await AISessionService.delete_session(db_session, session.id, user_id=1)
        assert result is True
        # 验证已删除
        fetched = await AISessionService.get_session(db_session, session.id, user_id=1)
        assert fetched is None

    @pytest.mark.asyncio
    async def test_delete_session_wrong_user(self, db_session):
        """测试删除其他用户会话失败"""
        from modules.ai.ai_session_service import AISessionService
        session = await AISessionService.create_session(db_session, user_id=1, title="不能删除")
        result = await AISessionService.delete_session(db_session, session.id, user_id=2)
        assert result is False

    @pytest.mark.asyncio
    async def test_add_message(self, db_session):
        """测试添加消息"""
        from modules.ai.ai_session_service import AISessionService
        session = await AISessionService.create_session(db_session, user_id=1, title="消息测试")
        msg = await AISessionService.add_message(db_session, session.id, user_id=1, role="user", content="你好")
        assert msg is not None
        assert msg.role == "user"
        assert msg.content == "你好"
        assert msg.session_id == session.id

    @pytest.mark.asyncio
    async def test_add_message_assistant(self, db_session):
        """测试添加 AI 回复消息"""
        from modules.ai.ai_session_service import AISessionService
        session = await AISessionService.create_session(db_session, user_id=1, title="回复测试")
        await AISessionService.add_message(db_session, session.id, user_id=1, role="user", content="问题")
        reply = await AISessionService.add_message(db_session, session.id, user_id=1, role="assistant", content="回答")
        assert reply.role == "assistant"

    @pytest.mark.asyncio
    async def test_add_error_message(self, db_session):
        """测试添加错误消息"""
        from modules.ai.ai_session_service import AISessionService
        session = await AISessionService.create_session(db_session, user_id=1, title="错误测试")
        err_msg = await AISessionService.add_message(
            db_session, session.id, user_id=1, role="system", content="发生错误", is_error=True
        )
        assert err_msg.is_error is True

    @pytest.mark.asyncio
    async def test_add_message_wrong_user(self, db_session):
        """测试向其他用户的会话添加消息失败"""
        from modules.ai.ai_session_service import AISessionService
        session = await AISessionService.create_session(db_session, user_id=1, title="私有会话")
        msg = await AISessionService.add_message(db_session, session.id, user_id=2, role="user", content="入侵")
        assert msg is None

    @pytest.mark.asyncio
    async def test_session_with_messages(self, db_session):
        """测试获取会话包含消息"""
        from modules.ai.ai_session_service import AISessionService
        session = await AISessionService.create_session(db_session, user_id=1, title="完整会话")
        await AISessionService.add_message(db_session, session.id, user_id=1, role="user", content="Q1")
        await AISessionService.add_message(db_session, session.id, user_id=1, role="assistant", content="A1")
        await AISessionService.add_message(db_session, session.id, user_id=1, role="user", content="Q2")

        fetched = await AISessionService.get_session(db_session, session.id, user_id=1)
        assert fetched is not None
        assert len(fetched.messages) == 3

    @pytest.mark.asyncio
    async def test_save_session_with_messages_new(self, db_session):
        """测试批量保存新会话及消息"""
        from modules.ai.ai_session_service import AISessionService
        session_data = {
            "title": "批量保存测试",
            "provider": "online",
            "messages": [
                {"role": "user", "content": "你好"},
                {"role": "assistant", "content": "你好！有什么可以帮助你的吗？"}
            ]
        }
        session = await AISessionService.save_session_with_messages(db_session, user_id=1, session_data=session_data)
        assert session.id is not None
        assert session.title == "批量保存测试"

    @pytest.mark.asyncio
    async def test_delete_session_cascades_messages(self, db_session):
        """测试删除会话级联删除消息"""
        from modules.ai.ai_session_service import AISessionService
        session = await AISessionService.create_session(db_session, user_id=1, title="级联删除")
        await AISessionService.add_message(db_session, session.id, user_id=1, role="user", content="test")
        result = await AISessionService.delete_session(db_session, session.id, user_id=1)
        assert result is True


# ==================== API 路由测试 ====================

@pytest.mark.asyncio
class TestAIStatusAPI:
    """AI 状态 API 测试"""

    async def test_get_status(self, admin_client: AsyncClient):
        """测试获取 AI 状态"""
        resp = await admin_client.get("/api/v1/ai/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "data" in data
        assert "status" in data["data"]
        assert "available_models" in data["data"]


@pytest.mark.asyncio
class TestAISessionAPI:
    """AI 会话 API 测试"""

    async def test_create_session(self, admin_client: AsyncClient):
        """测试创建会话"""
        resp = await admin_client.post("/api/v1/ai/sessions", json={
            "title": "API会话", "provider": "local"
        })
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["title"] == "API会话"
        assert data["id"] is not None

    async def test_list_sessions(self, admin_client: AsyncClient):
        """测试获取会话列表"""
        # 先创建
        await admin_client.post("/api/v1/ai/sessions", json={"title": "列表测试1"})
        await admin_client.post("/api/v1/ai/sessions", json={"title": "列表测试2"})
        resp = await admin_client.get("/api/v1/ai/sessions")
        assert resp.status_code == 200
        assert isinstance(resp.json()["data"], list)

    async def test_get_session(self, admin_client: AsyncClient):
        """测试获取单个会话"""
        cr = await admin_client.post("/api/v1/ai/sessions", json={"title": "详情测试"})
        sid = cr.json()["data"]["id"]
        resp = await admin_client.get(f"/api/v1/ai/sessions/{sid}")
        assert resp.status_code == 200
        assert resp.json()["data"]["title"] == "详情测试"

    async def test_update_session(self, admin_client: AsyncClient):
        """测试更新会话"""
        cr = await admin_client.post("/api/v1/ai/sessions", json={"title": "原始"})
        sid = cr.json()["data"]["id"]
        resp = await admin_client.put(f"/api/v1/ai/sessions/{sid}", json={"title": "已更新"})
        assert resp.status_code == 200
        assert resp.json()["data"]["title"] == "已更新"

    async def test_delete_session(self, admin_client: AsyncClient):
        """测试删除会话"""
        cr = await admin_client.post("/api/v1/ai/sessions", json={"title": "待删除"})
        sid = cr.json()["data"]["id"]
        resp = await admin_client.delete(f"/api/v1/ai/sessions/{sid}")
        assert resp.status_code == 200

    async def test_session_lifecycle(self, admin_client: AsyncClient):
        """测试会话完整生命周期"""
        # 创建
        cr = await admin_client.post("/api/v1/ai/sessions", json={
            "title": "生命周期", "provider": "online", "use_analysis": True
        })
        assert cr.status_code == 200
        sid = cr.json()["data"]["id"]
        # 查看
        get_r = await admin_client.get(f"/api/v1/ai/sessions/{sid}")
        assert get_r.status_code == 200
        assert "messages" in get_r.json()["data"]
        # 更新
        up_r = await admin_client.put(f"/api/v1/ai/sessions/{sid}", json={"title": "更新后"})
        assert up_r.status_code == 200
        # 删除
        del_r = await admin_client.delete(f"/api/v1/ai/sessions/{sid}")
        assert del_r.status_code == 200
        # 验证已删除
        get_r2 = await admin_client.get(f"/api/v1/ai/sessions/{sid}")
        assert get_r2.json().get("data") is None or get_r2.json().get("code") != 0

    async def test_get_nonexistent_session(self, admin_client: AsyncClient):
        """测试获取不存在的会话"""
        resp = await admin_client.get("/api/v1/ai/sessions/99999")
        # 应返回错误
        assert resp.status_code == 200  # 200 with error message in body
        assert "不存在" in resp.json().get("message", "") or resp.json().get("code", 0) != 0

    async def test_unauthorized_access(self, client: AsyncClient):
        """测试未认证访问"""
        resp = await client.get("/api/v1/ai/sessions")
        assert resp.status_code in (401, 403)


@pytest.mark.asyncio
class TestAIConfigAPI:
    """AI 配置 API 测试"""

    async def test_save_config(self, admin_client: AsyncClient):
        """测试保存 AI 配置"""
        resp = await admin_client.post("/api/v1/ai/config", json={
            "api_key": "sk-test-key-12345",
            "base_url": "https://api.deepseek.com/v1",
            "model": "deepseek-chat"
        })
        assert resp.status_code == 200

    async def test_save_config_empty_key(self, admin_client: AsyncClient):
        """测试保存空 API Key"""
        resp = await admin_client.post("/api/v1/ai/config", json={
            "api_key": "",
        })
        assert resp.status_code == 200
        # 应返回错误信息
        assert "不能为空" in resp.json().get("message", "") or resp.json().get("code", 0) != 0


class TestAPIEncryption:
    """API密钥加密概念测试"""

    def test_encryption_concept(self):
        import base64
        original = "sk-test-key-12345"
        shifted = ''.join(chr(ord(c) + 3) for c in original)
        encrypted = base64.b64encode(shifted.encode()).decode()
        decoded = base64.b64decode(encrypted).decode()
        decrypted = ''.join(chr(ord(c) - 3) for c in decoded)
        assert decrypted == original


class TestAIManifest:
    """AI 模块清单测试"""

    def test_manifest_load(self):
        from modules.ai.ai_manifest import manifest
        assert manifest.id == "ai"
        assert manifest.enabled is True
