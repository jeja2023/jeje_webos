# -*- coding: utf-8 -*-
"""
协同办公API路由
定义RESTful API接口
"""

import logging
from typing import Optional
from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.database import get_db
from core.security import get_current_user, require_permission, TokenData
from core.errors import NotFoundException, success_response, ErrorCode, BusinessException
from core.pagination import create_page_response
from models import User

from .office_schemas import (
    DocumentCreate, DocumentUpdate, DocumentContentUpdate,
    DocumentShareUpdate, CollaboratorAdd, CollaboratorUpdate,
    DocumentInfo, DocumentDetail, DocumentListItem,
    VersionInfo, VersionRestore, CollaboratorInfo, EditSessionInfo
)
from .office_services import OfficeService

logger = logging.getLogger(__name__)

router = APIRouter()

# 全局WebSocket连接管理
class ConnectionManager:
    """WebSocket连接管理器"""
    def __init__(self):
        # {document_id: {user_id: websocket}}
        self.active_connections: dict[int, dict[int, WebSocket]] = {}
    
    async def connect(self, websocket: WebSocket, document_id: int, user_id: int):
        await websocket.accept()
        if document_id not in self.active_connections:
            self.active_connections[document_id] = {}
        self.active_connections[document_id][user_id] = websocket
        logger.info(f"用户 {user_id} 加入文档 {document_id} 的协同编辑")
    
    def disconnect(self, document_id: int, user_id: int):
        if document_id in self.active_connections:
            self.active_connections[document_id].pop(user_id, None)
            if not self.active_connections[document_id]:
                del self.active_connections[document_id]
        logger.info(f"用户 {user_id} 离开文档 {document_id} 的协同编辑")
    
    async def broadcast(self, document_id: int, message: dict, exclude_user: int = None):
        if document_id in self.active_connections:
            for user_id, websocket in self.active_connections[document_id].items():
                if user_id != exclude_user:
                    try:
                        await websocket.send_json(message)
                    except Exception as e:
                        logger.error(f"发送消息给用户 {user_id} 失败: {e}")
    
    def get_online_users(self, document_id: int) -> list[int]:
        if document_id in self.active_connections:
            return list(self.active_connections[document_id].keys())
        return []

manager = ConnectionManager()


# ==================== 文档CRUD ====================

@router.get("", response_model=dict, summary="获取文档列表")
async def get_document_list(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    doc_type: Optional[str] = Query(None, description="文档类型: doc/sheet"),
    keyword: Optional[str] = Query(None, description="搜索关键词"),
    folder_id: Optional[int] = Query(None, description="文件夹ID"),
    is_starred: Optional[bool] = Query(None, description="是否收藏"),
    is_deleted: bool = Query(False, description="是否查看回收站"),
    is_template: Optional[bool] = Query(None, description="是否模板"),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """
    获取文档列表
    
    - 支持分页和筛选
    - 返回用户创建的和协作的文档
    """
    documents, total = await OfficeService.get_document_list(
        db,
        user_id=user.user_id,
        page=page,
        page_size=page_size,
        doc_type=doc_type,
        keyword=keyword,
        folder_id=folder_id,
        is_starred=is_starred,
        is_deleted=is_deleted,
        is_template=is_template
    )
    
    # 获取所有者信息
    items = []
    for doc in documents:
        item = DocumentListItem.model_validate(doc).model_dump()
        owner = await db.get(User, doc.user_id)
        item["owner_name"] = owner.nickname or owner.username if owner else None
        items.append(item)
    
    return create_page_response(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        message="获取成功"
    )


@router.post("", response_model=dict, summary="创建文档")
async def create_document(
    data: DocumentCreate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("office.create"))
):
    """
    创建新文档
    
    需要权限：office.create
    """
    document = await OfficeService.create_document(db, user.user_id, data)
    await db.commit()
    
    return success_response(
        data=DocumentInfo.model_validate(document).model_dump(),
        message="创建成功"
    )


@router.get("/templates", response_model=dict, summary="获取模板列表")
async def get_templates(
    doc_type: Optional[str] = Query(None, description="文档类型"),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取公共模板列表"""
    templates = await OfficeService.get_templates(db, doc_type)
    
    items = []
    for doc in templates:
        item = DocumentListItem.model_validate(doc).model_dump()
        owner = await db.get(User, doc.user_id)
        item["owner_name"] = owner.nickname or owner.username if owner else None
        items.append(item)
    
    return success_response(data=items, message="获取成功")


@router.post("/from-template/{template_id}", response_model=dict, summary="从模板创建")
async def create_from_template(
    template_id: int,
    title: str = Query(..., description="文档标题"),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("office.create"))
):
    """从模板创建新文档"""
    document = await OfficeService.create_from_template(db, template_id, user.user_id, title)
    if not document:
        raise NotFoundException("模板", template_id)
    
    await db.commit()
    
    return success_response(
        data=DocumentInfo.model_validate(document).model_dump(),
        message="创建成功"
    )


@router.get("/share/{share_code}", response_model=dict, summary="通过分享码获取文档")
async def get_by_share_code(
    share_code: str,
    db: AsyncSession = Depends(get_db)
):
    """通过分享码获取文档（无需登录）"""
    document = await OfficeService.get_document_by_share_code(db, share_code)
    if not document:
        raise NotFoundException("分享文档", share_code)
    
    return success_response(
        data=DocumentDetail.model_validate(document).model_dump(),
        message="获取成功"
    )


@router.get("/{document_id}", response_model=dict, summary="获取文档详情")
async def get_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取文档详情（含内容）"""
    document = await OfficeService.get_document(db, document_id, user.user_id)
    if not document:
        raise NotFoundException("文档", document_id)
    
    # 获取所有者信息
    owner = await db.get(User, document.user_id)
    result = DocumentDetail.model_validate(document).model_dump()
    result["owner_name"] = owner.nickname or owner.username if owner else None
    
    # 获取协作者数量
    collaborators = await OfficeService.get_collaborators(db, document_id, user.user_id)
    result["collaborator_count"] = len(collaborators)
    
    return success_response(data=result, message="获取成功")


@router.put("/{document_id}", response_model=dict, summary="更新文档信息")
async def update_document(
    document_id: int,
    data: DocumentUpdate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("office.update"))
):
    """更新文档基本信息"""
    document = await OfficeService.update_document(db, document_id, user.user_id, data)
    if not document:
        raise NotFoundException("文档", document_id)
    
    await db.commit()
    
    return success_response(
        data=DocumentInfo.model_validate(document).model_dump(),
        message="更新成功"
    )


@router.put("/{document_id}/content", response_model=dict, summary="更新文档内容")
async def update_document_content(
    document_id: int,
    data: DocumentContentUpdate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("office.update"))
):
    """
    更新文档内容
    
    - 支持版本控制
    - 支持创建版本快照
    """
    document = await OfficeService.update_document_content(db, document_id, user.user_id, data)
    if not document:
        raise BusinessException(code=ErrorCode.OPERATION_FAILED, message="无法更新文档，可能存在版本冲突")
    
    await db.commit()
    
    # 广播内容更新给其他协作者
    await manager.broadcast(document_id, {
        "type": "content",
        "data": {
            "content": data.content,
            "version": document.version,
            "user_id": user.user_id
        }
    }, exclude_user=user.user_id)
    
    return success_response(
        data={"version": document.version},
        message="保存成功"
    )


@router.delete("/{document_id}", response_model=dict, summary="删除文档")
async def delete_document(
    document_id: int,
    permanent: bool = Query(False, description="是否永久删除"),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("office.delete"))
):
    """删除文档（默认移到回收站）"""
    success = await OfficeService.delete_document(db, document_id, user.user_id, permanent)
    if not success:
        raise NotFoundException("文档", document_id)
    
    await db.commit()
    
    return success_response(message="删除成功")


@router.post("/{document_id}/restore", response_model=dict, summary="恢复文档")
async def restore_document(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("office.update"))
):
    """从回收站恢复文档"""
    document = await OfficeService.restore_document(db, document_id, user.user_id)
    if not document:
        raise NotFoundException("文档", document_id)
    
    await db.commit()
    
    return success_response(
        data=DocumentInfo.model_validate(document).model_dump(),
        message="恢复成功"
    )


# ==================== 分享管理 ====================

@router.put("/{document_id}/share", response_model=dict, summary="更新分享设置")
async def update_share_settings(
    document_id: int,
    data: DocumentShareUpdate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("office.share"))
):
    """更新文档分享设置"""
    document = await OfficeService.update_share_settings(db, document_id, user.user_id, data)
    if not document:
        raise NotFoundException("文档", document_id)
    
    await db.commit()
    
    return success_response(
        data={
            "share_type": document.share_type,
            "share_code": document.share_code,
            "share_permission": document.share_permission
        },
        message="分享设置已更新"
    )


# ==================== 版本管理 ====================

@router.get("/{document_id}/versions", response_model=dict, summary="获取版本历史")
async def get_versions(
    document_id: int,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取文档版本历史"""
    versions, total = await OfficeService.get_version_list(
        db, document_id, user.user_id, page, page_size
    )
    
    items = []
    for v in versions:
        item = VersionInfo.model_validate(v).model_dump()
        editor = await db.get(User, v.user_id)
        item["user_name"] = editor.nickname or editor.username if editor else None
        items.append(item)
    
    return create_page_response(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        message="获取成功"
    )


@router.post("/{document_id}/versions/restore", response_model=dict, summary="恢复到指定版本")
async def restore_version(
    document_id: int,
    data: VersionRestore,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("office.update"))
):
    """恢复到指定版本"""
    document = await OfficeService.restore_version(
        db, document_id, data.version_id, user.user_id
    )
    if not document:
        raise NotFoundException("版本", data.version_id)
    
    await db.commit()
    
    return success_response(
        data={"version": document.version},
        message="版本已恢复"
    )


# ==================== 协作者管理 ====================

@router.get("/{document_id}/collaborators", response_model=dict, summary="获取协作者列表")
async def get_collaborators(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取文档协作者列表"""
    collaborators = await OfficeService.get_collaborators(db, document_id, user.user_id)
    
    items = []
    for c in collaborators:
        item = CollaboratorInfo.model_validate(c).model_dump()
        collab_user = await db.get(User, c.user_id)
        if collab_user:
            item["user_name"] = collab_user.nickname or collab_user.username
            item["user_avatar"] = collab_user.avatar
        items.append(item)
    
    return success_response(data=items, message="获取成功")


@router.post("/{document_id}/collaborators", response_model=dict, summary="添加协作者")
async def add_collaborator(
    document_id: int,
    data: CollaboratorAdd,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("office.share"))
):
    """添加文档协作者"""
    collaborator = await OfficeService.add_collaborator(db, document_id, user.user_id, data)
    if not collaborator:
        raise BusinessException(code=ErrorCode.OPERATION_FAILED, message="无法添加协作者")
    
    await db.commit()
    
    return success_response(
        data=CollaboratorInfo.model_validate(collaborator).model_dump(),
        message="协作者已添加"
    )


@router.delete("/{document_id}/collaborators/{collaborator_user_id}", response_model=dict, summary="移除协作者")
async def remove_collaborator(
    document_id: int,
    collaborator_user_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("office.share"))
):
    """移除文档协作者"""
    success = await OfficeService.remove_collaborator(
        db, document_id, collaborator_user_id, user.user_id
    )
    if not success:
        raise NotFoundException("协作者", collaborator_user_id)
    
    await db.commit()
    
    return success_response(message="协作者已移除")


# ==================== 在线编辑者 ====================

@router.get("/{document_id}/editors", response_model=dict, summary="获取在线编辑者")
async def get_online_editors(
    document_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取当前在线的编辑者列表"""
    online_user_ids = manager.get_online_users(document_id)
    
    items = []
    for uid in online_user_ids:
        editor = await db.get(User, uid)
        if editor:
            items.append({
                "user_id": uid,
                "user_name": editor.nickname or editor.username,
                "user_avatar": editor.avatar
            })
    
    return success_response(data=items, message="获取成功")


# ==================== WebSocket 实时协同 ====================

@router.websocket("/ws/{document_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    document_id: int,
    db: AsyncSession = Depends(get_db)
):
    """
    WebSocket实时协同编辑
    
    消息类型：
    - join: 加入编辑
    - leave: 离开编辑
    - cursor: 光标位置更新
    - content: 内容更新
    """
    # 从URL参数或header获取token验证用户
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="未提供认证令牌")
        return
    
    # 验证token并获取用户信息
    try:
        from core.security import verify_token
        payload = verify_token(token)
        user_id = payload.get("user_id")
        if not user_id:
            await websocket.close(code=4001, reason="无效的认证令牌")
            return
    except Exception as e:
        await websocket.close(code=4001, reason="认证失败")
        return
    
    # 检查文档访问权限
    document = await OfficeService.get_document(db, document_id, user_id)
    if not document:
        await websocket.close(code=4004, reason="文档不存在或无权访问")
        return
    
    # 连接WebSocket
    await manager.connect(websocket, document_id, user_id)
    
    # 记录编辑会话
    session_id = f"{document_id}_{user_id}_{id(websocket)}"
    await OfficeService.join_edit_session(db, document_id, user_id, session_id)
    await db.commit()
    
    # 获取用户信息
    editor = await db.get(User, user_id)
    user_info = {
        "user_id": user_id,
        "user_name": editor.nickname or editor.username if editor else str(user_id),
        "user_avatar": editor.avatar if editor else None
    }
    
    # 广播用户加入
    await manager.broadcast(document_id, {
        "type": "join",
        "data": user_info
    }, exclude_user=user_id)
    
    try:
        while True:
            data = await websocket.receive_json()
            msg_type = data.get("type")
            
            if msg_type == "cursor":
                # 光标位置更新
                cursor_position = data.get("data", {}).get("position")
                if cursor_position:
                    await OfficeService.update_cursor_position(
                        db, document_id, user_id, str(cursor_position)
                    )
                    await db.commit()
                
                await manager.broadcast(document_id, {
                    "type": "cursor",
                    "data": {
                        **user_info,
                        "position": cursor_position
                    }
                }, exclude_user=user_id)
            
            elif msg_type == "content":
                # 内容更新（增量）
                await manager.broadcast(document_id, {
                    "type": "content",
                    "data": {
                        **user_info,
                        "delta": data.get("data", {}).get("delta")
                    }
                }, exclude_user=user_id)
    
    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WebSocket错误: {e}")
    finally:
        manager.disconnect(document_id, user_id)
        await OfficeService.leave_edit_session(db, document_id, user_id)
        await db.commit()
        
        # 广播用户离开
        await manager.broadcast(document_id, {
            "type": "leave",
            "data": user_info
        })
