import pytest
from unittest.mock import MagicMock, patch
from sqlalchemy.ext.asyncio import AsyncSession

from modules.video.video_services import VideoService
from modules.video.video_schemas import CollectionCreate, CollectionUpdate, VideoUpdate
from modules.video.video_models import VideoCollection, Video

# Mock user ID
USER_ID = 1

@pytest.fixture
def mock_storage_manager():
    manager = MagicMock()
    manager.get_module_dir.return_value = "/tmp/mock_dir"
    return manager

class TestVideoModule:
    """Video模块测试"""
    
    @pytest.mark.asyncio
    async def test_video_collection_crud(self, db_session: AsyncSession):
        """测试视频集增删改查"""
        db = db_session # Local alias
        # 1. Create
        create_data = CollectionCreate(name="Test Collection", description="Desc", is_public=True)
        collection = await VideoService.create_collection(db, USER_ID, create_data)
        
        assert collection.id is not None
        assert collection.name == "Test Collection"
        assert collection.user_id == USER_ID
        
        # 2. Get
        fetched = await VideoService.get_collection_by_id(db, collection.id, USER_ID)
        assert fetched is not None
        assert fetched.name == "Test Collection"
        
        # 3. Update
        update_data = CollectionUpdate(name="Updated Name")
        updated = await VideoService.update_collection(db, collection.id, update_data, USER_ID)
        assert updated.name == "Updated Name"
        
        # 4. List
        collections, total = await VideoService.get_collection_list(db, USER_ID, 1, 10)
        assert total >= 1
        assert len(collections) >= 1
        assert collections[0].name == "Updated Name"
        
        # 5. Delete
        # Mock delete_video_files as logic inside delete_collection calls it
        with patch.object(VideoService, '_delete_video_files'):
            success = await VideoService.delete_collection(db, collection.id, USER_ID)
            assert success is True
            
        fetched_after = await VideoService.get_collection_by_id(db, collection.id, USER_ID)
        assert fetched_after is None

    @pytest.mark.asyncio
    async def test_video_upload_flow(self, db_session: AsyncSession, mock_storage_manager):
        """测试视频上传流程（使用 Mock）"""
        db = db_session
        # 准备环境
        collection = await VideoService.create_collection(
            db, USER_ID, CollectionCreate(name="Upload Test")
        )
        
        file_content = b"fake video content"
        filename = "test.mp4"
        content_type = "video/mp4"
        
        # Mock file operations and subprocess
        with patch("builtins.open", new_callable=MagicMock) as mock_open:
            with patch("os.path.exists", return_value=False): # Avoid real file checks
                with patch("modules.video.video_services.check_ffmpeg_available", return_value=False): # Skip FFmpeg
                     # Perform Upload
                    video = await VideoService.upload_video(
                        db, USER_ID, collection.id, file_content, filename, content_type, mock_storage_manager
                    )
                    
        assert video is not None
        assert video.filename == filename
        assert video.collection_id == collection.id
        # assert video.video_count_in_collection == 1 (Assuming there's no direct field but logic updates collection)
        
        # Verify Collection count update
        await db.refresh(collection)
        assert collection.video_count == 1
        assert collection.cover_video_id == video.id
        
        # Test Update Video
        update_data = VideoUpdate(title="New Title", sort_order=5)
        updated_video = await VideoService.update_video(db, video.id, update_data, USER_ID)
        assert updated_video.title == "New Title"
        
        # Test Delete Video
        with patch("os.remove") as mock_remove:
            deleted_count = await VideoService.delete_videos(db, [video.id], USER_ID)
            assert deleted_count == 1
            
        # Verify deletion
        fetched_video = await VideoService.get_video_by_id(db, video.id, USER_ID)
        assert fetched_video is None
