# -*- coding: utf-8 -*-
"""
Markdown 文档业务逻辑层
"""

import logging
from typing import Optional, List, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, desc

from .markdown_models import MarkdownDoc, MarkdownTemplate
from .markdown_schemas import (
    MarkdownDocCreate, MarkdownDocUpdate, MarkdownDocListItem, MarkdownDocResponse,
    MarkdownTemplateCreate, MarkdownTemplateUpdate, MarkdownTemplateResponse
)

logger = logging.getLogger(__name__)


class MarkdownService:
    """Markdown 文档服务"""
    
    # 文档操作
    
    @staticmethod
    async def create_doc(
        db: AsyncSession, 
        user_id: int, 
        data: MarkdownDocCreate
    ) -> MarkdownDoc:
        """创建文档"""
        # 自动生成摘要
        summary = data.summary
        if not summary and data.content:
            # 取内容前200个字符作为摘要
            content_text = data.content.replace('#', '').replace('*', '').replace('`', '')
            summary = content_text[:200].strip()
        
        doc = MarkdownDoc(
            user_id=user_id,
            title=data.title,
            content=data.content or "",
            summary=summary or "",
            is_public=data.is_public or False
        )
        db.add(doc)
        await db.commit()
        await db.refresh(doc)
        logger.debug(f"用户 {user_id} 创建文档: {doc.title}")
        return doc
    
    @staticmethod
    async def get_doc_by_id(
        db: AsyncSession, 
        doc_id: int, 
        user_id: Optional[int] = None,
        increment_view: bool = False
    ) -> Optional[MarkdownDoc]:
        """获取单个文档"""
        stmt = select(MarkdownDoc).where(MarkdownDoc.id == doc_id)
        result = await db.execute(stmt)
        doc = result.scalar_one_or_none()
        
        if doc is None:
            return None
        
        # 权限检查：非公开文档只能由作者查看
        if not doc.is_public and user_id != doc.user_id:
            return None
        
        # 增加阅读次数
        if increment_view:
            doc.view_count += 1
            await db.commit()
            await db.refresh(doc)
        
        return doc
    
    @staticmethod
    async def get_doc_list(
        db: AsyncSession,
        user_id: int,
        page: int = 1,
        size: int = 20,
        keyword: Optional[str] = None,
        is_starred: Optional[bool] = None,
        is_public: Optional[bool] = None
    ) -> Tuple[List[MarkdownDoc], int]:
        """获取文档列表"""
        # 基础查询条件：只查询自己的文档
        conditions = [MarkdownDoc.user_id == user_id]
        
        # 关键词搜索
        if keyword:
            conditions.append(
                or_(
                    MarkdownDoc.title.ilike(f"%{keyword}%"),
                    MarkdownDoc.content.ilike(f"%{keyword}%")
                )
            )
        
        # 收藏筛选
        if is_starred is not None:
            conditions.append(MarkdownDoc.is_starred == is_starred)
        
        # 公开状态筛选
        if is_public is not None:
            conditions.append(MarkdownDoc.is_public == is_public)
        
        # 总数查询
        count_stmt = select(func.count()).select_from(MarkdownDoc).where(*conditions)
        total_result = await db.execute(count_stmt)
        total = total_result.scalar() or 0
        
        # 分页查询
        stmt = (
            select(MarkdownDoc)
            .where(*conditions)
            .order_by(desc(MarkdownDoc.updated_at))
            .offset((page - 1) * size)
            .limit(size)
        )
        result = await db.execute(stmt)
        docs = result.scalars().all()
        
        return list(docs), total
    
    @staticmethod
    async def update_doc(
        db: AsyncSession, 
        doc_id: int, 
        user_id: int, 
        data: MarkdownDocUpdate
    ) -> Optional[MarkdownDoc]:
        """更新文档"""
        stmt = select(MarkdownDoc).where(
            MarkdownDoc.id == doc_id,
            MarkdownDoc.user_id == user_id
        )
        result = await db.execute(stmt)
        doc = result.scalar_one_or_none()
        
        if doc is None:
            return None
        
        # 更新字段
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(doc, key, value)
        
        # 如果更新了内容但没有摘要，自动更新摘要
        if 'content' in update_data and 'summary' not in update_data:
            content_text = update_data['content'].replace('#', '').replace('*', '').replace('`', '')
            doc.summary = content_text[:200].strip()
        
        await db.commit()
        await db.refresh(doc)
        logger.debug(f"用户 {user_id} 更新文档: {doc.title}")
        return doc
    
    @staticmethod
    async def delete_doc(db: AsyncSession, doc_id: int, user_id: int) -> bool:
        """删除文档"""
        stmt = select(MarkdownDoc).where(
            MarkdownDoc.id == doc_id,
            MarkdownDoc.user_id == user_id
        )
        result = await db.execute(stmt)
        doc = result.scalar_one_or_none()
        
        if doc is None:
            return False
        
        await db.delete(doc)
        await db.commit()
        logger.info(f"用户 {user_id} 删除文档: {doc.title}")
        return True
    
    @staticmethod
    async def toggle_star(db: AsyncSession, doc_id: int, user_id: int) -> Optional[MarkdownDoc]:
        """切换收藏状态"""
        stmt = select(MarkdownDoc).where(
            MarkdownDoc.id == doc_id,
            MarkdownDoc.user_id == user_id
        )
        result = await db.execute(stmt)
        doc = result.scalar_one_or_none()
        
        if doc is None:
            return None
        
        doc.is_starred = not doc.is_starred
        await db.commit()
        await db.refresh(doc)
        return doc
    
    @staticmethod
    async def export_doc(
        db: AsyncSession, 
        doc_id: int, 
        user_id: int, 
        format: str
    ) -> Tuple[Optional[str], Optional[str], Optional[str]]:
        """导出文档
        Returns: (content, filename, media_type)
        """
        doc = await MarkdownService.get_doc_by_id(db, doc_id, user_id)
        if not doc:
            return None, None, None
            
        if format == 'markdown':
            filename = f"{doc.title}.md"
            return doc.content, filename, "text/markdown; charset=utf-8"
        
        elif format == 'html':
            try:
                from markdown_it import MarkdownIt
                md = MarkdownIt()
                html_content = md.render(doc.content or "")
            except ImportError:
                # 降级处理
                html_content = f"<pre>{doc.content}</pre>"
            
            # HTML 模板
            full_html = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>{doc.title}</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            line-height: 1.6;
            padding: 40px;
            max-width: 900px;
            margin: 0 auto;
            color: #2c3e50;
        }}
        h1, h2, h3, h4, h5, h6 {{ margin-top: 1.5em; margin-bottom: 0.5em; }}
        img {{ max-width: 100%; border-radius: 4px; }}
        pre {{ background: #f6f8fa; padding: 16px; border-radius: 6px; overflow-x: auto; }}
        code {{ background: #f6f8fa; padding: 2px 4px; border-radius: 3px; font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace; font-size: 0.9em; }}
        pre code {{ background: transparent; padding: 0; }}
        blockquote {{ border-left: 4px solid #dfe2e5; padding-left: 15px; color: #6a737d; margin: 1em 0; }}
        table {{ border-collapse: collapse; width: 100%; margin: 15px 0; }}
        th, td {{ border: 1px solid #dfe2e5; padding: 6px 13px; text-align: left; }}
        th {{ background-color: #f6f8fa; font-weight: 600; }}
        hr {{ height: 0.25em; padding: 0; margin: 24px 0; background-color: #e1e4e8; border: 0; }}
        a {{ color: #0366d6; text-decoration: none; }}
        a:hover {{ text-decoration: underline; }}
    </style>
</head>
<body>
    <h1 style="border-bottom: 1px solid #eaecef; padding-bottom: 0.3em;">{doc.title}</h1>
    {html_content}
    <footer style="margin-top: 50px; text-align: center; font-size: 12px; color: #999; border-top: 1px solid #eee; padding-top: 20px;">
        Generated by JeJe WebOS
    </footer>
</body>
</html>"""
            filename = f"{doc.title}.html"
            return full_html, filename, "text/html; charset=utf-8"
            
        return None, None, None
    
    # 模板操作
    
    @staticmethod
    async def get_templates(
        db: AsyncSession, 
        user_id: int
    ) -> List[MarkdownTemplate]:
        """获取模板列表（系统模板 + 用户模板）"""
        stmt = (
            select(MarkdownTemplate)
            .where(
                or_(
                    MarkdownTemplate.is_system == True,
                    MarkdownTemplate.user_id == user_id
                )
            )
            .order_by(MarkdownTemplate.is_system.desc(), MarkdownTemplate.created_at.desc())
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())
    
    @staticmethod
    async def create_template(
        db: AsyncSession, 
        user_id: int, 
        data: MarkdownTemplateCreate
    ) -> MarkdownTemplate:
        """创建用户模板"""
        template = MarkdownTemplate(
            user_id=user_id,
            name=data.name,
            description=data.description or "",
            content=data.content,
            is_system=False
        )
        db.add(template)
        await db.commit()
        await db.refresh(template)
        logger.info(f"用户 {user_id} 创建模板: {template.name}")
        return template
    
    @staticmethod
    async def delete_template(db: AsyncSession, template_id: int, user_id: int) -> bool:
        """删除用户模板（系统模板不可删除）"""
        stmt = select(MarkdownTemplate).where(
            MarkdownTemplate.id == template_id,
            MarkdownTemplate.user_id == user_id,
            MarkdownTemplate.is_system == False
        )
        result = await db.execute(stmt)
        template = result.scalar_one_or_none()
        
        if template is None:
            return False
        
        await db.delete(template)
        await db.commit()
        logger.info(f"用户 {user_id} 删除模板: {template.name}")
        return True
    
    # 统计信息
    
    @staticmethod
    async def get_statistics(db: AsyncSession, user_id: int) -> dict:
        """获取用户文档统计"""
        # 文档总数
        total_stmt = select(func.count()).select_from(MarkdownDoc).where(
            MarkdownDoc.user_id == user_id
        )
        total_result = await db.execute(total_stmt)
        total_docs = total_result.scalar() or 0
        
        # 收藏数
        starred_stmt = select(func.count()).select_from(MarkdownDoc).where(
            MarkdownDoc.user_id == user_id,
            MarkdownDoc.is_starred == True
        )
        starred_result = await db.execute(starred_stmt)
        starred_docs = starred_result.scalar() or 0
        
        # 公开数
        public_stmt = select(func.count()).select_from(MarkdownDoc).where(
            MarkdownDoc.user_id == user_id,
            MarkdownDoc.is_public == True
        )
        public_result = await db.execute(public_stmt)
        public_docs = public_result.scalar() or 0
        
        # 总阅读次数
        views_stmt = select(func.sum(MarkdownDoc.view_count)).where(
            MarkdownDoc.user_id == user_id
        )
        views_result = await db.execute(views_stmt)
        total_views = views_result.scalar() or 0
        
        return {
            "total_docs": total_docs,
            "starred_docs": starred_docs,
            "public_docs": public_docs,
            "total_views": total_views
        }
