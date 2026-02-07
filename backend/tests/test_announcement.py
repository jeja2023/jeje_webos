"""
公告系统 API 测试
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from models import Announcement, User
from utils.timezone import get_beijing_time
from sqlalchemy import select

class TestAnnouncementAPI:
    """公告 API 测试"""

    @pytest.mark.asyncio
    async def test_create_announcement(self, admin_client: AsyncClient):
        """测试管理员创建公告"""
        data = {
            "title": "测试公告",
            "content": "这是一条测试公告的内容",
            "type": "info",
            "is_published": True
        }
        response = await admin_client.post("/api/v1/announcements", json=data)
        assert response.status_code == 200
        res_data = response.json()
        assert res_data["data"]["title"] == "测试公告"

    @pytest.mark.asyncio
    async def test_list_published_announcements(self, admin_client: AsyncClient, client: AsyncClient, db_session: AsyncSession, test_admin_data: dict):
        """测试获取已发布的公告（公开接口）"""
        # admin_client 确保了管理员用户已创建
        result = await db_session.execute(select(User).where(User.username == test_admin_data["username"]))
        admin = result.scalar_one()
        
        # 准备已发布公告
        a = Announcement(
            title="公开公告",
            content="内容",
            type="info",
            is_published=True,
            author_id=admin.id,
            created_at=get_beijing_time()
        )
        db_session.add(a)
        await db_session.commit()
        
        # 修正路径：/public -> /published
        response = await client.get("/api/v1/announcements/published")
        assert response.status_code == 200
        res_data = response.json()
        assert len(res_data["data"]) >= 1

    @pytest.mark.asyncio
    async def test_get_announcement_detail(self, admin_client: AsyncClient, user_client: AsyncClient, db_session: AsyncSession, test_admin_data: dict):
        """测试获取公告详情"""
        # admin_client 确保了管理员用户已创建
        result = await db_session.execute(select(User).where(User.username == test_admin_data["username"]))
        admin = result.scalar_one()
        
        a = Announcement(
            title="详情公告",
            content="详情内容",
            type="info",
            is_published=True,
            author_id=admin.id,
            created_at=get_beijing_time()
        )
        db_session.add(a)
        await db_session.commit()
        await db_session.refresh(a)
        
        response = await user_client.get(f"/api/v1/announcements/{a.id}")
        assert response.status_code == 200
        assert response.json()["data"]["title"] == "详情公告"

    @pytest.mark.asyncio
    async def test_update_announcement(self, admin_client: AsyncClient, db_session: AsyncSession, test_admin_data: dict):
        """测试更新公告"""
        result = await db_session.execute(select(User).where(User.username == test_admin_data["username"]))
        admin = result.scalar_one()
        
        a = Announcement(
            title="旧标题",
            content="旧内容",
            type="info",
            is_published=False,
            author_id=admin.id,
            created_at=get_beijing_time()
        )
        db_session.add(a)
        await db_session.commit()
        await db_session.refresh(a)
        
        update_data = {"title": "新标题", "is_published": True}
        response = await admin_client.put(f"/api/v1/announcements/{a.id}", json=update_data)
        assert response.status_code == 200
        assert response.json()["data"]["title"] == "新标题"
        assert response.json()["data"]["is_published"] is True

    @pytest.mark.asyncio
    async def test_delete_announcement(self, admin_client: AsyncClient, db_session: AsyncSession, test_admin_data: dict):
        """测试删除公告"""
        result = await db_session.execute(select(User).where(User.username == test_admin_data["username"]))
        admin = result.scalar_one()
        
        a = Announcement(
            title="待删除公告",
            content="内容",
            type="info",
            is_published=False,
            author_id=admin.id,
            created_at=get_beijing_time()
        )
        db_session.add(a)
        await db_session.commit()
        await db_session.refresh(a)
        
        response = await admin_client.delete(f"/api/v1/announcements/{a.id}")
        assert response.status_code == 200
        
        # 验证已删除
        result = await db_session.execute(select(Announcement).where(Announcement.id == a.id))
        assert result.scalar_one_or_none() is None
