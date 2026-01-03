# -*- coding: utf-8 -*-
"""
快传模块测试
测试传输会话、历史记录等功能
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

from modules.transfer.transfer_models import TransferSession, TransferHistory, TransferStatus, TransferDirection
from modules.transfer.transfer_schemas import SessionCreate


class TestTransferModels:
    """测试快传数据模型"""
    
    def test_transfer_session_model(self):
        """测试传输会话模型"""
        assert TransferSession.__tablename__ == "transfer_sessions"
    
    def test_transfer_history_model(self):
        """测试传输历史模型"""
        assert TransferHistory.__tablename__ == "transfer_history"
    
    def test_transfer_status_enum(self):
        """测试传输状态枚举"""
        assert TransferStatus.PENDING == "pending"
        assert TransferStatus.CONNECTED == "connected"
        assert TransferStatus.TRANSFERRING == "transferring"
        assert TransferStatus.COMPLETED == "completed"
        assert TransferStatus.CANCELLED == "cancelled"
        assert TransferStatus.EXPIRED == "expired"
        assert TransferStatus.FAILED == "failed"
    
    def test_transfer_direction_enum(self):
        """测试传输方向枚举"""
        assert TransferDirection.SEND == "send"
        assert TransferDirection.RECEIVE == "receive"


class TestTransferSchemas:
    """测试快传数据验证模型"""
    
    def test_session_create_schema(self):
        """测试创建会话模型"""
        data = SessionCreate(
            file_name="test.txt",
            file_size=1024,
            file_type="text/plain"
        )
        assert data.file_name == "test.txt"
        assert data.file_size == 1024
        assert data.file_type == "text/plain"


class TestTransferService:
    """测试快传服务层"""
    
    @pytest.mark.asyncio
    async def test_create_session(self, db_session):
        """测试创建传输会话"""
        from modules.transfer.transfer_services import TransferService
        service = TransferService(db_session)
        data = SessionCreate(
            file_name="test.txt",
            file_size=1024,
            file_type="text/plain"
        )
        session = await service.create_session(data, sender_id=1)
        assert session.id is not None
        assert session.file_name == "test.txt"
        assert session.status == TransferStatus.PENDING.value
    
    @pytest.mark.asyncio
    async def test_get_session_by_code(self, db_session):
        """测试通过会话码获取会话"""
        from modules.transfer.transfer_services import TransferService
        service = TransferService(db_session)
        # 先创建会话
        data = SessionCreate(
            file_name="test.txt",
            file_size=1024
        )
        created = await service.create_session(data, sender_id=1)
        
        # 通过会话码获取
        session = await service.get_session_by_code(created.session_code)
        assert session is not None
        assert session.id == created.id
    
    @pytest.mark.asyncio
    async def test_update_session_status(self, db_session):
        """测试更新会话状态（测试直接更新优化）"""
        from modules.transfer.transfer_services import TransferService
        from modules.transfer.transfer_models import TransferStatus
        # 创建会话
        data = SessionCreate(
            file_name="test.txt",
            file_size=1024,
            file_type="text/plain",
            device_info="test device"
        )
        session = await TransferService.create_session(db_session, user_id=1, data=data)
        
        # 更新状态
        updated = await TransferService.update_session_status(
            db_session,
            session.session_code,
            TransferStatus.CONNECTED
        )
        assert updated is not None
        assert updated.status == TransferStatus.CONNECTED.value
    
    @pytest.mark.asyncio
    async def test_update_transfer_progress(self, db_session):
        """测试更新传输进度（测试直接更新优化）"""
        from modules.transfer.transfer_services import TransferService
        from modules.transfer.transfer_models import TransferStatus
        # 创建会话
        data = SessionCreate(
            file_name="test.txt",
            file_size=2048,
            file_type="text/plain",
            device_info="test device"
        )
        session = await TransferService.create_session(db_session, user_id=1, data=data)
        
        # 更新进度
        updated = await TransferService.update_transfer_progress(
            db_session,
            session.session_code,
            transferred_bytes=1024,
            completed_chunks=1
        )
        assert updated is not None
        assert updated.transferred_bytes == 1024
        assert updated.completed_chunks == 1
        # 如果状态是 CONNECTED，应该自动更新为 TRANSFERRING
        if session.status == TransferStatus.CONNECTED.value:
            assert updated.status == TransferStatus.TRANSFERRING.value
    
    @pytest.mark.asyncio
    async def test_generate_session_code(self, db_session):
        """测试生成会话码（测试优化后的生成方法）"""
        from modules.transfer.transfer_services import TransferService
        # 生成多个会话码，验证唯一性
        codes = set()
        for _ in range(10):
            code = TransferService.generate_session_code()
            assert len(code) == 6
            assert code.isdigit()
            codes.add(code)
        # 验证生成的码是唯一的（概率很高）
        assert len(codes) == 10
    
    @pytest.mark.asyncio
    async def test_cancel_session(self, db_session):
        """测试取消会话（测试直接更新优化）"""
        from modules.transfer.transfer_services import TransferService
        from modules.transfer.transfer_models import TransferStatus
        # 创建会话
        data = SessionCreate(
            file_name="test.txt",
            file_size=1024,
            file_type="text/plain",
            device_info="test device"
        )
        session = await TransferService.create_session(db_session, user_id=1, data=data)
        
        # 取消会话
        result = await TransferService.cancel_session(
            db_session,
            session.session_code,
            user_id=1
        )
        assert result is True
        
        # 验证状态已更新
        cancelled = await TransferService.get_session(db_session, session.session_code)
        assert cancelled.status == TransferStatus.CANCELLED.value


class TestTransferManifest:
    """测试快传模块清单"""
    
    def test_manifest_load(self):
        """测试清单加载"""
        from modules.transfer.transfer_manifest import manifest
        assert manifest.id == "transfer"
        assert manifest.enabled is True

