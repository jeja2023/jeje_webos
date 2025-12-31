"""
DataLens 数据透镜模块 - API 路由
定义所有 RESTful API 接口
"""

import json
import logging
import traceback
import os
import sys
from typing import Optional, List
import httpx
from mimetypes import guess_type
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Body
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user, require_permission, TokenData
from schemas import success, error

from .datalens_schemas import (
    DataSourceCreate, DataSourceUpdate, DataSourceResponse, DataSourceTestRequest,
    CategoryCreate, CategoryUpdate, CategoryResponse,
    ViewCreate, ViewUpdate, ViewResponse, ViewDataRequest, ViewDataResponse,
    HubOverviewResponse, PreviewRequest
)
from .datalens_services import (
    DataSourceService, CategoryService, ViewService,
    FavoriteService, RecentViewService, HubService, QueryExecutor
)

logger = logging.getLogger(__name__)
router = APIRouter()


# ==================== Hub 首页 ====================

@router.get("/hub")
async def get_hub_overview(
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """
    获取 Hub 首页概览
    包含视图统计、最近访问、收藏列表
    """
    is_admin = user.role == "admin" or "datalens:admin" in user.permissions
    overview = await HubService.get_overview(db, user.user_id, is_admin)
    return success(data=overview, message="获取概览成功")


# ==================== 数据源管理 ====================

@router.get("/sources")
async def get_datasource_list(
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取数据源列表"""
    is_admin = user.role == "admin" or "datalens:admin" in user.permissions
    sources = await DataSourceService.get_list(db, user.user_id, is_admin)
    return success(data=[
        {
            "id": s.id,
            "name": s.name,
            "type": s.type,
            "description": s.description,
            "is_active": s.is_active,
            "last_connected_at": s.last_connected_at.isoformat() if s.last_connected_at else None,
            "last_error": s.last_error,
            "created_by": s.created_by,
            "created_at": s.created_at.isoformat(),
            "updated_at": s.updated_at.isoformat()
        }
        for s in sources
    ])


@router.get("/sources/{source_id}")
async def get_datasource(
    source_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取数据源详情"""
    source = await DataSourceService.get_by_id(db, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="数据源不存在")

    # 权限检查
    is_admin = user.role == "admin" or "datalens:admin" in user.permissions
    if not is_admin and source.created_by != user.user_id:
        raise HTTPException(status_code=403, detail="无权访问该数据源")

    return success(data={
        "id": source.id,
        "name": source.name,
        "type": source.type,
        "description": source.description,
        "connection_config": json.loads(source.connection_config) if source.connection_config else None,
        "file_config": json.loads(source.file_config) if source.file_config else None,
        "api_config": json.loads(source.api_config) if source.api_config else None,
        "is_active": source.is_active,
        "last_connected_at": source.last_connected_at.isoformat() if source.last_connected_at else None,
        "last_error": source.last_error,
        "created_by": source.created_by,
        "created_at": source.created_at.isoformat(),
        "updated_at": source.updated_at.isoformat()
    })


@router.post("/sources")
async def create_datasource(
    data: DataSourceCreate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("datalens:source:manage"))
):
    """创建数据源"""
    source = await DataSourceService.create(db, data, user.user_id)
    logger.info(f"用户 {user.username} 创建了数据源: {source.name}")
    return success(data={"id": source.id}, message="数据源创建成功")


@router.put("/sources/{source_id}")
async def update_datasource(
    source_id: int,
    data: DataSourceUpdate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("datalens:source:manage"))
):
    """更新数据源"""
    source = await DataSourceService.get_by_id(db, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="数据源不存在")

    # 权限检查
    is_admin = user.role == "admin" or "datalens:admin" in user.permissions
    if not is_admin and source.created_by != user.user_id:
        raise HTTPException(status_code=403, detail="无权修改该数据源")

    await DataSourceService.update(db, source, data)
    logger.info(f"用户 {user.username} 更新了数据源: {source.name}")
    return success(message="数据源更新成功")


@router.delete("/sources/{source_id}")
async def delete_datasource(
    source_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("datalens:source:manage"))
):
    """删除数据源"""
    source = await DataSourceService.get_by_id(db, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="数据源不存在")

    # 权限检查
    is_admin = user.role == "admin" or "datalens:admin" in user.permissions
    if not is_admin and source.created_by != user.user_id:
        raise HTTPException(status_code=403, detail="无权删除该数据源")

    await DataSourceService.delete(db, source)
    logger.info(f"用户 {user.username} 删除了数据源: {source.name}")
    return success(message="数据源删除成功")


@router.post("/sources/test")
async def test_datasource(
    data: DataSourceTestRequest,
    user: TokenData = Depends(get_current_user)
):
    """测试数据源连接"""
    # 根据类型选择配置
    if data.type.value in ["mysql", "postgres", "sqlserver", "oracle"]:
        config = data.connection_config or {}
    elif data.type.value in ["csv", "excel", "sqlite"]:
        config = data.file_config or {}
    else:
        config = data.api_config or {}

    ok, msg = await DataSourceService.test_connection(data.type.value, config)
    if ok:
        return success(message=msg)
    else:
        return error(message=msg)


@router.get("/sources/{source_id}/tables")
async def get_source_tables(
    source_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取数据源的表列表"""
    source = await DataSourceService.get_by_id(db, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="数据源不存在")

    # 权限检查
    is_admin = user.role == "admin" or "datalens:admin" in user.permissions
    if not is_admin and source.created_by != user.user_id:
        raise HTTPException(status_code=403, detail="无权访问该数据源")

    tables = await DataSourceService.get_tables(source)
    return success(data=tables)


@router.get("/sources/{source_id}/columns")
async def get_source_columns(
    source_id: int,
    table_name: str = Query(..., description="表名"),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取数据源指定表的字段列表"""
    source = await DataSourceService.get_by_id(db, source_id)
    if not source:
        raise HTTPException(status_code=404, detail="数据源不存在")

    # 权限检查
    is_admin = user.role == "admin" or "datalens:admin" in user.permissions
    if not is_admin and source.created_by != user.user_id:
        raise HTTPException(status_code=403, detail="无权访问该数据源")

    try:
        columns = await DataSourceService.get_columns(source, table_name)
        return success(data=columns)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"获取字段列表失败: {str(e)}")


# ==================== 分类管理 ====================

@router.get("/categories")
async def get_category_list(
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("datalens:view"))
):
    """获取分类列表"""
    categories = await CategoryService.get_list(db)
    return success(data=categories)


@router.post("/categories")
async def create_category(
    data: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("datalens:create"))
):
    """创建分类"""
    category = await CategoryService.create(db, data)
    logger.info(f"用户 {user.username} 创建了分类: {category.name}")
    return success(data={"id": category.id}, message="分类创建成功")


@router.put("/categories/{category_id}")
async def update_category(
    category_id: int,
    data: CategoryUpdate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("datalens:update"))
):
    """更新分类"""
    category = await CategoryService.get_by_id(db, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="分类不存在")

    await CategoryService.update(db, category, data)
    logger.info(f"用户 {user.username} 更新了分类: {category.name}")
    return success(message="分类更新成功")


@router.delete("/categories/{category_id}")
async def delete_category(
    category_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("datalens:delete"))
):
    """删除分类"""
    category = await CategoryService.get_by_id(db, category_id)
    if not category:
        raise HTTPException(status_code=404, detail="分类不存在")

    await CategoryService.delete(db, category)
    logger.info(f"用户 {user.username} 删除了分类: {category.name}")
    return success(message="分类删除成功")


# ==================== 视图管理 ====================

@router.get("/views")
async def get_view_list(
    category_id: Optional[int] = Query(None, description="分类ID筛选"),
    search: Optional[str] = Query(None, description="搜索关键词"),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("datalens:view"))
):
    """获取视图列表"""
    is_admin = user.role == "admin" or "datalens:admin" in user.permissions
    views = await ViewService.get_list(db, user.user_id, is_admin, category_id, search)
    return success(data=views)


@router.get("/views/{view_id}")
async def get_view(
    view_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取视图详情"""
    view = await ViewService.get_by_id(db, view_id)
    if not view:
        raise HTTPException(status_code=404, detail="视图不存在")

    # 权限检查
    is_admin = user.role == "admin" or "datalens:admin" in user.permissions
    if not is_admin and not view.is_public and view.created_by != user.user_id:
        raise HTTPException(status_code=403, detail="无权访问该视图")

    # 检查视图级权限
    if view.required_permission and view.required_permission not in user.permissions:
        if user.role != "admin":
            raise HTTPException(status_code=403, detail=f"缺少权限: {view.required_permission}")

    return success(data={
        "id": view.id,
        "name": view.name,
        "description": view.description,
        "icon": view.icon,
        "category_id": view.category_id,
        "datasource_id": view.datasource_id,
        "query_type": view.query_type,
        "query_config": json.loads(view.query_config) if view.query_config else None,
        "display_config": json.loads(view.display_config) if view.display_config else None,
        "status_config": json.loads(view.status_config) if view.status_config else None,
        "chart_config": json.loads(view.chart_config) if view.chart_config else None,
        "required_permission": view.required_permission,
        "is_public": view.is_public,
        "view_count": view.view_count,
        "created_by": view.created_by,
        "created_at": view.created_at.isoformat(),
        "updated_at": view.updated_at.isoformat()
    })


@router.post("/views")
async def create_view(
    data: ViewCreate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("datalens:create"))
):
    """创建视图"""
    view = await ViewService.create(db, data, user.user_id)
    logger.info(f"用户 {user.username} 创建了视图: {view.name}")
    return success(data={"id": view.id}, message="视图创建成功")


@router.put("/views/{view_id}")
async def update_view(
    view_id: int,
    data: ViewUpdate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("datalens:update"))
):
    """更新视图"""
    view = await ViewService.get_by_id(db, view_id)
    if not view:
        raise HTTPException(status_code=404, detail="视图不存在")

    # 权限检查
    is_admin = user.role == "admin" or "datalens:admin" in user.permissions
    if not is_admin and view.created_by != user.user_id:
        raise HTTPException(status_code=403, detail="无权修改该视图")

    await ViewService.update(db, view, data)
    logger.info(f"用户 {user.username} 更新了视图: {view.name}")
    return success(message="视图更新成功")


@router.delete("/views/{view_id}")
async def delete_view(
    view_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("datalens:delete"))
):
    """删除视图"""
    view = await ViewService.get_by_id(db, view_id)
    if not view:
        raise HTTPException(status_code=404, detail="视图不存在")

    # 权限检查
    is_admin = user.role == "admin" or "datalens:admin" in user.permissions
    if not is_admin and view.created_by != user.user_id:
        raise HTTPException(status_code=403, detail="无权删除该视图")

    await ViewService.delete(db, view)
    logger.info(f"用户 {user.username} 删除了视图: {view.name}")
    return success(message="视图删除成功")


@router.post("/views/{view_id}/data")
async def get_view_data(
    view_id: int,
    request: ViewDataRequest,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """
    获取视图数据
    执行查询并返回分页数据
    """
    view = await ViewService.get_by_id(db, view_id)
    if not view:
        raise HTTPException(status_code=404, detail="视图不存在")

    # 权限检查
    is_admin = user.role == "admin" or "datalens:admin" in user.permissions
    if not is_admin and not view.is_public and view.created_by != user.user_id:
        raise HTTPException(status_code=403, detail="无权访问该视图")

    if view.required_permission and view.required_permission not in user.permissions:
        if user.role != "admin":
            raise HTTPException(status_code=403, detail=f"缺少权限: {view.required_permission}")

    try:
        # 增加访问次数
        await ViewService.increment_view_count(db, view)

        # 记录最近访问
        await RecentViewService.record(db, user.user_id, view_id)

        # 执行查询
        result = await ViewService.execute_query(db, view, request)
        return success(data=result.model_dump())
    except Exception as e:
        logger.error(f"查询视图数据失败: {e}")
        return error(message=f"查询失败: {str(e)}")


@router.get("/views/{view_id}/export")
async def export_view_data(
    view_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """
    流式导出视图数据为 CSV
    """
    from fastapi.responses import JSONResponse, Response
    from datetime import datetime
    import urllib.parse

    view = await ViewService.get_by_id(db, view_id)
    if not view:
        raise HTTPException(status_code=404, detail="视图不存在")

    # 权限检查
    is_admin = user.role == "admin" or "datalens:admin" in user.permissions
    if not is_admin and not view.is_public and view.created_by != user.user_id:
        raise HTTPException(status_code=403, detail="无权访问该视图")

    if view.required_permission and view.required_permission not in user.permissions:
        if user.role != "admin":
            raise HTTPException(status_code=403, detail=f"缺少权限: {view.required_permission}")

    try:
        generator = await ViewService.stream_export_csv(db, view)
        
        # 构造文件名
        filename = f"{view.name}_{datetime.now().strftime('%Y%m%d%H%M%S')}.csv"
        # 进行 URL 编码以防中文乱码
        encoded_filename = urllib.parse.quote(filename)
        
        headers = {
            "Content-Disposition": f"attachment; filename*=UTF-8''{encoded_filename}",
            "Content-Type": "text/csv; charset=utf-8"
        }
        
        return StreamingResponse(generator, headers=headers)
    except Exception as e:
        logger.error(f"导出视图数据失败: {e}")
        raise HTTPException(status_code=500, detail=f"导出失败: {str(e)}")


@router.get("/views/{view_id}/preview")
async def preview_view_data(
    view_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """
    预览视图数据
    返回前 10 条数据
    """
    view = await ViewService.get_by_id(db, view_id)
    if not view:
        raise HTTPException(status_code=404, detail="视图不存在")

    # 权限检查
    is_admin = user.role == "admin" or "datalens:admin" in user.permissions
    if not is_admin and not view.is_public and view.created_by != user.user_id:
        raise HTTPException(status_code=403, detail="无权访问该视图")

    try:
        request = ViewDataRequest(page=1, page_size=10)
        result = await ViewService.execute_query(db, view, request)
        return success(data=result.model_dump())
    except Exception as e:
        logger.error(f"预览视图数据失败: {e}")
        return error(message=f"预览失败: {str(e)}")


@router.post("/execute/preview")
async def execute_preview(
    data: PreviewRequest,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """
    执行预览查询（不保存）
    用于编辑器中测试 SQL 或配置
    """
    logger.info(f"用户 {user.username} 请求预览数据: datasource_id={data.datasource_id}, query_type={data.query_type}")
    
    # 获取数据源
    datasource = await DataSourceService.get_by_id(db, data.datasource_id)
    if not datasource:
         raise HTTPException(status_code=404, detail="数据源不存在")

    # 权限检查
    is_admin = user.role == "admin" or "datalens:admin" in user.permissions
    
    try:
        # 构造分页请求 (preview 只取前10条)
        request = ViewDataRequest(page=1, page_size=10)
        
        result = await QueryExecutor.execute(
            datasource, 
            data.query_type.value, 
            data.query_config or {}, 
            request
        )
        logger.info(f"预览执行成功，返回 {len(result.data)} 条数据")
        return success(data=result.model_dump())
    except Exception as e:
        logger.error(f"执行预览失败: {e}\n{traceback.format_exc()}")
        return error(message=f"执行失败: {str(e)}")




# ==================== 收藏管理 ====================

@router.get("/favorites")
async def get_favorites(
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取我的收藏列表"""
    favorites = await FavoriteService.get_list(db, user.user_id)
    return success(data=favorites)


@router.post("/favorites/{view_id}")
async def add_favorite(
    view_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """添加收藏"""
    # 检查视图是否存在
    view = await ViewService.get_by_id(db, view_id)
    if not view:
        raise HTTPException(status_code=404, detail="视图不存在")

    try:
        await FavoriteService.add(db, user.user_id, view_id)
        return success(message="收藏成功")
    except ValueError as e:
        return error(message=str(e))


@router.delete("/favorites/{view_id}")
async def remove_favorite(
    view_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """取消收藏"""
    await FavoriteService.remove(db, user.user_id, view_id)
    return success(message="取消收藏成功")


# ==================== 最近访问 ====================

@router.get("/recent")
async def get_recent_views(
    limit: int = Query(10, ge=1, le=50, description="返回数量"),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取最近访问的视图"""
    recent = await RecentViewService.get_list(db, user.user_id, limit)
    return success(data=recent)


# ==================== 文件上传 ====================

@router.post("/upload")
async def upload_file(
    file: UploadFile = File(...),
    user: TokenData = Depends(require_permission("datalens:source:manage"))
):
    """
    上传 CSV/Excel 文件
    文件将保存到 storage/modules/datalens/ 目录
    """
    import os
    import aiofiles
    from datetime import datetime
    from utils.storage import get_storage_manager

    # 检查文件类型
    allowed_extensions = [".csv", ".xlsx", ".xls"]
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(status_code=400, detail=f"不支持的文件类型，仅支持: {', '.join(allowed_extensions)}")

    # 使用 StorageManager 获取模块专属目录
    storage_manager = get_storage_manager()
    storage_dir = storage_manager.get_module_dir("datalens")

    # 生成文件名
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_filename = f"{timestamp}_{user.user_id}_{file.filename}"
    file_path_obj = storage_dir / safe_filename
    file_path = str(file_path_obj)

    # 保存文件
    content = await file.read()
    async with aiofiles.open(file_path, "wb") as f:
        await f.write(content)

    # 获取相对于 storage 根目录的路径，便于数据库存储
    try:
        relative_path = os.path.relpath(file_path, storage_manager.root_dir)
        # 统一使用正斜杠
        relative_path = relative_path.replace("\\", "/")
    except ValueError:
        relative_path = file_path

    logger.info(f"用户 {user.username} 上传了文件: {file.filename} -> {relative_path}")
    return success(data={
        "file_path": relative_path,  # 数据库中存储相对路径更稳健
        "file_name": file.filename,
        "file_size": len(content)
    }, message="文件上传成功")


@router.get("/image")
async def get_lens_image(
    path: str = Query(..., description="图片文件路径或URL"),
    base_path: str = Query(None, description="可选：图片基础根目录（覆盖全局配置）"),
    user: TokenData = Depends(get_current_user)
):
    """
    图片代理接口
    支持读取本地绝对路径或远程 URL 并返回图片流
    """
    # 1. 处理远程 URL
    if path.startswith("http://") or path.startswith("https://"):
        try:
            async with httpx.AsyncClient(timeout=10, verify=False) as client:
                response = await client.get(path)
                if response.status_code == 200:
                    content_type = response.headers.get("content-type", "image/jpeg")
                    return StreamingResponse(
                        iter([response.content]), 
                        media_type=content_type
                    )
                else:
                    raise HTTPException(status_code=404, detail="远程图片无法访问")
        except Exception as e:
            logger.error(f"代理远程图片失败: {e}")
            raise HTTPException(status_code=500, detail=f"获取远程图片失败: {str(e)}")

    # 2. 处理本地路径
    # 安全检查：只允许特定的扩展名
    allowed_exts = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp"}
    _, ext = os.path.splitext(path.lower())
    if ext not in allowed_exts:
        raise HTTPException(status_code=400, detail="不支持的图片类型")

    # 路径搜索逻辑
    final_path = path

    # 优先级 0: 如果提供了 base_path，优先尝试拼接
    if base_path:
        # 移除路径开头可能存在的 / 或 \
        clean_rel_path = path.lstrip("/\\")
        potential_path = os.path.join(base_path, clean_rel_path)
        if os.path.exists(potential_path):
            final_path = potential_path

    # 最终检查文件是否存在
    if not os.path.exists(final_path):
        # 尝试相对于系统根目录或项目目录
        raise HTTPException(status_code=404, detail=f"图片文件不存在: {path}")

    # 获取 MIME 类型
    mime_type, _ = guess_type(path)
    if not mime_type or not mime_type.startswith("image/"):
        mime_type = "image/jpeg"

    return FileResponse(final_path, media_type=mime_type)
