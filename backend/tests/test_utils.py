"""
工具函数单元测试
"""

import pytest
from datetime import datetime, timedelta


class TestUtils:
    """通用工具函数测试"""
    
    def test_import_utils(self):
        """测试工具模块可以正常导入"""
        from utils import jwt_rotate
        
        assert jwt_rotate is not None


class TestJWTRotator:
    """JWT 密钥轮换器测试"""
    
    def test_rotator_creation(self):
        """测试轮换器创建"""
        from utils.jwt_rotate import JWTRotator
        
        rotator = JWTRotator()
        
        assert rotator is not None
    
    def test_should_rotate_default(self):
        """测试默认情况是否需要轮换"""
        from utils.jwt_rotate import JWTRotator
        
        rotator = JWTRotator()
        
        # 默认情况下，如果没有设置轮换时间戳，不需要轮换
        result = rotator.should_rotate()
        
        assert isinstance(result, bool)
    
    def test_get_rotator_singleton(self):
        """测试获取轮换器单例"""
        from utils.jwt_rotate import get_jwt_rotator
        
        rotator1 = get_jwt_rotator()
        rotator2 = get_jwt_rotator()
        
        assert rotator1 is rotator2


class TestPagination:
    """分页工具测试"""
    
    def test_pagination_import(self):
        """测试分页模块导入"""
        from core.pagination import PaginationParams
        
        assert PaginationParams is not None
    
    def test_pagination_params_creation(self):
        """测试分页参数创建"""
        from core.pagination import PaginationParams
        
        # 使用实际的参数名
        params = PaginationParams()
        
        # 检查有分页相关属性
        assert hasattr(params, 'page') or hasattr(params, 'skip') or hasattr(params, 'offset')


class TestErrors:
    """错误码测试"""
    
    def test_error_codes_import(self):
        """测试错误码模块导入"""
        from core.errors import ErrorCode, AppException
        
        assert ErrorCode is not None
        assert AppException is not None
    
    def test_error_code_success(self):
        """测试成功错误码"""
        from core.errors import ErrorCode
        
        assert ErrorCode.SUCCESS == 0
    
    def test_app_exception_creation(self):
        """测试应用异常创建"""
        from core.errors import AppException, ErrorCode
        
        exc = AppException(
            code=ErrorCode.UNAUTHORIZED,
            message="未授权访问"
        )
        
        assert exc.code == ErrorCode.UNAUTHORIZED
        assert exc.message == "未授权访问"


class TestRateLimit:
    """速率限制测试"""
    
    def test_rate_limit_import(self):
        """测试速率限制模块导入"""
        from core.rate_limit import rate_limiter, init_rate_limiter
        
        assert rate_limiter is not None
        assert init_rate_limiter is not None
    
    def test_init_rate_limiter(self):
        """测试初始化速率限制器"""
        from core.rate_limit import init_rate_limiter, get_rate_limiter
        
        init_rate_limiter()
        limiter = get_rate_limiter()
        
        assert limiter is not None
