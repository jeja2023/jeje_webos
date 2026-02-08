# -*- coding: utf-8 -*-
"""
OCR 模块 API 路由
"""

import logging
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from typing import Optional, List

from core.security import get_current_user, TokenData
from schemas.response import success, error
from .ocr_services import OCRService
from .ocr_schemas import OCRRecognizeRequest

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/status")
async def get_status():
    """获取 OCR 服务状态"""
    try:
        status = OCRService.get_status()
        return success(data=status)
    except Exception as e:
        logger.error(f"获取 OCR 状态失败: {e}")
        return error(message=str(e))


@router.post("/recognize")
async def recognize_image(
    file: UploadFile = File(..., description="要识别的图片文件"),
    detect_direction: bool = Form(False, description="是否检测文字方向"),
    language: str = Form("ch", description="识别语言"),
    user: TokenData = Depends(get_current_user)
):
    """
    识别上传图片中的文字
    
    支持格式: JPG, PNG, BMP, WEBP 等常见图片格式
    """
    try:
        # 验证文件类型（Content-Type 检查）
        allowed_types = ["image/jpeg", "image/png", "image/bmp", "image/webp", "image/gif", "application/pdf"]
        if file.content_type not in allowed_types:
            return error(code=400, message=f"不支持的文件类型: {file.content_type}")
        
        # 读取文件内容
        image_data = await file.read()
        
        # 文件大小限制 (10MB)
        if len(image_data) > 10 * 1024 * 1024:
            return error(code=400, message="文件大小不能超过 10MB")
        
        # 文件魔数验证（防止 Content-Type 伪造）
        try:
            import filetype
            kind = filetype.guess(image_data[:8192])
            if kind and kind.mime not in allowed_types:
                return error(code=400, message=f"文件内容与声明类型不匹配")
        except ImportError:
            pass  # filetype 库未安装时跳过
        
        # 执行识别
        result = OCRService.recognize_image(
            image_data=image_data,
            detect_direction=detect_direction,
            language=language
        )
        
        logger.info(f"用户 {user.user_id} 识别图片成功，文字长度: {len(result['text'])}")
        
        return success(data={
            "filename": file.filename,
            **result
        })
        
    except RuntimeError as e:
        # PaddleOCR 未安装
        logger.error(f"OCR 服务不可用: {e}")
        return error(code=503, message=str(e))
    except Exception as e:
        logger.error(f"图片识别失败: {e}")
        return error(code=500, message=f"识别失败: {str(e)}")


@router.post("/recognize/base64")
async def recognize_base64(
    request: OCRRecognizeRequest,
    user: TokenData = Depends(get_current_user)
):
    """
    识别 Base64 编码的图片
    
    适用于前端截图或 canvas 导出的场景
    """
    try:
        if not request.image_base64:
            return error(code=400, message="缺少图片数据")
        
        result = OCRService.recognize_from_base64(
            base64_data=request.image_base64,
            detect_direction=request.detect_direction,
            language=request.language
        )
        
        logger.info(f"用户 {user.user_id} Base64 识别成功，文字长度: {len(result['text'])}")
        
        return success(data=result)
        
    except RuntimeError as e:
        logger.error(f"OCR 服务不可用: {e}")
        return error(code=503, message=str(e))
    except Exception as e:
        logger.error(f"Base64 识别失败: {e}")
        return error(code=500, message=f"识别失败: {str(e)}")


@router.post("/recognize/batch")
async def recognize_batch(
    files: List[UploadFile] = File(..., description="要识别的图片文件列表"),
    detect_direction: bool = Form(False),
    language: str = Form("ch"),
    user: TokenData = Depends(get_current_user)
):
    """
    批量识别多张图片
    
    最多支持 10 张图片同时识别
    """
    try:
        if len(files) > 10:
            return error(code=400, message="单次最多识别 10 张图片")
        
        results = []
        for file in files:
            try:
                image_data = await file.read()
                result = OCRService.recognize_image(
                    image_data=image_data,
                    detect_direction=detect_direction,
                    language=language
                )
                results.append({
                    "filename": file.filename,
                    "success": True,
                    **result
                })
            except Exception as e:
                results.append({
                    "filename": file.filename,
                    "success": False,
                    "error": str(e)
                })
        
        # 统计成功数量
        success_count = sum(1 for r in results if r.get("success"))
        
        logger.info(f"用户 {user.user_id} 批量识别完成，成功 {success_count}/{len(files)}")
        
        return success(data={
            "total": len(files),
            "success_count": success_count,
            "results": results
        })
        
    except RuntimeError as e:
        logger.error(f"OCR 服务不可用: {e}")
        return error(code=503, message=str(e))
    except Exception as e:
        logger.error(f"批量识别失败: {e}")
        return error(code=500, message=f"批量识别失败: {str(e)}")
