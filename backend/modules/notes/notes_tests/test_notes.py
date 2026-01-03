# -*- coding: utf-8 -*-
"""
笔记模块测试
测试笔记文件夹、笔记内容、标签等功能
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

from modules.notes.notes_models import NotesFolder, NotesNote, NotesTag
from modules.notes.notes_schemas import FolderCreate, NoteCreate, TagCreate


class TestNotesModels:
    """测试笔记数据模型"""
    
    def test_notes_folder_model(self):
        """测试笔记文件夹模型"""
        assert NotesFolder.__tablename__ == "notes_folders"
    
    def test_notes_note_model(self):
        """测试笔记内容模型"""
        assert NotesNote.__tablename__ == "notes_notes"
    
    def test_notes_tag_model(self):
        """测试笔记标签模型"""
        assert NotesTag.__tablename__ == "notes_tags"


class TestNotesSchemas:
    """测试笔记数据验证模型"""
    
    def test_folder_create_schema(self):
        """测试创建文件夹模型"""
        data = FolderCreate(
            name="测试文件夹",
            parent_id=None
        )
        assert data.name == "测试文件夹"
    
    def test_note_create_schema(self):
        """测试创建笔记模型"""
        data = NoteCreate(
            title="测试笔记",
            content="# 这是笔记内容"
        )
        assert data.title == "测试笔记"
        assert data.content == "# 这是笔记内容"
    
    def test_tag_create_schema(self):
        """测试创建标签模型"""
        data = TagCreate(
            name="重要",
            color="#ff0000"
        )
        assert data.name == "重要"
        assert data.color == "#ff0000"


class TestNotesService:
    """测试笔记服务层"""
    
    @pytest.mark.asyncio
    async def test_create_folder(self, db_session):
        """测试创建文件夹"""
        from modules.notes.notes_services import NotesService
        service = NotesService(db_session, user_id=1)
        data = FolderCreate(name="测试文件夹")
        folder = await service.create_folder(data)
        assert folder.id is not None
        assert folder.name == "测试文件夹"
        assert folder.user_id == 1
    
    @pytest.mark.asyncio
    async def test_create_note(self, db_session):
        """测试创建笔记"""
        from modules.notes.notes_services import NotesService
        service = NotesService(db_session, user_id=1)
        data = NoteCreate(
            title="测试笔记",
            content="笔记内容"
        )
        note = await service.create_note(data)
        assert note.id is not None
        assert note.title == "测试笔记"
        assert note.user_id == 1
    
    @pytest.mark.asyncio
    async def test_user_isolation(self, db_session):
        """测试用户隔离"""
        from modules.notes.notes_services import NotesService
        # 用户1创建笔记
        service1 = NotesService(db_session, user_id=1)
        data1 = NoteCreate(title="用户1的笔记", content="内容")
        note1 = await service1.create_note(data1)
        
        # 用户2尝试获取用户1的笔记
        service2 = NotesService(db_session, user_id=2)
        note2 = await service2.get_note(note1.id)
        assert note2 is None  # 应该无法获取
    
    @pytest.mark.asyncio
    async def test_get_folder_tree(self, db_session):
        """测试获取文件夹树（测试树结构构建优化）"""
        from modules.notes.notes_services import NotesService
        service = NotesService(db_session, user_id=1)
        
        # 创建文件夹树结构
        root1 = await service.create_folder(FolderCreate(name="根文件夹1"))
        root2 = await service.create_folder(FolderCreate(name="根文件夹2"))
        child1 = await service.create_folder(FolderCreate(name="子文件夹1", parent_id=root1.id))
        child2 = await service.create_folder(FolderCreate(name="子文件夹2", parent_id=root1.id))
        grandchild = await service.create_folder(FolderCreate(name="孙文件夹", parent_id=child1.id))
        
        # 获取文件夹树
        tree = await service.get_folder_tree()
        assert len(tree) >= 2  # 至少有两个根文件夹
        
        # 验证树结构
        root1_node = next((f for f in tree if f.id == root1.id), None)
        assert root1_node is not None
        assert len(root1_node.children) == 2  # 有两个子文件夹
    
    @pytest.mark.asyncio
    async def test_create_note_with_tags(self, db_session):
        """测试创建笔记（带标签，测试批量标签操作优化）"""
        from modules.notes.notes_services import NotesService
        from modules.notes.notes_schemas import TagCreate
        service = NotesService(db_session, user_id=1)
        
        # 创建标签
        tag1 = await service.create_tag(TagCreate(name="重要", color="#ff0000"))
        tag2 = await service.create_tag(TagCreate(name="工作", color="#00ff00"))
        
        # 创建带标签的笔记
        data = NoteCreate(
            title="测试笔记",
            content="内容",
            tags=[tag1.id, tag2.id]
        )
        note = await service.create_note(data)
        assert note.id is not None
        
        # 验证标签关联
        tags = await service.get_note_tags(note.id)
        assert len(tags) == 2
        tag_ids = [tag.id for tag in tags]
        assert tag1.id in tag_ids
        assert tag2.id in tag_ids
    
    @pytest.mark.asyncio
    async def test_delete_folder(self, db_session):
        """测试删除文件夹（测试批量删除优化）"""
        from modules.notes.notes_services import NotesService
        service = NotesService(db_session, user_id=1)
        
        # 创建文件夹树
        root = await service.create_folder(FolderCreate(name="根文件夹"))
        child1 = await service.create_folder(FolderCreate(name="子文件夹1", parent_id=root.id))
        child2 = await service.create_folder(FolderCreate(name="子文件夹2", parent_id=root.id))
        
        # 创建笔记
        note1 = await service.create_note(NoteCreate(title="笔记1", content="内容", folder_id=child1.id))
        note2 = await service.create_note(NoteCreate(title="笔记2", content="内容", folder_id=child2.id))
        
        # 删除根文件夹（应该级联删除所有子文件夹和笔记）
        result = await service.delete_folder(root.id)
        assert result is True
        
        # 验证已删除
        assert await service.get_folder(root.id) is None
        assert await service.get_folder(child1.id) is None
        assert await service.get_folder(child2.id) is None
        assert await service.get_note(note1.id) is None
        assert await service.get_note(note2.id) is None
    
    @pytest.mark.asyncio
    async def test_delete_note(self, db_session):
        """测试删除笔记（测试直接删除优化）"""
        from modules.notes.notes_services import NotesService
        service = NotesService(db_session, user_id=1)
        
        # 创建笔记
        note = await service.create_note(NoteCreate(title="待删除", content="内容"))
        
        # 删除笔记
        result = await service.delete_note(note.id)
        assert result is True
        
        # 验证已删除
        deleted = await service.get_note(note.id)
        assert deleted is None
    
    @pytest.mark.asyncio
    async def test_delete_tag(self, db_session):
        """测试删除标签（测试直接删除优化）"""
        from modules.notes.notes_services import NotesService
        from modules.notes.notes_schemas import TagCreate
        service = NotesService(db_session, user_id=1)
        
        # 创建标签
        tag = await service.create_tag(TagCreate(name="待删除", color="#ff0000"))
        
        # 删除标签
        result = await service.delete_tag(tag.id)
        assert result is True
        
        # 验证已删除
        deleted = await service.get_tag(tag.id)
        assert deleted is None


class TestNotesManifest:
    """测试笔记模块清单"""
    
    def test_manifest_load(self):
        """测试清单加载"""
        from modules.notes.notes_manifest import manifest
        assert manifest.id == "notes"
        assert manifest.enabled is True

