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
    """
    文件存储管理器 - 统一存储规则 (遵循开发规范 6.x)
    
    目录结构:
    storage/
    ├── public/              # 公共文件（全员可见，如头像、公共附件库）
    ├── modules/             # [核心业务区] 功能模块专属存储 (Module Autonomy)
    │   ├── {module}/        # 模块 ID (如 analysis, album, filemanager)
    │   │   ├── uploads/     # 模块业务原始附件
    │   │   └── outputs/     # 模块业务处理成果
    │   └── ...              # 各模块专项子目录 (如 ai_models, photos)
    └── system/              # 系统运行维护区 (不计入用户配额)
        ├── backups/         # 数据库备份
        ├── logs/            # 运行日志
        └── transfer_temp/   # [隔离区] 快传瞬时碎片 (即焚)
        
    ⚠️ 存储原则:
    - 隔离原则: vault (加密隐私) 无可见存储目录；transfer 归口 system/ 且 24h 清理。
    - 自治原则: 统一弃用顶层 users 目录，所有用户私有文件归口至 modules/filemanager。
    - 二元结构: 标准业务目录应统一为 uploads (入) 与 outputs (出)。
    """
    
    def __init__(self):
        # 统一使用项目根目录下的存储目录 (BACKEND_DIR 的同级目录)
        from core.config import BACKEND_DIR
        self.root_dir = (BACKEND_DIR.parent / settings.upload_dir).resolve()
        
        # 定义标准子目录
        self.public_dir = self.root_dir / "public"
        self.modules_dir = self.root_dir / "modules"
        self.system_dir = self.root_dir / "system"
        
        # 兼容性属性：upload_dir 以后应指向 self.root_dir，作为解析相对路径的基准
        self.upload_dir = self.root_dir 
        
        self.max_size = settings.max_upload_size
        self.allowed_extensions = {
            # 图片
            'jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp',
            # 文档
            'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md',
            # 压缩文件
            'zip', 'rar', '7z', 'tar', 'gz',
            # 其他
            'json', 'xml', 'csv', 'sqlite', 'db'
        }
        
        # 确保基础目录存在
        for d in [self.public_dir, self.modules_dir, self.system_dir]:
            d.mkdir(parents=True, exist_ok=True)
        
        # 初始化所有标准模块目录
        self._init_standard_dirs()
    
    def _init_standard_dirs(self):
        """
        初始化所有标准模块存储目录
        系统启动时自动创建，确保目录结构符合开发规范
        """
        # 定义标准模块目录结构
        # 格式：{模块名: [子目录列表]}
        standard_module_dirs = {
            # AI 模块
            "ai": ["ai_models", "uploads", "outputs"],
            # OCR 模块  
            "ocr": ["ocr_models", "uploads", "outputs"],
            # 地图模块
            "map": ["map_tiles", "map_gps", "uploads", "outputs"],
            # 知识库模块
            "knowledge": ["embedding_models", "vector_db", "uploads", "outputs"],
            # 数据分析模块
            "analysis": ["uploads", "outputs", "temp"],
            # IM 模块
            "im": ["uploads", "outputs"],
            # PDF 模块
            "pdf": ["uploads", "outputs"],
            # 相册模块 (统一二元结构: uploads 存原图, outputs 存缩略图)
            "album": ["uploads", "outputs"],
            # 视频模块 (统一二元结构: uploads 存视频, outputs 存封面缩略图)
            "video": ["uploads", "outputs"],
            # 博客模块
            "blog": ["uploads", "outputs"],
            # 笔记模块
            "notes": ["uploads", "outputs"],
            # 数据透镜
            "datalens": ["uploads", "outputs"],
            # 课程模块
            "course": ["uploads", "outputs"],
            # 考试模块
            "exam": ["uploads", "outputs"],
            # 反馈模块
            "feedback": ["uploads", "outputs"],
            # 文件管理
            "filemanager": ["uploads", "outputs"],
        }
        
        for module_name, sub_dirs in standard_module_dirs.items():
            module_dir = self.modules_dir / module_name
            module_dir.mkdir(parents=True, exist_ok=True)
            for sub_dir in sub_dirs:
                (module_dir / sub_dir).mkdir(parents=True, exist_ok=True)
        
        # 初始化标准系统目录
        standard_system_dirs = ["backups", "logs", "transfer_temp"]
        for category in standard_system_dirs:
            self.get_system_dir(category)
            
        # 初始化标准公共目录
        (self.public_dir / "avatars").mkdir(parents=True, exist_ok=True)
        (self.public_dir / "attachments").mkdir(parents=True, exist_ok=True)

        logger.debug("标准存储目录初始化完成")

    def get_user_dir(self, user_id: int, sub_dir: str = "uploads") -> Path:
        """
        获取用户私有目录 (重定向至 filemanager 模块)
        
        按照新规范，所有用户在网盘上传的文件均存放在 modules/filemanager 下
        """
        return self.get_module_dir("filemanager", sub_dir=sub_dir, user_id=user_id)

    def get_module_dir(self, module_name: str, sub_dir: str = "", user_id: Optional[int] = None) -> Path:
        """
        获取模块专属目录
        
        Args:
            module_name: 模块名称
            sub_dir: 子目录（如 temp, archive）
            user_id: 用户ID（可选，用于用户隔离）
        
        Returns:
            模块目录路径
        """
        target = self.modules_dir / module_name
        if sub_dir:
            target = target / sub_dir
        if user_id is not None:
            target = target / f"user_{user_id}"
        target.mkdir(parents=True, exist_ok=True)
        return target

    def get_system_dir(self, category: str) -> Path:
        """获取系统级目录（备份、日志等）"""
        target = self.system_dir / category
        target.mkdir(parents=True, exist_ok=True)
        return target
    
    def delete_user_files(self, user_id: int) -> bool:
        """
        删除用户的所有文件（用于用户注销等场景）
        
        Args:
            user_id: 用户ID
        
        Returns:
            是否成功
        """
        import shutil
        success = True
        
        # 删除 modules 目录下所有模块的用户文件
        # (filemanager 的文件也包含在内，因为 users_dir 已弃用)
        
        # 删除 modules 目录下所有模块的用户文件
        for module_dir in self.modules_dir.iterdir():
            if module_dir.is_dir():
                for sub_dir in module_dir.iterdir():
                    if sub_dir.is_dir():
                        user_module_dir = sub_dir / f"user_{user_id}"
                        if user_module_dir.exists():
                            try:
                                shutil.rmtree(user_module_dir)
                                logger.info(f"已删除模块用户目录: {user_module_dir}")
                            except Exception as e:
                                logger.error(f"删除模块用户目录失败: {user_module_dir}, 错误: {e}")
                                success = False
        
        return success

    def generate_filename(self, original_filename: str, user_id: Optional[int] = None, category: str = "attachments", module: Optional[str] = None, sub_type: str = "uploads") -> Tuple[str, str]:
        """
        生成唯一文件名，遵循 6.3 存储规则
        
        规则优先级:
        1. 如果指定了业务模块: modules/{module}/{sub_type}/user_{user_id}/filename
        2. 如果无业务模块且有 user_id 且非 avatar: 重定向至网盘 modules/filemanager/uploads/user_{user_id}/filename
        3. 如果是 avatar 或无 user_id: public/{category}/filename
        
        Args:
            original_filename: 原始文件名
            user_id: 用户ID
            category: 业务分类 (avatar, blog, note, attachment)
            module: 模块名 (可选)
            sub_type: 子类型 (uploads, exports, temp, archive)
        
        Returns:
            (相对路径, 完整路径)
        """
        ext = Path(original_filename).suffix.lower().lstrip('.')
        file_id = str(uuid.uuid4())
        filename = f"{file_id}.{ext}" if ext else file_id
        
        if module:
            # 模块专用路径
            rel_dir = f"modules/{module}/{sub_type}"
            if user_id:
                rel_dir += f"/user_{user_id}"
            base_dir = self.root_dir / rel_dir
        elif user_id and category != "avatar":
            # 无明确模块的用户文件，统一归口至网盘 (filemanager)
            rel_dir = f"modules/filemanager/{sub_type}/user_{user_id}"
            base_dir = self.root_dir / rel_dir
        else:
            # 公共路径: public/{category}/filename
            dir_name = "avatars" if category == "avatar" else (category if category else "attachments")
            rel_dir = f"public/{dir_name}"
            # 公共附件按年月做一层哈希，避免单目录文件过多
            if category != "avatar":
                date_dir = datetime.now().strftime("%Y/%m")
                rel_dir += f"/{date_dir}"
            base_dir = self.root_dir / rel_dir

        base_dir.mkdir(parents=True, exist_ok=True)
        full_path = base_dir / filename
        relative_path = Path(rel_dir) / filename
        
        return str(relative_path).replace('\\', '/'), str(full_path)

    
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
                    
                    # 允许常见的图片格式互换 (例如 .jpg 文件实际是 .png)
                    image_types = {'jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'}
                    is_image_swap = (normalized_ext in image_types and normalized_detected in image_types)

                    # 如果检测到的类型与扩展名不匹配，且不是允许的图片互换，则拒绝
                    if normalized_ext != normalized_detected and not is_image_swap:
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





