"""
文件存储工具
处理文件上传、存储、访问控制
"""

import os
import hashlib
import uuid
from pathlib import Path
from typing import Optional, Tuple
from datetime import datetime
import logging

from core.config import get_settings

logger = logging.getLogger(__name__)

# 尝试导入文件类型检测库
try:
    import filetype
    FILE_TYPE_AVAILABLE = True
except ImportError:
    FILE_TYPE_AVAILABLE = False
    logger.warning("filetype 库未安装，文件内容验证功能将受限。安装: pip install python-filetype")
settings = get_settings()


class StorageManager:
    """文件存储管理器"""
    
    def __init__(self):
        # 使用绝对路径，避免工作目录差异导致多处生成 storage
        self.upload_dir = Path(settings.upload_dir).resolve()
        self.max_size = settings.max_upload_size
        self.allowed_extensions = {
            # 图片
            'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp',
            # 文档
            'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md',
            # 压缩文件
            'zip', 'rar', '7z', 'tar', 'gz',
            # 其他
            'json', 'xml', 'csv'
        }
        
        # 确保上传目录存在
        self.upload_dir.mkdir(parents=True, exist_ok=True)
    
    def generate_filename(self, original_filename: str, user_id: Optional[int] = None, category: str = "attachment") -> Tuple[str, str]:
        """
        生成唯一文件名
        
        Args:
            original_filename: 原始文件名
            user_id: 用户ID（可选，用于目录分类）
            category: 业务分类（avatar, blog, note, attachment 等）
        
        Returns:
            (相对路径, 完整路径)
        """
        # 获取文件扩展名
        ext = Path(original_filename).suffix.lower().lstrip('.')
        
        # 生成唯一ID
        file_id = str(uuid.uuid4())
        filename = f"{file_id}.{ext}" if ext else file_id
        
        # 确定基础目录名
        # 头像放在 avatars 目录，其他按分类存放
        dir_name = category if category else "files"
        if dir_name == "avatar":
            dir_name = "avatars"
        
        base_dir = self.upload_dir / dir_name
        base_dir.mkdir(parents=True, exist_ok=True)
        
        # 对于头像，不需要按日期或用户分级，直接放在 avatars 目录下以便管理（或者按用户分级也可以）
        # 这里选择：avatars 使用扁平结构或 user_id 结构，其他使用日期结构
        
        if category == "avatar" and user_id:
            # 头像：avatars/{filename}
            # 为了避免一个目录文件太多，还是可以用 hash 前缀或 user_id，但头像通常直接与用户关联，这里简单点
            relative_path = f"{dir_name}/{filename}"
            full_path = base_dir / filename
        else:
            # 默认：{category}/YYYY/MM/{filename}
            date_dir = datetime.now().strftime("%Y/%m")
            date_path = base_dir / date_dir
            date_path.mkdir(parents=True, exist_ok=True)
            relative_path = f"{dir_name}/{date_dir}/{filename}"
            full_path = date_path / filename
        
        return relative_path, str(full_path)
    
    def validate_file(self, filename: str, size: int, content: Optional[bytes] = None) -> Tuple[bool, Optional[str]]:
        """
        验证文件
        
        Args:
            filename: 文件名
            size: 文件大小（字节）
            content: 文件内容（可选，用于内容验证）
        
        Returns:
            (是否有效, 错误信息)
        """
        # 检查文件大小
        if size > self.max_size:
            return False, f"文件大小超过限制（最大 {self.max_size / 1024 / 1024:.1f}MB）"
        
        # 检查文件扩展名
        ext = Path(filename).suffix.lower().lstrip('.')
        if ext and ext not in self.allowed_extensions:
            return False, f"不支持的文件类型: {ext}，允许的类型: {', '.join(sorted(self.allowed_extensions))}"
        
        # 如果提供了文件内容，进行内容验证
        if content and FILE_TYPE_AVAILABLE:
            try:
                kind = filetype.guess(content)
                if kind is None:
                    # 无法识别文件类型，可能是文本文件或特殊格式
                    # 对于文本文件（txt, md, json, xml, csv），允许通过
                    if ext in ['txt', 'md', 'json', 'xml', 'csv']:
                        pass  # 文本文件允许
                    else:
                        # 对于其他文件，如果无法识别类型，发出警告但允许通过（因为扩展名已检查）
                        logger.warning(f"无法识别文件真实类型: {filename}")
                else:
                    # 检查真实文件类型是否与扩展名匹配
                    detected_ext = kind.extension.lower()
                    # 扩展名映射（处理一些变体）
                    ext_mapping = {
                        'jpg': 'jpeg',
                        'jpeg': 'jpg',
                        'tif': 'tiff',
                        'tiff': 'tif'
                    }
                    normalized_ext = ext_mapping.get(ext, ext)
                    normalized_detected = ext_mapping.get(detected_ext, detected_ext)
                    
                    # 如果检测到的类型与扩展名不匹配，拒绝
                    if normalized_ext != normalized_detected:
                        return False, f"文件类型不匹配：扩展名为 {ext}，但实际文件类型为 {detected_ext}（{kind.mime}）。可能存在安全风险。"
            except Exception as e:
                logger.warning(f"文件内容验证失败: {e}")
                # 验证失败时，如果扩展名在白名单中，仍然允许（但记录警告）
        
        return True, None
    
    def _is_safe_path(self, path: Path) -> bool:
        """
        检查路径是否安全（防止路径遍历攻击）
        
        Args:
            path: 要检查的路径
        
        Returns:
            是否安全
        """
        try:
            # 解析为绝对路径
            resolved_path = path.resolve()
            # 确保路径在 upload_dir 内
            return str(resolved_path).startswith(str(self.upload_dir.resolve()))
        except Exception:
            return False
    
    def get_file_path(self, relative_path: str) -> Optional[Path]:
        """
        获取文件完整路径
        
        Args:
            relative_path: 相对路径
        
        Returns:
            完整路径，如果不存在或路径不安全返回 None
        """
        # 过滤危险字符
        if '..' in relative_path or relative_path.startswith('/'):
            logger.warning(f"检测到可疑路径: {relative_path}")
            return None
        
        full_path = self.upload_dir / relative_path
        
        # 安全检查：确保路径在 upload_dir 内
        if not self._is_safe_path(full_path):
            logger.warning(f"路径遍历尝试被阻止: {relative_path}")
            return None
        
        if full_path.exists() and full_path.is_file():
            return full_path
        return None
    
    def delete_file(self, relative_path: str) -> bool:
        """
        删除文件
        
        Args:
            relative_path: 相对路径
        
        Returns:
            是否删除成功
        """
        try:
            # 过滤危险字符
            if '..' in relative_path or relative_path.startswith('/'):
                logger.warning(f"检测到可疑路径: {relative_path}")
                return False
            
            full_path = self.upload_dir / relative_path
            
            # 安全检查：确保路径在 upload_dir 内
            if not self._is_safe_path(full_path):
                logger.warning(f"路径遍历尝试被阻止: {relative_path}")
                return False
            
            if full_path.exists():
                full_path.unlink()
                # 尝试删除空目录
                parent = full_path.parent
                if parent != self.upload_dir and not any(parent.iterdir()):
                    parent.rmdir()
                return True
            return False
        except Exception as e:
            logger.error(f"删除文件失败 {relative_path}: {e}")
            return False
    
    def get_file_info(self, relative_path: str) -> Optional[dict]:
        """
        获取文件信息
        
        Args:
            relative_path: 相对路径
        
        Returns:
            文件信息字典，如果不存在返回 None
        """
        full_path = self.get_file_path(relative_path)
        if not full_path:
            return None
        
        stat = full_path.stat()
        return {
            'path': relative_path,
            'filename': full_path.name,
            'size': stat.st_size,
            'created_at': datetime.fromtimestamp(stat.st_ctime).isoformat(),
            'modified_at': datetime.fromtimestamp(stat.st_mtime).isoformat(),
        }


# 全局存储管理器实例
_storage_manager: Optional[StorageManager] = None


def get_storage_manager() -> StorageManager:
    """获取存储管理器实例"""
    global _storage_manager
    if _storage_manager is None:
        _storage_manager = StorageManager()
    return _storage_manager





