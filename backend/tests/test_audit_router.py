"""
审计日志 API 测试
"""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession
from models import SystemLog
from datetime import datetime

class TestAuditAPI:
    """审计 API 测试"""

    @pytest.mark.asyncio
    async def test_list_logs_manager(self, admin_client: AsyncClient, db_session: AsyncSession):
        """测试管理员/经理获取审计日志"""
        # 准备一条日志
        log = SystemLog(
            level="INFO",
            module="test",
            action="test_action",
            message="这是一条测试审计日志",
            ip_address="127.0.0.1"
        )
        db_session.add(log)
        await db_session.commit()
        
        response = await admin_client.get("/api/v1/audit")
        assert response.status_code == 200
        data = response.json()
        assert "items" in data["data"]
        assert any(item["message"] == "这是一条测试审计日志" for item in data["data"]["items"])

    @pytest.mark.asyncio
    async def test_list_logs_filter(self, admin_client: AsyncClient, db_session: AsyncSession):
        """测试审计日志筛选"""
        # 准备不同级别的日志
        log1 = SystemLog(level="INFO", module="m1", action="a1", message="info log")
        log2 = SystemLog(level="ERROR", module="m2", action="a2", message="error log")
        db_session.add_all([log1, log2])
        await db_session.commit()
        
        # 筛选 ERROR
        response = await admin_client.get("/api/v1/audit?level=ERROR")
        assert response.status_code == 200
        data = response.json()
        for item in data["data"]["items"]:
            assert item["level"] == "ERROR"

    @pytest.mark.asyncio
    async def test_export_logs(self, admin_client: AsyncClient):
        """测试导出审计日志"""
        response = await admin_client.get("/api/v1/audit/export")
        assert response.status_code == 200
        assert "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" in response.headers["content-type"]

    @pytest.mark.asyncio
    async def test_list_logs_unauthorized(self, user_client: AsyncClient):
        """测试普通用户访问审计日志（未授权）"""
        response = await user_client.get("/api/v1/audit")
        # 审计日志通常需要经理或管理员权限
        assert response.status_code in [403, 401]
