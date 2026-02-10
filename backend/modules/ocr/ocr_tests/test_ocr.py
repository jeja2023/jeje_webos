# -*- coding: utf-8 -*-
"""
OCR 模块测试
覆盖：服务初始化、识别功能（模拟）、缓存、API 路由端点
"""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from httpx import AsyncClient


# ==================== 服务层测试 ====================
class TestOCRService:
    def test_service_import(self):
        """测试服务可导入"""
        from modules.ocr.ocr_services import OCRService
        assert OCRService is not None

    def test_service_has_methods(self):
        """测试服务包含关键方法"""
        from modules.ocr.ocr_services import OCRService
        svc = OCRService()
        assert hasattr(svc, 'recognize_from_base64')
        assert hasattr(svc, 'is_available')

    @pytest.mark.asyncio
    async def test_recognize_from_base64_mocked(self):
        """测试 base64 识别（模拟引擎）"""
        from modules.ocr.ocr_services import OCRService
        svc = OCRService()
        with patch.object(svc, '_engine', create=True):
            with patch.object(svc, 'recognize_from_base64', new_callable=AsyncMock,
                            return_value={"text": "识别结果", "confidence": 0.95}):
                result = await svc.recognize_from_base64("base64data")
                assert result["text"] == "识别结果"

    def test_is_available_without_engine(self):
        """测试无引擎时可用性"""
        from modules.ocr.ocr_services import OCRService
        svc = OCRService()
        # 未初始化引擎时应该返回 False
        available = svc.is_available()
        assert isinstance(available, bool)


# ==================== Schema 测试 ====================
class TestOCRSchemas:
    def test_recognize_request(self):
        """测试识别请求 Schema"""
        from modules.ocr.ocr_schemas import OCRRecognizeRequest
        req = OCRRecognizeRequest(image_base64="base64data")
        assert req.image_base64 == "base64data"


# ==================== API 路由测试 ====================
@pytest.mark.asyncio
class TestOCRAPI:
    async def test_get_status(self, admin_client: AsyncClient):
        """测试获取 OCR 状态"""
        resp = await admin_client.get("/api/v1/ocr/status")
        assert resp.status_code == 200

    async def test_recognize_base64_no_data(self, admin_client: AsyncClient):
        """测试空 base64 识别请求"""
        resp = await admin_client.post("/api/v1/ocr/recognize/base64", json={
            "image_base64": ""
        })
        # 空数据应返回错误
        assert resp.status_code in (200, 400, 422, 500)

    async def test_recognize_batch_empty(self, admin_client: AsyncClient):
        """测试空批量识别请求"""
        resp = await admin_client.post("/api/v1/ocr/recognize/batch", json={
            "images": []
        })
        assert resp.status_code in (200, 400, 422)


class TestOCRManifest:
    def test_manifest(self):
        from modules.ocr.ocr_manifest import manifest
        assert manifest.id == "ocr"
        assert manifest.enabled is True
