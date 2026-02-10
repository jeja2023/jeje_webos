
import pytest
from httpx import AsyncClient
from unittest.mock import patch, MagicMock
from core.config import get_settings

class TestSystemSettingsAPI:
    """系统设置 API 测试"""

    @pytest.mark.asyncio
    async def test_get_settings(self, admin_client: AsyncClient):
        """测试获取系统设置"""
        response = await admin_client.get("/api/v1/system/settings")
        assert response.status_code == 200
        data = response.json()
        assert "jwt_expire_minutes" in data["data"]
        assert "rate_limit_requests" in data["data"]

    @pytest.mark.asyncio
    @patch("core.rate_limit.rate_limiter.configure")

    async def test_update_dynamic_settings(self, mock_configure, admin_client: AsyncClient):
        """测试更新动态配置"""
        
        # 1. 准备新配置
        #    - jwt_expire_minutes 须在 5~1440 范围内（路由层校验）
        #    - 封禁时长须 <= 窗口时长（schema 校验）
        new_settings = {
            "jwt_expire_minutes": 120,
            "rate_limit_requests": 999,
            "rate_limit_window": 60,
            "rate_limit_block_duration": 30
        }
        
        # 2. 调用 API 更新    
        response = await admin_client.put("/api/v1/system/settings", json=new_settings, follow_redirects=True)
        assert response.status_code == 200
        
        # 3. 验证响应
        res_data = response.json()["data"]
        assert res_data["jwt_expire_minutes"] == 120
        assert res_data["rate_limit_requests"] == 999
        
        # 4. 验证 Rate Limiter 收到正确配置
        mock_configure.assert_called_with(
            requests=999,
            window=60,
            block_duration=30
        )
