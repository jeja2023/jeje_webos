# -*- coding: utf-8 -*-
"""
博客模块测试
测试博客文章、分类、标签等功能
"""

import pytest
import sys
import os

# 添加项目根目录到路径
backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
sys.path.insert(0, backend_dir)
# 确保可以导入 conftest
tests_dir = os.path.dirname(os.path.dirname(backend_dir))
sys.path.insert(0, os.path.join(tests_dir, "tests"))

from modules.blog.blog_models import BlogPost, BlogCategory, BlogTag
from modules.blog.blog_schemas import PostCreate, CategoryCreate


class TestBlogModels:
    """测试博客数据模型"""
    
    def test_blog_category_model(self):
        """测试博客分类模型"""
        assert BlogCategory.__tablename__ == "blog_categories"
    
    def test_blog_post_model(self):
        """测试博客文章模型"""
        assert BlogPost.__tablename__ == "blog_posts"
    
    def test_blog_tag_model(self):
        """测试博客标签模型"""
        assert BlogTag.__tablename__ == "blog_tags"


class TestBlogSchemas:
    """测试博客数据验证模型"""
    
    def test_post_create_schema(self):
        """测试创建文章模型"""
        data = PostCreate(
            title="测试文章",
            slug="test-post",
            content="这是文章内容",
            summary="文章摘要"
        )
        assert data.title == "测试文章"
        assert data.slug == "test-post"
        assert data.content == "这是文章内容"
    
    def test_category_create_schema(self):
        """测试创建分类模型"""
        data = CategoryCreate(
            name="技术",
            slug="tech",
            description="技术类文章"
        )
        assert data.name == "技术"
        assert data.slug == "tech"


class TestBlogService:
    """测试博客服务层"""
    
    @pytest.mark.asyncio
    async def test_create_category(self, db_session):
        """测试创建分类"""
        from modules.blog.blog_services import BlogService
        service = BlogService(db_session)
        data = CategoryCreate(
            name="测试分类",
            slug="test-category",
            description="测试描述"
        )
        category = await service.create_category(data)
        assert category.id is not None
        assert category.name == "测试分类"
    
    @pytest.mark.asyncio
    async def test_get_categories(self, db_session):
        """测试获取分类列表"""
        from modules.blog.blog_services import BlogService
        service = BlogService(db_session)
        categories = await service.get_categories()
        assert isinstance(categories, list)
    
    @pytest.mark.asyncio
    async def test_create_post(self, db_session):
        """测试创建文章"""
        from modules.blog.blog_services import BlogService
        service = BlogService(db_session)
        data = PostCreate(
            title="测试文章",
            slug="test-post",
            content="文章内容",
            author_id=1
        )
        post = await service.create_post(data, author_id=1)
        assert post.id is not None
        assert post.title == "测试文章"
        assert post.status == "draft"
    
    @pytest.mark.asyncio
    async def test_create_post_with_tags(self, db_session):
        """测试创建文章（带标签，测试批量标签操作优化）"""
        from modules.blog.blog_services import BlogService
        service = BlogService(db_session)
        
        # 先创建标签
        tag1 = await service.get_or_create_tag("Python", "python")
        tag2 = await service.get_or_create_tag("Django", "django")
        
        # 创建带标签的文章
        data = PostCreate(
            title="测试文章",
            slug="test-post",
            content="文章内容",
            tags=[tag1.id, tag2.id]
        )
        post = await service.create_post(data, author_id=1)
        assert post.id is not None
        
        # 验证标签关联
        tags = await service.get_post_tags(post.id)
        assert len(tags) == 2
        tag_ids = [tag.id for tag in tags]
        assert tag1.id in tag_ids
        assert tag2.id in tag_ids
    
    @pytest.mark.asyncio
    async def test_update_post(self, db_session):
        """测试更新文章（测试直接更新优化）"""
        from modules.blog.blog_services import BlogService
        from modules.blog.blog_schemas import PostUpdate
        service = BlogService(db_session)
        
        # 创建文章
        data = PostCreate(title="原始标题", slug="original-post", content="原始内容", author_id=1)
        post = await service.create_post(data, author_id=1)
        
        # 更新文章
        update_data = PostUpdate(title="更新标题", content="更新内容")
        updated = await service.update_post(post.id, update_data)
        assert updated.title == "更新标题"
        assert updated.content == "更新内容"
    
    @pytest.mark.asyncio
    async def test_increment_views(self, db_session):
        """测试增加浏览量（测试直接更新优化）"""
        from modules.blog.blog_services import BlogService
        service = BlogService(db_session)
        
        # 创建文章
        data = PostCreate(title="测试", slug="test", content="内容", author_id=1)
        post = await service.create_post(data, author_id=1)
        initial_views = post.views
        
        # 增加浏览量
        await service.increment_views(post.id)
        
        # 验证浏览量增加
        updated_post = await service.get_post(post.id)
        assert updated_post.views == initial_views + 1
    
    @pytest.mark.asyncio
    async def test_delete_category(self, db_session):
        """测试删除分类（测试直接删除优化）"""
        from modules.blog.blog_services import BlogService
        service = BlogService(db_session)
        
        # 创建分类
        data = CategoryCreate(name="测试分类", slug="test")
        category = await service.create_category(data)
        
        # 删除分类
        result = await service.delete_category(category.id)
        assert result is True
        
        # 验证已删除
        deleted = await service.get_category(category.id)
        assert deleted is None
    
    @pytest.mark.asyncio
    async def test_delete_post(self, db_session):
        """测试删除文章（测试直接删除优化）"""
        from modules.blog.blog_services import BlogService
        service = BlogService(db_session)
        
        # 创建文章
        data = PostCreate(title="待删除", slug="to-delete", content="内容", author_id=1)
        post = await service.create_post(data, author_id=1)
        
        # 删除文章
        result = await service.delete_post(post.id)
        assert result is True
        
        # 验证已删除
        deleted = await service.get_post(post.id)
        assert deleted is None


class TestBlogManifest:
    """测试博客模块清单"""
    
    def test_manifest_load(self):
        """测试清单加载"""
        from modules.blog.blog_manifest import manifest
        assert manifest.id == "blog"
        assert manifest.enabled is True

