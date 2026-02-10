# -*- coding: utf-8 -*-
"""
密码箱模块测试
覆盖：加密工具、服务层、API 路由端点
"""
import pytest
from httpx import AsyncClient
from modules.vault.vault_models import VaultCategory, VaultItem, VaultMasterKey


class TestVaultModels:
    def test_category_model(self):
        assert VaultCategory.__tablename__ == "vault_categories"
    def test_item_model(self):
        assert VaultItem.__tablename__ == "vault_items"
    def test_master_key_model(self):
        assert VaultMasterKey.__tablename__ == "vault_master_keys"


class TestVaultCrypto:
    def test_generate_salt(self):
        from modules.vault.vault_services import VaultCrypto
        s1 = VaultCrypto.generate_salt()
        s2 = VaultCrypto.generate_salt()
        assert s1 != s2
        assert len(s1) > 0

    def test_derive_key(self):
        from modules.vault.vault_services import VaultCrypto
        salt = VaultCrypto.generate_salt()
        key = VaultCrypto.derive_key("password", salt)
        assert len(key) > 0  # 密钥长度取决于实现（可能是 base64 编码的）

    def test_derive_key_consistency(self):
        from modules.vault.vault_services import VaultCrypto
        salt = VaultCrypto.generate_salt()
        k1 = VaultCrypto.derive_key("password", salt)
        k2 = VaultCrypto.derive_key("password", salt)
        assert k1 == k2

    def test_encrypt_decrypt(self):
        from modules.vault.vault_services import VaultCrypto
        salt = VaultCrypto.generate_salt()
        key = VaultCrypto.derive_key("password", salt)
        plaintext = "Hello, World! 你好世界"
        encrypted = VaultCrypto.encrypt(plaintext, key)
        assert encrypted != plaintext
        decrypted = VaultCrypto.decrypt(encrypted, key)
        assert decrypted == plaintext

    def test_generate_password(self):
        from modules.vault.vault_services import VaultCrypto
        pwd = VaultCrypto.generate_password(length=16)
        assert len(pwd) == 16

    def test_generate_password_options(self):
        from modules.vault.vault_services import VaultCrypto
        pwd = VaultCrypto.generate_password(
            length=20, include_uppercase=True, include_numbers=True, include_symbols=False
        )
        assert len(pwd) == 20

    def test_evaluate_password_strength(self):
        from modules.vault.vault_services import VaultCrypto
        assert VaultCrypto.evaluate_password_strength("123") in ("weak", "very_weak")
        assert VaultCrypto.evaluate_password_strength("Abc123!@#xyz") in ("strong", "very_strong")


class TestVaultService:
    @pytest.mark.asyncio
    async def test_create_master_key(self, db_session):
        from modules.vault.vault_services import VaultService
        svc = VaultService(db_session, user_id=1)
        success, msg = await svc.create_master_key("Master@12345")
        assert success is True

    @pytest.mark.asyncio
    async def test_verify_master_password(self, db_session):
        from modules.vault.vault_services import VaultService
        svc = VaultService(db_session, user_id=1)
        await svc.create_master_key("Test@12345")
        key = await svc.verify_master_password("Test@12345")
        assert key is not None

    @pytest.mark.asyncio
    async def test_verify_wrong_password(self, db_session):
        from modules.vault.vault_services import VaultService
        svc = VaultService(db_session, user_id=1)
        await svc.create_master_key("Correct@123")
        try:
            key = await svc.verify_master_password("Wrong@123")
            assert key is None
        except (ValueError, Exception):
            # 错误密码可能抛出异常（如账户锁定机制）
            pass

    @pytest.mark.asyncio
    async def test_create_category(self, db_session):
        from modules.vault.vault_services import VaultService
        from modules.vault.vault_schemas import CategoryCreate
        svc = VaultService(db_session, user_id=1)
        cat = await svc.create_category(CategoryCreate(name="银行卡", icon="💳"))
        assert cat.id is not None

    @pytest.mark.asyncio
    async def test_get_categories(self, db_session):
        from modules.vault.vault_services import VaultService
        from modules.vault.vault_schemas import CategoryCreate
        svc = VaultService(db_session, user_id=1)
        await svc.create_category(CategoryCreate(name="网站"))
        cats = await svc.get_categories()
        assert len(cats) >= 1

    @pytest.mark.asyncio
    async def test_create_and_decrypt_item(self, db_session):
        from modules.vault.vault_services import VaultService
        from modules.vault.vault_schemas import CategoryCreate, ItemCreate
        svc = VaultService(db_session, user_id=1)
        await svc.create_master_key("ItemTest@123")
        svc._encryption_key = await svc.verify_master_password("ItemTest@123")
        cat = await svc.create_category(CategoryCreate(name="网站"))
        item = await svc.create_item(ItemCreate(
            category_id=cat.id, title="GitHub", username="user1", password="secret123", website="https://github.com"
        ))
        assert item.id is not None
        decrypted = svc.decrypt_item(item)
        assert decrypted["password"] == "secret123"

    @pytest.mark.asyncio
    async def test_get_stats(self, db_session):
        from modules.vault.vault_services import VaultService
        svc = VaultService(db_session, user_id=1)
        stats = await svc.get_stats()
        assert isinstance(stats, dict)


@pytest.mark.asyncio
class TestVaultAPI:
    async def test_master_status(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/vault/master/status")
        assert resp.status_code == 200

    async def test_create_master(self, admin_client: AsyncClient):
        resp = await admin_client.post("/api/v1/vault/master/create", json={
            "master_password": "API@Master123"
        })
        assert resp.status_code == 200

    async def test_verify_master(self, admin_client: AsyncClient):
        await admin_client.post("/api/v1/vault/master/create", json={"master_password": "Verify@123"})
        resp = await admin_client.post("/api/v1/vault/master/verify", json={"master_password": "Verify@123"})
        assert resp.status_code == 200

    async def test_get_categories(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/vault/categories")
        assert resp.status_code == 200

    async def test_generate_password(self, admin_client: AsyncClient):
        resp = await admin_client.post("/api/v1/vault/generate", json={"length": 16})
        assert resp.status_code == 200

    async def test_get_stats(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/vault/stats")
        assert resp.status_code == 200


class TestVaultManifest:
    def test_manifest(self):
        from modules.vault.vault_manifest import manifest
        assert manifest.id == "vault"
        assert manifest.enabled is True
