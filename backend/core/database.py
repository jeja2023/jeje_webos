"""
数据库连接管理
提供异步数据库连接和会话管理
"""

import logging
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text, event
from typing import AsyncGenerator

from .config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

# 创建异步引擎（初始化会话时区）
engine = create_async_engine(
    settings.db_url,
    echo=False,  # 禁用 SQL 详细输出，避免日志过多
    pool_pre_ping=True,
    pool_size=10,
    max_overflow=20,
    connect_args={
        "init_command": f"SET time_zone = '{settings.db_time_zone}'"
    }
)


@event.listens_for(engine.sync_engine, "connect")
def _set_session_time_zone(dbapi_connection, connection_record):
    """确保每个连接会话时区一致"""
    with dbapi_connection.cursor() as cursor:
        cursor.execute(f"SET time_zone = '{settings.db_time_zone}'")

# 会话工厂
async_session = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False
)


class Base(DeclarativeBase):
    """模型基类"""
    pass


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """获取数据库会话（依赖注入用）"""
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def ensure_database_exists():
    """确保数据库存在，如果不存在则尝试创建"""
    # 创建不指定数据库的连接URL（用于创建数据库）
    from sqlalchemy.ext.asyncio import create_async_engine as create_engine
    admin_url = f"mysql+aiomysql://{settings.db_user}:{settings.db_password}@{settings.db_host}:{settings.db_port}"
    admin_engine = create_engine(
        admin_url,
        echo=False,
        connect_args={
            "init_command": f"SET time_zone = '{settings.db_time_zone}'"
        }
    )

    @event.listens_for(admin_engine.sync_engine, "connect")
    def _set_admin_time_zone(dbapi_connection, connection_record):
        with dbapi_connection.cursor() as cursor:
            cursor.execute(f"SET time_zone = '{settings.db_time_zone}'")
    
    try:
        async with admin_engine.connect() as conn:
            # 检查数据库是否存在
            result = await conn.execute(
                text(f"SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = '{settings.db_name}'")
            )
            exists = result.fetchone() is not None
            
            if not exists:
                logger.info(f"数据库 '{settings.db_name}' 不存在，正在创建...")
                try:
                    # 尝试创建数据库
                    await conn.execute(text(f"CREATE DATABASE `{settings.db_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"))
                    await conn.commit()
                    logger.info(f"数据库 '{settings.db_name}' 创建成功")
                except Exception as create_error:
                    # 如果创建失败（权限不足），给出提示
                    error_msg = str(create_error)
                    if "Access denied" in error_msg or "1044" in error_msg:
                        logger.error(f"用户 '{settings.db_user}' 没有创建数据库的权限")
                        logger.error(f"请使用以下 SQL 手动创建数据库：")
                        logger.error(f"  CREATE DATABASE {settings.db_name} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;")
                        logger.error(f"  GRANT ALL PRIVILEGES ON {settings.db_name}.* TO '{settings.db_user}'@'localhost';")
                        logger.error(f"  FLUSH PRIVILEGES;")
                    raise
            else:
                logger.debug(f"数据库 '{settings.db_name}' 已存在")
    except Exception as e:
        # 检查是否是权限问题，给出更友好的提示
        error_msg = str(e)
        if "Access denied" not in error_msg:
            logger.error(f"检查/创建数据库失败: {e}")
        raise
    finally:
        await admin_engine.dispose()


async def init_db():
    """初始化数据库（创建所有表）"""
    from sqlalchemy.exc import OperationalError, ProgrammingError
    from sqlalchemy import inspect
    from sqlalchemy.schema import CreateTable, CreateIndex
    
    # 确保数据库存在
    await ensure_database_exists()
    
    # 逐表、逐索引创建，忽略已存在错误
    async with engine.begin() as conn:
        def create_tables_safe(connection):
            inspector = inspect(connection)
            existing_tables = set(inspector.get_table_names())
            created_tables = []
            skipped_tables = []
            
            # 先创建表结构（不含索引）
            for table in Base.metadata.sorted_tables:
                if table.name in existing_tables:
                    logger.debug(f"表已存在: {table.name}")
                    skipped_tables.append(table.name)
                    continue
                
                try:
                    # 只创建表结构
                    connection.execute(CreateTable(table, if_not_exists=False))
                    created_tables.append(table.name)
                    logger.debug(f"创建表: {table.name}")
                except (OperationalError, ProgrammingError) as e:
                    if "1050" in str(e) or "already exists" in str(e):
                        logger.debug(f"表已存在，跳过: {table.name}")
                        skipped_tables.append(table.name)
                    else:
                        logger.error(f"创建表失败 {table.name}: {e}")
                        raise
            
            # 然后创建索引（允许失败）
            for table in Base.metadata.sorted_tables:
                for index in table.indexes:
                    try:
                        connection.execute(CreateIndex(index, if_not_exists=False))
                        logger.debug(f"创建索引: {index.name}")
                    except (OperationalError, ProgrammingError) as e:
                        # 忽略索引已存在的错误
                        if "1061" in str(e) or "Duplicate key" in str(e):
                            logger.debug(f"索引已存在，跳过: {index.name}")
                        else:
                            # 其他错误也警告但不中断
                            logger.warning(f"创建索引失败（已忽略）{index.name}: {e}")
            
            logger.debug(f"数据库表初始化完成（创建: {len(created_tables)}, 跳过: {len(skipped_tables)}）")
        
        await conn.run_sync(create_tables_safe)


async def close_db():
    """关闭数据库连接"""
    await engine.dispose()


