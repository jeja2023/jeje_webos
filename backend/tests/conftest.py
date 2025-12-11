"""
测试配置和 Fixtures
提供测试用的数据库会话、客户端和通用工具
"""

import os
import sys
import asyncio
from typing import AsyncGenerator, Generator

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

# 确保可以导入项目模块
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.database import Base
from core.config import get_settings
from main import app


# ==================== 配置 ====================

# 使用 SQLite 内存数据库进行测试
TEST_DATABASE_URL = "sqlite+aiosqlite:///:memory:"

# 创建测试用引擎
test_engine = create_async_engine(
    TEST_DATABASE_URL,
    echo=False,
    connect_args={"check_same_thread": False}
)

# 测试用会话工厂
TestSessionLocal = async_sessionmaker(
    test_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)


# ==================== Fixtures ====================

@pytest.fixture(scope="session")
def event_loop() -> Generator:
    """创建事件循环"""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="function")
async def db_session() -> AsyncGenerator[AsyncSession, None]:
    """
    创建测试用数据库会话
    每个测试函数使用独立的会话
    """
    # 创建所有表
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # 创建会话
    async with TestSessionLocal() as session:
        yield session
        await session.rollback()
    
    # 清理所有表
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture(scope="function")
async def client() -> AsyncGenerator[AsyncClient, None]:
    """
    创建异步测试客户端
    """
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def test_user_data() -> dict:
    """测试用户数据"""
    return {
        "username": "testuser",
        "password": "Test@123456",
        "phone": "13800138001",
        "nickname": "测试用户"
    }


@pytest.fixture
def test_admin_data() -> dict:
    """测试管理员数据"""
    return {
        "username": "testadmin",
        "password": "Admin@123456",
        "phone": "13800138000",
        "nickname": "测试管理员",
        "role": "admin"
    }


# ==================== 工具函数 ====================

async def create_test_user(session: AsyncSession, user_data: dict) -> dict:
    """
    创建测试用户并返回用户信息
    """
    from models import User
    from core.security import hash_password
    
    user = User(
        username=user_data["username"],
        password_hash=hash_password(user_data["password"]),
        phone=user_data.get("phone", "13800138001"),
        nickname=user_data.get("nickname", "测试用户"),
        role=user_data.get("role", "user"),
        is_active=True
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    
    return {
        "id": user.id,
        "username": user.username,
        "role": user.role
    }


async def get_auth_token(client: AsyncClient, username: str, password: str) -> str:
    """
    获取认证令牌
    """
    response = await client.post(
        "/api/v1/auth/login",
        json={"username": username, "password": password}
    )
    if response.status_code == 200:
        return response.json()["data"]["access_token"]
    return ""
