"""
Redis 缓存系统
提供统一的缓存接口
"""

import json
import logging
from typing import Optional, Any, Union
from datetime import timedelta

try:
    import redis.asyncio as redis
    REDIS_AVAILABLE = True
except ImportError:
    redis = None  # type: ignore
    REDIS_AVAILABLE = False
    logging.warning("Redis 未安装，缓存功能将不可用。请运行: pip install redis")

from core.config import get_settings

logger = logging.getLogger(__name__)

_redis_client: Optional[Any] = None  # redis.Redis 或 None


async def init_cache():
    """初始化 Redis 连接"""
    global _redis_client
    
    if not REDIS_AVAILABLE:
        logger.warning("Redis 库未安装，缓存功能已禁用")
        return False
    
    try:
        settings = get_settings()
        # 处理空密码情况
        redis_password = settings.redis_password or None
        
        _redis_client = redis.Redis(
            host=settings.redis_host,
            port=settings.redis_port,
            db=settings.redis_db,
            password=redis_password,  # 支持密码认证
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=5
        )
        # 测试连接
        await _redis_client.ping()
        logger.info(f"Redis 连接成功: {settings.redis_host}:{settings.redis_port}")
        return True
    except Exception as e:
        error_msg = str(e)
        if "Client sent AUTH, but no password is set" in error_msg:
            error_msg = "客户端发送了认证请求，但服务端未设置密码（请检查配置文件中的 REDIS_PASSWORD 是否为空）"
        elif "Authentication required" in error_msg:
            error_msg = "需要认证（请在配置文件中设置 REDIS_PASSWORD）"
        elif "Connection refused" in error_msg:
            error_msg = "连接被拒绝（请检查 Redis 服务是否启动）"
            
        logger.warning(f"Redis 连接失败，缓存功能已禁用: {error_msg}")
        _redis_client = None
        return False


async def close_cache():
    """关闭 Redis 连接"""
    global _redis_client
    if _redis_client:
        await _redis_client.close()
        _redis_client = None
        logger.info("Redis 连接已关闭")


class Cache:
    """缓存操作类（内置重试机制）"""
    
    # 重试配置
    MAX_RETRIES = 2
    RETRY_DELAY = 0.1  # 秒
    
    @staticmethod
    async def _retry_operation(operation, key: str, default=None):
        """带重试的操作执行器"""
        import asyncio
        last_error = None
        for attempt in range(Cache.MAX_RETRIES + 1):
            try:
                return await operation()
            except Exception as e:
                last_error = e
                if attempt < Cache.MAX_RETRIES:
                    await asyncio.sleep(Cache.RETRY_DELAY * (attempt + 1))
                else:
                    logger.error(f"缓存操作失败 {key}（已重试 {Cache.MAX_RETRIES} 次）: {e}")
        return default
    
    @staticmethod
    async def get(key: str, default: Any = None) -> Any:
        """
        获取缓存值
        
        Args:
            key: 缓存键
            default: 默认值（如果键不存在）
        
        Returns:
            缓存值或默认值
        """
        if not _redis_client:
            return default
        
        async def _do():
            value = await _redis_client.get(key)
            if value is None:
                return default
            try:
                return json.loads(value)
            except (json.JSONDecodeError, TypeError):
                return value
        
        return await Cache._retry_operation(_do, key, default)
    
    @staticmethod
    async def set(
        key: str,
        value: Any,
        expire: Optional[Union[int, timedelta]] = None
    ) -> bool:
        """
        设置缓存值
        
        Args:
            key: 缓存键
            value: 缓存值（会自动序列化为 JSON）
            expire: 过期时间（秒或 timedelta 对象）
        
        Returns:
            是否设置成功
        """
        if not _redis_client:
            return False
        
        async def _do():
            # 序列化值：统一使用 json.dumps，避免字符串被误解析为 bool/int
            # 例如 value="true" 应该返回字符串，而不是布尔值 True
            serialized = json.dumps(value, ensure_ascii=False)
            
            # 设置过期时间
            if expire is None:
                await _redis_client.set(key, serialized)
            elif isinstance(expire, timedelta):
                await _redis_client.setex(key, int(expire.total_seconds()), serialized)
            else:
                await _redis_client.setex(key, expire, serialized)
            
            return True
        
        result = await Cache._retry_operation(_do, key, False)
        return result if result is not None else False
    
    @staticmethod
    async def delete(key: str) -> bool:
        """
        删除缓存（带重试机制，与 get/set 保持一致）
        
        Args:
            key: 缓存键
        
        Returns:
            是否删除成功
        """
        if not _redis_client:
            return False
        
        async def _do():
            await _redis_client.delete(key)
            return True
        
        result = await Cache._retry_operation(_do, key, False)
        return result if result is not None else False
    
    @staticmethod
    async def exists(key: str) -> bool:
        """
        检查键是否存在（带重试机制）
        
        Args:
            key: 缓存键
        
        Returns:
            是否存在
        """
        if not _redis_client:
            return False
        
        async def _do():
            return bool(await _redis_client.exists(key))
        
        result = await Cache._retry_operation(_do, key, False)
        return result if result is not None else False
    
    @staticmethod
    async def expire(key: str, seconds: int) -> bool:
        """
        设置键的过期时间（带重试机制）
        
        Args:
            key: 缓存键
            seconds: 过期秒数
        
        Returns:
            是否设置成功
        """
        if not _redis_client:
            return False
        
        async def _do():
            return bool(await _redis_client.expire(key, seconds))
        
        result = await Cache._retry_operation(_do, key, False)
        return result if result is not None else False
    
    @staticmethod
    async def clear_pattern(pattern: str) -> int:
        """
        按模式删除缓存键
        
        Args:
            pattern: 键模式（支持 * 通配符）
        
        Returns:
            删除的键数量
        """
        if not _redis_client:
            return 0
        
        try:
            count = 0
            keys_batch = []
            async for key in _redis_client.scan_iter(match=pattern):
                keys_batch.append(key)
                # 批量删除，减少网络往返
                if len(keys_batch) >= 100:
                    await _redis_client.delete(*keys_batch)
                    count += len(keys_batch)
                    keys_batch = []
            if keys_batch:
                await _redis_client.delete(*keys_batch)
                count += len(keys_batch)
            return count
        except Exception as e:
            logger.error(f"按模式删除缓存失败 {pattern}: {e}")
            return 0
    
    @staticmethod
    async def increment(key: str, amount: int = 1) -> Optional[int]:
        """
        递增数值
        
        Args:
            key: 缓存键
            amount: 递增数量
        
        Returns:
            递增后的值，失败返回 None
        """
        if not _redis_client:
            return None
        
        try:
            return await _redis_client.incrby(key, amount)
        except Exception as e:
            logger.error(f"递增缓存失败 {key}: {e}")
            return None
    
    @staticmethod
    async def decrement(key: str, amount: int = 1) -> Optional[int]:
        """
        递减数值
        
        Args:
            key: 缓存键
            amount: 递减数量
        
        Returns:
            递减后的值，失败返回 None
        """
        if not _redis_client:
            return None
        
        try:
            return await _redis_client.decrby(key, amount)
        except Exception as e:
            logger.error(f"递减缓存失败 {key}: {e}")
            return None


# 便捷函数
async def get_cache(key: str, default: Any = None) -> Any:
    """获取缓存"""
    return await Cache.get(key, default)


async def set_cache(key: str, value: Any, expire: Optional[int] = None) -> bool:
    """设置缓存"""
    return await Cache.set(key, value, expire)


async def delete_cache(key: str) -> bool:
    """删除缓存"""
    return await Cache.delete(key)





