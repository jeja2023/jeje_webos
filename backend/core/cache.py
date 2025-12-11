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
    REDIS_AVAILABLE = False
    logging.warning("Redis 未安装，缓存功能将不可用。请运行: pip install redis")

from core.config import get_settings

logger = logging.getLogger(__name__)

_settings = get_settings()
_redis_client: Optional[redis.Redis] = None


async def init_cache():
    """初始化 Redis 连接"""
    global _redis_client
    
    if not REDIS_AVAILABLE:
        logger.warning("Redis 库未安装，缓存功能已禁用")
        return False
    
    try:
        _redis_client = redis.Redis(
            host=_settings.redis_host,
            port=_settings.redis_port,
            db=_settings.redis_db,
            password=_settings.redis_password,  # 支持密码认证
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=5
        )
        # 测试连接
        await _redis_client.ping()
        logger.info(f"Redis 连接成功: {_settings.redis_host}:{_settings.redis_port}")
        return True
    except Exception as e:
        logger.warning(f"Redis 连接失败，缓存功能已禁用: {e}")
        _redis_client = None
        return False


async def close_cache():
    """关闭 Redis 连接"""
    global _redis_client
    if _redis_client:
        await _redis_client.close()
        _redis_client = None
        logger.info("Redis 连接已关闭")


def _ensure_client():
    """确保 Redis 客户端已初始化"""
    if not _redis_client:
        raise RuntimeError("Redis 未初始化，请先调用 init_cache()")


class Cache:
    """缓存操作类"""
    
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
        
        try:
            _ensure_client()
            value = await _redis_client.get(key)
            if value is None:
                return default
            
            # 尝试解析 JSON
            try:
                return json.loads(value)
            except (json.JSONDecodeError, TypeError):
                return value
        except Exception as e:
            logger.error(f"获取缓存失败 {key}: {e}")
            return default
    
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
        
        try:
            _ensure_client()
            
            # 序列化值
            if isinstance(value, (str, int, float, bool)):
                serialized = str(value)
            else:
                serialized = json.dumps(value, ensure_ascii=False)
            
            # 设置过期时间
            if expire is None:
                await _redis_client.set(key, serialized)
            elif isinstance(expire, timedelta):
                await _redis_client.setex(key, int(expire.total_seconds()), serialized)
            else:
                await _redis_client.setex(key, expire, serialized)
            
            return True
        except Exception as e:
            logger.error(f"设置缓存失败 {key}: {e}")
            return False
    
    @staticmethod
    async def delete(key: str) -> bool:
        """
        删除缓存
        
        Args:
            key: 缓存键
        
        Returns:
            是否删除成功
        """
        if not _redis_client:
            return False
        
        try:
            _ensure_client()
            await _redis_client.delete(key)
            return True
        except Exception as e:
            logger.error(f"删除缓存失败 {key}: {e}")
            return False
    
    @staticmethod
    async def exists(key: str) -> bool:
        """
        检查键是否存在
        
        Args:
            key: 缓存键
        
        Returns:
            是否存在
        """
        if not _redis_client:
            return False
        
        try:
            _ensure_client()
            return bool(await _redis_client.exists(key))
        except Exception as e:
            logger.error(f"检查缓存键失败 {key}: {e}")
            return False
    
    @staticmethod
    async def expire(key: str, seconds: int) -> bool:
        """
        设置键的过期时间
        
        Args:
            key: 缓存键
            seconds: 过期秒数
        
        Returns:
            是否设置成功
        """
        if not _redis_client:
            return False
        
        try:
            _ensure_client()
            return bool(await _redis_client.expire(key, seconds))
        except Exception as e:
            logger.error(f"设置过期时间失败 {key}: {e}")
            return False
    
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
            _ensure_client()
            count = 0
            async for key in _redis_client.scan_iter(match=pattern):
                await _redis_client.delete(key)
                count += 1
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
            _ensure_client()
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
            _ensure_client()
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





