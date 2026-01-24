"""
PDF 工具模块数据验证
定义请求/响应的数据结构
"""

from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict, Field


# ==================== 基础模型 ====================

class PdfBase(BaseModel):
    """基础数据模型"""
    title: str = Field(..., min_length=1, max_length=200, description="标题")
    filename: Optional[str] = Field(None, description="文件名")


class PdfMetadata(BaseModel):
    """PDF 元数据"""
    title: Optional[str] = None
    author: Optional[str] = None
    subject: Optional[str] = None
    keywords: Optional[str] = None
    creator: Optional[str] = None
    producer: Optional[str] = None
    creationDate: Optional[str] = None
    modDate: Optional[str] = None
    page_count: int = 0
    size_bytes: int = 0
    is_encrypted: bool = False


class PdfMergeRequest(BaseModel):
    """合并 PDF 请求"""
    file_ids: List[int] = Field(..., description="要合并的文件ID列表（按顺序）")
    output_name: str = Field(..., min_length=1, description="输出文件名")


class PdfSplitRequest(BaseModel):
    """拆分 PDF 请求"""
    file_id: int = Field(..., description="文件ID")
    page_ranges: str = Field(..., description="页码范围，如 '1-3, 5, 8-10'")
    output_name: Optional[str] = Field(None, description="输出文件名（可选）")


class PdfConvertRequest(BaseModel):
    """转换 PDF 请求"""
    file_id: int = Field(..., description="文件ID")
    target_format: str = Field("png", description="目标格式: png, jpg, txt")


class PdfCompressRequest(BaseModel):
    """压缩 PDF 请求"""
    file_id: int = Field(..., description="文件ID")
    level: int = Field(2, ge=0, le=4, description="压缩等级 0-4 (0: 默认, 4: 最大压缩)")
    output_name: Optional[str] = Field(None, description="输出文件名")


class PdfWatermarkRequest(BaseModel):
    """添加水印请求"""
    file_id: int = Field(..., description="文件ID")
    text: str = Field(..., description="水印文本")
    output_name: Optional[str] = Field(None, description="输出文件名")
    color: List[float] = Field([0.5, 0.5, 0.5], description="RGB颜色 [0-1, 0-1, 0-1]")
    opacity: float = Field(0.3, ge=0.0, le=1.0, description="透明度")
    fontsize: int = Field(24, ge=10, le=100, description="字体大小")


class PdfImagesToPdfRequest(BaseModel):
    """图片转 PDF 请求"""
    file_ids: List[int] = Field(..., description="图片文件ID列表")
    output_name: str = Field(..., description="输出文件名")


class PdfToImagesRequest(BaseModel):
    """PDF 转图片请求"""
    file_id: int = Field(..., description="文件ID")
    page_ranges: Optional[str] = Field(None, description="页码范围，默认全部")


class PdfToWordRequest(BaseModel):
    """PDF 转 Word 请求"""
    file_id: int = Field(..., description="文件ID")
    output_name: Optional[str] = Field(None, description="输出文件名")


class PdfToExcelRequest(BaseModel):
    """PDF 转 Excel 请求（提取表格）"""
    file_id: int = Field(..., description="文件ID")
    output_name: Optional[str] = Field(None, description="输出文件名")
    page_ranges: Optional[str] = Field(None, description="页码范围，默认全部")


class PdfRemoveWatermarkRequest(BaseModel):
    """PDF 去水印请求"""
    file_id: int = Field(..., description="文件ID")
    output_name: Optional[str] = Field(None, description="输出文件名")
    method: str = Field("auto", description="去水印方法: auto, text, image")


class PdfEncryptRequest(BaseModel):
    """PDF 加密请求"""
    file_id: int = Field(..., description="文件ID")
    password: str = Field(..., min_length=1, description="密码")
    output_name: Optional[str] = Field(None, description="输出文件名")
    owner_password: Optional[str] = Field(None, description="所有者密码（可选，用于更多权限控制）")


class PdfDecryptRequest(BaseModel):
    """PDF 解密请求"""
    file_id: int = Field(..., description="文件ID")
    password: str = Field(..., description="当前密码")
    output_name: Optional[str] = Field(None, description="输出文件名")


class PdfRotateRequest(BaseModel):
    """PDF 旋转页面请求"""
    file_id: int = Field(..., description="文件ID")
    angle: int = Field(90, description="旋转角度: 90, 180, 270, -90")
    page_ranges: Optional[str] = Field(None, description="页码范围，默认全部页面")
    output_name: Optional[str] = Field(None, description="输出文件名")


class PdfReorderRequest(BaseModel):
    """PDF 页面重排请求"""
    file_id: int = Field(..., description="文件ID")
    page_order: List[int] = Field(..., description="新的页面顺序（从1开始的页码列表）")
    output_name: Optional[str] = Field(None, description="输出文件名")


class PdfExtractPagesRequest(BaseModel):
    """PDF 提取页面请求"""
    file_id: int = Field(..., description="文件ID")
    page_ranges: str = Field(..., description="要提取的页码范围，如 '1, 3-5, 8'")
    output_name: Optional[str] = Field(None, description="输出文件名")


class PdfAddPageNumbersRequest(BaseModel):
    """PDF 添加页码请求"""
    file_id: int = Field(..., description="文件ID")
    position: str = Field("bottom-center", description="页码位置: bottom-left, bottom-center, bottom-right, top-left, top-center, top-right")
    start_number: int = Field(1, ge=1, description="起始页码")
    format: str = Field("{n}", description="页码格式，{n}为当前页，{total}为总页数")
    fontsize: int = Field(12, ge=8, le=36, description="字体大小")
    output_name: Optional[str] = Field(None, description="输出文件名")


class PdfOcrRequest(BaseModel):
    """PDF OCR 识别请求"""
    file_id: int = Field(..., description="文件ID")
    language: str = Field("chi_sim+eng", description="OCR 语言: chi_sim, eng, chi_sim+eng")
    output_name: Optional[str] = Field(None, description="输出文件名")


class PdfSignRequest(BaseModel):
    """PDF 添加签名/印章请求"""
    file_id: int = Field(..., description="文件ID")
    image_file_id: int = Field(..., description="签名/印章图片文件ID")
    page: int = Field(1, ge=1, description="签名页码")
    x: float = Field(..., description="X 坐标位置（百分比 0-100）")
    y: float = Field(..., description="Y 坐标位置（百分比 0-100）")
    width: float = Field(20, description="宽度（百分比 0-100）")
    output_name: Optional[str] = Field(None, description="输出文件名")


class PdfResponse(PdfBase):
    """响应模型"""
    id: int = Field(..., description="ID")
    user_id: int = Field(..., description="用户ID")
    file_id: Optional[int] = Field(None, description="关联的文件管理器文件ID")
    created_at: datetime = Field(..., description="创建时间")
    
    model_config = ConfigDict(from_attributes=True)


class PdfListResponse(BaseModel):
    """列表响应"""
    items: List[PdfResponse] = Field(..., description="数据列表")
    total: int = Field(..., description="总数")
    page: int = Field(..., description="当前页")
    page_size: int = Field(..., description="每页数量")
