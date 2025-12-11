"""
Alembic 迁移环境配置
支持异步数据库和模块动态加载
"""

import asyncio
import sys
from pathlib import Path
from logging.config import fileConfig

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config

from alembic import context

# 确保可以导入项目模块
BACKEND_DIR = Path(__file__).parent.parent.resolve()
sys.path.insert(0, str(BACKEND_DIR))

# 导入配置和模型基类
from core.config import get_settings
from core.database import Base

# 加载所有模型（包括系统模型和模块模型）
# 这是必须的，否则 Alembic 无法检测到表结构
def import_all_models():
    """导入所有模型以便 Alembic 可以检测到"""
    import importlib
    import os
    
    # 1. 导入系统模型
    models_dir = BACKEND_DIR / "models"
    if models_dir.exists():
        for file in models_dir.glob("*.py"):
            if file.name.startswith("_"):
                continue
            module_name = f"models.{file.stem}"
            try:
                importlib.import_module(module_name)
            except Exception as e:
                print(f"警告: 无法导入模型 {module_name}: {e}")
    
    # 2. 导入模块模型
    modules_dir = BACKEND_DIR / "modules"
    if modules_dir.exists():
        for module_dir in modules_dir.iterdir():
            if not module_dir.is_dir() or module_dir.name.startswith("_"):
                continue
            
            models_file = module_dir / f"{module_dir.name}_models.py"
            if models_file.exists():
                module_name = f"modules.{module_dir.name}.{module_dir.name}_models"
                try:
                    importlib.import_module(module_name)
                except Exception as e:
                    print(f"警告: 无法导入模块模型 {module_name}: {e}")

# 导入所有模型
import_all_models()

# Alembic 配置对象
config = context.config

# 设置日志
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# 获取应用配置
settings = get_settings()

# 设置数据库 URL
config.set_main_option("sqlalchemy.url", settings.db_url)

# 目标元数据
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """
    离线模式运行迁移
    
    仅生成 SQL 脚本，不实际执行
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    """执行迁移"""
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        compare_type=True,
        compare_server_default=True,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    """异步运行迁移"""
    # 使用同步 URL（pymysql 而不是 aiomysql）
    sync_url = settings.db_url_sync
    
    configuration = config.get_section(config.config_ini_section)
    configuration["sqlalchemy.url"] = sync_url
    
    # 创建同步引擎
    from sqlalchemy import create_engine
    connectable = create_engine(
        sync_url,
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        do_run_migrations(connection)


def run_migrations_online() -> None:
    """
    在线模式运行迁移
    
    实际连接数据库并执行迁移
    """
    asyncio.run(run_async_migrations())


# 根据环境选择迁移模式
if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()





