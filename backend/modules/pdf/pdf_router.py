"""
PDF 工具模块 API 路由
定义 PDF 处理相关的 RESTful API
"""

import logging
import os
from typing import Optional, List
from fastapi import APIRouter, Depends, Query, HTTPException, Response, UploadFile, File
from fastapi.responses import StreamingResponse, FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user, require_permission, TokenData
from core.errors import NotFoundException, success_response, ErrorCode, error_response
from core.pagination import create_page_response
from utils.storage import get_storage_manager
from pathlib import Path

from .pdf_schemas import (
    PdfMergeRequest,
    PdfSplitRequest,
    PdfConvertRequest,
    PdfResponse,
    PdfMetadata,
    PdfCompressRequest,
    PdfWatermarkRequest,
    PdfImagesToPdfRequest,
    PdfToImagesRequest,
    PdfToWordRequest,
    PdfToExcelRequest,
    PdfRemoveWatermarkRequest,
    PdfEncryptRequest,
    PdfDecryptRequest,
    PdfRotateRequest,
    PdfReorderRequest,
    PdfExtractPagesRequest,
    PdfAddPageNumbersRequest,
    PdfSignRequest,
    PdfWordToPdfRequest,
    PdfExcelToPdfRequest,
    PdfSaveTextRequest
)
from .pdf_services import PdfService

logger = logging.getLogger(__name__)

# 路由不设置 prefix，由 loader 自动添加
router = APIRouter()


def _get_pdf_storage_paths(user_id: int) -> tuple:
    """获取 PDF 模块的存储路径"""
    storage = get_storage_manager()
    # 使用 StorageManager 提供的标准方法获取目录
    uploads_dir = storage.get_module_dir("pdf", "uploads", user_id)
    outputs_dir = storage.get_module_dir("pdf", "outputs", user_id)
    base_dir = uploads_dir.parent
    
    return storage, base_dir, uploads_dir, outputs_dir


def _scan_directory(directory: Path, storage_root: Path, category: str) -> list:
    """扫描目录获取文件列表"""
    files = []
    if directory.exists():
        for file_path in directory.iterdir():
            if file_path.is_file():
                stat = file_path.stat()
                files.append({
                    "name": file_path.name,
                    "path": str(file_path.relative_to(storage_root)),
                    "full_path": str(file_path),
                    "size": stat.st_size,
                    "created_at": stat.st_ctime * 1000,
                    "updated_at": stat.st_mtime * 1000,
                    "type": file_path.suffix[1:].lower() if file_path.suffix else "unknown",
                    "category": category
                })
    return files


@router.get("/files", response_model=dict, summary="获取 PDF 文件列表")
async def get_pdf_files(
    category: Optional[str] = Query(None, description="分类: uploads, outputs, 为空则获取全部"),
    user: TokenData = Depends(get_current_user)
):
    """
    获取用户的 PDF 文件列表
    - uploads: 用户上传的原始 PDF 文件
    - outputs: PDF 工具处理后生成的文件
    """
    storage, base_dir, uploads_dir, outputs_dir = _get_pdf_storage_paths(user.user_id)
    
    files = []
    if category is None or category == "uploads":
        files.extend(_scan_directory(uploads_dir, storage.root_dir, "uploads"))
    if category is None or category == "outputs":
        files.extend(_scan_directory(outputs_dir, storage.root_dir, "outputs"))
    
    # 按更新时间倒序排序
    files.sort(key=lambda x: x["updated_at"], reverse=True)
    
    return success_response(data={
        "files": files,
        "uploads_count": len([f for f in files if f["category"] == "uploads"]),
        "outputs_count": len([f for f in files if f["category"] == "outputs"])
    }, message="获取成功")


@router.post("/upload", response_model=dict, summary="上传 PDF 文件")
async def upload_pdf(
    file: UploadFile = File(...),
    user: TokenData = Depends(get_current_user)
):
    """
    上传文件到 PDF 模块的 uploads 目录
    支持 PDF 和常见图片格式（用于签名、图片转PDF等）
    """
    # 验证文件类型
    ext = file.filename.lower().split('.')[-1] if '.' in file.filename else ''
    allowed_exts = {'pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx', 'xls', 'xlsx', 'csv'}
    if ext not in allowed_exts:
        raise HTTPException(status_code=400, detail=f"不支持的文件类型，仅支持: {', '.join(allowed_exts)}")
    
    storage, base_dir, uploads_dir, outputs_dir = _get_pdf_storage_paths(user.user_id)
    
    # 生成安全的文件名（过滤路径分隔符，防止路径穿越）
    safe_filename = os.path.basename(file.filename or "unnamed").replace('..', '_')
    if not safe_filename:
        safe_filename = "unnamed"
    save_path = uploads_dir / safe_filename
    
    # 如果文件已存在，添加后缀
    counter = 1
    while save_path.exists():
        name, ext = os.path.splitext(file.filename)
        safe_filename = f"{name}_{counter}{ext}"
        save_path = uploads_dir / safe_filename
        counter += 1
    
    # 保存文件
    content = await file.read()
    with open(save_path, "wb") as f:
        f.write(content)
    
    logger.info(f"用户 {user.user_id} 上传 PDF 文件: {safe_filename}")
    
    return success_response(data={
        "name": safe_filename,
        "path": str(save_path.relative_to(storage.root_dir)),
        "size": len(content)
    }, message="上传成功")


@router.delete("/files/{filename}", response_model=dict, summary="删除 PDF 文件")
async def delete_pdf_file(
    filename: str,
    category: str = Query("uploads", description="分类: uploads 或 outputs"),
    user: TokenData = Depends(get_current_user)
):
    """删除 PDF 模块中的文件"""
    storage, base_dir, uploads_dir, outputs_dir = _get_pdf_storage_paths(user.user_id)
    
    # 安全过滤文件名
    safe_name = os.path.basename(filename).replace('..', '_')
    if not safe_name:
        raise HTTPException(status_code=400, detail="无效的文件名")
    
    target_dir = uploads_dir if category == "uploads" else outputs_dir
    file_path = target_dir / safe_name
    
    # 安全检查：确保文件在正确目录内
    try:
        file_path.resolve().relative_to(target_dir.resolve())
    except ValueError:
        raise HTTPException(status_code=403, detail="非法路径访问")
    
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="文件不存在")
    
    file_path.unlink()
    logger.info(f"用户 {user.user_id} 删除文件: {filename}")
    
    return success_response(message="删除成功")


@router.get("/history", response_model=dict, summary="获取操作历史")
async def get_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取 PDF 工具使用历史"""
    items, total = await PdfService.list_history(db, user.user_id, page, page_size)
    return create_page_response(
        items=[PdfResponse.model_validate(item) for item in items],
        total=total,
        page=page,
        page_size=page_size,
        message="获取成功"
    )


@router.get("/metadata", response_model=dict, summary="获取 PDF 元数据")
async def get_metadata(
    file_id: Optional[int] = Query(None, description="文件ID"),
    path: Optional[str] = Query(None, description="逻辑存储路径 (用于虚拟挂载文件)"),
    source: str = Query("filemanager", description="来源: filemanager, upload"),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取指定 PDF 的元数据、页数等信息"""
    try:
        if file_id is not None:
             file_path, _ = await PdfService.get_file_path(db, file_id, user.user_id, source)
        elif path:
             file_path, _ = await PdfService.get_file_path_by_storage(user.user_id, path)
        else:
             return error_response(code=ErrorCode.VALIDATION_ERROR, message="必须提供 file_id 或 path")
             
        meta = await PdfService.get_metadata(file_path)
        return success_response(data=meta, message="解析成功")
    except ValueError as e:
        return error_response(code=ErrorCode.VALIDATION_ERROR, message=str(e))


@router.get("/render", summary="预览 PDF 页面")
async def render_page(
    file_id: Optional[int] = Query(None, description="文件ID"),
    path: Optional[str] = Query(None, description="逻辑存储路径 (用于虚拟挂载文件)"),
    page: int = Query(0, ge=0, description="页码"),
    zoom: float = Query(2.0, ge=0.5, le=5.0, description="缩放比例"),
    source: str = Query("filemanager"),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """将 PDF 某页渲染为 PNG 图片返回"""
    try:
        if file_id is not None:
             file_path, _ = await PdfService.get_file_path(db, file_id, user.user_id, source)
        elif path:
             file_path, _ = await PdfService.get_file_path_by_storage(user.user_id, path)
        else:
             raise HTTPException(status_code=400, detail="必须提供 file_id 或 path")
             
        img_data = await PdfService.render_page(file_path, page, zoom)
        return Response(content=img_data, media_type="image/png")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/merge", response_model=dict, summary="合并 PDF")
async def merge_pdf(
    request: PdfMergeRequest,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("pdf.create"))
):
    """合并多个 PDF 文件"""
    try:
        output_path = await PdfService.merge_pdfs(db, user.user_id, request)
        await db.commit()
        return success_response(data={"path": output_path}, message="合并成功")
    except ValueError as e:
        return error_response(message=str(e))


@router.post("/split", response_model=dict, summary="拆分 PDF")
async def split_pdf(
    request: PdfSplitRequest,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("pdf.create"))
):
    """拆分 PDF 文件"""
    try:
        output_path = await PdfService.split_pdf(db, user.user_id, request)
        await db.commit()
        return success_response(data={"path": output_path}, message="拆分成功")
    except ValueError as e:
        return error_response(message=str(e))


@router.post("/compress", response_model=dict, summary="压缩 PDF")
async def compress_pdf(
    request: PdfCompressRequest,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("pdf.create"))
):
    """压缩 PDF 文件"""
    try:
        output_path = await PdfService.compress_pdf(db, user.user_id, request)
        await db.commit()
        return success_response(data={"path": output_path}, message="压缩成功")
    except ValueError as e:
        return error_response(message=str(e))


@router.post("/watermark", response_model=dict, summary="添加水印")
async def add_watermark(
    request: PdfWatermarkRequest,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("pdf.create"))
):
    """为 PDF 添加水印"""
    try:
        output_path = await PdfService.add_watermark(db, user.user_id, request)
        await db.commit()
        return success_response(data={"path": output_path}, message="添加水印成功")
    except ValueError as e:
        return error_response(message=str(e))


@router.post("/images-to-pdf", response_model=dict, summary="图片转 PDF")
async def images_to_pdf(
    request: PdfImagesToPdfRequest,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("pdf.create"))
):
    """将多张图片转换为 PDF"""
    try:
        output_path = await PdfService.images_to_pdf(db, user.user_id, request)
        await db.commit()
        return success_response(data={"path": output_path}, message="转换成功")
    except ValueError as e:
        return error_response(message=str(e))


@router.post("/pdf-to-images", response_model=dict, summary="PDF 转图片")
async def pdf_to_images(
    request: PdfToImagesRequest,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("pdf.create"))
):
    """将 PDF 转换为图片压缩包"""
    try:
        output_path = await PdfService.pdf_to_images(db, user.user_id, request)
        await db.commit()
        return success_response(data={"path": output_path}, message="转换成功")
    except ValueError as e:
        return error_response(message=str(e))


@router.get("/download-result", summary="下载处理结果")
async def download_result(
    filename: str = Query(..., description="文件名"),
    user: TokenData = Depends(get_current_user)
):
    """下载 PDF 处理后的结果文件"""
    storage = get_storage_manager()
    
    # 安全过滤文件名，防止路径穿越
    safe_filename = os.path.basename(filename).replace('..', '_')
    if not safe_filename:
        raise HTTPException(status_code=400, detail="无效的文件名")
    
    # 获取正确的模块目录 (输出目录和上传目录)
    output_dir = storage.get_module_dir("pdf", "outputs", user.user_id)
    upload_dir = storage.get_module_dir("pdf", "uploads", user.user_id)
    
    # 按优先级查找文件
    search_paths = [
        output_dir / safe_filename,
        upload_dir / safe_filename
    ]
    
    file_path = None
    for path in search_paths:
        if path.exists() and path.is_file():
            file_path = path
            break
    
    if not file_path:
        raise HTTPException(status_code=404, detail="文件不存在")
    
    # 路径遍历检查
    try:
        file_path = file_path.resolve()
        storage_root = storage.root_dir.resolve()
        # 只要在 storage 根目录下即视为安全（因为已通过 user_id 筛选了目录）
        if not str(file_path).startswith(str(storage_root)):
            raise HTTPException(status_code=403, detail="非法路径访问")
    except Exception:
        raise HTTPException(status_code=403, detail="非法路径访问")

    # 强制下载处理
    from urllib.parse import quote
    encoded_filename = quote(filename)
    
    return FileResponse(
        path=file_path,
        media_type="application/octet-stream",
        filename=filename,
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}"
        }
    )


@router.get("/extract-text", response_model=dict, summary="提取文本")
async def extract_text(
    file_id: Optional[int] = Query(None, description="文件ID (文件管理器)"),
    path: Optional[str] = Query(None, description="文件路径 (PDF模块)"),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """提取 PDF 全文文本"""
    try:
        # 使用通用的解析方法，支持 ID 或 Path
        file_path, _ = await PdfService._resolve_file(db, user.user_id, file_id, path)
        text = await PdfService.extract_text(str(file_path))
        return success_response(data={"text": text}, message="提取成功")
    except ValueError as e:
        return error_response(message=str(e))


# 新增功能路由

@router.post("/pdf-to-word", response_model=dict, summary="PDF 转 Word")
async def pdf_to_word(
    request: PdfToWordRequest,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("pdf.create"))
):
    """将 PDF 转换为 Word 文档"""
    try:
        output_path = await PdfService.pdf_to_word(db, user.user_id, request)
        await db.commit()
        return success_response(data={"path": output_path}, message="转换成功")
    except ValueError as e:
        return error_response(message=str(e))


@router.post("/pdf-to-excel", response_model=dict, summary="PDF 转 Excel")
async def pdf_to_excel(
    request: PdfToExcelRequest,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("pdf.create"))
):
    """将 PDF 中的表格提取为 Excel"""
    try:
        output_path = await PdfService.pdf_to_excel(db, user.user_id, request)
        await db.commit()
        return success_response(data={"path": output_path}, message="转换成功")
    except ValueError as e:
        return error_response(message=str(e))


@router.post("/remove-watermark", response_model=dict, summary="去除水印")
async def remove_watermark(
    request: PdfRemoveWatermarkRequest,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("pdf.create"))
):
    """去除 PDF 水印"""
    try:
        output_path = await PdfService.remove_watermark(db, user.user_id, request)
        await db.commit()
        return success_response(data={"path": output_path}, message="处理成功")
    except ValueError as e:
        return error_response(message=str(e))


@router.post("/encrypt", response_model=dict, summary="加密 PDF")
async def encrypt_pdf(
    request: PdfEncryptRequest,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("pdf.create"))
):
    """为 PDF 添加密码保护"""
    try:
        output_path = await PdfService.encrypt_pdf(db, user.user_id, request)
        await db.commit()
        return success_response(data={"path": output_path}, message="加密成功")
    except ValueError as e:
        return error_response(message=str(e))


@router.post("/decrypt", response_model=dict, summary="解密 PDF")
async def decrypt_pdf(
    request: PdfDecryptRequest,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("pdf.create"))
):
    """移除 PDF 密码保护"""
    try:
        output_path = await PdfService.decrypt_pdf(db, user.user_id, request)
        await db.commit()
        return success_response(data={"path": output_path}, message="解密成功")
    except ValueError as e:
        return error_response(message=str(e))


@router.post("/rotate", response_model=dict, summary="旋转页面")
async def rotate_pdf(
    request: PdfRotateRequest,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("pdf.create"))
):
    """旋转 PDF 页面"""
    try:
        output_path = await PdfService.rotate_pdf(db, user.user_id, request)
        await db.commit()
        return success_response(data={"path": output_path}, message="旋转成功")
    except ValueError as e:
        return error_response(message=str(e))


@router.post("/reorder", response_model=dict, summary="页面重排")
async def reorder_pages(
    request: PdfReorderRequest,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("pdf.create"))
):
    """重新排列 PDF 页面顺序"""
    try:
        output_path = await PdfService.reorder_pages(db, user.user_id, request)
        await db.commit()
        return success_response(data={"path": output_path}, message="重排成功")
    except ValueError as e:
        return error_response(message=str(e))


@router.post("/extract-pages", response_model=dict, summary="提取页面")
async def extract_pages(
    request: PdfExtractPagesRequest,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("pdf.create"))
):
    """提取 PDF 指定页面"""
    try:
        output_path = await PdfService.extract_pages(db, user.user_id, request)
        await db.commit()
        return success_response(data={"path": output_path}, message="提取成功")
    except ValueError as e:
        return error_response(message=str(e))


@router.post("/add-page-numbers", response_model=dict, summary="添加页码")
async def add_page_numbers(
    request: PdfAddPageNumbersRequest,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("pdf.create"))
):
    """为 PDF 添加页码"""
    try:
        output_path = await PdfService.add_page_numbers(db, user.user_id, request)
        await db.commit()
        return success_response(data={"path": output_path}, message="添加页码成功")
    except ValueError as e:
        return error_response(message=str(e))


@router.post("/sign", response_model=dict, summary="添加签名")
async def add_signature(
    request: PdfSignRequest,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("pdf.create"))
):
    """为 PDF 添加签名或印章图片"""
    try:
        output_path = await PdfService.add_signature(db, user.user_id, request)
        await db.commit()
        return success_response(data={"path": output_path}, message="添加签名成功")
    except ValueError as e:
        return error_response(message=str(e))


@router.post("/delete-pages", response_model=dict, summary="删除页面")
async def delete_pages(
    file_id: Optional[int] = Query(None, description="文件ID"),
    path: Optional[str] = Query(None, description="文件路径"),
    page_ranges: str = Query(..., description="要删除的页码范围"),
    output_name: Optional[str] = Query(None, description="输出文件名"),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("pdf.create"))
):
    """删除 PDF 中的指定页面"""
    try:
        output_path = await PdfService.delete_pages(db, user.user_id, file_id, page_ranges, output_name, path)
        await db.commit()
        return success_response(data={"path": output_path}, message="删除成功")
    except ValueError as e:
        return error_response(message=str(e))


@router.post("/reverse", response_model=dict, summary="反转页面")
async def reverse_pages(
    file_id: Optional[int] = Query(None, description="文件ID"),
    path: Optional[str] = Query(None, description="文件路径"),
    output_name: Optional[str] = Query(None, description="输出文件名"),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("pdf.create"))
):
    """反转 PDF 页面顺序"""
    try:
        output_path = await PdfService.reverse_pages(db, user.user_id, file_id, output_name, path)
        await db.commit()
        return success_response(data={"path": output_path}, message="反转成功")
    except ValueError as e:
        return error_response(message=str(e))


@router.post("/word-to-pdf", response_model=dict, summary="Word 转 PDF")
async def word_to_pdf(
    request: PdfWordToPdfRequest,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("pdf.create"))
):
    """Word 转 PDF"""
    try:
        output_path = await PdfService.word_to_pdf(db, user.user_id, request)
        await db.commit()
        return success_response(data={"path": output_path}, message="转换成功")
    except ValueError as e:
        return error_response(message=str(e))


@router.post("/excel-to-pdf", response_model=dict, summary="Excel 转 PDF")
async def excel_to_pdf(
    request: PdfExcelToPdfRequest,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("pdf.create"))
):
    """Excel 转 PDF"""
    try:
        output_path = await PdfService.excel_to_pdf(db, user.user_id, request)
        await db.commit()
        return success_response(data={"path": output_path}, message="转换成功")
    except ValueError as e:
        return error_response(message=str(e))


@router.post("/save-text", response_model=dict, summary="保存提取的文本")
async def save_text(
    request: PdfSaveTextRequest,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("pdf.create"))
):
    """保存提取的文本到文件"""
    try:
        output_path = await PdfService.save_extracted_text(db, user.user_id, request)
        await db.commit()
        return success_response(data={"path": output_path}, message="保存成功")
    except ValueError as e:
        return error_response(message=str(e))

