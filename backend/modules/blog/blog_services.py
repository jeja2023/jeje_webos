"""
博客业务逻辑
"""

from datetime import datetime, timezone
from typing import List, Optional, Tuple
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, delete, and_, or_

from .blog_models import BlogPost, BlogCategory, BlogTag, BlogPostTag
from .blog_schemas import PostCreate, PostUpdate, CategoryCreate, CategoryUpdate


class BlogService:
    """博客服务"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    # ============ 分类 ============
    
    async def get_categories(self) -> List[BlogCategory]:
        """获取所有分类"""
        result = await self.db.execute(
            select(BlogCategory).order_by(BlogCategory.order, BlogCategory.id)
        )
        return list(result.scalars().all())
    
    async def get_category(self, category_id: int) -> Optional[BlogCategory]:
        """获取分类"""
        result = await self.db.execute(
            select(BlogCategory).where(BlogCategory.id == category_id)
        )
        return result.scalar_one_or_none()
    
    async def create_category(self, data: CategoryCreate) -> BlogCategory:
        """创建分类"""
        category = BlogCategory(**data.model_dump())
        self.db.add(category)
        await self.db.commit()
        await self.db.refresh(category)
        return category
    
    async def update_category(self, category_id: int, data: CategoryUpdate) -> Optional[BlogCategory]:
        """更新分类（优化：使用直接更新，减少查询）"""
        update_data = data.model_dump(exclude_unset=True)
        if not update_data:
            # 如果没有要更新的字段，直接返回
            return await self.get_category(category_id)
        
        # 使用直接更新
        from sqlalchemy import update as sql_update
        await self.db.execute(
            sql_update(BlogCategory)
            .where(BlogCategory.id == category_id)
            .values(**update_data)
        )
        await self.db.commit()
        
        # 返回更新后的分类
        return await self.get_category(category_id)
    
    async def delete_category(self, category_id: int) -> bool:
        """删除分类（优化：直接删除，避免先查询）"""
        from sqlalchemy import delete as sql_delete
        result = await self.db.execute(
            sql_delete(BlogCategory).where(BlogCategory.id == category_id)
        )
        await self.db.commit()
        return result.rowcount > 0
    
    # ============ 标签 ============
    
    async def get_tags(self) -> List[BlogTag]:
        """获取所有标签"""
        result = await self.db.execute(select(BlogTag))
        return list(result.scalars().all())
    
    async def get_or_create_tag(self, name: str, slug: str) -> BlogTag:
        """获取或创建标签"""
        result = await self.db.execute(
            select(BlogTag).where(BlogTag.slug == slug)
        )
        tag = result.scalar_one_or_none()
        
        if not tag:
            tag = BlogTag(name=name, slug=slug)
            self.db.add(tag)
            await self.db.commit()
            await self.db.refresh(tag)
        
        return tag
    
    # ============ 文章 ============
    
    async def get_posts(
        self,
        page: int = 1,
        size: int = 10,
        category_id: Optional[int] = None,
        tag_id: Optional[int] = None,
        status: Optional[str] = None,
        keyword: Optional[str] = None,
        author_id: Optional[int] = None
    ) -> Tuple[List[BlogPost], int]:
        """获取文章列表"""
        query = select(BlogPost)
        count_query = select(func.count(BlogPost.id))
        
        # 筛选条件
        conditions = []
        
        if category_id:
            conditions.append(BlogPost.category_id == category_id)
        
        if status:
            conditions.append(BlogPost.status == status)
        
        if author_id:
            conditions.append(BlogPost.author_id == author_id)
        
        if keyword:
            conditions.append(
                or_(
                    BlogPost.title.contains(keyword),
                    BlogPost.summary.contains(keyword)
                )
            )
        
        if conditions:
            query = query.where(and_(*conditions))
            count_query = count_query.where(and_(*conditions))
        
        # 标签筛选（优化：使用 JOIN 代替子查询，性能更好）
        if tag_id:
            query = query.join(BlogPostTag, BlogPost.id == BlogPostTag.post_id).where(
                BlogPostTag.tag_id == tag_id
            )
            count_query = count_query.join(BlogPostTag, BlogPost.id == BlogPostTag.post_id).where(
                BlogPostTag.tag_id == tag_id
            )
        
        # 排序和分页
        query = query.order_by(BlogPost.is_top.desc(), BlogPost.created_at.desc())
        query = query.offset((page - 1) * size).limit(size)
        
        # 执行查询
        result = await self.db.execute(query)
        posts = list(result.scalars().all())
        
        count_result = await self.db.execute(count_query)
        total = count_result.scalar()
        
        return posts, total
    
    async def get_post(self, post_id: int) -> Optional[BlogPost]:
        """获取文章"""
        result = await self.db.execute(
            select(BlogPost).where(BlogPost.id == post_id)
        )
        return result.scalar_one_or_none()
    
    async def get_post_by_slug(self, slug: str) -> Optional[BlogPost]:
        """通过slug获取文章"""
        result = await self.db.execute(
            select(BlogPost).where(BlogPost.slug == slug)
        )
        return result.scalar_one_or_none()
    
    async def create_post(self, data: PostCreate, author_id: int) -> BlogPost:
        """创建文章"""
        tags = data.tags
        post_data = data.model_dump(exclude={"tags"})
        post_data["author_id"] = author_id
        
        if data.status == "published":
            post_data["published_at"] = datetime.now(timezone.utc)
        
        post = BlogPost(**post_data)
        self.db.add(post)
        await self.db.commit()
        await self.db.refresh(post)
        
        # 批量关联标签（优化：一次性添加所有标签关联）
        if tags:
            post_tags = [BlogPostTag(post_id=post.id, tag_id=tag_id) for tag_id in tags]
            self.db.add_all(post_tags)
            await self.db.commit()
        
        return post
    
    async def update_post(self, post_id: int, data: PostUpdate) -> Optional[BlogPost]:
        """更新文章"""
        post = await self.get_post(post_id)
        if not post:
            return None
        
        tags = data.tags
        update_data = data.model_dump(exclude={"tags"}, exclude_unset=True)
        
        # 更新发布时间（需要知道当前状态）
        if data.status == "published" and post.status != "published":
            update_data["published_at"] = datetime.now(timezone.utc)
        
        # 如果有字段需要更新，使用直接更新
        if update_data:
            from sqlalchemy import update as sql_update
            await self.db.execute(
                sql_update(BlogPost)
                .where(BlogPost.id == post_id)
                .values(**update_data)
            )
        
        # 批量更新标签（优化：先删除再批量添加）
        if tags is not None:
            await self.db.execute(
                delete(BlogPostTag).where(BlogPostTag.post_id == post_id)
            )
            if tags:  # 只有当标签列表不为空时才添加
                post_tags = [BlogPostTag(post_id=post_id, tag_id=tag_id) for tag_id in tags]
                self.db.add_all(post_tags)
        
        await self.db.commit()
        # 返回更新后的文章
        return await self.get_post(post_id)
    
    async def delete_post(self, post_id: int) -> bool:
        """删除文章（优化：直接删除，避免先查询）"""
        # 先删除标签关联
        await self.db.execute(
            delete(BlogPostTag).where(BlogPostTag.post_id == post_id)
        )
        # 再删除文章
        from sqlalchemy import delete as sql_delete
        result = await self.db.execute(
            sql_delete(BlogPost).where(BlogPost.id == post_id)
        )
        await self.db.commit()
        return result.rowcount > 0
    
    async def increment_views(self, post_id: int):
        """增加浏览量（优化：使用直接更新，避免先查询）"""
        from sqlalchemy import update as sql_update
        await self.db.execute(
            sql_update(BlogPost)
            .where(BlogPost.id == post_id)
            .values(views=BlogPost.views + 1)
        )
        await self.db.commit()
    
    async def get_post_tags(self, post_id: int) -> List[BlogTag]:
        """获取文章标签"""
        result = await self.db.execute(
            select(BlogTag)
            .join(BlogPostTag)
            .where(BlogPostTag.post_id == post_id)
        )
        return list(result.scalars().all())


