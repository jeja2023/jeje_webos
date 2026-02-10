# -*- coding: utf-8 -*-
"""
反馈模块测试
覆盖：模型、Schema、服务层 CRUD、API 路由端点
"""
import pytest
from httpx import AsyncClient
from modules.feedback.feedback_models import Feedback, FeedbackStatus, FeedbackType, FeedbackPriority
from modules.feedback.feedback_schemas import FeedbackCreate, FeedbackReply


class TestFeedbackModels:
    def test_model(self):
        assert "feedback" in Feedback.__tablename__
    def test_status_enum(self):
        assert FeedbackStatus.PENDING is not None
        assert FeedbackStatus.RESOLVED is not None
    def test_type_enum(self):
        assert FeedbackType.BUG is not None
        assert FeedbackType.SUGGESTION is not None
    def test_priority_enum(self):
        assert FeedbackPriority.LOW is not None
        assert FeedbackPriority.URGENT is not None


class TestFeedbackSchemas:
    def test_create(self):
        d = FeedbackCreate(title="BUG反馈", content="页面崩溃", type="bug", priority="high")
        assert d.title == "BUG反馈"
    def test_reply(self):
        d = FeedbackReply(reply_content="已修复", status="resolved")
        assert d.reply_content == "已修复"


@pytest.mark.asyncio
class TestFeedbackAPI:
    async def test_create_feedback(self, admin_client: AsyncClient):
        resp = await admin_client.post("/api/v1/feedback", json={
            "title": "API反馈", "content": "测试内容", "type": "suggestion", "priority": "normal"
        })
        assert resp.status_code == 200

    async def test_get_my_feedbacks(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/feedback/my")
        assert resp.status_code == 200

    async def test_get_feedbacks(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/feedback")
        assert resp.status_code == 200

    async def test_feedback_lifecycle(self, admin_client: AsyncClient):
        """反馈完整生命周期"""
        cr = await admin_client.post("/api/v1/feedback", json={
            "title": "生命周期", "content": "测试", "type": "bug", "priority": "high"
        })
        assert cr.status_code == 200
        fid = cr.json()["data"]["id"]
        get_r = await admin_client.get(f"/api/v1/feedback/{fid}")
        assert get_r.status_code == 200
        reply_r = await admin_client.post(f"/api/v1/feedback/{fid}/reply", json={
            "reply_content": "已修复", "status": "resolved"
        })
        assert reply_r.status_code == 200

    async def test_admin_get_all(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/feedback/admin/all")
        assert resp.status_code == 200

    async def test_admin_statistics(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/feedback/admin/statistics")
        assert resp.status_code == 200

    async def test_delete_feedback(self, admin_client: AsyncClient):
        cr = await admin_client.post("/api/v1/feedback", json={
            "title": "待删除", "content": "x", "type": "other"
        })
        assert cr.status_code == 200
        fid = cr.json()["data"]["id"]
        resp = await admin_client.delete(f"/api/v1/feedback/{fid}")
        assert resp.status_code == 200


class TestFeedbackManifest:
    def test_manifest(self):
        from modules.feedback.feedback_manifest import manifest
        assert manifest.id == "feedback"
        assert manifest.enabled is True
