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
# 连接池配置说明：
# - pool_size: 连接池保持的常驻连接数（根据并发量调整）
# - max_overflow: 超出 pool_size 后允许额外创建的连接数
# - pool_recycle: 连接最大存活时间（秒），防止 MySQL 主动断开长连接
# - pool_timeout: 获取连接的最大等待时间（秒），超时抛出异常
# - pool_pre_ping: 使用前检测连接有效性，自动剔除失效连接
engine_kwargs = {
    "echo": False,
    "pool_pre_ping": True,
}

# 仅在 MySQL 时使用连接池和时区设置
if settings.db_url.startswith("mysql"):
    engine_kwargs.update({
        "pool_size": settings.db_pool_size,
        "max_overflow": settings.db_max_overflow,
        "pool_recycle": settings.db_pool_recycle,
        "pool_timeout": 30,
        "connect_args": {
            "init_command": f"SET time_zone = '{settings.db_time_zone}'"
        }
    })
else:
    # SQLite 等其他数据库
    if "sqlite" in settings.db_url:
        engine_kwargs["connect_args"] = {"check_same_thread": False}
        if ":memory:" in settings.db_url:
            from sqlalchemy.pool import StaticPool
            engine_kwargs["poolclass"] = StaticPool

engine = create_async_engine(settings.db_url, **engine_kwargs)


@event.listens_for(engine.sync_engine, "connect")
def _set_session_time_zone(dbapi_connection, connection_record):
    """确保每个连接会话时区一致"""
    try:
        cursor = dbapi_connection.cursor()
        cursor.execute(f"SET time_zone = '{settings.db_time_zone}'")
        cursor.close()
    except Exception:
        # 如果 cursor 不支持上下文管理器或执行失败，忽略
        pass

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
        # finally 块由 async with 上下文管理器自动处理，无需显式调用 close()


from contextlib import asynccontextmanager

@asynccontextmanager
async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """
    获取数据库会话的上下文管理器版本
    用于定时任务或非请求上下文中获取数据库连接
    
    使用示例:
        async with get_db_session() as db:
            result = await db.execute(...)
    """
    async with async_session() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        # finally 块由 async with 上下文管理器自动处理，无需显式调用 close()


async def ensure_database_exists():
    """确保数据库存在，如果不存在则尝试创建"""
    # 检查数据库密码是否配置
    if not settings.db_password:
        logger.error("=" * 60)
        logger.error("❌ 数据库密码未配置！")
        logger.error("")
        logger.error("请在 backend/.env 文件中设置 DB_PASSWORD")
        logger.error("")
        logger.error("示例配置：")
        logger.error("  DB_USER=root")
        logger.error("  DB_PASSWORD=your_mysql_password")
        logger.error("")
        logger.error("如果您的 MySQL root 用户确实没有密码，")
        logger.error("请确保 MySQL 允许无密码连接，或设置一个密码。")
        logger.error("=" * 60)
        raise ValueError("数据库密码未配置，请在 .env 文件中设置 DB_PASSWORD")
    
    # 创建不指定数据库的连接URL（用于创建数据库）
    from sqlalchemy.ext.asyncio import create_async_engine as create_engine
    from urllib.parse import quote_plus
    
    encoded_user = quote_plus(settings.db_user)
    encoded_pwd = quote_plus(settings.db_password)
    admin_url = f"mysql+aiomysql://{encoded_user}:{encoded_pwd}@{settings.db_host}:{settings.db_port}"
    admin_engine = create_engine(
        admin_url,
        echo=False,
        connect_args={
            "init_command": f"SET time_zone = '{settings.db_time_zone}'"
        }
    )

    @event.listens_for(admin_engine.sync_engine, "connect")
    def _set_admin_time_zone(dbapi_connection, connection_record):
        try:
            cursor = dbapi_connection.cursor()
            cursor.execute(f"SET time_zone = '{settings.db_time_zone}'")
            cursor.close()
        except Exception:
            pass
    
    try:
        async with admin_engine.connect() as conn:
            # 检查数据库是否存在（使用参数化查询防止 SQL 注入）
            result = await conn.execute(
                text("SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = :db_name"),
                {"db_name": settings.db_name}
            )
            exists = result.fetchone() is not None
            
            if not exists:
                logger.info(f"数据库 '{settings.db_name}' 不存在，正在创建...")
                try:
                    # 创建数据库（DDL 不支持参数化，但 db_name 来自受信配置文件，非用户输入）
                    # 使用标识符引用确保安全
                    safe_db_name = settings.db_name.replace('`', '``')
                    await conn.execute(text(f"CREATE DATABASE `{safe_db_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"))
                    await conn.commit()
                    logger.info(f"数据库 '{settings.db_name}' 创建成功")
                except Exception as create_error:
                    # 如果创建失败（权限不足），记录错误
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
        # 检查是否是权限问题，记录错误信息
        error_msg = str(e)
        if "Access denied" in error_msg or "1045" in error_msg:
            logger.error("=" * 60)
            logger.error("❌ MySQL 数据库访问被拒绝")
            logger.error("")
            logger.error("可能的原因：")
            logger.error("  1. 数据库密码错误")
            logger.error("  2. 数据库用户不存在或没有权限")
            logger.error("  3. MySQL 服务未启动")
            logger.error("")
            logger.error("请检查 backend/.env 文件中的配置：")
            logger.error(f"  DB_USER={settings.db_user}")
            logger.error(f"  DB_PASSWORD={'*' * len(settings.db_password) if settings.db_password else '(未设置)'}")
            logger.error(f"  DB_HOST={settings.db_host}")
            logger.error(f"  DB_PORT={settings.db_port}")
            logger.error("")
            logger.error("如果密码正确但仍无法连接，请检查：")
            logger.error("  - MySQL 服务是否正在运行")
            logger.error("  - 用户是否有足够的权限")
            logger.error("  - 防火墙是否阻止了连接")
            logger.error("=" * 60)
        elif "Can't connect to MySQL server" in error_msg:
            logger.error("=" * 60)
            logger.error("❌ 无法连接到 MySQL 服务器")
            logger.error("")
            logger.error("请检查：")
            logger.error(f"  1. MySQL 服务是否已启动（主机: {settings.db_host}, 端口: {settings.db_port}）")
            logger.error("  2. 主机和端口配置是否正确")
            logger.error("  3. 防火墙是否允许连接")
            logger.error("=" * 60)
        elif "Unknown database" in error_msg:
            logger.error(f"❌ 找不到指定数据库: {settings.db_name}")
            logger.error("请检查 DB_NAME 配置是否正确")
        else:
            logger.error(f"❌ 检查/创建数据库失败: {e}")
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


def get_pool_status() -> dict:
    """
    获取数据库连接池状态
    
    Returns:
        包含连接池健康指标的字典
    """
    pool = engine.pool
    
    # 基础指标
    status = {
        "pool_size": pool.size(),           # 当前连接池大小
        "checked_in": pool.checkedin(),     # 可用（空闲）连接数
        "checked_out": pool.checkedout(),   # 正在使用的连接数
        "overflow": pool.overflow(),         # 溢出连接数
        "invalid": pool.invalidatedcount() if hasattr(pool, 'invalidatedcount') else 0,  # 失效连接数
    }
    
    # 计算健康状态
    total_capacity = settings.db_pool_size + settings.db_max_overflow
    usage_ratio = status["checked_out"] / total_capacity if total_capacity > 0 else 0
    
    if usage_ratio < 0.5:
        status["health"] = "healthy"
    elif usage_ratio < 0.8:
        status["health"] = "warning"
    else:
        status["health"] = "critical"
    
    status["usage_percent"] = round(usage_ratio * 100, 1)
    status["max_capacity"] = total_capacity
    
    return status