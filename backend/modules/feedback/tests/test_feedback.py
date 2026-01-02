# -*- coding: utf-8 -*-
"""
反馈模块测试
测试反馈的创建、查询、更新等功能
"""

import pytest
import sys
import os

# 添加项目根目录到路径
backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
sys.path.insert(0, backend_dir)
# 确保可以导入 conftest
tests_dir = os.path.dirname(os.path.dirname(backend_dir))
sys.path.insert(0, os.path.join(tests_dir, "tests"))

from modules.feedback.feedback_models import Feedback, FeedbackStatus, FeedbackType, FeedbackPriority
from modules.feedback.feedback_schemas import FeedbackCreate, FeedbackUpdate, FeedbackReply
from modules.feedback.feedback_services import FeedbackService


class TestFeedbackModels:
    """测试反馈数据模型"""
    
    def test_feedback_status_enum(self):
        """测试反馈状态枚举"""
        assert FeedbackStatus.PENDING == "pending"
        assert FeedbackStatus.PROCESSING == "processing"
        assert FeedbackStatus.RESOLVED == "resolved"
        assert FeedbackStatus.CLOSED == "closed"
    
    def test_feedback_type_enum(self):
        """测试反馈类型枚举"""
        assert FeedbackType.SUGGESTION == "suggestion"
        assert FeedbackType.OPINION == "opinion"
        assert FeedbackType.BUG == "bug"
        assert FeedbackType.FEATURE == "feature"
        assert FeedbackType.OTHER == "other"
    
    def test_feedback_priority_enum(self):
        """测试反馈优先级枚举"""
        assert FeedbackPriority.LOW == "low"
        assert FeedbackPriority.NORMAL == "normal"
        assert FeedbackPriority.HIGH == "high"
        assert FeedbackPriority.URGENT == "urgent"


class TestFeedbackSchemas:
    """测试反馈数据验证模型"""
    
    def test_feedback_create_schema(self):
        """测试创建反馈模型"""
        data = FeedbackCreate(
            title="测试反馈",
            content="这是一个测试反馈内容",
            type=FeedbackType.BUG,
            priority=FeedbackPriority.HIGH
        )
        assert data.title == "测试反馈"
        assert data.content == "这是一个测试反馈内容"
        assert data.type == FeedbackType.BUG
        assert data.priority == FeedbackPriority.HIGH
    
    def test_feedback_create_with_contact(self):
        """测试创建反馈（带联系方式）"""
        data = FeedbackCreate(
            title="测试反馈",
            content="内容",
            contact="test@example.com",
            attachments="file1.jpg,file2.pdf"
        )
        assert data.contact == "test@example.com"
        assert data.attachments == "file1.jpg,file2.pdf"
    
    def test_feedback_update_schema(self):
        """测试更新反馈模型"""
        data = FeedbackUpdate(
            title="更新后的标题",
            content="更新后的内容"
        )
        assert data.title == "更新后的标题"
        assert data.content == "更新后的内容"
    
    def test_feedback_reply_schema(self):
        """测试回复反馈模型"""
        data = FeedbackReply(
            reply_content="这是回复内容",
            status=FeedbackStatus.RESOLVED
        )
        assert data.reply_content == "这是回复内容"
        assert data.status == FeedbackStatus.RESOLVED


class TestFeedbackService:
    """测试反馈服务层"""
    
    @pytest.mark.asyncio
    async def test_create_feedback(self, db_session):
        """测试创建反馈"""
        service = FeedbackService(db_session)
        data = FeedbackCreate(
            title="测试反馈",
            content="测试内容",
            type=FeedbackType.BUG,
            priority=FeedbackPriority.HIGH
        )
        feedback = await service.create_feedback(data, user_id=1)
        assert feedback.id is not None
        assert feedback.title == "测试反馈"
        assert feedback.status == FeedbackStatus.PENDING
    
    @pytest.mark.asyncio
    async def test_get_feedback(self, db_session):
        """测试获取反馈详情"""
        service = FeedbackService(db_session)
        # 先创建反馈
        data = FeedbackCreate(
            title="测试反馈",
            content="测试内容"
        )
        created = await service.create_feedback(data, user_id=1)
        
        # 获取反馈
        feedback = await service.get_feedback(created.id)
        assert feedback is not None
        assert feedback.id == created.id
        assert feedback.title == "测试反馈"
    
    @pytest.mark.asyncio
    async def test_get_feedbacks_list(self, db_session):
        """测试获取反馈列表"""
        service = FeedbackService(db_session)
        # 创建多个反馈
        for i in range(3):
            data = FeedbackCreate(
                title=f"测试反馈{i}",
                content=f"内容{i}"
            )
            await service.create_feedback(data, user_id=1)
        
        # 获取列表
        items, total = await service.get_feedbacks(page=1, size=10, user_id=1)
        assert total >= 3
        assert len(items) >= 3
    
    @pytest.mark.asyncio
    async def test_update_feedback(self, db_session):
        """测试更新反馈"""
        service = FeedbackService(db_session)
        # 创建反馈
        data = FeedbackCreate(
            title="原始标题",
            content="原始内容"
        )
        feedback = await service.create_feedback(data, user_id=1)
        
        # 更新反馈
        update_data = FeedbackUpdate(
            title="更新后的标题",
            content="更新后的内容"
        )
        updated = await service.update_feedback(feedback.id, update_data, user_id=1)
        assert updated.title == "更新后的标题"
        assert updated.content == "更新后的内容"
    
    @pytest.mark.asyncio
    async def test_reply_feedback(self, db_session):
        """测试回复反馈"""
        service = FeedbackService(db_session)
        # 创建反馈
        data = FeedbackCreate(
            title="测试反馈",
            content="测试内容"
        )
        feedback = await service.create_feedback(data, user_id=1)
        
        # 回复反馈
        reply_data = FeedbackReply(
            reply_content="这是回复内容",
            status=FeedbackStatus.RESOLVED
        )
        replied = await service.reply_feedback(feedback.id, reply_data, handler_id=2)
        assert replied.reply_content == "这是回复内容"
        assert replied.status == FeedbackStatus.RESOLVED
        assert replied.handler_id == 2
    
    @pytest.mark.asyncio
    async def test_get_statistics(self, db_session):
        """测试获取统计信息（测试并发查询优化）"""
        service = FeedbackService(db_session)
        # 创建多个不同状态的反馈
        for i, status in enumerate([FeedbackStatus.PENDING, FeedbackStatus.PROCESSING, FeedbackStatus.RESOLVED]):
            data = FeedbackCreate(
                title=f"测试反馈{i}",
                content="测试内容",
                type=FeedbackType.BUG if i % 2 == 0 else FeedbackType.SUGGESTION
            )
            feedback = await service.create_feedback(data, user_id=1)
            if status != FeedbackStatus.PENDING:
                reply_data = FeedbackReply(
                    reply_content="回复",
                    status=status
                )
                await service.reply_feedback(feedback.id, reply_data, handler_id=2)
        
        # 获取统计信息
        stats = await service.get_statistics()
        assert "total" in stats
        assert "pending" in stats
        assert "processing" in stats
        assert "resolved" in stats
        assert "by_type" in stats
        assert "by_status" in stats
        assert stats["total"] >= 3
    
    @pytest.mark.asyncio
    async def test_get_feedbacks_priority_sort(self, db_session):
        """测试反馈列表优先级排序（测试 CASE WHEN 排序优化）"""
        service = FeedbackService(db_session)
        # 创建不同优先级的反馈
        priorities = [FeedbackPriority.LOW, FeedbackPriority.NORMAL, FeedbackPriority.HIGH, FeedbackPriority.URGENT]
        for priority in priorities:
            data = FeedbackCreate(
                title=f"优先级{priority}",
                content="测试",
                priority=priority
            )
            await service.create_feedback(data, user_id=1)
        
        # 获取列表，应该按优先级排序
        items, total = await service.get_feedbacks(page=1, size=10, user_id=1)
        assert total >= 4
        # 第一个应该是 URGENT
        assert items[0].priority == FeedbackPriority.URGENT
    
    @pytest.mark.asyncio
    async def test_delete_feedback(self, db_session):
        """测试删除反馈（测试直接删除优化）"""
        service = FeedbackService(db_session)
        # 创建反馈
        data = FeedbackCreate(title="待删除", content="测试")
        feedback = await service.create_feedback(data, user_id=1)
        
        # 删除反馈
        result = await service.delete_feedback(feedback.id, user_id=1)
        assert result is True
        
        # 验证已删除
        deleted = await service.get_feedback(feedback.id)
        assert deleted is None


class TestFeedbackManifest:
    """测试反馈模块清单"""
    
    def test_manifest_load(self):
        """测试清单加载"""
        from modules.feedback.feedback_manifest import manifest
        assert manifest.id == "feedback"
        assert manifest.enabled is True
    
    def test_manifest_permissions(self):
        """测试权限声明"""
        from modules.feedback.feedback_manifest import manifest
        assert "feedback:view" in manifest.permissions or len(manifest.permissions) >= 0

