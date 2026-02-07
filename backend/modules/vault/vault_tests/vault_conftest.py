# -*- coding: utf-8 -*-
"""
密码保险箱测试夹具和配置
"""
import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.pool import StaticPool
from core.database import Base

@pytest_asyncio.fixture
async def db_session():
    """创建测试用数据库会话"""
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    
    async with async_session() as session:
        yield session
    
    await engine.dispose()

@pytest.fixture
def sample_user_id():
    """测试用用户ID"""
    return 1

@pytest.fixture
def another_user_id():
    """另一个测试用用户ID"""
    return 2

# from tests.tests_conftest import *
