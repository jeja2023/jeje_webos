"""
博客API路由
RESTful风格
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user, TokenData, require_permission
from core.events import event_bus, Events
from schemas import success, paginate

from .blog_schemas import (
    PostCreate, PostUpdate, PostInfo, PostListItem,
    CategoryCreate, CategoryUpdate, CategoryInfo,
    TagCreate, TagInfo
)
from .blog_services import BlogService

router = APIRouter()


# ============ 分类接口 ============

@router.get("/categories")
async def list_categories(db: AsyncSession = Depends(get_db)):
    """获取分类列表"""
    service = BlogService(db)
    categories = await service.get_categories()
    return success([CategoryInfo.model_validate(c).model_dump() for c in categories])


@router.post("/categories")
async def create_category(
    data: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("blog.create"))
):
    """创建分类"""
    service = BlogService(db)
    category = await service.create_category(data)
    return success(CategoryInfo.model_validate(category).model_dump())


@router.put("/categories/{category_id}")
async def update_category(
    category_id: int,
    data: CategoryUpdate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("blog.update"))
):
    """更新分类"""
    service = BlogService(db)
    category = await service.update_category(category_id, data)
    if not category:
        raise HTTPException(status_code=404, detail="分类不存在")
    return success(CategoryInfo.model_validate(category).model_dump())


@router.delete("/categories/{category_id}")
async def delete_category(
    category_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("blog.delete"))
):
    """删除分类"""
    service = BlogService(db)
    if not await service.delete_category(category_id):
        raise HTTPException(status_code=404, detail="分类不存在")
    return success(message="删除成功")


# ============ 标签接口 ============

@router.get("/tags")
async def list_tags(db: AsyncSession = Depends(get_db)):
    """获取标签列表"""
    service = BlogService(db)
    tags = await service.get_tags()
    return success([TagInfo.model_validate(t).model_dump() for t in tags])


@router.post("/tags")
async def create_tag(
    data: TagCreate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("blog.create"))
):
    """创建标签"""
    service = BlogService(db)
    tag = await service.get_or_create_tag(data.name, data.slug)
    return success(TagInfo.model_validate(tag).model_dump())


# ============ 文章接口 ============

@router.get("/posts")
async def list_posts(
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
    category_id: Optional[int] = None,
    tag_id: Optional[int] = None,
    status: Optional[str] = None,
    keyword: Optional[str] = None,
    db: AsyncSession = Depends(get_db)
):
    """获取文章列表（公开）"""
    service = BlogService(db)
    
    # 公开接口只显示已发布文章
    if status is None:
        status = "published"
    
    posts, total = await service.get_posts(
        page=page,
        size=size,
        category_id=category_id,
        tag_id=tag_id,
        status=status,
        keyword=keyword
    )
    
    # 获取每篇文章的标签
    items = []
    for post in posts:
        items.append(await _enrich_post_data(service, post))
    
    return paginate(items, total, page, size)


async def _enrich_post_data(service: BlogService, post, schema=PostListItem):
    """辅助函数：填充文章的关联数据（标签、分类）"""
    post_dict = schema.model_validate(post).model_dump()
    
    # 获取标签
    tags = await service.get_post_tags(post.id)
    post_dict["tags"] = [TagInfo.model_validate(t).model_dump() for t in tags]
    
    # 获取分类
    if post.category_id:
        category = await service.get_category(post.category_id)
        if category:
            post_dict["category"] = CategoryInfo.model_validate(category).model_dump()

    # 填充标签和分类等关联数据
    # 返回字典格式，由调用者验证具体的 Schema (PostListItem 或 PostInfo)
    
    return post_dict


@router.get("/posts/my")
async def list_my_posts(
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
    status: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取我的文章列表（管理员可查看所有文章）"""
    service = BlogService(db)
    
    # 管理员可以查看所有文章，普通用户只能查看自己的
    author_id = None if user.role == "admin" else user.user_id
    
    posts, total = await service.get_posts(
        page=page,
        size=size,
        status=status,
        author_id=author_id
    )
    
    items = []
    for post in posts:
        items.append(await _enrich_post_data(service, post))
    
    return paginate(items, total, page, size)


@router.get("/posts/{post_id}")
async def get_post(
    post_id: int,
    db: AsyncSession = Depends(get_db)
):
    """获取文章详情"""
    service = BlogService(db)
    post = await service.get_post(post_id)
    
    if not post:
        raise HTTPException(status_code=404, detail="文章不存在")
    
    # 增加浏览量
    await service.increment_views(post_id)
    
    # 构建响应
    # 使用 PostInfo schema 获取完整详情（包含 content）
    post_dict = await _enrich_post_data(service, post, schema=PostInfo)
    
    return success(post_dict)
    



@router.get("/posts/slug/{slug}")
async def get_post_by_slug(
    slug: str,
    db: AsyncSession = Depends(get_db)
):
    """通过slug获取文章"""
    service = BlogService(db)
    post = await service.get_post_by_slug(slug)
    
    if not post:
        raise HTTPException(status_code=404, detail="文章不存在")
    
    await service.increment_views(post.id)
    
    post_dict = await _enrich_post_data(service, post, schema=PostInfo)
    
    return success(post_dict)


@router.post("/posts")
async def create_post(
    data: PostCreate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("blog.create"))
):
    """创建文章"""
    service = BlogService(db)
    post = await service.create_post(data, user.user_id)
    
    # 发布事件
    event_bus.emit(Events.CONTENT_CREATED, "blog", {
        "type": "post",
        "id": post.id,
        "title": post.title
    })
    
    return success({"id": post.id}, "创建成功")


@router.put("/posts/{post_id}")
async def update_post(
    post_id: int,
    data: PostUpdate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("blog.update"))
):
    """更新文章"""
    service = BlogService(db)
    
    # 检查权限（非管理员只能编辑自己的文章）
    post = await service.get_post(post_id)
    if not post:
        raise HTTPException(status_code=404, detail="文章不存在")
    
    if user.role != "admin" and post.author_id != user.user_id:
        raise HTTPException(status_code=403, detail="无权编辑此文章")
    
    updated_post = await service.update_post(post_id, data)
    
    event_bus.emit(Events.CONTENT_UPDATED, "blog", {
        "type": "post",
        "id": post_id
    })
    
    return success({"id": updated_post.id}, "更新成功")


@router.delete("/posts/{post_id}")
async def delete_post(
    post_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_permission("blog.delete"))
):
    """删除文章"""
    service = BlogService(db)
    
    post = await service.get_post(post_id)
    if not post:
        raise HTTPException(status_code=404, detail="文章不存在")
    
    if user.role != "admin" and post.author_id != user.user_id:
        raise HTTPException(status_code=403, detail="无权删除此文章")
    
    await service.delete_post(post_id)
    
    event_bus.emit(Events.CONTENT_DELETED, "blog", {
        "type": "post",
        "id": post_id
    })
    
    return success(message="删除成功")
