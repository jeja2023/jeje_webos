"""
缓存核心模块单元测试
"""

import pytest
import json
from unittest.mock import patch, MagicMock, AsyncMock
from core.cache import Cache, get_cache, set_cache, delete_cache, init_cache

class TestCache:
    """缓存功能测试"""
    
    @pytest.mark.asyncio
    async def test_cache_set_get(self):
        """测试缓存设置和获取"""
        mock_redis = AsyncMock()
        mock_redis.get.return_value = json.dumps({"key": "value"})
        mock_redis.ping.return_value = True
        
        with patch("core.cache._redis_client", mock_redis), \
             patch("core.cache.REDIS_AVAILABLE", True):
            
            # 测试获取
            val = await Cache.get("test_key")
            assert val == {"key": "value"}
            mock_redis.get.assert_called_with("test_key")
            
            # 测试设置
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
        """测试缓存连接检查"""
        mock_redis = AsyncMock()
        mock_redis.exists.return_value = 1
        
        with patch("core.cache._redis_client", mock_redis), \
             patch("core.cache.REDIS_AVAILABLE", True):
            
            exists = await Cache.exists("test_key")
            assert exists is True
            mock_redis.exists.assert_called_with("test_key")

    @pytest.mark.asyncio
    async def test_init_cache_faiure(self):
        """测试初始化失败处理"""
        with patch("redis.asyncio.Redis", side_effect=Exception("Connection Error")), \
             patch("core.cache.REDIS_AVAILABLE", True):
            
            success = await init_cache()
            assert success is False

    @pytest.mark.asyncio
    async def test_convenience_functions(self):
        """测试便捷函数"""
        mock_redis = AsyncMock()
        mock_redis.get.return_value = "simple_value"
        
        with patch("core.cache._redis_client", mock_redis), \
             patch("core.cache.REDIS_AVAILABLE", True):
            
            val = await get_cache("key")
            assert val == "simple_value"
            
            await set_cache("key", "val")
            mock_redis.set.assert_called()
            
            await delete_cache("key")
            mock_redis.delete.assert_called()
