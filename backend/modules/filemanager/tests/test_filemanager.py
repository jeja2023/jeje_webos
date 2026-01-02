# -*- coding: utf-8 -*-
"""
文件管理模块测试
测试虚拟文件夹、文件管理等功能
"""

import pytest
import sys
import os

# 添加项目根目录到路径
backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
sys.path.insert(0, backend_dir)
# 确保可以导入 conftest
tests_dir = os.path.dirname(os.path.dirname(backend_dir))
sys.path.insert(0, os.path.join(tests_dir, "tests"))

from modules.filemanager.filemanager_models import VirtualFolder, VirtualFile
from modules.filemanager.filemanager_schemas import FolderCreate, FileUpdate
from models import User
from core.security import hash_password


class TestFileManagerModels:
    """测试文件管理数据模型"""
    
    def test_virtual_folder_model(self):
        """测试虚拟文件夹模型"""
        assert VirtualFolder.__tablename__ == "fm_folders"
    
    def test_virtual_file_model(self):
        """测试虚拟文件模型"""
        assert VirtualFile.__tablename__ == "fm_files"


class TestFileManagerSchemas:
    """测试文件管理数据验证模型"""
    
    def test_folder_create_schema(self):
        """测试创建文件夹模型"""
        data = FolderCreate(
            name="测试文件夹",
            parent_id=None
        )
        assert data.name == "测试文件夹"
    
    def test_file_update_schema(self):
        """测试更新文件模型"""
        data = FileUpdate(
            name="新文件名.txt",
            description="文件描述"
        )
        assert data.name == "新文件名.txt"
        assert data.description == "文件描述"


class TestFileManagerService:
    """测试文件管理服务层"""
    
    async def _create_test_user(self, db_session, user_id: int = None):
        """创建测试用户，返回用户对象（包含生成的id）"""
        user = User(
            username=f"testuser{user_id or ''}",
            password_hash=hash_password("test123"),
            phone=f"1380013800{user_id or ''}",
            nickname=f"测试用户{user_id or ''}",
            role="user",
            is_active=True
        )
        db_session.add(user)
        await db_session.commit()
        await db_session.refresh(user)
        return user
    
    @pytest.mark.asyncio
    async def test_create_folder(self, db_session):
        """测试创建文件夹"""
        from modules.filemanager.filemanager_services import FileManagerService
        service = FileManagerService(db_session, user_id=1)
        data = FolderCreate(name="测试文件夹")
        folder = await service.create_folder(data)
        assert folder.id is not None
        assert folder.name == "测试文件夹"
        assert folder.user_id == 1
    
    @pytest.mark.asyncio
    async def test_get_folder(self, db_session):
        """测试获取文件夹"""
        from modules.filemanager.filemanager_services import FileManagerService
        service = FileManagerService(db_session, user_id=1)
        # 先创建文件夹
        data = FolderCreate(name="测试文件夹")
        created = await service.create_folder(data)
        
        # 获取文件夹
        folder = await service.get_folder(created.id)
        assert folder is not None
        assert folder.id == created.id
    
    @pytest.mark.asyncio
    async def test_user_isolation(self, db_session):
        """测试用户隔离"""
        from modules.filemanager.filemanager_services import FileManagerService
        # 用户1创建文件夹
        service1 = FileManagerService(db_session, user_id=1)
        data1 = FolderCreate(name="用户1的文件夹")
        folder1 = await service1.create_folder(data1)
        
        # 用户2尝试获取用户1的文件夹
        service2 = FileManagerService(db_session, user_id=2)
        folder2 = await service2.get_folder(folder1.id)
        assert folder2 is None  # 应该无法获取
    
    @pytest.mark.asyncio
    async def test_update_file(self, db_session):
        """测试更新文件信息（测试直接更新优化）"""
        from modules.filemanager.filemanager_services import FileManagerService
        from modules.filemanager.filemanager_schemas import FileUpdate
        # 创建测试用户
        user = await self._create_test_user(db_session)
        service = FileManagerService(db_session, user_id=user.id)
        
        # 创建文件夹
        folder = await service.create_folder(FolderCreate(name="测试文件夹"))
        
        # 上传文件
        file = await service.upload_file(
            filename="test.txt",
            content=b"test content",
            mime_type="text/plain",
            folder_id=folder.id
        )
        
        # 更新文件
        update_data = FileUpdate(name="新文件名.txt", description="新描述")
        updated = await service.update_file(file.id, update_data)
        assert updated.name == "新文件名.txt"
        assert updated.description == "新描述"
    
    @pytest.mark.asyncio
    async def test_delete_file(self, db_session):
        """测试删除文件（测试直接删除优化）"""
        from modules.filemanager.filemanager_services import FileManagerService
        # 创建测试用户
        user = await self._create_test_user(db_session)
        service = FileManagerService(db_session, user_id=user.id)
        
        # 创建文件夹
        folder = await service.create_folder(FolderCreate(name="测试文件夹"))
        
        # 上传文件
        file = await service.upload_file(
            filename="test.txt",
            content=b"test content",
            mime_type="text/plain",
            folder_id=folder.id
        )
        
        # 删除文件
        result = await service.delete_file(file.id)
        assert result is True
        
        # 验证已删除
        deleted = await service.get_file(file.id)
        assert deleted is None
    
    @pytest.mark.asyncio
    async def test_move_file(self, db_session):
        """测试移动文件（测试直接更新优化）"""
        from modules.filemanager.filemanager_services import FileManagerService
        # 创建测试用户
        user = await self._create_test_user(db_session)
        service = FileManagerService(db_session, user_id=user.id)
        
        # 创建两个文件夹
        folder1 = await service.create_folder(FolderCreate(name="文件夹1"))
        folder2 = await service.create_folder(FolderCreate(name="文件夹2"))
        
        # 上传文件到文件夹1
        file = await service.upload_file(
            filename="test.txt",
            content=b"test content",
            mime_type="text/plain",
            folder_id=folder1.id
        )
        
        # 移动到文件夹2
        moved = await service.move_file(file.id, folder2.id)
        assert moved.folder_id == folder2.id


class TestFileManagerManifest:
    """测试文件管理模块清单"""
    
    def test_manifest_load(self):
        """测试清单加载"""
        from modules.filemanager.filemanager_manifest import manifest
        assert manifest.id == "filemanager"
        assert manifest.enabled is True

