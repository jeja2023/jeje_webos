"""
缓存核心模块单元测试
覆盖：基本操作、自增自减、模式清除、重试机制、关闭、便捷函数
"""

import pytest
import json
from unittest.mock import patch, MagicMock, AsyncMock
from core.cache import (
    Cache, get_cache, set_cache, delete_cache,
    init_cache, close_cache,
)


class TestCacheBasicOperations:
    """缓存基本操作测试"""
    
    @pytest.mark.asyncio
    async def test_cache_set_get(self):
        """测试缓存设置和获取"""
        mock_redis = AsyncMock()
        mock_redis.get.return_value = json.dumps({"key": "value"})
        mock_redis.ping.return_value = True
        
        with patch("core.cache._redis_client", mock_redis), \
             patch("core.cache.REDIS_AVAILABLE", True):
            
            val = await Cache.get("test_key")
            assert val == {"key": "value"}
            mock_redis.get.assert_called_with("test_key")
            
            await Cache.set("test_key2", "test_value", expire=60)
            mock_redis.setex.assert_called()
            
    @pytest.mark.asyncio
    async def test_cache_delete(self):
        """测试缓存删除"""
        mock_redis = AsyncMock()
        
        with patch("core.cache._redis_client", mock_redis), \
             patch("core.cache.REDIS_AVAILABLE", True):
            
            await Cache.delete("test_key")
            mock_redis.delete.assert_called_with("test_key")

    @pytest.mark.asyncio
    async def test_cache_exists(self):
        """测试缓存键存在检查"""
        mock_redis = AsyncMock()
        mock_redis.exists.return_value = 1
        
        with patch("core.cache._redis_client", mock_redis), \
             patch("core.cache.REDIS_AVAILABLE", True):
            
            exists = await Cache.exists("test_key")
            assert exists is True
            mock_redis.exists.assert_called_with("test_key")

    @pytest.mark.asyncio
    async def test_cache_expire(self):
        """测试设置过期时间"""
        mock_redis = AsyncMock()
        mock_redis.expire.return_value = True
        
        with patch("core.cache._redis_client", mock_redis):
            result = await Cache.expire("test_key", 300)
            assert result is True
            mock_redis.expire.assert_called_with("test_key", 300)

    @pytest.mark.asyncio
    async def test_cache_set_with_timedelta(self):
        """测试使用 timedelta 设置过期"""
        from datetime import timedelta
        mock_redis = AsyncMock()
        
        with patch("core.cache._redis_client", mock_redis):
            await Cache.set("key", "value", expire=timedelta(minutes=5))
            mock_redis.setex.assert_called_once()
            # 检查过期时间是 300 秒
            args = mock_redis.setex.call_args[0]
            assert args[1] == 300

    @pytest.mark.asyncio
    async def test_cache_set_without_expire(self):
        """测试不设置过期时间"""
        mock_redis = AsyncMock()
        
        with patch("core.cache._redis_client", mock_redis):
            await Cache.set("key", "value")
            mock_redis.set.assert_called_once()

    @pytest.mark.asyncio
    async def test_cache_get_nonexistent_key(self):
        """测试获取不存在的键返回默认值"""
        mock_redis = AsyncMock()
        mock_redis.get.return_value = None
        
        with patch("core.cache._redis_client", mock_redis):
            val = await Cache.get("nonexistent", default="fallback")
            assert val == "fallback"

    @pytest.mark.asyncio
    async def test_cache_get_plain_string(self):
        """测试获取非 JSON 字符串"""
        mock_redis = AsyncMock()
        mock_redis.get.return_value = "not_json_value"
        
        with patch("core.cache._redis_client", mock_redis):
            val = await Cache.get("key")
            assert val == "not_json_value"


class TestCacheNoRedis:
    """无 Redis 连接时的降级测试"""

    @pytest.mark.asyncio
    async def test_get_without_redis(self):
        """测试无 Redis 时 get 返回默认值"""
        with patch("core.cache._redis_client", None):
            result = await Cache.get("key", default="default")
            assert result == "default"

    @pytest.mark.asyncio
    async def test_set_without_redis(self):
        """测试无 Redis 时 set 返回 False"""
        with patch("core.cache._redis_client", None):
            result = await Cache.set("key", "value")
            assert result is False

    @pytest.mark.asyncio
    async def test_delete_without_redis(self):
        """测试无 Redis 时 delete 返回 False"""
        with patch("core.cache._redis_client", None):
            result = await Cache.delete("key")
            assert result is False

    @pytest.mark.asyncio
    async def test_exists_without_redis(self):
        """测试无 Redis 时 exists 返回 False"""
        with patch("core.cache._redis_client", None):
            result = await Cache.exists("key")
            assert result is False

    @pytest.mark.asyncio
    async def test_expire_without_redis(self):
        """测试无 Redis 时 expire 返回 False"""
        with patch("core.cache._redis_client", None):
            result = await Cache.expire("key", 60)
            assert result is False

    @pytest.mark.asyncio
    async def test_increment_without_redis(self):
        """测试无 Redis 时 increment 返回 None"""
        with patch("core.cache._redis_client", None):
            result = await Cache.increment("key")
            assert result is None

    @pytest.mark.asyncio
    async def test_decrement_without_redis(self):
        """测试无 Redis 时 decrement 返回 None"""
        with patch("core.cache._redis_client", None):
            result = await Cache.decrement("key")
            assert result is None

    @pytest.mark.asyncio
    async def test_clear_pattern_without_redis(self):
        """测试无 Redis 时 clear_pattern 返回 0"""
        with patch("core.cache._redis_client", None):
            result = await Cache.clear_pattern("prefix:*")
            assert result == 0


class TestCacheIncrementDecrement:
    """自增自减测试"""

    @pytest.mark.asyncio
    async def test_increment(self):
        """测试自增"""
        mock_redis = AsyncMock()
        mock_redis.incrby.return_value = 5
        
        with patch("core.cache._redis_client", mock_redis):
            result = await Cache.increment("counter", 1)
            assert result == 5
            mock_redis.incrby.assert_called_with("counter", 1)

    @pytest.mark.asyncio
    async def test_increment_custom_amount(self):
        """测试自定义自增量"""
        mock_redis = AsyncMock()
        mock_redis.incrby.return_value = 10
        
        with patch("core.cache._redis_client", mock_redis):
            result = await Cache.increment("counter", 5)
            assert result == 10
            mock_redis.incrby.assert_called_with("counter", 5)

    @pytest.mark.asyncio
    async def test_decrement(self):
        """测试自减"""
        mock_redis = AsyncMock()
        mock_redis.decrby.return_value = 3
        
        with patch("core.cache._redis_client", mock_redis):
            result = await Cache.decrement("counter", 1)
            assert result == 3
            mock_redis.decrby.assert_called_with("counter", 1)

    @pytest.mark.asyncio
    async def test_increment_error_handling(self):
        """测试自增异常处理"""
        mock_redis = AsyncMock()
        mock_redis.incrby.side_effect = Exception("Redis error")
        
        with patch("core.cache._redis_client", mock_redis):
            result = await Cache.increment("counter")
            assert result is None

    @pytest.mark.asyncio
    async def test_decrement_error_handling(self):
        """测试自减异常处理"""
        mock_redis = AsyncMock()
        mock_redis.decrby.side_effect = Exception("Redis error")
        
        with patch("core.cache._redis_client", mock_redis):
            result = await Cache.decrement("counter")
            assert result is None


class TestCacheClearPattern:
    """模式清除测试"""

    @pytest.mark.asyncio
    async def test_clear_pattern(self):
        """测试按模式清除缓存"""
        mock_redis = AsyncMock()
        
        # 模拟 scan_iter 返回键
        async def mock_scan_iter(match=None):
            for key in ["prefix:key1", "prefix:key2", "prefix:key3"]:
                yield key
        
        mock_redis.scan_iter = mock_scan_iter
        
        with patch("core.cache._redis_client", mock_redis):
            count = await Cache.clear_pattern("prefix:*")
            assert count == 3
            mock_redis.delete.assert_called_once()

    @pytest.mark.asyncio
    async def test_clear_pattern_large_batch(self):
        """测试大批量模式清除（分批删除）"""
        mock_redis = AsyncMock()
        
        # 模拟超过 100 个键
        async def mock_scan_iter(match=None):
            for i in range(150):
                yield f"key:{i}"
        
        mock_redis.scan_iter = mock_scan_iter
        
        with patch("core.cache._redis_client", mock_redis):
            count = await Cache.clear_pattern("key:*")
            assert count == 150
            # 应该分两批删除（100 + 50）
            assert mock_redis.delete.call_count == 2

    @pytest.mark.asyncio
    async def test_clear_pattern_error(self):
        """测试模式清除异常处理"""
        mock_redis = AsyncMock()
        
        async def mock_scan_iter(match=None):
            raise Exception("Redis error")
            yield  # 使其成为异步生成器
        
        mock_redis.scan_iter = mock_scan_iter
        
        with patch("core.cache._redis_client", mock_redis):
            count = await Cache.clear_pattern("prefix:*")
            assert count == 0


class TestCacheRetry:
    """重试机制测试"""

    @pytest.mark.asyncio
    async def test_retry_on_transient_error(self):
        """测试临时错误时重试"""
        mock_redis = AsyncMock()
        # 第一次失败，第二次成功
        mock_redis.get.side_effect = [Exception("Temporary error"), json.dumps("success")]
        
        with patch("core.cache._redis_client", mock_redis), \
             patch("core.cache.Cache.RETRY_DELAY", 0.001):  # 加速测试
            result = await Cache.get("key")
            assert result == "success"
            assert mock_redis.get.call_count == 2

    @pytest.mark.asyncio
    async def test_retry_all_failed(self):
        """测试所有重试都失败"""
        mock_redis = AsyncMock()
        mock_redis.get.side_effect = Exception("Persistent error")
        
        with patch("core.cache._redis_client", mock_redis), \
             patch("core.cache.Cache.RETRY_DELAY", 0.001):
            result = await Cache.get("key", default="fallback")
            assert result == "fallback"
            # 应该重试 MAX_RETRIES 次
            assert mock_redis.get.call_count == Cache.MAX_RETRIES + 1


class TestCacheInitClose:
    """缓存初始化和关闭测试"""

    @pytest.mark.asyncio
    async def test_init_cache_failure(self):
        """测试初始化失败处理"""
        with patch("redis.asyncio.Redis", side_effect=Exception("Connection Error")), \
             patch("core.cache.REDIS_AVAILABLE", True):
            
            success = await init_cache()
            assert success is False

    @pytest.mark.asyncio
    async def test_close_cache(self):
        """测试关闭缓存"""
        mock_redis = AsyncMock()
        
        with patch("core.cache._redis_client", mock_redis):
            await close_cache()
            mock_redis.close.assert_called_once()

    @pytest.mark.asyncio
    async def test_close_cache_no_client(self):
        """测试无客户端时关闭不报错"""
        with patch("core.cache._redis_client", None):
            await close_cache()  # 不应抛出异常

    @pytest.mark.asyncio
    async def test_init_cache_redis_not_available(self):
        """测试 Redis 库未安装时的处理"""
        with patch("core.cache.REDIS_AVAILABLE", False):
            success = await init_cache()
            assert success is False


class TestConvenienceFunctions:
    """便捷函数测试"""

    @pytest.mark.asyncio
    async def test_get_cache(self):
        """测试 get_cache 便捷函数"""
        mock_redis = AsyncMock()
        mock_redis.get.return_value = "simple_value"
        
        with patch("core.cache._redis_client", mock_redis):
            val = await get_cache("key")
            assert val == "simple_value"

    @pytest.mark.asyncio
    async def test_set_cache(self):
        """测试 set_cache 便捷函数"""
        mock_redis = AsyncMock()
        
        with patch("core.cache._redis_client", mock_redis):
            await set_cache("key", "val")
            mock_redis.set.assert_called()

    @pytest.mark.asyncio
    async def test_delete_cache(self):
        """测试 delete_cache 便捷函数"""
        mock_redis = AsyncMock()
        
        with patch("core.cache._redis_client", mock_redis):
            await delete_cache("key")
            mock_redis.delete.assert_called()
