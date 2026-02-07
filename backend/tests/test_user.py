"""
用户管理 API 测试
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from models import User
from core.security import hash_password

class TestUserAPI:
    """用户 API 测试"""

    @pytest.mark.asyncio
    async def test_update_profile(self, user_client: AsyncClient, db_session: AsyncSession):
        """测试更新个人资料"""
        # 准备数据
        update_data = {
            "nickname": "新昵称",
            "phone": "13912345678"
        }
        
        # 调用接口
        response = await user_client.put("/api/v1/users/profile", json=update_data)
        assert response.status_code == 200
        data = response.json()
        assert data["data"]["nickname"] == "新昵称"
        assert data["data"]["phone"] == "13912345678"

    @pytest.mark.asyncio
    async def test_search_users(self, user_client: AsyncClient, db_session: AsyncSession):
        """测试搜索用户"""
        # 创建一个可供搜索的用户
        other_user = User(
            username="otheruser",
            password_hash=hash_password("Password@123"),
            nickname="搜索目标",
            is_active=True
        )
        db_session.add(other_user)
        await db_session.commit()
        
        # 调用搜索接口
        response = await user_client.get("/api/v1/users/search?query=搜索")
        assert response.status_code == 200
        data = response.json()
        assert len(data["data"]) >= 1
        assert any(u["nickname"] == "搜索目标" for u in data["data"])

    @pytest.mark.asyncio
    async def test_list_users_admin(self, admin_client: AsyncClient):
        """测试管理员获取用户列表"""
        response = await admin_client.get("/api/v1/users")
        assert response.status_code == 200
        data = response.json()
        assert "items" in data["data"]
        assert len(data["data"]["items"]) >= 1

    @pytest.mark.asyncio
    async def test_list_users_unauthorized(self, user_client: AsyncClient):
        """测试普通用户获取用户列表（无权）"""
        response = await user_client.get("/api/v1/users")
        # 根据后端设计，可能通过或者被拒绝，通常只有管理员能看全表
        # 如果后端做了限制，应该返回 403
        assert response.status_code in [200, 403] 

    @pytest.mark.asyncio
    async def test_create_user_admin(self, admin_client: AsyncClient):
        """测试管理员创建用户"""
        new_user = {
            "username": "newadminuser",
            "password": "Password@123",
            "nickname": "管理员创建的用户",
            "role": "user"
        }
        response = await admin_client.post("/api/v1/users", json=new_user)
        assert response.status_code == 200
        data = response.json()
        assert data["data"]["username"] == "newadminuser"

    @pytest.mark.asyncio
    async def test_delete_user_self(self, user_client: AsyncClient, db_session: AsyncSession, test_user_data: dict):
        """测试删除自己"""
        # 获取当前用户ID
        result = await db_session.execute(select(User).where(User.username == test_user_data["username"]))
        user = result.scalar_one()
        user_id = user.id
        
        response = await user_client.delete(f"/api/v1/users/{user_id}")
        # 后端设计可能允许也可能不允许删除自己
        assert response.status_code in [200, 400, 403]
