"""
通知系统 API 测试
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models import Notification, User
from core.security import hash_password

class TestNotificationAPI:
    """通知 API 测试"""

    @pytest.mark.asyncio
    async def test_list_notifications(self, user_client: AsyncClient, db_session: AsyncSession, test_user_data: dict):
        """测试获取通知列表"""
        # 获取当前用户
        result = await db_session.execute(select(User).where(User.username == test_user_data["username"]))
        user = result.scalar_one()
        
        # 创建一个通知
        n = Notification(
            user_id=user.id,
            title="测试通知",
            content="内容",
            type="info"
        )
        db_session.add(n)
        await db_session.commit()
        
        response = await user_client.get("/api/v1/notification")
        assert response.status_code == 200
        data = response.json()
        assert "items" in data["data"]
        assert any(item["title"] == "测试通知" for item in data["data"]["items"])

    @pytest.mark.asyncio
    async def test_get_unread_count(self, user_client: AsyncClient, db_session: AsyncSession, test_user_data: dict):
        """测试获取未读数量"""
        result = await db_session.execute(select(User).where(User.username == test_user_data["username"]))
        user = result.scalar_one()
        
        n = Notification(user_id=user.id, title="未读1", content="c", type="info", is_read=False)
        db_session.add(n)
        await db_session.commit()
        
        response = await user_client.get("/api/v1/notification/unread-count")
        assert response.status_code == 200
        assert response.json()["data"]["count"] >= 1

    @pytest.mark.asyncio
    async def test_mark_as_read(self, user_client: AsyncClient, db_session: AsyncSession, test_user_data: dict):
        """测试标记已读"""
        result = await db_session.execute(select(User).where(User.username == test_user_data["username"]))
        user = result.scalar_one()
        
        n = Notification(user_id=user.id, title="待读", content="c", type="info", is_read=False)
        db_session.add(n)
        await db_session.commit()
        await db_session.refresh(n)
        
        response = await user_client.put(f"/api/v1/notification/{n.id}/read")
        assert response.status_code == 200
        
        # 验证数据库状态
        result = await db_session.execute(select(Notification).where(Notification.id == n.id))
        notif = result.scalar_one()
        assert notif.is_read is True

    @pytest.mark.asyncio
    async def test_delete_notification(self, user_client: AsyncClient, db_session: AsyncSession, test_user_data: dict):
        """测试删除通知"""
        result = await db_session.execute(select(User).where(User.username == test_user_data["username"]))
        user = result.scalar_one()
        
        n = Notification(user_id=user.id, title="待删", content="c", type="info")
        db_session.add(n)
        await db_session.commit()
        await db_session.refresh(n)
        
        response = await user_client.delete(f"/api/v1/notification/{n.id}")
        assert response.status_code == 200
        
        result = await db_session.execute(select(Notification).where(Notification.id == n.id))
        assert result.scalar_one_or_none() is None
