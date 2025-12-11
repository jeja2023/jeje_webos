"""
安全模块单元测试
"""

import pytest
from datetime import datetime, timedelta

from core.security import (
    hash_password,
    verify_password,
    create_token,
    decode_token,
    TokenData
)


class TestPasswordHashing:
    """密码哈希测试"""
    
    def test_hash_password(self):
        """测试密码哈希生成"""
        password = "TestPassword123"
        hashed = hash_password(password)
        
        assert hashed is not None
        assert hashed != password
        assert len(hashed) > 0
    
    def test_hash_password_different_each_time(self):
        """测试每次哈希结果不同（使用随机盐）"""
        password = "TestPassword123"
        hash1 = hash_password(password)
        hash2 = hash_password(password)
        
        # 由于使用随机盐，两次哈希结果应该不同
        assert hash1 != hash2
    
    def test_verify_password_correct(self):
        """测试正确密码验证"""
        password = "TestPassword123"
        hashed = hash_password(password)
        
        assert verify_password(password, hashed) is True
    
    def test_verify_password_incorrect(self):
        """测试错误密码验证"""
        password = "TestPassword123"
        wrong_password = "WrongPassword456"
        hashed = hash_password(password)
        
        assert verify_password(wrong_password, hashed) is False
    
    def test_verify_password_empty(self):
        """测试空密码验证"""
        password = "TestPassword123"
        hashed = hash_password(password)
        
        assert verify_password("", hashed) is False


class TestJWT:
    """JWT 令牌测试"""
    
    def test_create_token(self):
        """测试创建访问令牌"""
        token_data = TokenData(
            user_id=1,
            username="testuser",
            role="user"
        )
        token = create_token(token_data)
        
        assert token is not None
        assert isinstance(token, str)
        assert len(token) > 0
    
    def test_decode_token_valid(self):
        """测试解码有效令牌"""
        token_data = TokenData(
            user_id=1,
            username="testuser",
            role="admin"
        )
        token = create_token(token_data)
        
        decoded = decode_token(token)
        
        assert decoded is not None
        assert decoded.user_id == 1
        assert decoded.username == "testuser"
        assert decoded.role == "admin"
    
    def test_decode_token_invalid(self):
        """测试解码无效令牌"""
        invalid_token = "invalid.token.here"
        
        token_data = decode_token(invalid_token)
        
        assert token_data is None
    
    def test_decode_token_empty(self):
        """测试解码空令牌"""
        token_data = decode_token("")
        
        assert token_data is None
    
    def test_token_contains_user_info(self):
        """测试令牌包含用户信息"""
        user_id = 42
        username = "specialuser"
        role = "manager"
        
        token_data = TokenData(
            user_id=user_id,
            username=username,
            role=role
        )
        token = create_token(token_data)
        
        decoded = decode_token(token)
        
        assert decoded.user_id == user_id
        assert decoded.username == username
        assert decoded.role == role


class TestTokenData:
    """TokenData 数据类测试"""
    
    def test_token_data_creation(self):
        """测试 TokenData 创建"""
        token_data = TokenData(
            user_id=1,
            username="testuser",
            role="user"
        )
        
        assert token_data.user_id == 1
        assert token_data.username == "testuser"
        assert token_data.role == "user"
    
    def test_token_data_optional_fields(self):
        """测试 TokenData 可选字段"""
        token_data = TokenData(
            user_id=1,
            username="testuser",
            role="user",
            permissions=["read", "write"]
        )
        
        assert token_data.permissions == ["read", "write"]
