"""
文件管理业务逻辑服务
"""

import os
import logging
from pathlib import Path
from typing import Optional, List, Tuple
from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete, update, or_, and_
from sqlalchemy.orm import selectinload

from .filemanager_models import VirtualFolder, VirtualFile
from models import User
from .filemanager_schemas import (
    FolderCreate, FolderUpdate, FolderInfo, FolderTreeNode,
    FileUpdate, FileInfo, FileListItem, BreadcrumbItem, DirectoryContents, StorageStats
)
from utils.storage import get_storage_manager
from core.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()


class FileManagerService:
    """文件管理服务"""
    
    def __init__(self, db: AsyncSession, user_id: int):
        self.db = db
        self.user_id = user_id
        self.storage = get_storage_manager()
    
    # ============ 文件夹操作 ============
    
    async def get_folder(self, folder_id: int) -> Optional[VirtualFolder]:
        """获取文件夹"""
        result = await self.db.execute(
            select(VirtualFolder)
            .where(VirtualFolder.id == folder_id, VirtualFolder.user_id == self.user_id)
        )
        return result.scalar_one_or_none()
    
    async def get_folder_by_path(self, path: str) -> Optional[VirtualFolder]:
        """根据路径获取文件夹"""
        result = await self.db.execute(
            select(VirtualFolder)
            .where(VirtualFolder.path == path, VirtualFolder.user_id == self.user_id)
        )
        return result.scalar_one_or_none()
    
    async def init_system_folders(self):
        """初始化用户的系统文件夹（保留空实现，兼容性考虑）"""
        pass

    async def register_file(
        self, 
        folder_name: str, 
        filename: str, 
        storage_path: str, 
        file_size: int, 
        mime_type: Optional[str] = None,
        description: Optional[str] = None
    ) -> VirtualFile:
        """
        供其它模块调用的通用文件注册接口
        将已经物理存储的文件注册进 VFS
        """
        # 1. 确保目标文件夹存在
        folder = await self.db.execute(
            select(VirtualFolder).where(
                VirtualFolder.name == folder_name,
                VirtualFolder.user_id == self.user_id,
                VirtualFolder.parent_id == None
            )
        )
        folder = folder.scalar_one_or_none()
        
        if not folder:
            # 自动创建根目录文件夹
            folder = VirtualFolder(
                name=folder_name,
                parent_id=None,
                user_id=self.user_id,
                path=f"/{folder_name}",
                is_system=True,
                icon="📁"
            )
            self.db.add(folder)
            await self.db.flush()
            
        # 2. 处理重名
        base_name, ext = os.path.splitext(filename)
        counter = 1
        final_name = filename
        while True:
            existing = await self.db.execute(
                select(VirtualFile).where(
                    VirtualFile.folder_id == folder.id,
                    VirtualFile.name == final_name,
                    VirtualFile.user_id == self.user_id
                )
            )
            if not existing.scalar_one_or_none():
                break
            final_name = f"{base_name}_{counter}{ext}"
            counter += 1
            
        # 3. 转换相对路径
        rel_path = storage_path
        if os.path.isabs(storage_path):
            rel_path = os.path.relpath(storage_path, self.storage.root_dir).replace('\\', '/')

        # 4. 创建记录
        virtual_file = VirtualFile(
            name=final_name,
            folder_id=folder.id,
            user_id=self.user_id,
            storage_path=rel_path,
            file_size=file_size,
            mime_type=mime_type or self._guess_mime(final_name),
            description=description
        )
        self.db.add(virtual_file)
        await self.db.commit()
        await self.db.refresh(virtual_file)
        
        logger.info(f"模块文件已注册到 VFS: {final_name} -> {folder_name}")
        return virtual_file

    def _guess_mime(self, filename: str) -> str:
        """简单 MIME 猜测"""
        ext = filename.split(".")[-1].lower() if "." in filename else ""
        mime_map = {
            "pdf": "application/pdf",
            "png": "image/png",
            "jpg": "image/jpeg",
            "jpeg": "image/jpeg",
            "gif": "image/gif",
            "mp4": "video/mp4",
            "zip": "application/zip",
            "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        }
        return mime_map.get(ext, "application/octet-stream")
    
    async def create_folder(self, data: FolderCreate) -> VirtualFolder:
        """创建文件夹"""
        parent_path = "/"
        if data.parent_id:
            parent = await self.get_folder(data.parent_id)
            if not parent:
                raise ValueError("父文件夹不存在")
            parent_path = parent.path
        
        full_path = f"{parent_path.rstrip('/')}/{data.name}"
        existing = await self.get_folder_by_path(full_path)
        if existing:
            raise ValueError("同名文件夹已存在")
        
        folder = VirtualFolder(
            name=data.name,
            parent_id=data.parent_id,
            user_id=self.user_id,
            path=full_path
        )
        self.db.add(folder)
        await self.db.commit()
        await self.db.refresh(folder)
        
        logger.info(f"用户 {self.user_id} 创建文件夹: {full_path}")
        return folder
    
    async def update_folder(self, folder_id: int, data: FolderUpdate) -> Optional[VirtualFolder]:
        """更新文件夹（重命名）"""
        folder = await self.get_folder(folder_id)
        if not folder:
            return None
        
        if data.name:
            if folder.is_system:
                raise ValueError("系统保护文件夹不允许重命名")

            old_path = folder.path
            parent_path = "/".join(old_path.split("/")[:-1]) or "/"
            new_path = f"{parent_path.rstrip('/')}/{data.name}"
            
            existing = await self.get_folder_by_path(new_path)
            if existing and existing.id != folder_id:
                raise ValueError("同名文件夹已存在")
            
            folder.name = data.name
            folder.path = new_path
            folder.updated_at = datetime.now()
            
            await self._update_children_paths(folder_id, old_path, new_path)
            await self.db.commit()
        else:
            folder.updated_at = datetime.now()
            await self.db.commit()
        
        return folder
    
    async def _update_children_paths(self, parent_id: int, old_prefix: str, new_prefix: str):
        """递归更新子文件夹路径"""
        result = await self.db.execute(
            select(VirtualFolder)
            .where(VirtualFolder.parent_id == parent_id, VirtualFolder.user_id == self.user_id)
        )
        children = result.scalars().all()
        
        for child in children:
            child.path = child.path.replace(old_prefix, new_prefix, 1)
            await self._update_children_paths(child.id, old_prefix, new_prefix)
    
    async def move_folder(self, folder_id: int, target_parent_id: Optional[int]) -> Optional[VirtualFolder]:
        """移动文件夹"""
        folder = await self.get_folder(folder_id)
        if not folder:
            return None
        
        new_parent_path = "/"
        if target_parent_id:
            if target_parent_id == folder_id:
                raise ValueError("不能将文件夹移动到自己")
            
            target = await self.get_folder(target_parent_id)
            if not target:
                raise ValueError("目标文件夹不存在")
            
            if target.path.startswith(folder.path + "/"):
                raise ValueError("不能将文件夹移动到其子文件夹")
            
            new_parent_path = target.path
        
        old_path = folder.path
        new_path = f"{new_parent_path.rstrip('/')}/{folder.name}"
        
        existing = await self.get_folder_by_path(new_path)
        if existing and existing.id != folder_id:
            raise ValueError("目标位置已存在同名文件夹")
        
        folder.parent_id = target_parent_id
        folder.path = new_path
        folder.updated_at = datetime.now()
        
        await self._update_children_paths(folder_id, old_path, new_path)
        await self.db.commit()
        await self.db.refresh(folder)
        
        return folder
    
    async def delete_folder(self, folder_id: int) -> bool:
        """删除文件夹（级联删除文件）"""
        folder = await self.get_folder(folder_id)
        if not folder:
            return False
            
        if folder.is_system:
            raise ValueError("系统保护文件夹不允许删除")
        
        await self._delete_folder_files(folder_id)
        
        result = await self.db.execute(
            select(VirtualFolder)
            .where(VirtualFolder.parent_id == folder_id, VirtualFolder.user_id == self.user_id)
        )
        children = result.scalars().all()
        for child in children:
            await self.delete_folder(child.id)
        
        await self.db.delete(folder)
        await self.db.commit()
        
        logger.info(f"用户 {self.user_id} 删除文件夹: {folder.path}")
        return True
    
    async def _delete_folder_files(self, folder_id: int):
        """删除文件夹下的所有物理文件"""
        result = await self.db.execute(
            select(VirtualFile)
            .where(VirtualFile.folder_id == folder_id, VirtualFile.user_id == self.user_id)
        )
        files = result.scalars().all()
        
        for file in files:
            try:
                file_path = self.storage.get_file_path(file.storage_path)
                if file_path and file_path.exists():
                    self.storage.delete_file(file.storage_path)
            except Exception as e:
                logger.warning(f"删除物理文件失败: {file.storage_path}, 错误: {e}")
    
    async def get_folder_tree(self) -> List[FolderTreeNode]:
        """获取完整文件夹树"""
        result = await self.db.execute(
            select(VirtualFolder)
            .where(VirtualFolder.user_id == self.user_id)
            .order_by(VirtualFolder.name)
        )
        folders = result.scalars().all()
        
        folder_map = {f.id: FolderTreeNode(id=f.id, name=f.name, path=f.path, children=[]) for f in folders}
        root_nodes = []
        
        for folder in folders:
            node = folder_map[folder.id]
            if folder.parent_id and folder.parent_id in folder_map:
                folder_map[folder.parent_id].children.append(node)
            else:
                root_nodes.append(node)
        
        return root_nodes
    
    # ============ 文件操作 ============
    
    async def get_file(self, file_id: int) -> Optional[VirtualFile]:
        """获取文件"""
        result = await self.db.execute(
            select(VirtualFile)
            .where(VirtualFile.id == file_id, VirtualFile.user_id == self.user_id)
        )
        return result.scalar_one_or_none()
    
    async def _check_storage_quota(self, additional_size: int) -> None:
        """检查存储配额"""
        result = await self.db.execute(
            select(
                User.storage_quota,
                func.coalesce(func.sum(VirtualFile.file_size), 0).label('used_size')
            )
            .outerjoin(VirtualFile, User.id == VirtualFile.user_id)
            .where(User.id == self.user_id)
            .group_by(User.id, User.storage_quota)
        )
        row = result.first()
        
        if not row:
            raise ValueError("用户不存在")
        
        storage_quota = row.storage_quota
        current_size = row.used_size or 0
        
        if storage_quota is None:
            return
        
        if current_size + additional_size > storage_quota:
            used_mb = current_size / 1024 / 1024
            quota_mb = storage_quota / 1024 / 1024
            additional_mb = additional_size / 1024 / 1024
            raise ValueError(
                f"存储空间不足：当前已使用 {used_mb:.2f}MB / {quota_mb:.2f}MB，"
                f"本次上传需要 {additional_mb:.2f}MB，超出配额限制。"
            )
    
    async def upload_file(
        self,
        filename: str,
        content: bytes,
        mime_type: str,
        folder_id: Optional[int] = None,
        description: Optional[str] = None
    ) -> VirtualFile:
        """上传文件"""
        if folder_id:
            folder = await self.get_folder(folder_id)
            if not folder:
                raise ValueError("文件夹不存在")
        
        file_size = len(content)
        await self._check_storage_quota(file_size)
        
        is_valid, error_msg = self.storage.validate_file(filename, file_size, content)
        if not is_valid:
            raise ValueError(error_msg)
        
        relative_path, full_path = self.storage.generate_filename(filename, self.user_id)
        
        try:
            Path(full_path).parent.mkdir(parents=True, exist_ok=True)
            with open(full_path, "wb") as f:
                f.write(content)
        except Exception as e:
            raise ValueError(f"文件保存失败: {str(e)}")
        
        file = VirtualFile(
            name=filename,
            folder_id=folder_id,
            user_id=self.user_id,
            storage_path=relative_path,
            file_size=file_size,
            mime_type=mime_type,
            description=description
        )
        self.db.add(file)
        await self.db.commit()
        await self.db.refresh(file)
        
        logger.info(f"用户 {self.user_id} 上传文件: {filename}")
        return file
    
    async def update_file(self, file_id: int, data: FileUpdate) -> Optional[VirtualFile]:
        """更新文件信息"""
        file = await self.get_file(file_id)
        if not file:
            return None
        
        update_data = data.model_dump(exclude_unset=True)
        if not update_data:
            return file
        
        for key, value in update_data.items():
            setattr(file, key, value)
        
        file.updated_at = datetime.now()
        await self.db.commit()
        await self.db.refresh(file)
        return file
    
    async def move_file(self, file_id: int, target_folder_id: Optional[int]) -> Optional[VirtualFile]:
        """移动文件"""
        file = await self.get_file(file_id)
        if not file:
            return None
        
        if target_folder_id:
            folder = await self.get_folder(target_folder_id)
            if not folder:
                raise ValueError("目标文件夹不存在")
        
        file.folder_id = target_folder_id
        file.updated_at = datetime.now()
        await self.db.commit()
        await self.db.refresh(file)
        return file
    
    async def delete_file(self, file_id: int) -> bool:
        """删除文件"""
        file = await self.get_file(file_id)
        if not file:
            return False
        
        file_path = self.storage.get_file_path(file.storage_path)
        if file_path and file_path.exists():
            self.storage.delete_file(file.storage_path)
        
        await self.db.delete(file)
        await self.db.commit()
        
        logger.info(f"用户 {self.user_id} 删除文件: {file.name}")
        return True
    
    async def batch_delete(self, file_ids: List[int] = None, folder_ids: List[int] = None) -> dict:
        """批量删除文件和文件夹"""
        file_ids = file_ids or []
        folder_ids = folder_ids or []
        
        deleted_files = []
        deleted_folders = []
        errors = []
        
        for folder_id in folder_ids:
            try:
                if await self.delete_folder(folder_id):
                    deleted_folders.append(folder_id)
            except Exception as e:
                errors.append({"type": "folder", "id": folder_id, "error": str(e)})
        
        for file_id in file_ids:
            try:
                if await self.delete_file(file_id):
                    deleted_files.append(file_id)
            except Exception as e:
                errors.append({"type": "file", "id": file_id, "error": str(e)})
        
        return {
            "success_count": len(deleted_files) + len(deleted_folders),
            "failed_count": len(errors),
            "deleted_files": deleted_files,
            "deleted_folders": deleted_folders,
            "errors": errors
        }
    
    async def toggle_star(self, file_id: int) -> Optional[VirtualFile]:
        """切换收藏状态"""
        file = await self.get_file(file_id)
        if not file:
            return None
        
        file.is_starred = not file.is_starred
        file.updated_at = datetime.now()
        await self.db.commit()
        await self.db.refresh(file)
        return file
    
    # ============ 目录浏览 ============
    
    async def browse_directory(
        self,
        folder_id: Optional[int] = None,
        keyword: Optional[str] = None
    ) -> DirectoryContents:
        """浏览目录内容"""
        current_folder = None
        if folder_id:
            current_folder = await self.get_folder(folder_id)
            if not current_folder:
                raise ValueError("文件夹不存在")
        
        breadcrumbs = await self._get_breadcrumbs(folder_id)
        
        # 获取子文件夹
        folder_query = select(VirtualFolder).where(
            VirtualFolder.user_id == self.user_id,
            VirtualFolder.parent_id == folder_id
        )
        if keyword:
            folder_query = folder_query.where(VirtualFolder.name.ilike(f"%{keyword}%"))
        folder_query = folder_query.order_by(VirtualFolder.name)
        
        result = await self.db.execute(folder_query)
        folders = result.scalars().all()
        
        folder_infos = []
        for f in folders:
            folder_infos.append(FolderInfo(
                id=f.id,
                name=f.name,
                parent_id=f.parent_id,
                path=f.path,
                created_at=f.created_at,
                updated_at=f.updated_at,
                file_count=await self._count_folder_files(f.id),
                folder_count=await self._count_subfolders(f.id),
                icon=f.icon or "📁",
                is_system=f.is_system,
                is_virtual=f.is_virtual
            ))
        
        # 获取文件
        file_query = select(VirtualFile).where(
            VirtualFile.user_id == self.user_id,
            VirtualFile.folder_id == folder_id
        )
        if keyword:
            file_query = file_query.where(VirtualFile.name.ilike(f"%{keyword}%"))
        file_query = file_query.order_by(VirtualFile.name)
        
        result = await self.db.execute(file_query)
        files = result.scalars().all()
        
        file_infos = [self._file_to_info(f) for f in files]
        
        return DirectoryContents(
            current_folder=FolderInfo(
                id=current_folder.id,
                name=current_folder.name,
                parent_id=current_folder.parent_id,
                path=current_folder.path,
                created_at=current_folder.created_at,
                updated_at=current_folder.updated_at,
                icon=current_folder.icon or "📁",
                is_system=current_folder.is_system,
                is_virtual=current_folder.is_virtual
            ) if current_folder else None,
            breadcrumbs=breadcrumbs,
            folders=folder_infos,
            files=file_infos,
            total_folders=len(folder_infos),
            total_files=len(file_infos)
        )

    async def _get_breadcrumbs(self, folder_id: Optional[int]) -> List[BreadcrumbItem]:
        """获取面包屑导航"""
        breadcrumbs = [BreadcrumbItem(id=None, name="根目录", path="/")]
        if not folder_id:
            return breadcrumbs
        
        current_id = folder_id
        path_parts = []
        while current_id:
            folder = await self.get_folder(current_id)
            if not folder:
                break
            path_parts.append(BreadcrumbItem(id=folder.id, name=folder.name, path=folder.path))
            current_id = folder.parent_id
        
        path_parts.reverse()
        breadcrumbs.extend(path_parts)
        return breadcrumbs
    
    async def _count_folder_files(self, folder_id: int) -> int:
        """统计文件夹下的文件数"""
        result = await self.db.execute(
            select(func.count(VirtualFile.id))
            .where(VirtualFile.folder_id == folder_id, VirtualFile.user_id == self.user_id)
        )
        return result.scalar_one()
    
    async def _count_subfolders(self, folder_id: int) -> int:
        """统计子文件夹数"""
        result = await self.db.execute(
            select(func.count(VirtualFolder.id))
            .where(VirtualFolder.parent_id == folder_id, VirtualFolder.user_id == self.user_id)
        )
        return result.scalar_one()
    
    def _file_to_info(self, file: VirtualFile) -> FileInfo:
        """转换文件为信息对象"""
        return FileInfo(
            id=file.id,
            name=file.name,
            folder_id=file.folder_id,
            storage_path=file.storage_path,
            file_size=file.file_size,
            mime_type=file.mime_type,
            description=file.description,
            is_starred=file.is_starred,
            created_at=file.created_at,
            updated_at=file.updated_at,
            download_url=f"/api/v1/filemanager/download/{file.id}",
            preview_url=f"/api/v1/filemanager/preview/{file.id}",
            icon=self._get_file_icon(file.mime_type, file.name),
            is_readonly=False
        )
    
    def _get_file_icon(self, mime_type: Optional[str], filename: str) -> str:
        """根据文件类型获取图标"""
        if not mime_type:
            ext = filename.split(".")[-1].lower() if "." in filename else ""
            mime_map = {
                "pdf": "📕", "doc": "📘", "docx": "📘", "xls": "📗", "xlsx": "📗",
                "ppt": "📙", "pptx": "📙", "txt": "📄", "md": "📝",
                "zip": "📦", "rar": "📦", "7z": "📦", "tar": "📦", "gz": "📦",
                "py": "🐍", "js": "📜", "html": "🌐", "css": "🎨", "json": "📋",
                "mp3": "🎵", "wav": "🎵", "flac": "🎵",
                "mp4": "🎬", "avi": "🎬", "mkv": "🎬", "mov": "🎬",
                "jpg": "🖼️", "jpeg": "🖼️", "png": "🖼️", "gif": "🖼️", "svg": "🖼️", "webp": "🖼️",
            }
            return mime_map.get(ext, "📄")
        
        if mime_type.startswith("image/"): return "🖼️"
        elif mime_type.startswith("video/"): return "🎬"
        elif mime_type.startswith("audio/"): return "🎵"
        elif mime_type.startswith("text/"): return "📄"
        elif "pdf" in mime_type: return "📕"
        elif "zip" in mime_type or "compressed" in mime_type: return "📦"
        return "📄"
    
    # ============ 统计 ============
    
    async def get_storage_stats(self) -> StorageStats:
        """获取存储统计"""
        user_result = await self.db.execute(select(User).where(User.id == self.user_id))
        user = user_result.scalar_one_or_none()
        storage_quota = user.storage_quota if user else None
        
        file_count = await self.db.execute(select(func.count(VirtualFile.id)).where(VirtualFile.user_id == self.user_id))
        total_files = file_count.scalar_one()
        
        folder_count = await self.db.execute(select(func.count(VirtualFolder.id)).where(VirtualFolder.user_id == self.user_id))
        total_folders = folder_count.scalar_one()
        
        size_result = await self.db.execute(select(func.coalesce(func.sum(VirtualFile.file_size), 0)).where(VirtualFile.user_id == self.user_id))
        total_size = size_result.scalar_one()
        
        used_percentage = None
        if storage_quota and storage_quota > 0:
            used_percentage = min((total_size / storage_quota) * 100, 100)
        
        starred_count = (await self.db.execute(select(func.count(VirtualFile.id)).where(VirtualFile.user_id == self.user_id, VirtualFile.is_starred == True))).scalar_one()
        
        recent_result = await self.db.execute(select(VirtualFile).where(VirtualFile.user_id == self.user_id).order_by(VirtualFile.updated_at.desc()).limit(5))
        recent_files = [self._file_to_info(f) for f in recent_result.scalars().all()]
        
        return StorageStats(
            total_files=total_files,
            total_folders=total_folders,
            total_size=total_size,
            storage_quota=storage_quota,
            used_percentage=used_percentage,
            starred_count=starred_count,
            recent_files=recent_files
        )
    
    async def search(self, keyword: str) -> DirectoryContents:
        """全局搜索"""
        return await self.browse_directory(keyword=keyword)
    
    async def get_starred_files(self) -> List[FileInfo]:
        """获取收藏的文件"""
        result = await self.db.execute(
            select(VirtualFile)
            .where(VirtualFile.user_id == self.user_id, VirtualFile.is_starred == True)
            .order_by(VirtualFile.updated_at.desc())
        )
        return [self._file_to_info(f) for f in result.scalars().all()]
