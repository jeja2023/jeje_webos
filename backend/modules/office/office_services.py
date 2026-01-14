# -*- coding: utf-8 -*-
"""
协同办公服务层
处理文档的CRUD和协同编辑逻辑
"""

import secrets
import json
import logging
from typing import List, Optional, Tuple
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, and_, or_

from .office_models import OfficeDocument, OfficeVersion, OfficeCollaborator, OfficeEditSession, OfficeComment
from .office_schemas import (
    DocumentCreate, DocumentUpdate, DocumentContentUpdate,
    DocumentShareUpdate, CollaboratorAdd, CollaboratorUpdate,
    CommentCreate, CommentUpdate
)

logger = logging.getLogger(__name__)


class OfficeService:
    """协同办公服务"""
    
    # ==================== 文档CRUD ====================
    
    @staticmethod
    async def create_document(
        db: AsyncSession,
        user_id: int,
        data: DocumentCreate
    ) -> OfficeDocument:
        """创建文档"""
        document = OfficeDocument(
            title=data.title,
            doc_type=data.doc_type.value,
            content=data.content or OfficeService._get_default_content(data.doc_type.value),
            user_id=user_id,
            folder_id=data.folder_id,
            is_template=data.is_template,
            version=1
        )
        db.add(document)
        await db.flush()
        await db.refresh(document)
        
        logger.info(f"用户 {user_id} 创建了文档 {document.id}: {data.title}")
        return document
    
    @staticmethod
    def _get_default_content(doc_type: str) -> str:
        """获取文档默认内容"""
        if doc_type == "doc":
            # Word文档默认内容(Tiptap JSON格式)
            return json.dumps({
                "type": "doc",
                "content": [
                    {
                        "type": "paragraph",
                        "content": []
                    }
                ]
            })
        else:
            # Excel表格默认内容(Luckysheet JSON格式)
            return json.dumps([{
                "name": "Sheet1",
                "index": 0,
                "status": 1,
                "order": 0,
                "celldata": [],
                "config": {}
            }])
    
    @staticmethod
    async def get_document(
        db: AsyncSession,
        document_id: int,
        user_id: int,
        include_deleted: bool = False
    ) -> Optional[OfficeDocument]:
        """获取文档详情（检查权限）"""
        query = select(OfficeDocument).where(OfficeDocument.id == document_id)
        
        if not include_deleted:
            query = query.where(OfficeDocument.is_deleted == False)
        
        result = await db.execute(query)
        document = result.scalar_one_or_none()
        
        if not document:
            return None
        
        # 检查访问权限
        if not await OfficeService.check_access(db, document, user_id):
            return None
        
        return document
    
    @staticmethod
    async def check_access(
        db: AsyncSession,
        document: OfficeDocument,
        user_id: int,
        require_edit: bool = False
    ) -> bool:
        """检查用户对文档的访问权限"""
        # 所有者有完整权限
        if document.user_id == user_id:
            return True
        
        # 检查是否为协作者
        result = await db.execute(
            select(OfficeCollaborator).where(
                and_(
                    OfficeCollaborator.document_id == document.id,
                    OfficeCollaborator.user_id == user_id
                )
            )
        )
        collaborator = result.scalar_one_or_none()
        
        if collaborator:
            if require_edit:
                return collaborator.permission in ("edit", "admin")
            return True
        
        # 检查分享设置
        if document.share_type in ("link", "public"):
            if require_edit:
                return document.share_permission == "edit"
            return True
        
        return False
    
    @staticmethod
    async def get_document_list(
        db: AsyncSession,
        user_id: int,
        page: int = 1,
        page_size: int = 20,
        doc_type: Optional[str] = None,
        keyword: Optional[str] = None,
        folder_id: Optional[int] = None,
        is_starred: Optional[bool] = None,
        is_deleted: bool = False,
        is_template: Optional[bool] = None
    ) -> Tuple[List[OfficeDocument], int]:
        """获取文档列表"""
        # 基础查询：用户创建的或协作的文档
        collab_subquery = select(OfficeCollaborator.document_id).where(
            OfficeCollaborator.user_id == user_id
        ).scalar_subquery()
        
        query = select(OfficeDocument).where(
            and_(
                or_(
                    OfficeDocument.user_id == user_id,
                    OfficeDocument.id.in_(collab_subquery)
                ),
                OfficeDocument.is_deleted == is_deleted
            )
        )
        
        # 筛选条件
        if doc_type:
            query = query.where(OfficeDocument.doc_type == doc_type)
        
        if keyword:
            query = query.where(OfficeDocument.title.contains(keyword))
        
        if folder_id is not None:
            query = query.where(OfficeDocument.folder_id == folder_id)
        
        if is_starred is not None:
            query = query.where(OfficeDocument.is_starred == is_starred)
        
        if is_template is not None:
            query = query.where(OfficeDocument.is_template == is_template)
        
        # 计算总数
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await db.execute(count_query)
        total = total_result.scalar() or 0
        
        # 分页排序
        query = query.order_by(desc(OfficeDocument.updated_at))
        query = query.offset((page - 1) * page_size).limit(page_size)
        
        result = await db.execute(query)
        documents = result.scalars().all()
        
        return list(documents), total
    
    @staticmethod
    async def update_document(
        db: AsyncSession,
        document_id: int,
        user_id: int,
        data: DocumentUpdate
    ) -> Optional[OfficeDocument]:
        """更新文档信息"""
        document = await OfficeService.get_document(db, document_id, user_id)
        if not document:
            return None
        
        # 检查编辑权限
        if not await OfficeService.check_access(db, document, user_id, require_edit=True):
            return None
        
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(document, key, value)
        
        await db.flush()
        return document
    
    @staticmethod
    async def update_document_content(
        db: AsyncSession,
        document_id: int,
        user_id: int,
        data: DocumentContentUpdate
    ) -> Optional[OfficeDocument]:
        """更新文档内容（带版本控制）"""
        document = await OfficeService.get_document(db, document_id, user_id)
        if not document:
            return None
        
        # 检查编辑权限
        if not await OfficeService.check_access(db, document, user_id, require_edit=True):
            return None
        
        # 版本冲突检测
        if document.version != data.version:
            logger.warning(f"文档 {document_id} 版本冲突: 当前 {document.version}, 提交 {data.version}")
            return None
        
        # 创建版本快照
        if data.create_version:
            version = OfficeVersion(
                document_id=document_id,
                version=document.version,
                content=document.content or "",
                user_id=user_id,
                comment=data.version_comment
            )
            db.add(version)
        
        # 更新内容和版本号
        document.content = data.content
        document.version = document.version + 1
        
        await db.flush()
        return document
    
    @staticmethod
    async def delete_document(
        db: AsyncSession,
        document_id: int,
        user_id: int,
        permanent: bool = False
    ) -> bool:
        """删除文档（软删除或永久删除）"""
        document = await OfficeService.get_document(db, document_id, user_id, include_deleted=True)
        if not document:
            return False
        
        # 只有所有者可以删除
        if document.user_id != user_id:
            return False
        
        if permanent:
            await db.delete(document)
        else:
            document.is_deleted = True
            document.deleted_at = datetime.now()
        
        await db.flush()
        logger.info(f"用户 {user_id} 删除了文档 {document_id}, 永久删除: {permanent}")
        return True
    
    @staticmethod
    async def restore_document(
        db: AsyncSession,
        document_id: int,
        user_id: int
    ) -> Optional[OfficeDocument]:
        """恢复已删除的文档"""
        document = await OfficeService.get_document(db, document_id, user_id, include_deleted=True)
        if not document or not document.is_deleted:
            return None
        
        if document.user_id != user_id:
            return None
        
        document.is_deleted = False
        document.deleted_at = None
        
        await db.flush()
        return document
    
    # ==================== 分享管理 ====================
    
    @staticmethod
    async def update_share_settings(
        db: AsyncSession,
        document_id: int,
        user_id: int,
        data: DocumentShareUpdate
    ) -> Optional[OfficeDocument]:
        """更新分享设置"""
        document = await OfficeService.get_document(db, document_id, user_id)
        if not document or document.user_id != user_id:
            return None
        
        document.share_type = data.share_type.value
        document.share_permission = data.share_permission.value
        
        # 生成分享码
        if data.share_type.value in ("link", "public") and not document.share_code:
            document.share_code = secrets.token_urlsafe(16)
        
        await db.flush()
        return document
    
    @staticmethod
    async def get_document_by_share_code(
        db: AsyncSession,
        share_code: str
    ) -> Optional[OfficeDocument]:
        """通过分享码获取文档"""
        result = await db.execute(
            select(OfficeDocument).where(
                and_(
                    OfficeDocument.share_code == share_code,
                    OfficeDocument.share_type.in_(["link", "public"]),
                    OfficeDocument.is_deleted == False
                )
            )
        )
        return result.scalar_one_or_none()
    
    # ==================== 版本管理 ====================
    
    @staticmethod
    async def get_version_list(
        db: AsyncSession,
        document_id: int,
        user_id: int,
        page: int = 1,
        page_size: int = 20
    ) -> Tuple[List[OfficeVersion], int]:
        """获取版本历史"""
        document = await OfficeService.get_document(db, document_id, user_id)
        if not document:
            return [], 0
        
        query = select(OfficeVersion).where(OfficeVersion.document_id == document_id)
        
        # 总数
        count_result = await db.execute(
            select(func.count()).select_from(query.subquery())
        )
        total = count_result.scalar() or 0
        
        # 分页
        query = query.order_by(desc(OfficeVersion.version))
        query = query.offset((page - 1) * page_size).limit(page_size)
        
        result = await db.execute(query)
        versions = result.scalars().all()
        
        return list(versions), total
    
    @staticmethod
    async def restore_version(
        db: AsyncSession,
        document_id: int,
        version_id: int,
        user_id: int
    ) -> Optional[OfficeDocument]:
        """恢复到指定版本"""
        document = await OfficeService.get_document(db, document_id, user_id)
        if not document:
            return None
        
        # 检查编辑权限
        if not await OfficeService.check_access(db, document, user_id, require_edit=True):
            return None
        
        # 获取版本
        result = await db.execute(
            select(OfficeVersion).where(
                and_(
                    OfficeVersion.id == version_id,
                    OfficeVersion.document_id == document_id
                )
            )
        )
        version = result.scalar_one_or_none()
        if not version:
            return None
        
        # 保存当前内容为新版本
        current_version = OfficeVersion(
            document_id=document_id,
            version=document.version,
            content=document.content or "",
            user_id=user_id,
            comment=f"恢复到版本 {version.version} 前的自动备份"
        )
        db.add(current_version)
        
        # 恢复内容
        document.content = version.content
        document.version = document.version + 1
        
        await db.flush()
        logger.info(f"用户 {user_id} 将文档 {document_id} 恢复到版本 {version.version}")
        return document
    
    # ==================== 协作者管理 ====================
    
    @staticmethod
    async def add_collaborator(
        db: AsyncSession,
        document_id: int,
        user_id: int,
        data: CollaboratorAdd
    ) -> Optional[OfficeCollaborator]:
        """添加协作者"""
        document = await OfficeService.get_document(db, document_id, user_id)
        if not document or document.user_id != user_id:
            return None
        
        # 不能添加自己
        if data.user_id == user_id:
            return None
        
        # 检查是否已存在
        result = await db.execute(
            select(OfficeCollaborator).where(
                and_(
                    OfficeCollaborator.document_id == document_id,
                    OfficeCollaborator.user_id == data.user_id
                )
            )
        )
        existing = result.scalar_one_or_none()
        if existing:
            existing.permission = data.permission.value
            await db.flush()
            return existing
        
        collaborator = OfficeCollaborator(
            document_id=document_id,
            user_id=data.user_id,
            permission=data.permission.value,
            invited_by=user_id
        )
        db.add(collaborator)
        await db.flush()
        await db.refresh(collaborator)
        
        return collaborator
    
    @staticmethod
    async def remove_collaborator(
        db: AsyncSession,
        document_id: int,
        collaborator_user_id: int,
        user_id: int
    ) -> bool:
        """移除协作者"""
        document = await OfficeService.get_document(db, document_id, user_id)
        if not document or document.user_id != user_id:
            return False
        
        result = await db.execute(
            select(OfficeCollaborator).where(
                and_(
                    OfficeCollaborator.document_id == document_id,
                    OfficeCollaborator.user_id == collaborator_user_id
                )
            )
        )
        collaborator = result.scalar_one_or_none()
        if not collaborator:
            return False
        
        await db.delete(collaborator)
        await db.flush()
        return True
    
    @staticmethod
    async def get_collaborators(
        db: AsyncSession,
        document_id: int,
        user_id: int
    ) -> List[OfficeCollaborator]:
        """获取协作者列表"""
        document = await OfficeService.get_document(db, document_id, user_id)
        if not document:
            return []
        
        result = await db.execute(
            select(OfficeCollaborator).where(
                OfficeCollaborator.document_id == document_id
            ).order_by(OfficeCollaborator.created_at)
        )
        return list(result.scalars().all())
    
    # ==================== 编辑会话管理 ====================
    
    @staticmethod
    async def join_edit_session(
        db: AsyncSession,
        document_id: int,
        user_id: int,
        session_id: str
    ) -> Optional[OfficeEditSession]:
        """加入编辑会话"""
        document = await OfficeService.get_document(db, document_id, user_id)
        if not document:
            return None
        
        # 检查是否已有会话
        result = await db.execute(
            select(OfficeEditSession).where(
                and_(
                    OfficeEditSession.document_id == document_id,
                    OfficeEditSession.user_id == user_id
                )
            )
        )
        existing = result.scalar_one_or_none()
        
        if existing:
            existing.session_id = session_id
            existing.is_active = True
            existing.last_activity = datetime.now()
            await db.flush()
            return existing
        
        session = OfficeEditSession(
            document_id=document_id,
            user_id=user_id,
            session_id=session_id,
            is_active=True
        )
        db.add(session)
        await db.flush()
        await db.refresh(session)
        
        return session
    
    @staticmethod
    async def leave_edit_session(
        db: AsyncSession,
        document_id: int,
        user_id: int
    ) -> bool:
        """离开编辑会话"""
        result = await db.execute(
            select(OfficeEditSession).where(
                and_(
                    OfficeEditSession.document_id == document_id,
                    OfficeEditSession.user_id == user_id
                )
            )
        )
        session = result.scalar_one_or_none()
        
        if session:
            session.is_active = False
            await db.flush()
            return True
        
        return False
    
    @staticmethod
    async def get_active_editors(
        db: AsyncSession,
        document_id: int
    ) -> List[OfficeEditSession]:
        """获取当前活跃的编辑者"""
        result = await db.execute(
            select(OfficeEditSession).where(
                and_(
                    OfficeEditSession.document_id == document_id,
                    OfficeEditSession.is_active == True
                )
            )
        )
        return list(result.scalars().all())
    
    @staticmethod
    async def update_cursor_position(
        db: AsyncSession,
        document_id: int,
        user_id: int,
        cursor_position: str
    ) -> bool:
        """更新光标位置"""
        result = await db.execute(
            select(OfficeEditSession).where(
                and_(
                    OfficeEditSession.document_id == document_id,
                    OfficeEditSession.user_id == user_id,
                    OfficeEditSession.is_active == True
                )
            )
        )
        session = result.scalar_one_or_none()
        
        if session:
            session.cursor_position = cursor_position
            session.last_activity = datetime.now()
            await db.flush()
            return True
        
        return False
    
    @staticmethod
    async def cleanup_inactive_sessions(
        db: AsyncSession,
        timeout_minutes: int = 10
    ) -> int:
        """清理超时的编辑会话"""
        from datetime import timedelta
        cutoff_time = datetime.now() - timedelta(minutes=timeout_minutes)
        
        result = await db.execute(
            select(OfficeEditSession).where(
                and_(
                    OfficeEditSession.is_active == True,
                    OfficeEditSession.last_activity < cutoff_time
                )
            )
        )
        sessions = result.scalars().all()
        
        count = 0
        for session in sessions:
            session.is_active = False
            count += 1
        
        if count > 0:
            await db.flush()
            logger.info(f"已清理 {count} 个不活跃的编辑会话")
        
        return count
    
    # ==================== 模板管理 ====================
    
    @staticmethod
    async def get_templates(
        db: AsyncSession,
        doc_type: Optional[str] = None
    ) -> List[OfficeDocument]:
        """获取公共模板列表"""
        query = select(OfficeDocument).where(
            and_(
                OfficeDocument.is_template == True,
                OfficeDocument.is_deleted == False,
                OfficeDocument.share_type == "public"
            )
        )
        
        if doc_type:
            query = query.where(OfficeDocument.doc_type == doc_type)
        
        query = query.order_by(desc(OfficeDocument.updated_at))
        
        result = await db.execute(query)
        return list(result.scalars().all())
    
    @staticmethod
    async def create_from_template(
        db: AsyncSession,
        template_id: int,
        user_id: int,
        title: str
    ) -> Optional[OfficeDocument]:
        """从模板创建文档"""
        result = await db.execute(
            select(OfficeDocument).where(
                and_(
                    OfficeDocument.id == template_id,
                    OfficeDocument.is_template == True,
                    OfficeDocument.is_deleted == False
                )
            )
        )
        template = result.scalar_one_or_none()
        
        if not template:
            return None
        
        document = OfficeDocument(
            title=title,
            doc_type=template.doc_type,
            content=template.content,
            user_id=user_id,
            is_template=False,
            version=1
        )
        db.add(document)
        await db.flush()
        await db.refresh(document)
        
        return document
    
    # ==================== 评论批注管理 ====================
    
    @staticmethod
    async def create_comment(
        db: AsyncSession,
        document_id: int,
        user_id: int,
        data: CommentCreate
    ) -> Optional[OfficeComment]:
        """创建评论"""
        document = await OfficeService.get_document(db, document_id, user_id)
        if not document:
            return None
        
        comment = OfficeComment(
            document_id=document_id,
            user_id=user_id,
            content=data.content,
            selection_start=data.selection_start,
            selection_end=data.selection_end,
            selected_text=data.selected_text,
            parent_id=data.parent_id
        )
        db.add(comment)
        await db.flush()
        await db.refresh(comment)
        
        logger.info(f"用户 {user_id} 在文档 {document_id} 添加了评论 {comment.id}")
        return comment
    
    @staticmethod
    async def get_comments(
        db: AsyncSession,
        document_id: int,
        user_id: int,
        include_resolved: bool = True
    ) -> List[OfficeComment]:
        """获取文档评论列表"""
        document = await OfficeService.get_document(db, document_id, user_id)
        if not document:
            return []
        
        query = select(OfficeComment).where(
            and_(
                OfficeComment.document_id == document_id,
                OfficeComment.parent_id == None  # 只获取顶级评论
            )
        )
        
        if not include_resolved:
            query = query.where(OfficeComment.is_resolved == False)
        
        query = query.order_by(OfficeComment.created_at.desc())
        
        result = await db.execute(query)
        return list(result.scalars().all())
    
    @staticmethod
    async def get_comment_replies(
        db: AsyncSession,
        comment_id: int
    ) -> List[OfficeComment]:
        """获取评论的回复列表"""
        result = await db.execute(
            select(OfficeComment).where(
                OfficeComment.parent_id == comment_id
            ).order_by(OfficeComment.created_at)
        )
        return list(result.scalars().all())
    
    @staticmethod
    async def update_comment(
        db: AsyncSession,
        comment_id: int,
        user_id: int,
        data: CommentUpdate
    ) -> Optional[OfficeComment]:
        """更新评论"""
        result = await db.execute(
            select(OfficeComment).where(OfficeComment.id == comment_id)
        )
        comment = result.scalar_one_or_none()
        
        if not comment:
            return None
        
        # 只有评论作者可以编辑内容
        if data.content is not None:
            if comment.user_id != user_id:
                return None
            comment.content = data.content
        
        # 解决评论
        if data.is_resolved is not None:
            comment.is_resolved = data.is_resolved
            if data.is_resolved:
                comment.resolved_by = user_id
                comment.resolved_at = datetime.now()
            else:
                comment.resolved_by = None
                comment.resolved_at = None
        
        await db.flush()
        return comment
    
    @staticmethod
    async def delete_comment(
        db: AsyncSession,
        comment_id: int,
        user_id: int
    ) -> bool:
        """删除评论"""
        result = await db.execute(
            select(OfficeComment).where(OfficeComment.id == comment_id)
        )
        comment = result.scalar_one_or_none()
        
        if not comment:
            return False
        
        # 只有评论作者或文档所有者可以删除
        document = await OfficeService.get_document(db, comment.document_id, user_id)
        if not document:
            return False
        
        if comment.user_id != user_id and document.user_id != user_id:
            return False
        
        await db.delete(comment)
        await db.flush()
        return True
