# -*- coding: utf-8 -*-
"""
Markdown 编辑器 API 路由
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional

from core.database import get_db
from core.security import get_current_user, TokenData
from core.errors import NotFoundException
from schemas.response import success, error

from .markdown_schemas import (
    MarkdownDocCreate, MarkdownDocUpdate, MarkdownDocResponse, MarkdownDocListItem,
    MarkdownTemplateCreate, MarkdownTemplateResponse
)
from .markdown_services import MarkdownService

router = APIRouter()


# 文档接口

@router.get("/docs", response_model=dict)
async def get_doc_list(
    page: int = 1,
    size: int = 20,
    keyword: Optional[str] = None,
    is_starred: Optional[bool] = None,
    is_public: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取文档列表"""
    docs, total = await MarkdownService.get_doc_list(
        db, user.user_id, page, size, keyword, is_starred, is_public
    )
    
    items = []
    for doc in docs:
        item = MarkdownDocListItem(
            id=doc.id,
            title=doc.title,
            summary=doc.summary,
            is_public=doc.is_public,
            is_starred=doc.is_starred,
            view_count=doc.view_count,
            created_at=doc.created_at,
            updated_at=doc.updated_at,
            username=doc.user.username if doc.user else None
        )
        items.append(item.model_dump())
    
    return success(data={
        "items": items,
        "total": total,
        "page": page,
        "size": size
    })


@router.post("/docs", response_model=dict)
async def create_doc(
    data: MarkdownDocCreate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """创建文档"""
    doc = await MarkdownService.create_doc(db, user.user_id, data)
    
    response = MarkdownDocResponse(
        id=doc.id,
        user_id=doc.user_id,
        title=doc.title,
        content=doc.content,
        summary=doc.summary,
        is_public=doc.is_public,
        is_starred=doc.is_starred,
        view_count=doc.view_count,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        username=doc.user.username if doc.user else None
    )
    
    return success(data=response.model_dump(), message="文档创建成功")


@router.get("/docs/{doc_id}", response_model=dict)
async def get_doc(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取文档详情"""
    doc = await MarkdownService.get_doc_by_id(
        db, doc_id, user.user_id, increment_view=True
    )
    
    if doc is None:
        return error(code=404, message="文档不存在或无权限访问")
    
    response = MarkdownDocResponse(
        id=doc.id,
        user_id=doc.user_id,
        title=doc.title,
        content=doc.content,
        summary=doc.summary,
        is_public=doc.is_public,
        is_starred=doc.is_starred,
        view_count=doc.view_count,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        username=doc.user.username if doc.user else None
    )
    
    return success(data=response.model_dump())


@router.put("/docs/{doc_id}", response_model=dict)
async def update_doc(
    doc_id: int,
    data: MarkdownDocUpdate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """更新文档"""
    doc = await MarkdownService.update_doc(db, doc_id, user.user_id, data)
    
    if doc is None:
        return error(code=404, message="文档不存在或无权限修改")
    
    response = MarkdownDocResponse(
        id=doc.id,
        user_id=doc.user_id,
        title=doc.title,
        content=doc.content,
        summary=doc.summary,
        is_public=doc.is_public,
        is_starred=doc.is_starred,
        view_count=doc.view_count,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
        username=doc.user.username if doc.user else None
    )
    
    return success(data=response.model_dump(), message="文档更新成功")


@router.delete("/docs/{doc_id}", response_model=dict)
async def delete_doc(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """删除文档"""
    result = await MarkdownService.delete_doc(db, doc_id, user.user_id)
    
    if not result:
        return error(code=404, message="文档不存在或无权限删除")
    
    return success(message="文档删除成功")


@router.post("/docs/{doc_id}/star", response_model=dict)
async def toggle_star(
    doc_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """切换收藏状态"""
    doc = await MarkdownService.toggle_star(db, doc_id, user.user_id)
    
    if doc is None:
        return error(code=404, message="文档不存在或无权限操作")
    
    status = "已收藏" if doc.is_starred else "已取消收藏"
    return success(data={"is_starred": doc.is_starred}, message=status)


@router.get("/docs/{doc_id}/export")
async def export_doc(
    doc_id: int,
    format: str = Query("html", pattern="^(html|markdown)$"),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """导出文档"""
    content, filename, media_type = await MarkdownService.export_doc(db, doc_id, user.user_id, format)
    
    if content is None:
        raise NotFoundException("文档")
        
    from fastapi.responses import Response
    from urllib.parse import quote
    
    # RFC 5987 文件名编码
    try:
        filename.encode('ascii')
        cd_header = f'attachment; filename="{filename}"'
    except UnicodeEncodeError:
        encoded = quote(filename, safe='')
        cd_header = f"attachment; filename*=UTF-8''{encoded}"
        
    return Response(
        content=content,
        media_type=media_type,
        headers={"Content-Disposition": cd_header}
    )


# 模板接口

@router.get("/templates", response_model=dict)
async def get_templates(
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取模板列表"""
    templates = await MarkdownService.get_templates(db, user.user_id)
    
    items = [
        MarkdownTemplateResponse(
            id=t.id,
            name=t.name,
            description=t.description,
            content=t.content,
            is_system=t.is_system,
            created_at=t.created_at
        ).model_dump()
        for t in templates
    ]
    
    return success(data=items)


@router.post("/templates", response_model=dict)
async def create_template(
    data: MarkdownTemplateCreate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """创建模板"""
    template = await MarkdownService.create_template(db, user.user_id, data)
    
    response = MarkdownTemplateResponse(
        id=template.id,
        name=template.name,
        description=template.description,
        content=template.content,
        is_system=template.is_system,
        created_at=template.created_at
    )
    
    return success(data=response.model_dump(), message="模板创建成功")


@router.delete("/templates/{template_id}", response_model=dict)
async def delete_template(
    template_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """删除模板"""
    result = await MarkdownService.delete_template(db, template_id, user.user_id)
    
    if not result:
        return error(code=404, message="模板不存在或无权限删除")
    
    return success(message="模板删除成功")


# 统计接口

@router.get("/statistics", response_model=dict)
async def get_statistics(
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取统计信息"""
    stats = await MarkdownService.get_statistics(db, user.user_id)
    return success(data=stats)
