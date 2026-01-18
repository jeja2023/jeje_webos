import pytest
from unittest.mock import MagicMock, patch
from sqlalchemy.ext.asyncio import AsyncSession

from modules.album.album_services import AlbumService
from modules.album.album_schemas import AlbumCreate, AlbumUpdate, PhotoUpdate
from modules.album.album_models import Album, AlbumPhoto

# Mock user ID
USER_ID = 1

class TestAlbumModule:
    """Album模块测试"""
    
    @pytest.fixture
    def mock_storage_manager(self):
        manager = MagicMock()
        manager.get_module_dir.return_value = "/tmp/mock_dir"
        return manager

    @pytest.mark.asyncio
    async def test_album_crud(self, db: AsyncSession):
        """测试相册增删改查"""
        # 1. Create
        create_data = AlbumCreate(name="Test Album", description="Desc", is_public=True)
        album = await AlbumService.create_album(db, USER_ID, create_data)
        
        assert album.id is not None
        assert album.name == "Test Album"
        assert album.user_id == USER_ID
        
        # 2. Get
        fetched = await AlbumService.get_album_by_id(db, album.id, USER_ID)
        assert fetched is not None
        assert fetched.name == "Test Album"
        
        # 3. Update
        update_data = AlbumUpdate(name="Updated Album")
        updated = await AlbumService.update_album(db, album.id, update_data, USER_ID)
        assert updated.name == "Updated Album"
        
        # 4. List
        albums, total = await AlbumService.get_album_list(db, USER_ID, 1, 10)
        assert total >= 1
        assert len(albums) >= 1
        assert albums[0].name == "Updated Album"
        
        # 5. Delete
        # Mock delete_photo_files logic
        with patch.object(AlbumService, '_delete_photo_files'):
            success = await AlbumService.delete_album(db, album.id, USER_ID)
            assert success is True
            
        fetched_after = await AlbumService.get_album_by_id(db, album.id, USER_ID)
        assert fetched_after is None

    @pytest.mark.asyncio
    async def test_photo_upload_flow(self, db: AsyncSession, mock_storage_manager):
        """测试照片上传流程（使用 Mock）"""
        # 准备环境
        album = await AlbumService.create_album(
            db, USER_ID, AlbumCreate(name="Photo Test")
        )
        
        file_content = b"fake image content"
        filename = "test.jpg"
        content_type = "image/jpeg"
        
        # Mock Image processing and file operations
        with patch("builtins.open", new_callable=MagicMock) as mock_open:
            with patch("PIL.Image.open") as mock_img_open:
                 # Mock PIL Image object
                mock_img = MagicMock()
                mock_img.size = (800, 600)
                mock_img.mode = 'RGB'
                mock_img_open.return_value = mock_img
                
                with patch("os.path.exists", return_value=False):
                    # Perform Upload
                    photo = await AlbumService.upload_photo(
                        db, USER_ID, album.id, file_content, filename, content_type, mock_storage_manager
                    )
                    
        assert photo is not None
        assert photo.filename == filename
        assert photo.album_id == album.id
        assert photo.width == 800
        assert photo.height == 600
        
        # Verify Album stats
        await db.refresh(album)
        assert album.photo_count == 1
        assert album.cover_photo_id == photo.id
        
        # Test Update Photo
        update_data = PhotoUpdate(title="Nice Shot", sort_order=2)
        updated_photo = await AlbumService.update_photo(db, photo.id, update_data, USER_ID)
        assert updated_photo.title == "Nice Shot"
        
        # Test Delete Photo
        with patch("os.remove") as mock_remove:
            deleted_count = await AlbumService.delete_photos(db, [photo.id], USER_ID)
            assert deleted_count == 1
            
        fetched_photo = await AlbumService.get_photo_by_id(db, photo.id, USER_ID)
        assert fetched_photo is None
