# -*- coding: utf-8 -*-
"""
博客模块测试
覆盖：模型、Schema、服务层 CRUD、API 路由端点
"""

import pytest
from httpx import AsyncClient

from modules.blog.blog_models import BlogPost, BlogCategory, BlogTag
from modules.blog.blog_schemas import PostCreate, CategoryCreate


# ==================== 模型测试 ====================

class TestBlogModels:
    """测试博客数据模型"""
    
    def test_blog_category_model(self):
        assert BlogCategory.__tablename__ == "blog_categories"
    
    def test_blog_post_model(self):
        assert BlogPost.__tablename__ == "blog_posts"
    
    def test_blog_tag_model(self):
        assert BlogTag.__tablename__ == "blog_tags"


class TestBlogSchemas:
    """测试博客数据验证模型"""
    
    def test_post_create_schema(self):
        data = PostCreate(title="测试文章", slug="test-post", content="这是文章内容", summary="文章摘要")
        assert data.title == "测试文章"
    
    def test_category_create_schema(self):
        data = CategoryCreate(name="技术", slug="tech", description="技术类文章")
        assert data.name == "技术"


# ==================== 服务层测试 ====================

class TestBlogService:
    """测试博客服务层"""
    
    @pytest.mark.asyncio
    async def test_create_category(self, db_session):
        from modules.blog.blog_services import BlogService
        service = BlogService(db_session)
        data = CategoryCreate(name="测试分类", slug="test-category", description="测试描述")
        category = await service.create_category(data)
        assert category.id is not None
        assert category.name == "测试分类"
    
    @pytest.mark.asyncio
    async def test_get_categories(self, db_session):
        from modules.blog.blog_services import BlogService
        service = BlogService(db_session)
        categories = await service.get_categories()
        assert isinstance(categories, list)
    
    @pytest.mark.asyncio
    async def test_create_post(self, db_session):
        from modules.blog.blog_services import BlogService
        service = BlogService(db_session)
        data = PostCreate(title="测试文章", slug="test-post", content="文章内容", author_id=1)
        post = await service.create_post(data, author_id=1)
        assert post.id is not None
        assert post.title == "测试文章"
        assert post.status == "draft"
    
    @pytest.mark.asyncio
    async def test_create_post_with_tags(self, db_session):
        from modules.blog.blog_services import BlogService
        service = BlogService(db_session)
        tag1 = await service.get_or_create_tag("Python", "python")
        tag2 = await service.get_or_create_tag("Django", "django")
        data = PostCreate(title="测试文章", slug="test-post", content="文章内容", tags=[tag1.id, tag2.id])
        post = await service.create_post(data, author_id=1)
        tags = await service.get_post_tags(post.id)
        assert len(tags) == 2
    
    @pytest.mark.asyncio
    async def test_update_post(self, db_session):
        from modules.blog.blog_services import BlogService
        from modules.blog.blog_schemas import PostUpdate
        service = BlogService(db_session)
        data = PostCreate(title="原始标题", slug="original-post", content="原始内容", author_id=1)
        post = await service.create_post(data, author_id=1)
        update_data = PostUpdate(title="更新标题", content="更新内容")
        updated = await service.update_post(post.id, update_data)
        assert updated.title == "更新标题"
    
    @pytest.mark.asyncio
    async def test_increment_views(self, db_session):
        from modules.blog.blog_services import BlogService
        service = BlogService(db_session)
        data = PostCreate(title="测试", slug="test", content="内容", author_id=1)
        post = await service.create_post(data, author_id=1)
        initial_views = post.views
        await service.increment_views(post.id)
        updated_post = await service.get_post(post.id)
        assert updated_post.views == initial_views + 1
    
    @pytest.mark.asyncio
    async def test_delete_category(self, db_session):
        from modules.blog.blog_services import BlogService
        service = BlogService(db_session)
        data = CategoryCreate(name="测试分类", slug="test")
        category = await service.create_category(data)
        result = await service.delete_category(category.id)
        assert result is True
        deleted = await service.get_category(category.id)
        assert deleted is None
    
    @pytest.mark.asyncio
    async def test_delete_post(self, db_session):
        from modules.blog.blog_services import BlogService
        service = BlogService(db_session)
        data = PostCreate(title="待删除", slug="to-delete", content="内容", author_id=1)
        post = await service.create_post(data, author_id=1)
        result = await service.delete_post(post.id)
        assert result is True

    @pytest.mark.asyncio
    async def test_get_post(self, db_session):
        """测试获取单篇文章"""
        from modules.blog.blog_services import BlogService
        service = BlogService(db_session)
        data = PostCreate(title="查询文章", slug="get-test", content="内容")
        post = await service.create_post(data, author_id=1)
        fetched = await service.get_post(post.id)
        assert fetched is not None
        assert fetched.title == "查询文章"

    @pytest.mark.asyncio
    async def test_get_posts_list(self, db_session):
        """测试获取文章列表"""
        from modules.blog.blog_services import BlogService
        service = BlogService(db_session)
        await service.create_post(PostCreate(title="文章1", slug="p1", content="c1"), author_id=1)
        await service.create_post(PostCreate(title="文章2", slug="p2", content="c2"), author_id=1)
        posts, total = await service.get_posts(page=1, size=10)
        assert total >= 2

    @pytest.mark.asyncio
    async def test_get_or_create_tag_idempotent(self, db_session):
        """测试标签创建的幂等性"""
        from modules.blog.blog_services import BlogService
        service = BlogService(db_session)
        tag1 = await service.get_or_create_tag("Python", "python")
        tag2 = await service.get_or_create_tag("Python", "python")
        assert tag1.id == tag2.id


# ==================== API 路由测试 ====================

@pytest.mark.asyncio
class TestBlogCategoryAPI:
    """博客分类 API 测试"""

    async def test_get_categories(self, admin_client: AsyncClient):
        """测试获取分类列表"""
        resp = await admin_client.get("/api/v1/blog/categories")
        assert resp.status_code == 200

    async def test_create_category(self, admin_client: AsyncClient):
        """测试创建分类"""
        resp = await admin_client.post("/api/v1/blog/categories", json={
            "name": "API测试分类", "slug": "api-test-cat", "description": "描述"
        })
        assert resp.status_code == 200
        assert resp.json()["data"]["name"] == "API测试分类"

    async def test_update_category(self, admin_client: AsyncClient):
        """测试更新分类"""
        create_resp = await admin_client.post("/api/v1/blog/categories", json={
            "name": "待更新分类", "slug": "to-update"
        })
        cat_id = create_resp.json()["data"]["id"]
        resp = await admin_client.put(f"/api/v1/blog/categories/{cat_id}", json={
            "name": "已更新分类"
        })
        assert resp.status_code == 200

    async def test_delete_category(self, admin_client: AsyncClient):
        """测试删除分类"""
        create_resp = await admin_client.post("/api/v1/blog/categories", json={
            "name": "待删除分类", "slug": "to-delete"
        })
        cat_id = create_resp.json()["data"]["id"]
        resp = await admin_client.delete(f"/api/v1/blog/categories/{cat_id}")
        assert resp.status_code == 200


@pytest.mark.asyncio
class TestBlogPostAPI:
    """博客文章 API 测试"""

    async def test_get_posts_list(self, admin_client: AsyncClient):
        """测试获取文章列表"""
        resp = await admin_client.get("/api/v1/blog/posts")
        assert resp.status_code == 200

    async def test_create_post(self, admin_client: AsyncClient):
        """测试创建文章"""
        resp = await admin_client.post("/api/v1/blog/posts", json={
            "title": "API测试文章", "slug": "api-test-post", "content": "API测试内容",
            "summary": "API测试摘要"
        })
        assert resp.status_code == 200

    async def test_get_post_detail(self, admin_client: AsyncClient):
        """测试获取文章详情"""
        create = await admin_client.post("/api/v1/blog/posts", json={
            "title": "详情测试", "slug": "detail-test", "content": "内容"
        })
        assert create.status_code == 200
        post_id = create.json()["data"]["id"]
        resp = await admin_client.get(f"/api/v1/blog/posts/{post_id}")
        assert resp.status_code == 200

    async def test_update_post(self, admin_client: AsyncClient):
        """测试更新文章"""
        create = await admin_client.post("/api/v1/blog/posts", json={
            "title": "原始", "slug": "update-test", "content": "内容"
        })
        assert create.status_code == 200
        post_id = create.json()["data"]["id"]
        resp = await admin_client.put(f"/api/v1/blog/posts/{post_id}", json={
            "title": "已更新标题"
        })
        assert resp.status_code == 200

    async def test_delete_post(self, admin_client: AsyncClient):
        """测试删除文章"""
        create = await admin_client.post("/api/v1/blog/posts", json={
            "title": "待删除", "slug": "delete-test", "content": "内容"
        })
        assert create.status_code == 200
        post_id = create.json()["data"]["id"]
        resp = await admin_client.delete(f"/api/v1/blog/posts/{post_id}")
        assert resp.status_code == 200

    async def test_get_my_posts(self, admin_client: AsyncClient):
        """测试获取我的文章"""
        resp = await admin_client.get("/api/v1/blog/posts/my")
        assert resp.status_code == 200


@pytest.mark.asyncio
class TestBlogTagAPI:
    """博客标签 API 测试"""

    async def test_get_tags(self, admin_client: AsyncClient):
        """测试获取标签列表"""
        resp = await admin_client.get("/api/v1/blog/tags")
        assert resp.status_code == 200

    async def test_create_tag(self, admin_client: AsyncClient):
        """测试创建标签"""
        resp = await admin_client.post("/api/v1/blog/tags", json={
            "name": "API标签", "slug": "api-tag"
        })
        assert resp.status_code == 200


class TestBlogManifest:
    """测试博客模块清单"""
    def test_manifest_load(self):
        from modules.blog.blog_manifest import manifest
        assert manifest.id == "blog"
        assert manifest.enabled is True
