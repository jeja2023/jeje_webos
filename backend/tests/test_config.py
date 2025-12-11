"""
核心配置模块单元测试
"""

import pytest
from core.config import Settings, get_settings, reload_settings


class TestSettings:
    """配置类测试"""
    
    def test_default_settings_structure(self):
        """测试配置类结构"""
        settings = Settings(
            db_password="test",
            admin_phone="13800138000"
        )
        
        # 测试配置类属性存在
        assert hasattr(settings, 'app_name')
        assert hasattr(settings, 'app_version')
        assert hasattr(settings, 'debug')
        assert hasattr(settings, 'db_host')
        assert hasattr(settings, 'jwt_secret')
    
    def test_custom_settings(self):
        """测试自定义配置值"""
        settings = Settings(
            app_name="Test App",
            app_version="2.0.0",
            debug=True,
            db_password="test"
        )
        
        assert settings.app_name == "Test App"
        assert settings.app_version == "2.0.0"
        assert settings.debug is True
    
    def test_db_url_generation(self):
        """测试数据库 URL 生成"""
        settings = Settings(
            db_host="127.0.0.1",
            db_port=3307,
            db_user="test",
            db_password="testpass",
            db_name="testdb"
        )
        
        expected_url = "mysql+aiomysql://test:testpass@127.0.0.1:3307/testdb"
        assert settings.db_url == expected_url
    
    def test_redis_url_generation(self):
        """测试 Redis URL 生成"""
        settings = Settings(
            redis_host="127.0.0.1",
            redis_port=6380,
            redis_db=1
        )
        
        expected_url = "redis://127.0.0.1:6380/1"
        assert settings.redis_url == expected_url
    
    def test_get_settings_singleton(self):
        """测试配置单例模式"""
        settings1 = get_settings()
        settings2 = get_settings()
        
        assert settings1 is settings2
    
    def test_reload_settings(self):
        """测试配置重新加载"""
        settings1 = get_settings()
        settings2 = reload_settings()
        
        # 重新加载后应该是新实例
        assert settings1 is not settings2


class TestJWTConfig:
    """JWT 配置测试"""
    
    def test_default_jwt_settings(self):
        """测试默认 JWT 配置"""
        settings = Settings()
        
        assert settings.jwt_expire_minutes == 60 * 24 * 7  # 7天
        assert settings.jwt_auto_rotate is True
        assert settings.jwt_rotate_interval_min == 25
        assert settings.jwt_rotate_interval_max == 35
    
    def test_jwt_custom_settings(self):
        """测试自定义 JWT 配置"""
        settings = Settings(
            jwt_secret="custom-secret",
            jwt_expire_minutes=1440,  # 1天
            jwt_auto_rotate=False
        )
        
        assert settings.jwt_secret == "custom-secret"
        assert settings.jwt_expire_minutes == 1440
        assert settings.jwt_auto_rotate is False
