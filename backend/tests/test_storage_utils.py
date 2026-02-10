"""
文件存储管理器单元测试
覆盖：文件名生成、文件验证、路径安全检查、文件操作、目录管理
"""

import pytest
import os
from pathlib import Path
from unittest.mock import patch, MagicMock

from utils.storage import StorageManager, get_storage_manager


class TestStorageManagerInit:
    """存储管理器初始化测试"""

    def test_singleton_pattern(self, tmp_workspace):
        """测试单例模式"""
        import utils.storage
        utils.storage._storage_manager = None
        
        mgr1 = get_storage_manager()
        mgr2 = get_storage_manager()
        
        assert mgr1 is mgr2
        
        # 清理
        utils.storage._storage_manager = None

    def test_directory_structure_created(self, tmp_workspace):
        """测试基础目录结构被创建"""
        import utils.storage
        utils.storage._storage_manager = None
        
        mgr = get_storage_manager()
        
        assert mgr.public_dir.exists()
        assert mgr.modules_dir.exists()
        assert mgr.system_dir.exists()
        
        utils.storage._storage_manager = None


class TestGenerateFilename:
    """文件名生成测试"""

    def test_module_path(self, tmp_workspace):
        """测试模块专用路径"""
        import utils.storage
        utils.storage._storage_manager = None
        mgr = get_storage_manager()
        
        rel_path, full_path = mgr.generate_filename(
            "test.pdf", module="analysis", sub_type="uploads"
        )
        
        assert "modules/analysis/uploads" in rel_path
        assert rel_path.endswith(".pdf")
        
        utils.storage._storage_manager = None

    def test_module_path_with_user(self, tmp_workspace):
        """测试模块路径带用户隔离"""
        import utils.storage
        utils.storage._storage_manager = None
        mgr = get_storage_manager()
        
        rel_path, full_path = mgr.generate_filename(
            "data.csv", module="analysis", user_id=42, sub_type="uploads"
        )
        
        assert "modules/analysis/uploads/user_42" in rel_path
        assert rel_path.endswith(".csv")
        
        utils.storage._storage_manager = None

    def test_user_file_redirects_to_filemanager(self, tmp_workspace):
        """测试无模块的用户文件重定向至 filemanager"""
        import utils.storage
        utils.storage._storage_manager = None
        mgr = get_storage_manager()
        
        rel_path, full_path = mgr.generate_filename(
            "doc.pdf", user_id=1, category="attachments"
        )
        
        assert "modules/filemanager" in rel_path
        
        utils.storage._storage_manager = None

    def test_avatar_goes_to_public(self, tmp_workspace):
        """测试头像路径到公共目录"""
        import utils.storage
        utils.storage._storage_manager = None
        mgr = get_storage_manager()
        
        rel_path, full_path = mgr.generate_filename(
            "avatar.jpg", user_id=1, category="avatar"
        )
        
        assert "public/avatars" in rel_path
        
        utils.storage._storage_manager = None

    def test_public_attachment_path(self, tmp_workspace):
        """测试公共附件路径"""
        import utils.storage
        utils.storage._storage_manager = None
        mgr = get_storage_manager()
        
        rel_path, full_path = mgr.generate_filename(
            "file.txt", category="attachments"
        )
        
        assert "public/attachments" in rel_path
        
        utils.storage._storage_manager = None

    def test_unique_filenames(self, tmp_workspace):
        """测试文件名唯一性"""
        import utils.storage
        utils.storage._storage_manager = None
        mgr = get_storage_manager()
        
        rel1, _ = mgr.generate_filename("test.txt")
        rel2, _ = mgr.generate_filename("test.txt")
        
        assert rel1 != rel2
        
        utils.storage._storage_manager = None

    def test_no_extension_file(self, tmp_workspace):
        """测试无扩展名文件"""
        import utils.storage
        utils.storage._storage_manager = None
        mgr = get_storage_manager()
        
        rel_path, full_path = mgr.generate_filename("Makefile")
        
        assert rel_path is not None
        assert "." not in rel_path.split("/")[-1] or rel_path.split("/")[-1].count(".") == 0
        
        utils.storage._storage_manager = None


class TestValidateFile:
    """文件验证测试"""

    def _get_manager(self, tmp_workspace):
        import utils.storage
        utils.storage._storage_manager = None
        mgr = get_storage_manager()
        return mgr

    def test_valid_file(self, tmp_workspace):
        """测试有效文件"""
        mgr = self._get_manager(tmp_workspace)
        valid, error = mgr.validate_file("test.pdf", 1024)
        
        assert valid is True
        assert error is None

    def test_file_too_large(self, tmp_workspace):
        """测试文件过大"""
        mgr = self._get_manager(tmp_workspace)
        valid, error = mgr.validate_file("test.pdf", mgr.max_size + 1)
        
        assert valid is False
        assert "大小超过限制" in error

    def test_invalid_extension(self, tmp_workspace):
        """测试不允许的扩展名"""
        mgr = self._get_manager(tmp_workspace)
        valid, error = mgr.validate_file("test.exe", 1024)
        
        assert valid is False
        assert "不支持的文件类型" in error

    def test_valid_extensions(self, tmp_workspace):
        """测试各种允许的扩展名"""
        mgr = self._get_manager(tmp_workspace)
        
        valid_exts = ["jpg", "png", "pdf", "docx", "xlsx", "zip", "json", "csv", "md"]
        for ext in valid_exts:
            valid, error = mgr.validate_file(f"test.{ext}", 1024)
            assert valid is True, f"Extension {ext} should be valid"

    def test_no_extension_allowed(self, tmp_workspace):
        """测试无扩展名文件（允许通过）"""
        mgr = self._get_manager(tmp_workspace)
        valid, error = mgr.validate_file("README", 1024)
        
        assert valid is True

    def test_zero_size_file(self, tmp_workspace):
        """测试零字节文件"""
        mgr = self._get_manager(tmp_workspace)
        valid, error = mgr.validate_file("test.txt", 0)
        
        assert valid is True


class TestPathSafety:
    """路径安全测试"""

    def _get_manager(self, tmp_workspace):
        import utils.storage
        utils.storage._storage_manager = None
        return get_storage_manager()

    def test_path_traversal_blocked(self, tmp_workspace):
        """测试路径遍历攻击被阻止"""
        mgr = self._get_manager(tmp_workspace)
        
        result = mgr.get_file_path("../../etc/passwd")
        assert result is None

    def test_absolute_path_blocked(self, tmp_workspace):
        """测试绝对路径被阻止"""
        mgr = self._get_manager(tmp_workspace)
        
        result = mgr.get_file_path("/etc/passwd")
        assert result is None

    def test_dotdot_in_path(self, tmp_workspace):
        """测试路径中的 .. 被检测"""
        mgr = self._get_manager(tmp_workspace)
        
        result = mgr.get_file_path("valid/../../../etc/passwd")
        assert result is None

    def test_safe_path_check(self, tmp_workspace):
        """测试安全路径检查"""
        mgr = self._get_manager(tmp_workspace)
        
        safe_path = mgr.upload_dir / "test" / "file.txt"
        unsafe_path = mgr.upload_dir / ".." / ".." / "etc" / "passwd"
        
        assert mgr._is_safe_path(safe_path) is True
        assert mgr._is_safe_path(unsafe_path) is False

    def test_delete_path_traversal_blocked(self, tmp_workspace):
        """测试删除时路径遍历被阻止"""
        mgr = self._get_manager(tmp_workspace)
        
        result = mgr.delete_file("../../important.db")
        assert result is False

    def test_delete_absolute_path_blocked(self, tmp_workspace):
        """测试删除时绝对路径被阻止"""
        mgr = self._get_manager(tmp_workspace)
        
        result = mgr.delete_file("/etc/hosts")
        assert result is False


class TestFileOperations:
    """文件操作测试"""

    def _get_manager(self, tmp_workspace):
        import utils.storage
        utils.storage._storage_manager = None
        return get_storage_manager()

    def test_get_nonexistent_file(self, tmp_workspace):
        """测试获取不存在的文件"""
        mgr = self._get_manager(tmp_workspace)
        
        result = mgr.get_file_path("nonexistent/file.txt")
        assert result is None

    def test_get_file_info_nonexistent(self, tmp_workspace):
        """测试获取不存在文件的信息"""
        mgr = self._get_manager(tmp_workspace)
        
        result = mgr.get_file_info("nonexistent/file.txt")
        assert result is None

    def test_delete_nonexistent_file(self, tmp_workspace):
        """测试删除不存在的文件"""
        mgr = self._get_manager(tmp_workspace)
        
        result = mgr.delete_file("nonexistent/file.txt")
        assert result is False

    def test_write_and_read_file(self, tmp_workspace):
        """测试写入并读取文件"""
        mgr = self._get_manager(tmp_workspace)
        
        # 生成路径并写入文件
        rel_path, full_path = mgr.generate_filename("test.txt")
        Path(full_path).write_text("hello world")
        
        # 读取文件
        file_path = mgr.get_file_path(rel_path)
        assert file_path is not None
        assert file_path.read_text() == "hello world"

    def test_write_read_delete_lifecycle(self, tmp_workspace):
        """测试文件完整生命周期"""
        mgr = self._get_manager(tmp_workspace)
        
        # 创建
        rel_path, full_path = mgr.generate_filename("lifecycle.txt")
        Path(full_path).write_text("test content")
        
        # 验证存在
        assert mgr.get_file_path(rel_path) is not None
        
        # 获取信息
        info = mgr.get_file_info(rel_path)
        assert info is not None
        assert info["filename"] == Path(full_path).name
        assert info["size"] > 0
        
        # 删除
        assert mgr.delete_file(rel_path) is True
        
        # 验证已删除
        assert mgr.get_file_path(rel_path) is None


class TestDirectoryManagement:
    """目录管理测试"""

    def _get_manager(self, tmp_workspace):
        import utils.storage
        utils.storage._storage_manager = None
        return get_storage_manager()

    def test_get_module_dir(self, tmp_workspace):
        """测试获取模块目录"""
        mgr = self._get_manager(tmp_workspace)
        
        module_dir = mgr.get_module_dir("analysis")
        assert module_dir.exists()
        assert "analysis" in str(module_dir)

    def test_get_module_dir_with_sub(self, tmp_workspace):
        """测试获取带子目录的模块目录"""
        mgr = self._get_manager(tmp_workspace)
        
        sub_dir = mgr.get_module_dir("analysis", sub_dir="uploads")
        assert sub_dir.exists()
        assert "uploads" in str(sub_dir)

    def test_get_module_dir_with_user(self, tmp_workspace):
        """测试获取带用户隔离的模块目录"""
        mgr = self._get_manager(tmp_workspace)
        
        user_dir = mgr.get_module_dir("analysis", sub_dir="uploads", user_id=42)
        assert user_dir.exists()
        assert "user_42" in str(user_dir)

    def test_get_system_dir(self, tmp_workspace):
        """测试获取系统目录"""
        mgr = self._get_manager(tmp_workspace)
        
        backup_dir = mgr.get_system_dir("backups")
        assert backup_dir.exists()
        assert "backups" in str(backup_dir)

    def test_get_user_dir(self, tmp_workspace):
        """测试获取用户目录（重定向到 filemanager）"""
        mgr = self._get_manager(tmp_workspace)
        
        user_dir = mgr.get_user_dir(1)
        assert user_dir.exists()
        assert "filemanager" in str(user_dir)
