import pytest
import base64
from unittest.mock import MagicMock, patch
from modules.ocr.ocr_services import OCRService

# Test Data
FAKE_IMAGE_BYTES = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR..."

@pytest.fixture
def mock_ocr_instance():
    """Mock RapidOCR instance"""
    mock_ocr = MagicMock()
    # Mock return: [ [box, text, score], ... ]
    mock_ocr.return_value = (
        ([ [[0,0], [10,0], [10,10], [0,10]], "Hello", 0.99 ],), 
        0.1 # elapse time
    )
    return mock_ocr

@pytest.fixture
def mock_storage():
    with patch("modules.ocr.ocr_services.get_storage_manager") as mock:
        yield mock

class TestOCRService:
    
    def test_initialization(self, mock_storage):
        """测试服务初始化检查"""
        # Mock class specific behavior if needed
        assert not OCRService._initialized
        
        with patch.dict(OCRService.LANG_MODEL_MAP, {"ch": "fake_model.onnx"}):
            # Check model dir getter
            path = OCRService.get_models_dir()
            assert path is not None

    def test_recognize_image_mocked(self, mock_ocr_instance):
        """测试图片识别流程（使用 Mock 引擎）"""
        
        # Patch the _get_ocr method to return our mock
        with patch.object(OCRService, '_get_ocr', return_value=mock_ocr_instance):
            # 1. Base64 Input
            b64_str = base64.b64encode(FAKE_IMAGE_BYTES).decode()
            
            # Use patch for PIL Image open to avoid real image parsing error on fake bytes
            with patch("PIL.Image.open") as mock_img_open:
                mock_img = MagicMock()
                mock_img.mode = 'RGB'
                mock_img.width = 100
                mock_img.height = 100
                mock_img_open.return_value = mock_img
                
                import numpy as np
                with patch("numpy.array", return_value=np.zeros((100,100,3))):
                     result = OCRService.recognize_from_base64(b64_str)
            
            assert result is not None
            assert "text" in result
            assert result["text"] == "Hello"
            assert result["confidence"] == 0.99
            assert len(result["boxes"]) == 1
            
            # Verify cache logic
            cache_key = list(OCRService._cache.keys())[0]
            # assert OCRService._cache[cache_key]["from_cache"] is True  <-- WRONG
            assert "text" in OCRService._cache[cache_key]
            
            # Second call should hit cache
            result2 = OCRService.recognize_from_base64(b64_str)
            assert result2.get("from_cache") is True

    def test_recognize_pdf_mocked(self, mock_ocr_instance):
        """测试 PDF 识别流程"""
        # Mock fitz (PyMuPDF)
        with patch.dict('sys.modules', {'fitz': MagicMock()}):
            import fitz
            mock_doc = MagicMock()
            mock_page = MagicMock()
            mock_pix = MagicMock()
            mock_pix.width = 100
            mock_pix.height = 100
            mock_pix.samples = b'\x00' * 30000
            
            mock_doc.__len__.return_value = 1
            mock_doc.load_page.return_value = mock_page
            mock_page.get_pixmap.return_value = mock_pix
            fitz.open.return_value = mock_doc
            
            with patch.object(OCRService, '_get_ocr', return_value=mock_ocr_instance):
                with patch("PIL.Image.frombytes") as mock_frombytes:
                    mock_frombytes.return_value = MagicMock()
                    
                    import numpy as np
                    with patch("numpy.array", return_value=np.zeros((100,100,3))):
                        result = OCRService.recognize_pdf(b"%PDF-FAKE")
                        
            assert result["pages"] == 1
            assert "Hello" in result["text"]
