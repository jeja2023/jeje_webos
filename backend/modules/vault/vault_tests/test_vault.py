# -*- coding: utf-8 -*-
"""
密码保险箱单元测试
"""

import pytest
from modules.vault.vault_services import VaultService, VaultCrypto
from modules.vault.vault_schemas import (
    CategoryCreate, CategoryUpdate,
    ItemCreate, ItemUpdate,
    PasswordGenerateRequest
)


class TestVaultCrypto:
    """加密工具测试"""
    
    def test_generate_salt(self):
        """测试生成盐值"""
        salt = VaultCrypto.generate_salt()
        assert len(salt) == 64  # 32字节的十六进制表示
        
        # 确保每次生成的盐值不同
        salt2 = VaultCrypto.generate_salt()
        assert salt != salt2
    
    def test_derive_key(self):
        """测试密钥派生"""
        password = "test_password_123"
        salt = VaultCrypto.generate_salt()
        
        key = VaultCrypto.derive_key(password, salt)
        assert key is not None
        assert len(key) == 44  # Base64编码的32字节密钥
        
        # 相同输入应产生相同密钥
        key2 = VaultCrypto.derive_key(password, salt)
        assert key == key2
        
        # 不同密码应产生不同密钥
        key3 = VaultCrypto.derive_key("different_password", salt)
        assert key != key3
    
    def test_encrypt_decrypt(self):
        """测试加密解密"""
        password = "master_password"
        salt = VaultCrypto.generate_salt()
        key = VaultCrypto.derive_key(password, salt)
        
        plaintext = "这是一个测试密码 test123!@#"
        
        # 加密
        ciphertext = VaultCrypto.encrypt(plaintext, key)
        assert ciphertext != plaintext
        assert len(ciphertext) > 0
        
        # 解密
        decrypted = VaultCrypto.decrypt(ciphertext, key)
        assert decrypted == plaintext
    
    def test_encrypt_empty_string(self):
        """测试空字符串加密"""
        key = VaultCrypto.derive_key("password", VaultCrypto.generate_salt())
        
        result = VaultCrypto.encrypt("", key)
        assert result == ""
        
        result = VaultCrypto.decrypt("", key)
        assert result == ""
    
    def test_generate_password(self):
        """测试密码生成"""
        # 默认参数
        password = VaultCrypto.generate_password()
        assert len(password) == 16
        
        # 自定义长度
        password = VaultCrypto.generate_password(length=24)
        assert len(password) == 24
        
        # 仅小写字母
        password = VaultCrypto.generate_password(
            length=10,
            include_uppercase=False,
            include_numbers=False,
            include_symbols=False
        )
        assert len(password) == 10
        assert password.islower()
    
    def test_evaluate_password_strength(self):
        """测试密码强度评估"""
        # 弱密码
        assert VaultCrypto.evaluate_password_strength("abc") == "weak"
        assert VaultCrypto.evaluate_password_strength("12345678") == "weak"
        
        # 中等密码
        assert VaultCrypto.evaluate_password_strength("Abc12345") == "medium"
        
        # 强密码
        assert VaultCrypto.evaluate_password_strength("Abc12345!@#") == "strong"
        
        # 非常强的密码
        assert VaultCrypto.evaluate_password_strength("Abc12345!@#$%^XYZ") == "very_strong"


class TestVaultService:
    """密码保险箱服务测试"""
    
    @pytest.mark.asyncio
    async def test_create_master_key(self, db_session, sample_user_id):
        """测试创建主密码"""
        service = VaultService(db_session, sample_user_id)
        
        # 初始状态：无主密码
        assert await service.has_master_key() == False
        
        # 创建主密码
        result = await service.create_master_key("MasterPassword123")
        assert result[0] == True
        
        # 现在应该有主密码
        assert await service.has_master_key() == True
    
    @pytest.mark.asyncio
    async def test_verify_master_password(self, db_session, sample_user_id):
        """测试验证主密码"""
        service = VaultService(db_session, sample_user_id)
        
        # 创建主密码
        await service.create_master_key("CorrectPassword123")
        
        # 正确密码
        key = await service.verify_master_password("CorrectPassword123")
        assert key is not None
        
        # 错误密码应抛出异常
        with pytest.raises(ValueError, match="主密码错误"):
            await service.verify_master_password("WrongPassword123")
    
    @pytest.mark.asyncio
    async def test_account_lockout(self, db_session, sample_user_id):
        """测试账户锁定机制"""
        service = VaultService(db_session, sample_user_id)
        
        # 创建主密码
        await service.create_master_key("LockoutTestPass123")
        
        # 连续失败5次
        for i in range(5):
            try:
                await service.verify_master_password("WrongPass123")
            except ValueError as e:
                # 第5次会提示已被锁定
                if i == 4:
                    assert "已被锁定" in str(e)
                else:
                    assert f"还剩 {4-i} 次" in str(e)
        
        # 再次尝试应该会被直接拒绝
        with pytest.raises(ValueError, match="已被锁定"):
            await service.verify_master_password("WrongPass123")
            
        # 即使输入正确密码也应该被拒绝
        with pytest.raises(ValueError, match="已被锁定"):
            await service.verify_master_password("LockoutTestPass123")
            
        # 检查状态
        assert await service.is_master_key_locked() == True

    @pytest.mark.asyncio
    async def test_create_category(self, db_session, sample_user_id):
        """测试创建分类"""
        service = VaultService(db_session, sample_user_id)
        
        data = CategoryCreate(name="工作账户", icon="💼", color="#ff6b6b")
        category = await service.create_category(data)
        
        assert category.id is not None
        assert category.name == "工作账户"
        assert category.icon == "💼"
        assert category.color == "#ff6b6b"
        assert category.user_id == sample_user_id
    
    @pytest.mark.asyncio
    async def test_category_isolation(self, db_session, sample_user_id, another_user_id):
        """测试分类用户隔离"""
        service1 = VaultService(db_session, sample_user_id)
        service2 = VaultService(db_session, another_user_id)
        
        # 用户1创建分类
        data = CategoryCreate(name="用户1的分类")
        cat1 = await service1.create_category(data)
        
        # 用户2创建分类
        data = CategoryCreate(name="用户2的分类")
        cat2 = await service2.create_category(data)
        
        # 用户1只能看到自己的分类
        cats1 = await service1.get_categories()
        assert len(cats1) == 1
        assert cats1[0].name == "用户1的分类"
        
        # 用户2只能看到自己的分类
        cats2 = await service2.get_categories()
        assert len(cats2) == 1
        assert cats2[0].name == "用户2的分类"
    
    @pytest.mark.asyncio
    async def test_create_item(self, db_session, sample_user_id):
        """测试创建密码条目"""
        service = VaultService(db_session, sample_user_id)
        
        # 先创建主密码并解锁
        await service.create_master_key("MasterPass123")
        key = await service.verify_master_password("MasterPass123")
        service.set_encryption_key(key)
        
        # 创建条目
        data = ItemCreate(
            title="GitHub",
            website="https://github.com",
            username="testuser",
            password="secretpass123",
            notes="我的GitHub账户"
        )
        item = await service.create_item(data)
        
        assert item.id is not None
        assert item.title == "GitHub"
        assert item.website == "https://github.com"
        # 敏感数据应该是加密的
        assert item.username_encrypted != "testuser"
        assert item.password_encrypted != "secretpass123"
    
    @pytest.mark.asyncio
    async def test_decrypt_item(self, db_session, sample_user_id):
        """测试解密条目"""
        service = VaultService(db_session, sample_user_id)
        
        # 创建主密码并解锁
        await service.create_master_key("MasterPass123")
        key = await service.verify_master_password("MasterPass123")
        service.set_encryption_key(key)
        
        # 创建条目
        data = ItemCreate(
            title="测试账户",
            username="myuser",
            password="mypass",
            notes="测试备注"
        )
        item = await service.create_item(data)
        
        # 解密
        decrypted = service.decrypt_item(item)
        assert decrypted["username"] == "myuser"
        assert decrypted["password"] == "mypass"
        assert decrypted["notes"] == "测试备注"
    
    @pytest.mark.asyncio
    async def test_change_master_password(self, db_session, sample_user_id):
        """测试修改主密码"""
        service = VaultService(db_session, sample_user_id)
        
        # 创建主密码
        await service.create_master_key("OldPassword123")
        key = await service.verify_master_password("OldPassword123")
        service.set_encryption_key(key)
        
        # 创建一些条目
        data = ItemCreate(title="Test", username="user1", password="pass1")
        await service.create_item(data)
        
        # 修改主密码
        result = await service.change_master_password("OldPassword123", "NewPassword123")
        assert result == True
        
        # 旧密码应该无效
        # verify_master_password 现在会抛出异常而不是返回 None
        with pytest.raises(ValueError, match="主密码错误"):
            await service.verify_master_password("OldPassword123")
        
        # 新密码应该有效
        new_key = await service.verify_master_password("NewPassword123")
        assert new_key is not None
        
        # 使用新密码解密数据应该正常
        service.set_encryption_key(new_key)
        items, _ = await service.get_items()
        decrypted = service.decrypt_item(items[0])
        assert decrypted["username"] == "user1"
        assert decrypted["password"] == "pass1"
    
    @pytest.mark.asyncio
    async def test_get_stats(self, db_session, sample_user_id):
        """测试获取统计信息"""
        service = VaultService(db_session, sample_user_id)
        
        # 创建主密码
        await service.create_master_key("MasterStats123")
        key = await service.verify_master_password("MasterStats123")
        service.set_encryption_key(key)
        
        # 创建分类
        await service.create_category(CategoryCreate(name="分类1"))
        await service.create_category(CategoryCreate(name="分类2"))
        
        # 创建条目
        await service.create_item(ItemCreate(title="Item1", username="u1", password="p1", is_starred=True))
        await service.create_item(ItemCreate(title="Item2", username="u2", password="p2"))
        await service.create_item(ItemCreate(title="Item3", username="u3", password="p3", is_starred=True))
        
        # 获取统计
        stats = await service.get_stats()
        assert stats["total_items"] == 3
        assert stats["starred_items"] == 2
        assert stats["total_categories"] == 2
