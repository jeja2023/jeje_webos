"""
视频模块业务逻辑
实现视频集和视频的管理操作
"""

import os
import logging
import subprocess
from typing import Optional, List, Tuple
from datetime import datetime
from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .video_models import VideoCollection, Video
from .video_schemas import CollectionCreate, CollectionUpdate, VideoUpdate

logger = logging.getLogger(__name__)

# 缩略图尺寸
THUMBNAIL_SIZE = (320, 180)
# 允许的视频类型
ALLOWED_EXTENSIONS = {'.mp4', '.webm', '.mov', '.avi', '.mkv', '.flv', '.wmv', '.m4v'}
ALLOWED_MIME_TYPES = {'video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 
                       'video/x-matroska', 'video/x-flv', 'video/x-ms-wmv', 'video/x-m4v'}

# FFmpeg 可用性标志（只检测一次）
_ffmpeg_available = None
_ffmpeg_checked = False


def check_ffmpeg_available() -> bool:
    """
    检查 FFmpeg 是否可用（只检测一次）
    """
    global _ffmpeg_available, _ffmpeg_checked
    
    if _ffmpeg_checked:
        return _ffmpeg_available
    
    _ffmpeg_checked = True
    
    try:
        # 检测 ffmpeg
        result = subprocess.run(
            ['ffmpeg', '-version'], 
            capture_output=True, 
            timeout=5,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
        )
        if result.returncode != 0:
            raise Exception("ffmpeg 返回错误")
        
        # 检测 ffprobe
        result = subprocess.run(
            ['ffprobe', '-version'], 
            capture_output=True, 
            timeout=5,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
        )
        if result.returncode != 0:
            raise Exception("ffprobe 返回错误")
        
        _ffmpeg_available = True
        logger.info("FFmpeg 已就绪，视频缩略图和元信息功能可用")
    except Exception as e:
        _ffmpeg_available = False
        logger.warning(
            f"FFmpeg 未安装或不可用 ({e})。视频仍可正常上传播放，"
            "但无法生成缩略图和获取视频时长。"
            "如需完整功能，请安装 FFmpeg: https://ffmpeg.org/download.html"
        )
    
    return _ffmpeg_available


class VideoService:
    """
    视频服务类
    提供视频集和视频的 CRUD 操作
    """
    
    # ==================== 视频集操作 ====================
    
    @staticmethod
    async def create_collection(
        db: AsyncSession,
        user_id: int,
        data: CollectionCreate
    ) -> VideoCollection:
        """创建视频集"""
        collection = VideoCollection(
            user_id=user_id,
            **data.model_dump()
        )
        db.add(collection)
        await db.flush()
        await db.refresh(collection)
        logger.info(f"创建视频集: id={collection.id}, user_id={user_id}, name={collection.name}")
        return collection
    
    @staticmethod
    async def get_collection_by_id(
        db: AsyncSession,
        collection_id: int,
        user_id: Optional[int] = None,
        include_videos: bool = False
    ) -> Optional[VideoCollection]:
        """
        根据ID获取视频集
        
        Args:
            db: 数据库会话
            collection_id: 视频集ID
            user_id: 用户ID（如果指定，只返回该用户的视频集）
            include_videos: 是否包含视频列表
        """
        query = select(VideoCollection).where(VideoCollection.id == collection_id)
        if user_id is not None:
            query = query.where(VideoCollection.user_id == user_id)
        if include_videos:
            query = query.options(selectinload(VideoCollection.videos))
        
        result = await db.execute(query)
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_collection_list(
        db: AsyncSession,
        user_id: int,
        page: int = 1,
        page_size: int = 20,
        keyword: Optional[str] = None
    ) -> Tuple[List[VideoCollection], int]:
        """
        获取用户的视频集列表
        
        Returns:
            (collections, total): 视频集列表和总数
        """
        conditions = [VideoCollection.user_id == user_id]
        if keyword:
            conditions.append(VideoCollection.name.ilike(f"%{keyword}%"))
        
        # 查询总数
        count_query = select(func.count(VideoCollection.id)).where(and_(*conditions))
        total_result = await db.execute(count_query)
        total = total_result.scalar() or 0
        
        # 查询数据
        query = select(VideoCollection).where(and_(*conditions))
        query = query.order_by(VideoCollection.updated_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)
        
        result = await db.execute(query)
        collections = result.scalars().all()
        
        return list(collections), total
    
    @staticmethod
    async def update_collection(
        db: AsyncSession,
        collection_id: int,
        data: CollectionUpdate,
        user_id: int
    ) -> Optional[VideoCollection]:
        """更新视频集"""
        collection = await VideoService.get_collection_by_id(db, collection_id, user_id)
        if not collection:
            return None
        
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(collection, key, value)
        
        await db.flush()
        await db.refresh(collection)
        logger.info(f"更新视频集: id={collection_id}")
        return collection
    
    @staticmethod
    async def delete_collection(
        db: AsyncSession,
        collection_id: int,
        user_id: int
    ) -> bool:
        """删除视频集（同时删除所有视频）"""
        collection = await VideoService.get_collection_by_id(db, collection_id, user_id, include_videos=True)
        if not collection:
            return False
        
        # 删除物理文件
        for video in collection.videos:
            VideoService._delete_video_files(video)
        
        await db.delete(collection)
        logger.info(f"删除视频集: id={collection_id}")
        return True
    
    # ==================== 视频操作 ====================
    
    @staticmethod
    async def upload_video(
        db: AsyncSession,
        user_id: int,
        collection_id: int,
        file_content: bytes,
        filename: str,
        content_type: str,
        storage_manager
    ) -> Optional[Video]:
        """
        上传视频到视频集
        
        Args:
            db: 数据库会话
            user_id: 用户ID
            collection_id: 视频集ID
            file_content: 文件内容
            filename: 原始文件名
            content_type: MIME类型
            storage_manager: 存储管理器
        """
        # 验证视频集归属
        collection = await VideoService.get_collection_by_id(db, collection_id, user_id)
        if not collection:
            return None
        
        # 验证文件类型
        ext = os.path.splitext(filename)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise ValueError(f"不支持的文件类型: {ext}")
        
        # 生成存储路径
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        safe_filename = f"{timestamp}{ext}"
        
        # 获取模块存储目录
        video_dir = storage_manager.get_module_dir("video", "videos", user_id=user_id)
        thumb_dir = storage_manager.get_module_dir("video", "thumbnails", user_id=user_id)
        
        video_path = os.path.join(video_dir, safe_filename)
        thumb_path = os.path.join(thumb_dir, f"{timestamp}.jpg")
        
        # 保存视频文件
        with open(video_path, 'wb') as f:
            f.write(file_content)
        
        # 获取视频信息并生成缩略图（仅在 FFmpeg 可用时）
        duration, width, height = None, None, None
        thumbnail_created = False
        
        if check_ffmpeg_available():
            try:
                # 使用 ffprobe 获取视频信息
                probe_result = VideoService._get_video_info(video_path)
                if probe_result:
                    duration = probe_result.get('duration')
                    width = probe_result.get('width')
                    height = probe_result.get('height')
                
                # 使用 ffmpeg 生成缩略图
                thumbnail_created = VideoService._generate_thumbnail(video_path, thumb_path)
            except Exception as e:
                logger.warning(f"处理视频元数据失败: {e}")
        
        # 创建数据库记录
        video = Video(
            user_id=user_id,
            collection_id=collection_id,
            filename=filename,
            storage_path=video_path,
            thumbnail_path=thumb_path if thumbnail_created else None,
            duration=duration,
            width=width,
            height=height,
            file_size=len(file_content),
            mime_type=content_type,
            sort_order=collection.video_count
        )
        db.add(video)
        
        # 更新视频集视频数量
        collection.video_count += 1
        
        # 如果是第一个视频，设为封面
        if collection.video_count == 1:
            await db.flush()
            await db.refresh(video)
            collection.cover_video_id = video.id
        
        await db.flush()
        await db.refresh(video)
        logger.info(f"上传视频: id={video.id}, collection_id={collection_id}")
        return video
    
    @staticmethod
    def _get_video_info(video_path: str) -> Optional[dict]:
        """使用 ffprobe 获取视频信息"""
        try:
            cmd = [
                'ffprobe', '-v', 'quiet', '-print_format', 'json',
                '-show_format', '-show_streams', video_path
            ]
            # Windows 上隐藏命令窗口
            kwargs = {'capture_output': True, 'text': True, 'timeout': 30}
            if os.name == 'nt':
                kwargs['creationflags'] = subprocess.CREATE_NO_WINDOW
            
            result = subprocess.run(cmd, **kwargs)
            if result.returncode == 0:
                import json
                data = json.loads(result.stdout)
                
                # 获取视频流信息
                video_stream = None
                for stream in data.get('streams', []):
                    if stream.get('codec_type') == 'video':
                        video_stream = stream
                        break
                
                info = {}
                if video_stream:
                    info['width'] = video_stream.get('width')
                    info['height'] = video_stream.get('height')
                
                # 获取时长
                format_info = data.get('format', {})
                duration_str = format_info.get('duration')
                if duration_str:
                    info['duration'] = int(float(duration_str))
                
                return info
        except Exception as e:
            logger.debug(f"获取视频信息失败: {e}")
        return None
    
    @staticmethod
    def _generate_thumbnail(video_path: str, thumb_path: str) -> bool:
        """使用 ffmpeg 生成视频缩略图"""
        try:
            cmd = [
                'ffmpeg', '-i', video_path, '-ss', '00:00:01',
                '-vframes', '1', '-q:v', '2',
                '-vf', f'scale={THUMBNAIL_SIZE[0]}:{THUMBNAIL_SIZE[1]}:force_original_aspect_ratio=decrease',
                '-y', thumb_path
            ]
            # Windows 上隐藏命令窗口
            kwargs = {'capture_output': True, 'timeout': 60}
            if os.name == 'nt':
                kwargs['creationflags'] = subprocess.CREATE_NO_WINDOW
            
            result = subprocess.run(cmd, **kwargs)
            return result.returncode == 0 and os.path.exists(thumb_path)
        except Exception as e:
            logger.debug(f"生成视频缩略图失败: {e}")
        return False
    
    @staticmethod
    async def get_video_by_id(
        db: AsyncSession,
        video_id: int,
        user_id: Optional[int] = None
    ) -> Optional[Video]:
        """根据ID获取视频"""
        query = select(Video).where(Video.id == video_id)
        if user_id is not None:
            query = query.where(Video.user_id == user_id)
        
        result = await db.execute(query)
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_videos_by_collection(
        db: AsyncSession,
        collection_id: int,
        user_id: int
    ) -> List[Video]:
        """获取视频集中的所有视频"""
        query = select(Video).where(
            and_(
                Video.collection_id == collection_id,
                Video.user_id == user_id
            )
        ).order_by(Video.sort_order, Video.created_at)
        
        result = await db.execute(query)
        return list(result.scalars().all())
    
    @staticmethod
    async def update_video(
        db: AsyncSession,
        video_id: int,
        data: VideoUpdate,
        user_id: int
    ) -> Optional[Video]:
        """更新视频信息"""
        video = await VideoService.get_video_by_id(db, video_id, user_id)
        if not video:
            return None
        
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(video, key, value)
        
        await db.flush()
        await db.refresh(video)
        logger.info(f"更新视频: id={video_id}")
        return video
    
    @staticmethod
    async def delete_videos(
        db: AsyncSession,
        video_ids: List[int],
        user_id: int
    ) -> int:
        """批量删除视频"""
        query = select(Video).where(
            and_(
                Video.id.in_(video_ids),
                Video.user_id == user_id
            )
        )
        result = await db.execute(query)
        videos = result.scalars().all()
        
        if not videos:
            return 0
        
        collection_ids = set()
        deleted_count = 0
        
        for video in videos:
            collection_ids.add(video.collection_id)
            # 删除物理文件
            VideoService._delete_video_files(video)
            await db.delete(video)
            deleted_count += 1
            
        # 更新相关视频集的视频数量和封面
        if collection_ids:
            for collection_id in collection_ids:
                # 重新计算该视频集的视频数量
                count_query = select(func.count(Video.id)).where(Video.collection_id == collection_id)
                count_res = await db.execute(count_query)
                count = count_res.scalar() or 0
                
                collection = await VideoService.get_collection_by_id(db, collection_id, user_id)
                if collection:
                    collection.video_count = max(0, count)
                    # 如果封面被删除，设为 None
                    if collection.cover_video_id in video_ids:
                        collection.cover_video_id = None

        if deleted_count > 0:
            msg = f"删除视频: id={video_ids[0]}" if len(video_ids) == 1 else f"批量删除视频: count={deleted_count}"
            logger.info(f"{msg}, user_id={user_id}")
            
        return deleted_count
    
    @staticmethod
    def _delete_video_files(video: Video):
        """删除视频的物理文件"""
        try:
            if video.storage_path and os.path.exists(video.storage_path):
                os.remove(video.storage_path)
            if video.thumbnail_path and os.path.exists(video.thumbnail_path):
                os.remove(video.thumbnail_path)
        except Exception as e:
            logger.warning(f"删除视频文件失败: {e}")
    
    @staticmethod
    def get_video_url(video: Video, base_url: str = "/api/v1/video") -> str:
        """获取视频访问URL"""
        return f"{base_url}/videos/{video.id}/file"
    
    @staticmethod
    def get_thumbnail_url(video: Video, base_url: str = "/api/v1/video") -> str:
        """获取缩略图访问URL（仅在文件存在时返回）"""
        if video.thumbnail_path and os.path.exists(video.thumbnail_path):
            return f"{base_url}/videos/{video.id}/thumbnail"
        return ""
    
    @staticmethod
    def format_duration(seconds: Optional[int]) -> str:
        """格式化时长显示"""
        if seconds is None:
            return ""
        hours = seconds // 3600
        minutes = (seconds % 3600) // 60
        secs = seconds % 60
        if hours > 0:
            return f"{hours}:{minutes:02d}:{secs:02d}"
        return f"{minutes}:{secs:02d}"
