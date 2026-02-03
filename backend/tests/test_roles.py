
import pytest
from httpx import AsyncClient

class TestRolesAPI:
    """角色管理 API 测试"""

    @pytest.mark.asyncio
    async def test_list_roles_requires_admin(self, client: AsyncClient):
        """测试获取角色列表需管理员权限"""
        response = await client.get("/api/v1/roles", follow_redirects=True)
        assert response.status_code in [401, 403]

    @pytest.mark.asyncio
    async def test_list_roles_success(self, admin_client: AsyncClient):
        """测试管理员获取角色列表"""
        response = await admin_client.get("/api/v1/roles", follow_redirects=True)
        assert response.status_code == 200
        data = response.json()
        assert data["code"] == 200
        items = data["data"]["items"] if "items" in data["data"] else data["data"]
        
        roles = data["data"]
        assert len(roles) >= 0
        
        if roles:
            first_role = roles[0]
            assert "user_count" in first_role

    @pytest.mark.asyncio
    async def test_create_and_delete_role(self, admin_client: AsyncClient):
        """测试创建和删除角色"""
        # 1. 创建角色
        role_data = {
            "name": "test_role_123",
            "description": "Just a test role",
            "permissions": []
        }
        res_create = await admin_client.post("/api/v1/roles", json=role_data, follow_redirects=True)
        assert res_create.status_code == 200
        new_role = res_create.json()["data"]
        role_id = new_role["id"]

        # 2. 验证列表中存在
        res_list = await admin_client.get("/api/v1/roles", follow_redirects=True)
        roles = res_list.json()["data"]
        assert any(r["id"] == role_id for r in roles)

        # 3. 删除角色
        res_del = await admin_client.delete(f"/api/v1/roles/{role_id}", follow_redirects=True)
        assert res_del.status_code == 200

        # 4. 验证已删除
        res_list_after = await admin_client.get("/api/v1/roles", follow_redirects=True)
        roles_after = res_list_after.json()["data"]
        assert not any(r["id"] == role_id for r in roles_after)
