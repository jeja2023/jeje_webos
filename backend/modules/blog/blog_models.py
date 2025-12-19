"""
博客数据模型
表名遵循隔离协议：blog_前缀
"""

from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base


class BlogCategory(Base):
    """博客分类"""
    __tablename__ = "blog_categories"
    __table_args__ = {"extend_existing": True, "comment": "博客分类表"}
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(50), unique=True)
    slug: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    description: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    order: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class BlogPost(Base):
    """博客文章"""
    __tablename__ = "blog_posts"
    __table_args__ = {"extend_existing": True, "comment": "博客文章表"}
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(200))
    slug: Mapped[str] = mapped_column(String(200), unique=True, index=True)
    summary: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    content: Mapped[str] = mapped_column(Text)
    cover: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    
    # 分类
    category_id: Mapped[Optional[int]] = mapped_column(
        Integer, 
        ForeignKey("blog_categories.id", ondelete="SET NULL"),
        nullable=True
    )
    
    # 作者
    author_id: Mapped[int] = mapped_column(Integer, index=True)
    
    # 状态
    status: Mapped[str] = mapped_column(String(20), default="draft")  # 状态：draft草稿, published已发布, archived已归档
    is_top: Mapped[bool] = mapped_column(Boolean, default=False)
    
    # 统计
    views: Mapped[int] = mapped_column(Integer, default=0)
    likes: Mapped[int] = mapped_column(Integer, default=0)
    
    # 时间
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now, onupdate=datetime.now)

    # 关联关系
    category: Mapped[Optional["BlogCategory"]] = relationship("BlogCategory", lazy="selectin", viewonly=True)
    tags: Mapped[list["BlogTag"]] = relationship(
        "BlogTag",
        secondary="blog_post_tags",
        lazy="selectin",
        viewonly=True
    )


class BlogTag(Base):
    """博客标签"""
    __tablename__ = "blog_tags"
    __table_args__ = {"extend_existing": True, "comment": "博客标签表"}
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(30), unique=True)
    slug: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.now)


class BlogPostTag(Base):
    """文章标签关联"""
    __tablename__ = "blog_post_tags"
    __table_args__ = {"extend_existing": True, "comment": "文章与标签关联表"}
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    post_id: Mapped[int] = mapped_column(Integer, ForeignKey("blog_posts.id", ondelete="CASCADE"))
    tag_id: Mapped[int] = mapped_column(Integer, ForeignKey("blog_tags.id", ondelete="CASCADE"))

