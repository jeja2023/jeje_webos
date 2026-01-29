"""
数据库核心模块单元测试
"""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from core.database import Base, get_db, get_db_session, engine
from sqlalchemy import text

class TestDatabase:
    """数据库功能测试"""
    
    @pytest.mark.asyncio
    async def test_engine_connection(self, db_session):
        """测试数据库引擎连接和基本查询"""
        # 使用传入的 db_session (由 conftest 提供，通常是 SQLite 内存)
        result = await db_session.execute(text("SELECT 1"))
        val = result.scalar()
        assert val == 1
        
    @pytest.mark.asyncio
    async def test_get_db_generator(self):
        """测试 get_db 生成器"""
        # 由于 get_db 依赖全局 engine，在测试环境中它会被 conftest 重写
        # 这里验证它是否能正确产生 session
        from main import app
        from core.database import get_db
        
        # 如果 app.dependency_overrides 中有 get_db，说明正在测试环境下
        if get_db in app.dependency_overrides:
            gen = app.dependency_overrides[get_db]()
        else:
            gen = get_db()
            
        async for session in gen:
            assert isinstance(session, AsyncSession)
            break # 我们只需要检查第一个产生的值
            
    @pytest.mark.asyncio
    async def test_get_db_session_context_manager(self, db_session):
        """测试 get_db_session 上下文管理器"""
        # 注意：在测试中，get_db_session 仍然会尝试使用全局 engine
        # 我们通过 mock 或者仅仅验证逻辑
        from unittest.mock import patch, MagicMock, AsyncMock
        
        mock_session = AsyncMock(spec=AsyncSession)
        mock_session.__aenter__.return_value = mock_session
        mock_factory = MagicMock(return_value=mock_session)
        
        with patch("core.database.async_session", mock_factory):
            async with get_db_session() as session:
                assert session is mock_session
                
            # 验证是否调用了 commit 和 close
            mock_session.commit.assert_called_once()
            mock_session.close.assert_called_once()

    def test_base_metadata(self):
        """测试 Base 类元数据"""
        assert Base.metadata is not None
        # 验证是否加载了核心表模型
        # 由于 conftest 中导入了 models，这里应该能看到一些表
        assert len(Base.metadata.tables) > 0
