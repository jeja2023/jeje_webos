"""
知识库模块 API 路由
"""

import os
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List, Optional

from core.database import get_db
from core.security import get_current_user, TokenData
from schemas.response import success, error
from utils.background_tasks import BackgroundTaskHelper
from .knowledge_schemas import (
    KbBaseCreate, KbBaseUpdate, KbBaseResponse,
    KbNodeCreate, KbNodeUpdate, KbNodeResponse, KbNodeDetail
)
from .knowledge_services import KnowledgeService

router = APIRouter()

# ==================== Knowledge Base ====================

@router.post("/bases", response_model=dict)
async def create_base(
    data: KbBaseCreate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """创建知识库"""
    base = await KnowledgeService.create_base(db, user.user_id, data)
    return success(data=KbBaseResponse.model_validate(base).model_dump())

@router.get("/bases", response_model=dict)
async def get_bases(
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取知识库列表"""
    bases = await KnowledgeService.get_bases(db, user.user_id)
    return success(data=[KbBaseResponse.model_validate(b).model_dump() for b in bases])

@router.get("/bases/{base_id}", response_model=dict)
async def get_base(
    base_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取知识库详情"""
    base = await KnowledgeService.get_base(db, base_id)
    if not base:
        return error(404, "知识库不存在")
    if not base.is_public and base.owner_id != user.user_id:
        return error(403, "无权访问")
    return success(data=KbBaseResponse.model_validate(base).model_dump())

@router.delete("/bases/{base_id}", response_model=dict)
async def delete_base(
    base_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """删除知识库"""
    base = await KnowledgeService.get_base(db, base_id)
    if not base:
        return error(404, "知识库不存在")
    if base.owner_id != user.user_id:
        return error(403, "只有所有者可以删除")
        
    await KnowledgeService.delete_base(db, base_id)
    return success(message="删除成功")

# ==================== Knowledge Nodes ====================

@router.get("/bases/{base_id}/nodes", response_model=dict)
async def get_base_nodes(
    base_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取知识库下的所有节点（树形）"""
    base = await KnowledgeService.get_base(db, base_id)
    if not base:
        return error(404, "知识库不存在")
    if not base.is_public and base.owner_id != user.user_id:
        return error(403, "无权访问")
        
    nodes = await KnowledgeService.get_tree_nodes(db, base_id)
    return success(data=[KbNodeResponse.model_validate(n).model_dump() for n in nodes])

@router.post("/nodes", response_model=dict)
async def create_node(
    data: KbNodeCreate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """创建文档或文件夹节点"""
    base = await KnowledgeService.get_base(db, data.base_id)
    if not base:
        return error(404, "知识库不存在")
    if base.owner_id != user.user_id: 
        return error(403, "无权创建")
        
    node = await KnowledgeService.create_node(db, user.user_id, data)
    return success(data=KbNodeResponse.model_validate(node).model_dump())

@router.post("/upload", response_model=dict)
async def upload_file(
    background_tasks: BackgroundTasks,
    base_id: int = Form(...),
    parent_id: Optional[int] = Form(None),
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """文件上传接口 (异步解析)"""
    base = await KnowledgeService.get_base(db, base_id)
    if not base:
        return error(404, "知识库不存在")
    if base.owner_id != user.user_id:
        return error(403, "无权上传")
        
    # Phase 1: Rapid upload & DB record
    node = await KnowledgeService.upload_file(db, user.user_id, base_id, parent_id, file)
    
    # Phase 2: Background processing
    background_tasks.add_task(
        BackgroundTaskHelper.run_with_db,
        KnowledgeService.process_file_background,
        node.id
    )
    
    return success(data=KbNodeResponse.model_validate(node).model_dump())

@router.get("/nodes/{node_id}/preview")
async def preview_file(
    node_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """预览/下载文件接口"""
    node = await KnowledgeService.get_node(db, node_id)
    if not node:
        raise HTTPException(status_code=404, detail="文档不存在")
        
    if not node.file_path or not os.path.exists(node.file_path):
        raise HTTPException(status_code=404, detail="文件实体不存在")
        
    # TODO: 后续增加权限细粒度校验
    
    return FileResponse(
        path=node.file_path,
        filename=node.title, # 下载时的文件名
        media_type=node.file_meta.get("mime", "application/octet-stream")
    )

@router.get("/nodes/{node_id}", response_model=dict)
async def get_node(
    node_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取单个节点详情"""
    node = await KnowledgeService.get_node(db, node_id)
    if not node:
        return error(404, "文档不存在")
        
    return success(data=KbNodeDetail.model_validate(node).model_dump())

@router.put("/nodes/{node_id}", response_model=dict)
async def update_node(
    node_id: int,
    data: KbNodeUpdate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """更新节点（内容、标题等）"""
    node = await KnowledgeService.get_node(db, node_id)
    if not node:
        return error(404, "文档不存在")
    if node.created_by != user.user_id: 
        return error(403, "无权修改")
        
    updated = await KnowledgeService.update_node(db, node_id, data)
    return success(data=KbNodeDetail.model_validate(updated).model_dump())

@router.delete("/nodes/{node_id}", response_model=dict)
async def delete_node(
    node_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """删除节点"""
    node = await KnowledgeService.get_node(db, node_id)
    if not node:
        return error(404, "文档不存在")
    if node.created_by != user.user_id:
        return error(403, "无权删除")
        
    await KnowledgeService.delete_node(db, node_id)
    return success(message="删除成功")

@router.get("/search", response_model=dict)
async def search_knowledge(
    q: str,
    base_id: Optional[int] = None,
    node_type: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """知识库搜索 (混合搜索 + Rerank + 过滤)"""
    filters = {}
    if node_type:
        filters["type"] = node_type
        
    results = await KnowledgeService.search(db, base_id, q, filters=filters)
    return success(data=results)

@router.get("/bases/{base_id}/graph", response_model=dict)
async def get_knowledge_graph(
    base_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取知识图谱数据"""
    from .knowledge_graph_service import KnowledgeGraphService
    
    base = await KnowledgeService.get_base(db, base_id)
    if not base:
        return error(404, "知识库不存在")
        
    graph = await KnowledgeGraphService.get_graph(db, base_id)
    return success(data=graph)
