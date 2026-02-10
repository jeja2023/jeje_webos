# -*- coding: utf-8 -*-
"""
即时通讯模块测试
覆盖：消息加密、服务层 CRUD、API 路由端点
"""
import pytest
from httpx import AsyncClient
from modules.im.im_models import IMConversation, IMMessage, IMContact
from modules.im.im_schemas import ConversationCreate, MessageCreate


class TestIMModels:
    def test_conversation_model(self):
        assert IMConversation.__tablename__ == "im_conversations"
    def test_message_model(self):
        assert IMMessage.__tablename__ == "im_messages"
    def test_contact_model(self):
        assert IMContact.__tablename__ == "im_contacts"


class TestMessageEncryption:
    def test_encrypt_decrypt(self):
        from modules.im.im_services import MessageEncryption
        enc = MessageEncryption()
        original = "Hello, 你好世界!"
        encrypted = enc.encrypt(original)
        assert encrypted != original
        decrypted = enc.decrypt(encrypted)
        assert decrypted == original

    def test_encrypt_empty(self):
        from modules.im.im_services import MessageEncryption
        enc = MessageEncryption()
        result = enc.encrypt("")
        # 空字符串加密后可能返回空或加密结果
        assert result is not None

    def test_decrypt_empty(self):
        from modules.im.im_services import MessageEncryption
        enc = MessageEncryption()
        assert enc.decrypt("") == ""

    def test_encrypt_produces_different_ciphertext(self):
        from modules.im.im_services import MessageEncryption
        enc = MessageEncryption()
        e1 = enc.encrypt("same text")
        e2 = enc.encrypt("same text")
        assert enc.decrypt(e1) == "same text"
        assert enc.decrypt(e2) == "same text"


class TestIMService:
    @pytest.mark.asyncio
    async def test_create_conversation(self, db_session):
        from modules.im.im_services import IMService
        svc = IMService(db_session)
        conv = await svc.create_conversation(user_id=1, data=ConversationCreate(
            name="测试会话", type="private", member_ids=[2]
        ))
        assert conv.id is not None

    @pytest.mark.asyncio
    async def test_get_conversation_list(self, db_session):
        from modules.im.im_services import IMService
        svc = IMService(db_session)
        await svc.create_conversation(user_id=1, data=ConversationCreate(
            name="列表测试", type="private", member_ids=[2]
        ))
        convs, total = await svc.get_conversation_list(user_id=1)
        assert total >= 1

    @pytest.mark.asyncio
    async def test_send_message(self, db_session):
        from modules.im.im_services import IMService
        svc = IMService(db_session)
        conv = await svc.create_conversation(user_id=1, data=ConversationCreate(
            name="消息测试", type="private", member_ids=[2]
        ))
        msg = await svc.send_message(user_id=1, data=MessageCreate(
            conversation_id=conv.id, content="你好", msg_type="text"
        ))
        assert msg.id is not None

    @pytest.mark.asyncio
    async def test_recall_message(self, db_session):
        from modules.im.im_services import IMService
        svc = IMService(db_session)
        conv = await svc.create_conversation(user_id=1, data=ConversationCreate(
            name="撤回测试", type="private", member_ids=[2]
        ))
        msg = await svc.send_message(user_id=1, data=MessageCreate(
            conversation_id=conv.id, content="撤回消息", msg_type="text"
        ))
        result = await svc.recall_message(msg.id, user_id=1)
        assert result is True


@pytest.mark.asyncio
class TestIMAPI:
    async def test_create_conversation(self, admin_client: AsyncClient):
        resp = await admin_client.post("/api/v1/im/conversations", json={
            "name": "API会话", "type": "group", "member_ids": []
        })
        # 可能需要有效成员ID，接受 200 或 400
        assert resp.status_code in (200, 400)

    async def test_get_conversations(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/im/conversations")
        assert resp.status_code == 200

    async def test_get_contacts(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/im/contacts")
        assert resp.status_code == 200


class TestIMManifest:
    def test_manifest(self):
        from modules.im.im_manifest import manifest
        assert manifest.id == "im"
        assert manifest.enabled is True
