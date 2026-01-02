"""
通知系统测试
"""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from models.notification import Notification
from models.account import User
from core.security import hash_password


class TestNotificationModel:
    """测试通知模型"""
    
    def test_notification_table_name(self):
        """测试通知表名"""
        assert Notification.__tablename__ == "sys_notifications"
    
    def test_notification_fields(self):
        """测试通知字段"""
        assert hasattr(Notification, 'id')
        assert hasattr(Notification, 'user_id')
        assert hasattr(Notification, 'title')
        assert hasattr(Notification, 'content')
        assert hasattr(Notification, 'type')
        assert hasattr(Notification, 'is_read')


class TestNotificationService:
    """测试通知服务层"""
    
    @pytest.mark.asyncio
    async def test_create_notification(self, db_session: AsyncSession):
        """测试创建通知"""
        # 创建测试用户
        user = User(
            username="testuser",
            password_hash=hash_password("test123"),
            phone="13800138001",
            nickname="测试用户",
            role="user",
            is_active=True
        )
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)
        
        # 创建通知
        notification = Notification(
            user_id=user.id,
            sender_id=None,
            title="测试通知",
            content="这是测试通知内容",
            type="info"
        )
        db_session.add(notification)
        await db_session.commit()
        await db_session.refresh(notification)
        
        assert notification.id is not None
        assert notification.title == "测试通知"
        assert notification.is_read == False
    
    @pytest.mark.asyncio
    async def test_mark_notification_as_read(self, db_session: AsyncSession):
        """测试标记通知为已读"""
        # 创建测试用户
        user = User(
            username="testuser2",
            password_hash=hash_password("test123"),
            phone="13800138002",
            nickname="测试用户2",
            role="user",
            is_active=True
        )
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)
        
        # 创建通知
        notification = Notification(
            user_id=user.id,
            title="测试通知",
            content="测试内容",
            type="info"
        )
        db_session.add(notification)
        await db_session.commit()
        await db_session.refresh(notification)
        
        # 标记为已读
        from datetime import datetime, timezone
        notification.is_read = True
        notification.read_at = datetime.now(timezone.utc)
        await db_session.commit()
        await db_session.refresh(notification)
        
        assert notification.is_read == True
        assert notification.read_at is not None

