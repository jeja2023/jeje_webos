"""
测试配置和 Fixtures
提供测试用的数据库会话、客户端和通用工具
"""

import os
import sys
import asyncio
from pathlib import Path
from typing import AsyncGenerator, Generator

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

# 确保可以导入项目模块
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.database import Base
from core.config import get_settings, reload_settings
from main import app

# Mock 审计日志，防止测试中尝试连接 MySQL
from unittest.mock import patch, MagicMock, AsyncMock
patch("core.audit_utils.log_audit", new_callable=AsyncMock).start()
patch("core.audit_utils.AuditLogger.log", new_callable=AsyncMock).start()


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
    每个测试函数使用独立的会话，并自动注入到 FastAPI 中
    """
    # 创建所有表
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # 创建会话
    async with TestSessionLocal() as session:
        # 重写依赖注入，确保 app 使用测试会话
        from core.database import get_db
        async def _get_test_db():
            yield session
            
        app.dependency_overrides[get_db] = _get_test_db
        
        yield session
        await session.rollback()
        
        # 清理依赖注入
        app.dependency_overrides.clear()
    
    # 清理所有表
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture(scope="function")
async def tmp_workspace(tmp_path) -> AsyncGenerator[dict, None]:
    """
    创建临时工作区（storage/modules）
    隔离测试产生的文件
    """
    settings = get_settings()
    
    # 创建临时目录
    temp_dir = tmp_path / "test_workspace"
    temp_dir.mkdir()
    modules_dir = temp_dir / "modules"
    storage_dir = temp_dir / "storage"
    modules_dir.mkdir()
    storage_dir.mkdir()
    
    # 记录原始路径
    old_modules_dir = settings.modules_dir
    # 更新全局配置
    old_modules_dir = settings.modules_dir
    old_upload_dir = settings.upload_dir
    settings.modules_dir = str(modules_dir)
    settings.upload_dir = str(storage_dir)
    
    # 同时更新环境变量，确保 Pydantic 重新加载时也能识别（部分组件可能重新调用 get_settings）
    os.environ["MODULES_DIR"] = str(modules_dir)
    os.environ["UPLOAD_DIR"] = str(storage_dir)
    
    # 重置单例 loader
    from core.loader import get_module_loader, init_loader
    loader = get_module_loader()
    if loader:
        loader.modules_path = Path(str(modules_dir))
        loader._states = {}
        loader.modules = {}
        loader._state_file = Path(str(temp_dir / "module_states.json"))
        
    yield {
        "temp_dir": temp_dir,
        "modules_dir": modules_dir,
        "storage_dir": storage_dir
    }
    
    # 恢复配置
    settings.modules_dir = old_modules_dir
    settings.upload_dir = old_upload_dir
    os.environ.pop("MODULES_DIR", None)
    os.environ.pop("UPLOAD_DIR", None)
    
    # 清理临时目录
    import shutil
    shutil.rmtree(temp_dir)


@pytest_asyncio.fixture(scope="function")
async def client(tmp_workspace) -> AsyncGenerator[AsyncClient, None]:
    """
    创建异步测试客户端
    依赖 tmp_workspace 以确保隔离
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


@pytest_asyncio.fixture(scope="function")
async def admin_token(client: AsyncClient, db_session: AsyncSession, test_admin_data: dict) -> str:
    """提供登录后的管理员 Token 字符串"""
    await create_test_user(db_session, test_admin_data)
    token = await get_auth_token(client, test_admin_data["username"], test_admin_data["password"])
    return token


@pytest_asyncio.fixture(scope="function")
async def admin_client(client: AsyncClient, db_session: AsyncSession, test_admin_data: dict) -> AsyncClient:
    """提供已登录管理员权限的客户端"""
    # 创建管理员
    await create_test_user(db_session, test_admin_data)
    # 登录并获取 token
    token = await get_auth_token(client, test_admin_data["username"], test_admin_data["password"])
    # 设置 header
    client.headers["Authorization"] = f"Bearer {token}"
    return client


@pytest_asyncio.fixture(scope="function")
async def user_client(client: AsyncClient, db_session: AsyncSession, test_user_data: dict) -> AsyncClient:
    """提供已登录普通用户权限的客户端"""
    # 创建用户
    await create_test_user(db_session, test_user_data)
    # 登录并获取 token
    token = await get_auth_token(client, test_user_data["username"], test_user_data["password"])
    # 设置 header
    client.headers["Authorization"] = f"Bearer {token}"
    return client


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
