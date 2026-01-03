# -*- coding: utf-8 -*-
"""
OCR 模块数据验证模型
"""

from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime


class OCRBox(BaseModel):
    """文字检测框"""
    text: str = Field(..., description="识别的文字内容")
    confidence: float = Field(..., description="置信度 0-1")
    box: List[List[int]] = Field(..., description="文字区域坐标 [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]")


class OCRResult(BaseModel):
    """单张图片识别结果"""
    text: str = Field(..., description="识别的全部文字（合并）")
    boxes: List[OCRBox] = Field(default=[], description="详细的文字检测框列表")
    confidence: float = Field(..., description="平均置信度")
    processing_time: float = Field(..., description="处理耗时（秒）")


class OCRRecognizeRequest(BaseModel):
    """识别请求（Base64 模式）"""
    image_base64: Optional[str] = Field(None, description="Base64 编码的图片数据")
    detect_direction: bool = Field(False, description="是否检测文字方向")
    language: str = Field("ch", description="识别语言：ch(中英混合)、en(英文)、japan、korean 等")


class OCRHistoryItem(BaseModel):
    """识别历史记录"""
    id: int
    user_id: int
    filename: str
    text: str
    confidence: float
    created_at: datetime
    
    class Config:
        from_attributes = True
