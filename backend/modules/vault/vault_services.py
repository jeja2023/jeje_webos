# -*- coding: utf-8 -*-
"""
密码保险箱业务逻辑
包含AES加密/解密、主密码验证等核心功能
"""

import os
import base64
import hashlib
import secrets
import string
from typing import List, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete, and_, update
from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from .vault_models import VaultCategory, VaultItem, VaultMasterKey
from .vault_schemas import (
    CategoryCreate, CategoryUpdate,
    ItemCreate, ItemUpdate,
    PasswordGenerateRequest
)
from utils.timezone import get_beijing_time


class VaultCrypto:
    """加密工具类"""
    
    # 验证字符串（用于验证主密码是否正确）
    VERIFICATION_STRING = "JEJE_VAULT_VERIFY_2026"
    
    @staticmethod
    def generate_salt() -> str:
        """生成随机盐值"""
        return secrets.token_hex(32)
    
    @staticmethod
    def derive_key(password: str, salt: str) -> bytes:
        """从主密码派生加密密钥"""
        salt_bytes = bytes.fromhex(salt)
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=salt_bytes,
            iterations=480000,  # OWASP推荐的迭代次数
        )
        key = kdf.derive(password.encode('utf-8'))
        return base64.urlsafe_b64encode(key)
    
    @staticmethod
    def hash_password(password: str, salt: str) -> str:
        """哈希主密码（用于存储验证）"""
        salted = f"{salt}{password}{salt}".encode('utf-8')
        return hashlib.sha256(salted).hexdigest()
    
    @staticmethod
    def encrypt(plaintext: str, key: bytes) -> str:
        """使用Fernet加密文本"""
        if not plaintext:
            return ""
        fernet = Fernet(key)
        encrypted = fernet.encrypt(plaintext.encode('utf-8'))
        return base64.urlsafe_b64encode(encrypted).decode('utf-8')
    
    @staticmethod
    def decrypt(ciphertext: str, key: bytes) -> str:
        """使用Fernet解密文本"""
        if not ciphertext:
            return ""
        try:
            fernet = Fernet(key)
            encrypted = base64.urlsafe_b64decode(ciphertext.encode('utf-8'))
            decrypted = fernet.decrypt(encrypted)
            return decrypted.decode('utf-8')
        except Exception:
            return "[解密失败]"
    
    @staticmethod
    def generate_password(
        length: int = 16,
        include_uppercase: bool = True,
        include_lowercase: bool = True,
        include_numbers: bool = True,
        include_symbols: bool = True,
        exclude_ambiguous: bool = False
    ) -> str:
        """生成随机密码"""
        chars = ""
        
        if include_uppercase:
            chars += string.ascii_uppercase
        if include_lowercase:
            chars += string.ascii_lowercase
        if include_numbers:
            chars += string.digits
        if include_symbols:
            chars += "!@#$%^&*()_+-=[]{}|;:,.<>?"
        
        if exclude_ambiguous:
            # 排除易混淆字符
            ambiguous = "0O1lI|"
            chars = ''.join(c for c in chars if c not in ambiguous)
        
        if not chars:
            chars = string.ascii_letters + string.digits
        
        return ''.join(secrets.choice(chars) for _ in range(length))
    
    @staticmethod
    def evaluate_password_strength(password: str) -> str:
        """评估密码强度"""
        score = 0
        
        # 长度评分
        if len(password) >= 8:
            score += 1
        if len(password) >= 12:
            score += 1
        if len(password) >= 16:
            score += 1
        
        # 字符类型评分
        if any(c.isupper() for c in password):
            score += 1
        if any(c.islower() for c in password):
            score += 1
        if any(c.isdigit() for c in password):
            score += 1
        if any(c in "!@#$%^&*()_+-=[]{}|;:,.<>?" for c in password):
            score += 1
        
        if score <= 2:
            return "weak"
        elif score <= 4:
            return "medium"
        elif score <= 6:
            return "strong"
        else:
            return "very_strong"

    @staticmethod
    def validate_master_password(password: str):
        """验证主密码复杂度"""
        if len(password) < 8:
            raise ValueError("主密码长度至少需要8位")
        
        has_upper = any(c.isupper() for c in password)
        has_lower = any(c.islower() for c in password)
        has_digit = any(c.isdigit() for c in password)
        
        if not (has_upper and has_lower and has_digit):
            raise ValueError("主密码必须包含大写字母、小写字母和数字")

    @staticmethod
    def generate_recovery_key() -> str:
        """生成恢复码（格式：XXXX-XXXX-XXXX-XXXX-XXXX-XXXX）"""
        # 生成 24 位字母数字组合，分组显示
        chars = string.ascii_uppercase + string.digits
        # 排除易混淆字符
        chars = chars.replace('0', '').replace('O', '').replace('I', '').replace('1', '').replace('L', '')
        key_chars = ''.join(secrets.choice(chars) for _ in range(24))
        # 分组格式化
        return '-'.join(key_chars[i:i+4] for i in range(0, 24, 4))


class VaultService:
    """密码保险箱服务"""
    
    def __init__(self, db: AsyncSession, user_id: int):
        self.db = db
        self.user_id = user_id
        self._encryption_key: Optional[bytes] = None
    
    def set_encryption_key(self, key: bytes):
        """设置加密密钥（由主密码派生）"""
        self._encryption_key = key
    
    # ============ 主密码管理 ============
    
    async def has_master_key(self) -> bool:
        """检查用户是否已设置主密码"""
        stmt = select(VaultMasterKey).where(VaultMasterKey.user_id == self.user_id)
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none() is not None
        
    async def is_master_key_locked(self) -> bool:
        """检查主密码是否已锁定"""
        stmt = select(VaultMasterKey).where(VaultMasterKey.user_id == self.user_id)
        result = await self.db.execute(stmt)
        master_key = result.scalar_one_or_none()
        return master_key.is_locked if master_key else False
    
    async def create_master_key(self, master_password: str) -> Tuple[bool, str]:
        """创建主密码，返回 (成功状态, 恢复码)"""
        # 检查是否已存在
        if await self.has_master_key():
            raise ValueError("主密码已存在，请使用修改功能")
        
        # 验证复杂度
        VaultCrypto.validate_master_password(master_password)
        
        # 生成盐值
        salt = VaultCrypto.generate_salt()
        
        # 哈希主密码
        master_key_hash = VaultCrypto.hash_password(master_password, salt)
        
        # 派生加密密钥并加密验证字符串
        key = VaultCrypto.derive_key(master_password, salt)
        verification_hash = VaultCrypto.encrypt(VaultCrypto.VERIFICATION_STRING, key)
        
        # 生成恢复码
        recovery_key = VaultCrypto.generate_recovery_key()
        recovery_salt = VaultCrypto.generate_salt()
        
        # 用恢复码派生密钥，加密数据密钥
        recovery_derived_key = VaultCrypto.derive_key(recovery_key.replace('-', ''), recovery_salt)
        encrypted_data_key = VaultCrypto.encrypt(key.decode('utf-8'), recovery_derived_key)
        
        # 保存
        master_key = VaultMasterKey(
            user_id=self.user_id,
            master_key_hash=master_key_hash,
            salt=salt,
            verification_hash=verification_hash,
            recovery_salt=recovery_salt,
            encrypted_data_key=encrypted_data_key
        )
        self.db.add(master_key)
        await self.db.commit()
        
        return True, recovery_key
    
    async def verify_master_password(self, master_password: str) -> Optional[bytes]:
        """验证主密码，返回加密密钥"""
        stmt = select(VaultMasterKey).where(VaultMasterKey.user_id == self.user_id)
        result = await self.db.execute(stmt)
        master_key = result.scalar_one_or_none()
        
        if not master_key:
            return None
        
        # 检查是否已锁定
        if master_key.is_locked:
            raise ValueError("由于主密码尝试次数过多，密码箱已被锁定。请使用恢复码进行重置。")
            
        # 派生密钥并验证
        try:
            key = VaultCrypto.derive_key(master_password, master_key.salt)
            decrypted = VaultCrypto.decrypt(master_key.verification_hash, key)
            
            if decrypted == VaultCrypto.VERIFICATION_STRING:
                # 验证成功，重置失败次数
                if master_key.failed_attempts > 0:
                    master_key.failed_attempts = 0
                    await self.db.commit()
                return key
        except Exception:
            pass
            
        # 验证失败，增加失败次数
        master_key.failed_attempts += 1
        if master_key.failed_attempts >= 5:
            master_key.is_locked = True
            await self.db.commit()
            raise ValueError("主密码错误。由于失败次数过多，密码箱现已被锁定。请使用恢复码进行重置。")
            
        await self.db.commit()
        remaining = 5 - master_key.failed_attempts
        raise ValueError(f"主密码错误（还剩 {remaining} 次尝试机会）")
    
    async def change_master_password(self, old_password: str, new_password: str) -> bool:
        """修改主密码（需要重新加密所有数据）"""
        # 验证旧密码
        old_key = await self.verify_master_password(old_password)
        if not old_key:
            raise ValueError("旧密码错误")
            
        # 验证新密码复杂度
        VaultCrypto.validate_master_password(new_password)
        
        # 获取所有条目
        items_stmt = select(VaultItem).where(VaultItem.user_id == self.user_id)
        items_result = await self.db.execute(items_stmt)
        items = items_result.scalars().all()
        
        # 生成新的盐值和密钥
        new_salt = VaultCrypto.generate_salt()
        new_key = VaultCrypto.derive_key(new_password, new_salt)
        new_master_key_hash = VaultCrypto.hash_password(new_password, new_salt)
        new_verification_hash = VaultCrypto.encrypt(VaultCrypto.VERIFICATION_STRING, new_key)
        
        # 重新加密所有条目
        for item in items:
            # 解密
            username = VaultCrypto.decrypt(item.username_encrypted, old_key)
            password = VaultCrypto.decrypt(item.password_encrypted, old_key)
            notes = VaultCrypto.decrypt(item.notes_encrypted, old_key) if item.notes_encrypted else None
            
            # 重新加密
            item.username_encrypted = VaultCrypto.encrypt(username, new_key)
            item.password_encrypted = VaultCrypto.encrypt(password, new_key)
            item.notes_encrypted = VaultCrypto.encrypt(notes, new_key) if notes else None
        
        # 更新主密钥
        stmt = update(VaultMasterKey).where(
            VaultMasterKey.user_id == self.user_id
        ).values(
            master_key_hash=new_master_key_hash,
            salt=new_salt,
            verification_hash=new_verification_hash,
            updated_at=get_beijing_time()
        )
        await self.db.execute(stmt)
        await self.db.commit()
        
        return True
    

    async def reset_vault(self) -> bool:
        """重置密码箱（危险操作：这一步会删除用户所有的保险箱数据并清除主密码）"""
        # 删除所有条目
        await self.db.execute(delete(VaultItem).where(VaultItem.user_id == self.user_id))
        # 删除所有分类
        await self.db.execute(delete(VaultCategory).where(VaultCategory.user_id == self.user_id))
        # 删除主密码
        await self.db.execute(delete(VaultMasterKey).where(VaultMasterKey.user_id == self.user_id))
        
        await self.db.commit()
        return True
    
    async def recover_with_recovery_key(self, recovery_key: str, new_password: str) -> bool:
        """使用恢复码重置主密码（不丢失数据）"""
        # 验证新密码复杂度
        VaultCrypto.validate_master_password(new_password)
        
        # 获取主密钥记录
        stmt = select(VaultMasterKey).where(VaultMasterKey.user_id == self.user_id)
        result = await self.db.execute(stmt)
        master_key_record = result.scalar_one_or_none()
        
        if not master_key_record:
            raise ValueError("未找到主密码记录")
        
        if not master_key_record.recovery_salt or not master_key_record.encrypted_data_key:
            raise ValueError("此账户未设置恢复码，无法恢复")
        
        # 用恢复码派生密钥，解密数据密钥
        recovery_key_clean = recovery_key.replace('-', '').upper()
        recovery_derived_key = VaultCrypto.derive_key(recovery_key_clean, master_key_record.recovery_salt)
        
        try:
            old_key_str = VaultCrypto.decrypt(master_key_record.encrypted_data_key, recovery_derived_key)
            if old_key_str == "[解密失败]":
                raise ValueError("恢复码错误")
            old_key = old_key_str.encode('utf-8')
        except Exception:
            raise ValueError("恢复码错误")
        
        # 获取所有条目
        items_stmt = select(VaultItem).where(VaultItem.user_id == self.user_id)
        items_result = await self.db.execute(items_stmt)
        items = items_result.scalars().all()
        
        # 生成新的盐值和密钥
        new_salt = VaultCrypto.generate_salt()
        new_key = VaultCrypto.derive_key(new_password, new_salt)
        new_master_key_hash = VaultCrypto.hash_password(new_password, new_salt)
        new_verification_hash = VaultCrypto.encrypt(VaultCrypto.VERIFICATION_STRING, new_key)
        
        # 生成新的恢复码
        new_recovery_key = VaultCrypto.generate_recovery_key()
        new_recovery_salt = VaultCrypto.generate_salt()
        new_recovery_derived_key = VaultCrypto.derive_key(new_recovery_key.replace('-', ''), new_recovery_salt)
        new_encrypted_data_key = VaultCrypto.encrypt(new_key.decode('utf-8'), new_recovery_derived_key)
        
        # 重新加密所有条目
        for item in items:
            username = VaultCrypto.decrypt(item.username_encrypted, old_key)
            password = VaultCrypto.decrypt(item.password_encrypted, old_key)
            notes = VaultCrypto.decrypt(item.notes_encrypted, old_key) if item.notes_encrypted else None
            
            item.username_encrypted = VaultCrypto.encrypt(username, new_key)
            item.password_encrypted = VaultCrypto.encrypt(password, new_key)
            item.notes_encrypted = VaultCrypto.encrypt(notes, new_key) if notes else None
        
        # 更新主密钥记录（并重置锁定状态）
        master_key_record.master_key_hash = new_master_key_hash
        master_key_record.salt = new_salt
        master_key_record.verification_hash = new_verification_hash
        master_key_record.recovery_salt = new_recovery_salt
        master_key_record.encrypted_data_key = new_encrypted_data_key
        master_key_record.is_locked = False
        master_key_record.failed_attempts = 0
        master_key_record.updated_at = get_beijing_time() # Assuming get_beijing_time() is available
        
        await self.db.commit()
        
        # 返回新的恢复码
        return new_recovery_key
    
    # ============ 分类管理 ============
    
    async def get_categories(self) -> List[VaultCategory]:
        """获取所有分类"""
        stmt = select(VaultCategory).where(
            VaultCategory.user_id == self.user_id
        ).order_by(VaultCategory.order, VaultCategory.id)
        result = await self.db.execute(stmt)
        return list(result.scalars().all())
    
    async def get_category(self, category_id: int) -> Optional[VaultCategory]:
        """获取分类详情"""
        stmt = select(VaultCategory).where(
            and_(
                VaultCategory.id == category_id,
                VaultCategory.user_id == self.user_id
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def get_category_item_count(self, category_id: int) -> int:
        """获取分类下的条目数量"""
        stmt = select(func.count(VaultItem.id)).where(
            and_(
                VaultItem.category_id == category_id,
                VaultItem.user_id == self.user_id
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar() or 0
    
    async def create_category(self, data: CategoryCreate) -> VaultCategory:
        """创建分类"""
        category = VaultCategory(
            user_id=self.user_id,
            name=data.name,
            icon=data.icon,
            color=data.color,
            order=data.order
        )
        self.db.add(category)
        await self.db.commit()
        await self.db.refresh(category)
        return category
    
    async def update_category(self, category_id: int, data: CategoryUpdate) -> Optional[VaultCategory]:
        """更新分类"""
        category = await self.get_category(category_id)
        if not category:
            return None
        
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(category, key, value)
        
        await self.db.commit()
        await self.db.refresh(category)
        return category
    
    async def delete_category(self, category_id: int) -> bool:
        """删除分类（条目将变为未分类）"""
        category = await self.get_category(category_id)
        if not category:
            return False
        
        await self.db.delete(category)
        await self.db.commit()
        return True
    
    # ============ 密码条目管理 ============
    
    async def get_items(
        self,
        category_id: Optional[int] = None,
        is_starred: Optional[bool] = None,
        keyword: Optional[str] = None,
        page: int = 1,
        size: int = 20
    ) -> Tuple[List[VaultItem], int]:
        """获取条目列表"""
        # 基础查询
        conditions = [VaultItem.user_id == self.user_id]
        
        # 分类筛选
        if category_id is not None:
            if category_id == 0:
                conditions.append(VaultItem.category_id.is_(None))
            else:
                conditions.append(VaultItem.category_id == category_id)
        
        # 收藏筛选
        if is_starred is not None:
            conditions.append(VaultItem.is_starred == is_starred)
        
        # 关键词搜索（只搜索标题和网址，不搜索加密内容）
        if keyword:
            keyword = f"%{keyword}%"
            conditions.append(
                (VaultItem.title.ilike(keyword)) |
                (VaultItem.website.ilike(keyword))
            )
        
        # 总数查询
        count_stmt = select(func.count(VaultItem.id)).where(and_(*conditions))
        total_result = await self.db.execute(count_stmt)
        total = total_result.scalar() or 0
        
        # 分页查询
        offset = (page - 1) * size
        items_stmt = select(VaultItem).where(and_(*conditions)).order_by(
            VaultItem.is_starred.desc(),
            VaultItem.updated_at.desc()
        ).offset(offset).limit(size)
        items_result = await self.db.execute(items_stmt)
        items = list(items_result.scalars().all())
        
        return items, total
    
    async def get_item(self, item_id: int) -> Optional[VaultItem]:
        """获取条目"""
        stmt = select(VaultItem).where(
            and_(
                VaultItem.id == item_id,
                VaultItem.user_id == self.user_id
            )
        )
        result = await self.db.execute(stmt)
        return result.scalar_one_or_none()
    
    async def create_item(self, data: ItemCreate) -> VaultItem:
        """创建条目"""
        if not self._encryption_key:
            raise ValueError("请先解锁保险箱")
        
        # 如果指定了分类，验证分类存在
        if data.category_id:
            category = await self.get_category(data.category_id)
            if not category:
                raise ValueError("分类不存在")
        
        # 加密敏感数据
        item = VaultItem(
            user_id=self.user_id,
            title=data.title,
            website=data.website,
            username_encrypted=VaultCrypto.encrypt(data.username, self._encryption_key),
            password_encrypted=VaultCrypto.encrypt(data.password, self._encryption_key),
            notes_encrypted=VaultCrypto.encrypt(data.notes, self._encryption_key) if data.notes else None,
            category_id=data.category_id,
            is_starred=data.is_starred
        )
        self.db.add(item)
        await self.db.commit()
        await self.db.refresh(item)
        return item
    
    async def update_item(self, item_id: int, data: ItemUpdate) -> Optional[VaultItem]:
        """更新条目"""
        if not self._encryption_key:
            raise ValueError("请先解锁保险箱")
        
        item = await self.get_item(item_id)
        if not item:
            return None
        
        # 如果更新分类，验证分类存在
        if data.category_id is not None and data.category_id != 0:
            category = await self.get_category(data.category_id)
            if not category:
                raise ValueError("分类不存在")
        
        update_data = data.model_dump(exclude_unset=True)
        
        # 处理加密字段
        if 'username' in update_data:
            item.username_encrypted = VaultCrypto.encrypt(update_data.pop('username'), self._encryption_key)
        if 'password' in update_data:
            item.password_encrypted = VaultCrypto.encrypt(update_data.pop('password'), self._encryption_key)
        if 'notes' in update_data:
            notes = update_data.pop('notes')
            item.notes_encrypted = VaultCrypto.encrypt(notes, self._encryption_key) if notes else None
        
        # 更新其他字段
        for key, value in update_data.items():
            setattr(item, key, value)
        
        await self.db.commit()
        await self.db.refresh(item)
        return item
    
    async def delete_item(self, item_id: int) -> bool:
        """删除条目"""
        item = await self.get_item(item_id)
        if not item:
            return False
        
        await self.db.delete(item)
        await self.db.commit()
        return True
    
    async def record_item_usage(self, item_id: int) -> bool:
        """记录条目使用"""
        stmt = update(VaultItem).where(
            and_(
                VaultItem.id == item_id,
                VaultItem.user_id == self.user_id
            )
        ).values(last_used_at=get_beijing_time())
        result = await self.db.execute(stmt)
        await self.db.commit()
        return result.rowcount > 0
    
    def decrypt_item(self, item: VaultItem) -> dict:
        """解密条目数据"""
        if not self._encryption_key:
            raise ValueError("请先解锁保险箱")
        
        return {
            "username": VaultCrypto.decrypt(item.username_encrypted, self._encryption_key),
            "password": VaultCrypto.decrypt(item.password_encrypted, self._encryption_key),
            "notes": VaultCrypto.decrypt(item.notes_encrypted, self._encryption_key) if item.notes_encrypted else None
        }
    
    # ============ 统计 ============
    
    async def get_stats(self) -> dict:
        """获取统计信息"""
        # 总条目数
        total_stmt = select(func.count(VaultItem.id)).where(VaultItem.user_id == self.user_id)
        total_result = await self.db.execute(total_stmt)
        total_items = total_result.scalar() or 0
        
        # 收藏数
        starred_stmt = select(func.count(VaultItem.id)).where(
            and_(VaultItem.user_id == self.user_id, VaultItem.is_starred == True)
        )
        starred_result = await self.db.execute(starred_stmt)
        starred_items = starred_result.scalar() or 0
        
        # 分类数
        category_stmt = select(func.count(VaultCategory.id)).where(VaultCategory.user_id == self.user_id)
        category_result = await self.db.execute(category_stmt)
        total_categories = category_result.scalar() or 0
        
        return {
            "total_items": total_items,
            "starred_items": starred_items,
            "total_categories": total_categories
        }
    
    # ============ 导入导出 ============
    
    async def export_data(self) -> dict:
        """导出所有数据（已解密）"""
        if not self._encryption_key:
            raise ValueError("请先解锁保险箱")
        
        # 获取所有分类
        categories = await self.get_categories()
        categories_data = [
            {
                "name": cat.name,
                "icon": cat.icon,
                "color": cat.color,
                "order": cat.order
            }
            for cat in categories
        ]
        
        # 获取所有条目
        items, _ = await self.get_items(page=1, size=10000)
        items_data = []
        for item in items:
            decrypted = self.decrypt_item(item)
            # 获取分类名称
            category_name = None
            if item.category_id:
                for cat in categories:
                    if cat.id == item.category_id:
                        category_name = cat.name
                        break
            
            items_data.append({
                "title": item.title,
                "website": item.website,
                "username": decrypted["username"],
                "password": decrypted["password"],
                "notes": decrypted["notes"],
                "category_name": category_name,
                "is_starred": item.is_starred
            })
        
        return {
            "version": "1.0",
            "export_time": get_beijing_time().isoformat(),
            "categories": categories_data,
            "items": items_data
        }
    
    async def import_data(self, data: dict) -> dict:
        """导入数据"""
        if not self._encryption_key:
            raise ValueError("请先解锁保险箱")
        
        imported_categories = 0
        imported_items = 0
        skipped_items = 0
        
        # 获取现有分类映射
        existing_categories = await self.get_categories()
        category_map = {cat.name: cat.id for cat in existing_categories}
        
        # 导入分类
        for cat_data in data.get("categories", []):
            if cat_data["name"] not in category_map:
                new_cat = await self.create_category(CategoryCreate(
                    name=cat_data["name"],
                    icon=cat_data.get("icon", "📁"),
                    color=cat_data.get("color", "#3b82f6"),
                    order=cat_data.get("order", 0)
                ))
                category_map[cat_data["name"]] = new_cat.id
                imported_categories += 1
        
        # 导入条目
        for item_data in data.get("items", []):
            # 检查是否已存在（根据标题和网站判断）
            existing = await self.db.execute(
                select(VaultItem).where(
                    and_(
                        VaultItem.user_id == self.user_id,
                        VaultItem.title == item_data["title"],
                        VaultItem.website == item_data.get("website")
                    )
                )
            )
            if existing.scalar_one_or_none():
                skipped_items += 1
                continue
            
            # 获取分类ID
            category_id = None
            if item_data.get("category_name"):
                category_id = category_map.get(item_data["category_name"])
            
            await self.create_item(ItemCreate(
                title=item_data["title"],
                website=item_data.get("website"),
                username=item_data["username"],
                password=item_data["password"],
                notes=item_data.get("notes"),
                category_id=category_id,
                is_starred=item_data.get("is_starred", False)
            ))
            imported_items += 1
        
        return {
            "imported_categories": imported_categories,
            "imported_items": imported_items,
            "skipped_items": skipped_items
        }
