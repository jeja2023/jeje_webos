# -*- coding: utf-8 -*-
"""
快传模块测试
覆盖：模型、Schema、服务层、API 路由端点
"""
import pytest
from httpx import AsyncClient
from modules.transfer.transfer_models import TransferSession, TransferHistory, TransferStatus
from modules.transfer.transfer_schemas import SessionCreate


class TestTransferModels:
    def test_session_model(self):
        assert TransferSession.__tablename__ == "transfer_sessions"
    def test_history_model(self):
        assert TransferHistory.__tablename__ == "transfer_history"
    def test_status_enum(self):
        assert TransferStatus.PENDING is not None
        assert TransferStatus.COMPLETED is not None


class TestTransferService:
    @pytest.mark.asyncio
    async def test_generate_session_code(self, db_session):
        from modules.transfer.transfer_services import TransferService
        code = TransferService.generate_session_code()
        assert len(code) == 6
        code2 = TransferService.generate_session_code()
        assert code != code2

    @pytest.mark.asyncio
    async def test_create_session(self, db_session):
        from modules.transfer.transfer_services import TransferService
        session = await TransferService.create_session(db_session, user_id=1, data=SessionCreate(
            file_name="test.pdf", file_size=1024
        ))
        assert session.id is not None
        assert session.session_code is not None

    @pytest.mark.asyncio
    async def test_get_session(self, db_session):
        from modules.transfer.transfer_services import TransferService
        session = await TransferService.create_session(db_session, user_id=1, data=SessionCreate(
            file_name="get.pdf", file_size=512
        ))
        fetched = await TransferService.get_session(db_session, session.session_code)
        assert fetched is not None

    @pytest.mark.asyncio
    async def test_get_active_sessions(self, db_session):
        from modules.transfer.transfer_services import TransferService
        await TransferService.create_session(db_session, user_id=1, data=SessionCreate(
            file_name="active.pdf", file_size=100
        ))
        sessions = await TransferService.get_active_sessions(db_session, user_id=1)
        assert len(sessions) >= 1

    @pytest.mark.asyncio
    async def test_cancel_session(self, db_session):
        from modules.transfer.transfer_services import TransferService
        session = await TransferService.create_session(db_session, user_id=1, data=SessionCreate(
            file_name="cancel.pdf", file_size=100
        ))
        result = await TransferService.cancel_session(db_session, session.session_code, user_id=1)
        assert result is True

    @pytest.mark.asyncio
    async def test_chunk_hash(self, db_session):
        from modules.transfer.transfer_services import ChunkService
        h = ChunkService.calculate_chunk_hash(b"test data")
        assert len(h) > 0


@pytest.mark.asyncio
class TestTransferAPI:
    async def test_get_config(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/transfer/config")
        assert resp.status_code == 200

    async def test_create_session(self, admin_client: AsyncClient):
        resp = await admin_client.post("/api/v1/transfer/session", json={
            "file_name": "api_test.pdf", "file_size": 2048
        })
        assert resp.status_code == 200

    async def test_get_sessions(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/transfer/sessions")
        assert resp.status_code == 200

    async def test_session_lifecycle(self, admin_client: AsyncClient):
        cr = await admin_client.post("/api/v1/transfer/session", json={
            "file_name": "lifecycle.txt", "file_size": 100
        })
        assert cr.status_code == 200
        code = cr.json()["data"]["session_code"]
        get_r = await admin_client.get(f"/api/v1/transfer/session/{code}")
        assert get_r.status_code == 200
        del_r = await admin_client.delete(f"/api/v1/transfer/session/{code}")
        assert del_r.status_code == 200

    async def test_get_history(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/transfer/history")
        assert resp.status_code == 200

    async def test_get_history_stats(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/transfer/history/stats")
        assert resp.status_code == 200


class TestTransferManifest:
    def test_manifest(self):
        from modules.transfer.transfer_manifest import manifest
        assert manifest.id == "transfer"
        assert manifest.enabled is True
