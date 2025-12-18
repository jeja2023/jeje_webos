"""
应用市场 API 单元测试
测试包上传、冲突处理和权限控制
"""

import io
import json
import zipfile
import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
class TestMarketAPI:
    """应用市场 API 测试"""

    def create_dummy_package(self, module_id: str, name: str = "Test Module"):
        """创建内存中的伪装包"""
        content = f"""
from core.loader import ModuleManifest
manifest = ModuleManifest(
    id="{module_id}",
    name="{name}",
    version="1.0.0",
    author="Tester",
    description="Test description",
    enabled=True,
    router_prefix="/api/v1/{module_id}",
    menu={{"title": "{name}", "icon": "test", "path": "/{module_id}"}}
)
"""
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, "w") as zf:
            zf.writestr(f"{module_id}/{module_id}_manifest.py", content)
            zf.writestr(f"{module_id}/__init__.py", "")
            zf.writestr(f"{module_id}/{module_id}_router.py", "from fastapi import APIRouter\nrouter = APIRouter()")
            
        buf.seek(0)
        return buf

    async def test_upload_package_admin_required(self, user_client: AsyncClient, tmp_workspace):
        """测试上传包需要管理员权限"""
        files = {"file": ("test.jwapp", b"fake content")}
        response = await user_client.post("/api/v1/system/market/upload", files=files)
        assert response.status_code == 403

    async def test_upload_package_success(self, admin_token: str, client: AsyncClient, tmp_workspace):
        """测试成功上传包"""
        mod_id = "mod_success"
        pkg_buf = self.create_dummy_package(mod_id, name="Success Mod")
        files = {"file": (f"{mod_id}.jwapp", pkg_buf, "application/octet-stream")}
        
        response = await client.post(
            "/api/v1/system/market/upload", 
            files=files,
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert data["data"]["module_id"] == mod_id
        assert data["data"]["is_overwrite"] is False

    async def test_upload_package_conflict(self, admin_token: str, client: AsyncClient, tmp_workspace):
        """测试上传已存在的包导致冲突"""
        mod_id = "mod_conflict"
        # 第一遍上传
        pkg_buf = self.create_dummy_package(mod_id)
        files = {"file": (f"{mod_id}.jwapp", pkg_buf, "application/octet-stream")}
        await client.post(
            "/api/v1/system/market/upload", 
            files=files,
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        # 第二遍上传（未设置 force）
        pkg_buf2 = self.create_dummy_package(mod_id)
        files2 = {"file": (f"{mod_id}.jwapp", pkg_buf2, "application/octet-stream")}
        response = await client.post(
            "/api/v1/system/market/upload", 
            files=files2,
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        data = response.json()
        if response.status_code != 409:
            print(f"Unexpected status {response.status_code}: {data}")
        
        # 验证错误详情（现在结构为 code/message/data）
        assert response.status_code == 409
        assert "message" in data, f"Response missing 'message': {data}"
        assert "已存在" in data["message"]
        assert data["data"]["module_id"] == mod_id

    async def test_upload_package_force_overwrite(self, admin_token: str, client: AsyncClient, tmp_workspace):
        """测试强制覆盖上传"""
        mod_id = "mod_force"
        # 第一遍上传
        pkg_buf = self.create_dummy_package(mod_id)
        files = {"file": (f"{mod_id}.jwapp", pkg_buf, "application/octet-stream")}
        await client.post(
            "/api/v1/system/market/upload", 
            files=files,
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        # 第二遍上传（设置 force=true）
        pkg_buf2 = self.create_dummy_package(mod_id)
        files2 = {"file": (f"{mod_id}.jwapp", pkg_buf2, "application/octet-stream")}
        response = await client.post(
            "/api/v1/system/market/upload", 
            params={"force": "true"}, 
            files=files2,
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["data"]["is_overwrite"] is True
