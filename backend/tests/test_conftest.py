"""
测试配置和 Fixtures
提供测试用的数据库会话、客户端和通用工具
"""

import os
import sys

# 立即设置测试环境变量，确保核心模块加载时使用测试配置
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("ENV", "test")

import asyncio
from pathlib import Path
from contextlib import asynccontextmanager
from typing import AsyncGenerator, Generator

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

# 确保可以导入项目模块
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.database import Base, engine as global_engine
from core.config import get_settings, reload_settings
import models # 强制加载核心模型以注册 Base.metadata
from main import app

# 注册模块测试插件（由 pytest 统一加载）
pytest_plugins = [
    "modules._template._template_tests._template_conftest",
    "modules.ai.ai_tests.ai_conftest",
    "modules.album.album_tests.album_conftest",
    "modules.analysis.analysis_tests.analysis_conftest",
    "modules.blog.blog_tests.blog_conftest",
    "modules.course.course_tests.course_conftest",
    "modules.datalens.datalens_tests.datalens_conftest",
    "modules.exam.exam_tests.exam_conftest",
    "modules.feedback.feedback_tests.feedback_conftest",
    "modules.filemanager.filemanager_tests.filemanager_conftest",
    "modules.im.im_tests.im_conftest",
    "modules.knowledge.knowledge_tests.knowledge_conftest",
    "modules.lm_cleaner.lm_cleaner_tests.lm_cleaner_conftest",
    "modules.map.map_tests.map_conftest",
    "modules.markdown.markdown_tests.markdown_conftest",
    "modules.notes.notes_tests.notes_conftest",
    "modules.ocr.ocr_tests.ocr_conftest",
    "modules.pdf.pdf_tests.pdf_conftest",
    "modules.schedule.schedule_tests.schedule_conftest",
    "modules.transfer.transfer_tests.transfer_conftest",
    "modules.vault.vault_tests.vault_conftest",
    "modules.video.video_tests.video_conftest",
]

# ==================== 配置 ====================

# 使用全局引擎（已经通过环境变量配置为内存数据库）
# 不再创建独立的 test_engine，避免 SQLite 内存数据库多连接隔离问题
from sqlalchemy import event
import sqlite3

# 注册自定义函数以实现 SQLite 的 json_contains 兼容性
def _sqlite_json_contains(json_array, value):
    if not json_array:
        return False
    try:
        import json
        array = json.loads(json_array)
        try:
            val_int = int(value)
            val_str = str(value)
            return val_int in array or val_str in array
        except:
            return value in array
    except:
        return str(value) in str(json_array)

@event.listens_for(global_engine.sync_engine, "connect")
def _add_sqlite_functions(dbapi_connection, connection_record):
    try:
        dbapi_connection.create_function("json_contains", 2, _sqlite_json_contains)
    except Exception as e:
        print(f"注册 json_contains 失败: {e}")

# 使用全局的会话工厂
from core.database import async_session as TestSessionLocal


# ==================== 测试夹具 (Fixtures) ====================

@pytest_asyncio.fixture(scope="session", autouse=True)
async def cleanup_global_engine():
    """清理全局数据库引擎，防止 Event loop is closed 错误"""
    yield
    # 确保关闭引擎，避免 ResourceWarning
    await global_engine.dispose()
    
    # 彻底停止审计日志刷新和调度器，防止其连接泄露
    from core.audit_utils import AuditLogger
    from core.scheduler import get_scheduler
    try:
        await AuditLogger.stop_auto_flush()
    except:
        pass
    try:
        scheduler = get_scheduler()
        await scheduler.stop()
    except:
        pass
        
    # 尝试关闭缓存
    from core.cache import close_cache
    await close_cache()


@pytest_asyncio.fixture(scope="function")
async def db_session(monkeypatch) -> AsyncGenerator[AsyncSession, None]:
    """
    创建测试用数据库会话
    每个测试函数使用独立的会话，并自动注入到 FastAPI 中
    """
    # 强制清理权限缓存，确保环境干净
    from core.security import invalidate_permission_cache
    invalidate_permission_cache()
    
    # 确保清理之前的状态，不进行刷新直接清空
    from core.audit_utils import AuditLogger
    from core.middleware import request_stats
    
    # 彻底重置审计日志状态
    if AuditLogger._flush_task and not AuditLogger._flush_task.done():
        AuditLogger._flush_task.cancel()
    AuditLogger._log_queue = []
    request_stats.reset()
    
    # 创建所有表
    async with global_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    
    # 创建会话
    session = TestSessionLocal()
    
    try:
        # 重写依赖注入，确保 app 使用测试会话
        from core.database import get_db
        async def _get_test_db():
            yield session
            
        app.dependency_overrides[get_db] = _get_test_db

        # 确保后台任务也使用相同的会话工厂
        from core import database, audit_utils
        
        @asynccontextmanager
        async def _get_test_db_session():
            yield session
            
        monkeypatch.setattr(database, "get_db_session", _get_test_db_session)
        
        yield session
        
    finally:
        await session.rollback()
        await session.close()
        
        # 清理依赖注入及其它状态
        app.dependency_overrides.clear()
        
        # 测试结束后不再尝试刷新，直接清空
        if AuditLogger._flush_task and not AuditLogger._flush_task.done():
            AuditLogger._flush_task.cancel()
        AuditLogger._log_queue = []
    
        # 清理所有表
        async with global_engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)


@pytest.fixture
def db(db_session):
    """db_session 测试夹具的别名"""
    return db_session


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
    
    # 记录原始路径和配置
    old_modules_dir = settings.modules_dir
    old_upload_dir = settings.upload_dir
    old_rate_limit = settings.rate_limit_enabled
    
    # 更新全局配置
    settings.modules_dir = str(modules_dir)
    settings.upload_dir = str(storage_dir)
    settings.rate_limit_enabled = False  # 禁用速率限制
    
    # 同时更新环境变量
    os.environ["MODULES_DIR"] = str(modules_dir)
    os.environ["UPLOAD_DIR"] = str(storage_dir)
    os.environ["RATE_LIMIT_ENABLED"] = "False"
    
    # 重置单例 loader 和 storage
    from core.loader import get_module_loader
    import utils.storage
    utils.storage._storage_manager = None
    
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
    settings.rate_limit_enabled = old_rate_limit
    
    os.environ.pop("MODULES_DIR", None)
    os.environ.pop("UPLOAD_DIR", None)
    os.environ.pop("RATE_LIMIT_ENABLED", None)
    
    # 清理临时目录
    import shutil
    shutil.rmtree(temp_dir)


@pytest_asyncio.fixture(scope="function")
async def client(tmp_workspace, db_session) -> AsyncGenerator[AsyncClient, None]:
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
    """提供登录后的管理员令牌字符串"""
    await create_test_user(db_session, test_admin_data)
    token = await get_auth_token(client, test_admin_data["username"], test_admin_data["password"])
    return token


@pytest_asyncio.fixture(scope="function")
async def admin_client(client: AsyncClient, db_session: AsyncSession, test_admin_data: dict) -> AsyncClient:
    """提供已登录管理员权限的客户端"""
    # 创建管理员
    await create_test_user(db_session, test_admin_data)
    # 登录并获取令牌
    token = await get_auth_token(client, test_admin_data["username"], test_admin_data["password"])
    # 设置请求头
    client.headers["Authorization"] = f"Bearer {token}"
    return client


@pytest_asyncio.fixture(scope="function")
async def user_client(client: AsyncClient, db_session: AsyncSession, test_user_data: dict) -> AsyncClient:
    """提供已登录普通用户权限的客户端"""
    # 创建用户
    await create_test_user(db_session, test_user_data)
    # 登录并获取令牌
    token = await get_auth_token(client, test_user_data["username"], test_user_data["password"])
    # 设置请求头
    client.headers["Authorization"] = f"Bearer {token}"
    return client


# ==================== 工具函数 ====================

@pytest.fixture(autouse=True)
def mock_rate_limiter(monkeypatch):
    """
    全局禁用速率限制，防止测试时出现 429 错误
    """
    from core.rate_limit import rate_limiter
    
    # 定义永远通过的 check 函数
    def mock_check(request):
        return True, {"remaining": 1000, "limit": 1000, "reset": 0}
        
    monkeypatch.setattr(rate_limiter, "check", mock_check)


@pytest.fixture(autouse=True)
def mock_permission_cache(monkeypatch):
    """
    模拟权限缓存，确保跨测试用例隔离
    """
    from core import security
    
    # 使用简单的字典替代 TTLCache，并确保每次测试都清空
    mock_cache = {}
    monkeypatch.setattr(security, "permission_cache", mock_cache)
    
    yield mock_cache
    
    mock_cache.clear()


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
