"""
相册模块业务逻辑
实现相册和照片的管理操作
"""

import os
import logging
from typing import Optional, List, Tuple
from datetime import datetime
from sqlalchemy import select, func, and_, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from PIL import Image
import io

from .album_models import Album, AlbumPhoto
from .album_schemas import AlbumCreate, AlbumUpdate, PhotoUpdate

logger = logging.getLogger(__name__)

# 缩略图尺寸
THUMBNAIL_SIZE = (300, 300)
# 允许的图片类型
ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp'}
ALLOWED_MIME_TYPES = {'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'}

import zipfile

def create_zip_stream(files: List[Tuple[str, str]]) -> io.BytesIO:
    """
    创建 ZIP 文件流
    Args:
        files: 文件列表，每个元素为 (file_path, archive_name)
    """
    memory_file = io.BytesIO()
    with zipfile.ZipFile(memory_file, 'w', zipfile.ZIP_DEFLATED) as zf:
        for file_path, archive_name in files:
            if os.path.exists(file_path):
                zf.write(file_path, archive_name)
    memory_file.seek(0)
    return memory_file


class AlbumService:
    """
    相册服务类
    提供相册和照片的 CRUD 操作
    """
    
    # ==================== 相册操作 ====================
    
    @staticmethod
    async def create_album(
        db: AsyncSession,
        user_id: int,
        data: AlbumCreate
    ) -> Album:
        """创建相册"""
        album = Album(
            user_id=user_id,
            **data.model_dump()
        )
        db.add(album)
        await db.flush()
        await db.refresh(album)
        logger.info(f"创建相册: id={album.id}, user_id={user_id}, name={album.name}")
        return album
    
    @staticmethod
    async def get_album_by_id(
        db: AsyncSession,
        album_id: int,
        user_id: Optional[int] = None,
        include_photos: bool = False
    ) -> Optional[Album]:
        """
        根据ID获取相册
        
        Args:
            db: 数据库会话
            album_id: 相册ID
            user_id: 用户ID（如果指定，只返回该用户的相册）
            include_photos: 是否包含照片列表
        """
        query = select(Album).where(Album.id == album_id)
        if user_id is not None:
            query = query.where(Album.user_id == user_id)
        if include_photos:
            query = query.options(selectinload(Album.photos))
        
        result = await db.execute(query)
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_album_list(
        db: AsyncSession,
        user_id: int,
        page: int = 1,
        page_size: int = 20,
        keyword: Optional[str] = None
    ) -> Tuple[List[Album], int]:
        """
        获取用户的相册列表
        
        Returns:
            (albums, total): 相册列表和总数
        """
        conditions = [Album.user_id == user_id]
        if keyword:
            conditions.append(Album.name.ilike(f"%{keyword}%"))
        
        # 查询总数
        count_query = select(func.count(Album.id)).where(and_(*conditions))
        total_result = await db.execute(count_query)
        total = total_result.scalar() or 0
        
        # 查询数据
        query = select(Album).where(and_(*conditions))
        query = query.order_by(Album.updated_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)
        
        result = await db.execute(query)
        albums = result.scalars().all()
        
        return list(albums), total
    
    @staticmethod
    async def update_album(
        db: AsyncSession,
        album_id: int,
        data: AlbumUpdate,
        user_id: int
    ) -> Optional[Album]:
        """更新相册"""
        album = await AlbumService.get_album_by_id(db, album_id, user_id)
        if not album:
            return None
        
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(album, key, value)
        
        await db.flush()
        await db.refresh(album)
        logger.info(f"更新相册: id={album_id}")
        return album
    
    @staticmethod
    async def delete_album(
        db: AsyncSession,
        album_id: int,
        user_id: int
    ) -> bool:
        """删除相册（同时删除所有照片）"""
        album = await AlbumService.get_album_by_id(db, album_id, user_id, include_photos=True)
        if not album:
            return False
        
        # 删除物理文件
        for photo in album.photos:
            AlbumService._delete_photo_files(photo)
        
        await db.delete(album)
        logger.info(f"删除相册: id={album_id}")
        return True
    
    # ==================== 照片操作 ====================
    
    @staticmethod
    async def upload_photo(
        db: AsyncSession,
        user_id: int,
        album_id: int,
        file_content: bytes,
        filename: str,
        content_type: str,
        storage_manager
    ) -> Optional[AlbumPhoto]:
        """
        上传照片到相册
        
        Args:
            db: 数据库会话
            user_id: 用户ID
            album_id: 相册ID
            file_content: 文件内容
            filename: 原始文件名
            content_type: MIME类型
            storage_manager: 存储管理器
        """
        # 验证相册归属
        album = await AlbumService.get_album_by_id(db, album_id, user_id)
        if not album:
            return None
        
        # 验证文件类型
        ext = os.path.splitext(filename)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise ValueError(f"不支持的文件类型: {ext}")
        
        # 生成存储路径
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        safe_filename = f"{timestamp}{ext}"
        
        # 获取模块存储目录
        photo_dir = storage_manager.get_module_dir("album", "photos", user_id=user_id)
        thumb_dir = storage_manager.get_module_dir("album", "thumbnails", user_id=user_id)
        
        photo_path = os.path.join(photo_dir, safe_filename)
        thumb_path = os.path.join(thumb_dir, safe_filename)
        
        # 保存原图
        with open(photo_path, 'wb') as f:
            f.write(file_content)
        
        # 获取图片信息并生成缩略图
        width, height = None, None
        try:
            img = Image.open(io.BytesIO(file_content))
            width, height = img.size
            
            # 生成缩略图
            img.thumbnail(THUMBNAIL_SIZE, Image.Resampling.LANCZOS)
            
            # 处理 RGBA 模式（PNG 透明图片），转换为 RGB 以便保存为 JPEG
            if img.mode in ('RGBA', 'LA', 'P'):
                # 创建白色背景
                background = Image.new('RGB', img.size, (255, 255, 255))
                if img.mode == 'P':
                    img = img.convert('RGBA')
                background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
                img = background
            elif img.mode != 'RGB':
                img = img.convert('RGB')
            
            img.save(thumb_path, 'JPEG', quality=85)
        except Exception as e:
            logger.warning(f"生成缩略图失败: {e}")
            thumb_path = None
        
        # 创建数据库记录
        photo = AlbumPhoto(
            user_id=user_id,
            album_id=album_id,
            filename=filename,
            storage_path=photo_path,
            thumbnail_path=thumb_path,
            width=width,
            height=height,
            file_size=len(file_content),
            mime_type=content_type,
            sort_order=album.photo_count
        )
        db.add(photo)
        
        # 更新相册照片数量
        album.photo_count += 1
        
        # 如果是第一张照片，设为封面
        if album.photo_count == 1:
            await db.flush()
            await db.refresh(photo)
            album.cover_photo_id = photo.id
        
        await db.flush()
        await db.refresh(photo)
        logger.info(f"上传照片: id={photo.id}, album_id={album_id}")
        return photo
    
    @staticmethod
    async def get_photo_by_id(
        db: AsyncSession,
        photo_id: int,
        user_id: Optional[int] = None
    ) -> Optional[AlbumPhoto]:
        """根据ID获取照片"""
        query = select(AlbumPhoto).where(AlbumPhoto.id == photo_id)
        if user_id is not None:
            query = query.where(AlbumPhoto.user_id == user_id)
        
        result = await db.execute(query)
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_photos_by_album(
        db: AsyncSession,
        album_id: int,
        user_id: int
    ) -> List[AlbumPhoto]:
        """获取相册中的所有照片"""
        query = select(AlbumPhoto).where(
            and_(
                AlbumPhoto.album_id == album_id,
                AlbumPhoto.user_id == user_id
            )
        ).order_by(AlbumPhoto.sort_order, AlbumPhoto.created_at)
        
        result = await db.execute(query)
        return list(result.scalars().all())
    
    @staticmethod
    async def update_photo(
        db: AsyncSession,
        photo_id: int,
        data: PhotoUpdate,
        user_id: int
    ) -> Optional[AlbumPhoto]:
        """更新照片信息"""
        photo = await AlbumService.get_photo_by_id(db, photo_id, user_id)
        if not photo:
            return None
        
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(photo, key, value)
        
        await db.flush()
        await db.refresh(photo)
        logger.info(f"更新照片: id={photo_id}")
        return photo
    
    @staticmethod
    async def delete_photos(
        db: AsyncSession,
        photo_ids: List[int],
        user_id: int
    ) -> int:
        """批量删除照片"""
        query = select(AlbumPhoto).where(
            and_(
                AlbumPhoto.id.in_(photo_ids),
                AlbumPhoto.user_id == user_id
            )
        )
        result = await db.execute(query)
        photos = result.scalars().all()
        
        if not photos:
            return 0
        
        album_ids = set()
        deleted_count = 0
        
        for photo in photos:
            album_ids.add(photo.album_id)
            # 删除物理文件
            AlbumService._delete_photo_files(photo)
            await db.delete(photo)
            deleted_count += 1
            
        # 更新相关相册的照片数量和封面
        if album_ids:
            for album_id in album_ids:
                # 重新计算该相册的照片数量
                count_query = select(func.count(AlbumPhoto.id)).where(AlbumPhoto.album_id == album_id)
                count_res = await db.execute(count_query)
                count = count_res.scalar() or 0
                
                album = await AlbumService.get_album_by_id(db, album_id, user_id)
                if album:
                    album.photo_count = max(0, count)
                    # 如果封面被删除，设为 None（或者设为第一张照片，这里简单处理为 None）
                    if album.cover_photo_id in photo_ids:
                        album.cover_photo_id = None

        logger.info(f"批量删除照片: count={deleted_count}, user_id={user_id}")
        return deleted_count

    @staticmethod
    async def get_photos_by_ids(
        db: AsyncSession,
        photo_ids: List[int],
        user_id: int
    ) -> List[AlbumPhoto]:
        """根据 ID 列表获取照片"""
        query = select(AlbumPhoto).where(
            and_(
                AlbumPhoto.id.in_(photo_ids),
                AlbumPhoto.user_id == user_id
            )
        )
        result = await db.execute(query)
        return list(result.scalars().all())
    
    @staticmethod
    def _delete_photo_files(photo: AlbumPhoto):
        """删除照片的物理文件"""
        try:
            if photo.storage_path and os.path.exists(photo.storage_path):
                os.remove(photo.storage_path)
            if photo.thumbnail_path and os.path.exists(photo.thumbnail_path):
                os.remove(photo.thumbnail_path)
        except Exception as e:
            logger.warning(f"删除照片文件失败: {e}")
    
    @staticmethod
    def get_photo_url(photo: AlbumPhoto, base_url: str = "/api/v1/album") -> str:
        """获取照片访问URL"""
        return f"{base_url}/photos/{photo.id}/file"
    
    @staticmethod
    def get_thumbnail_url(photo: AlbumPhoto, base_url: str = "/api/v1/album") -> str:
        """获取缩略图访问URL（仅在文件存在时返回）"""
        if photo.thumbnail_path and os.path.exists(photo.thumbnail_path):
            return f"{base_url}/photos/{photo.id}/thumbnail"
        return AlbumService.get_photo_url(photo, base_url)

    @staticmethod
    async def reorder_photos(
        db: AsyncSession,
        album_id: int,
        photo_ids: List[int],
        user_id: int
    ):
        """
        批量更新照片排序
        """
        for index, photo_id in enumerate(photo_ids):
             await db.execute(
                 update(AlbumPhoto)
                 .where(
                     and_(
                         AlbumPhoto.id == photo_id,
                         AlbumPhoto.album_id == album_id,
                         AlbumPhoto.user_id == user_id
                     )
                 )
                 .values(sort_order=index)
             )
