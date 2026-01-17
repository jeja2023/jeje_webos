"""
博客数据模型
表名遵循隔离协议：blog_前缀
"""

from datetime import datetime
from typing import Optional
from sqlalchemy import String, Integer, Boolean, DateTime, Text, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from core.database import Base
from utils.timezone import get_beijing_time


class BlogCategory(Base):
    """博客分类"""
    __tablename__ = "blog_categories"
    __table_args__ = {"extend_existing": True, "comment": "博客分类表"}
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    name: Mapped[str] = mapped_column(String(50), unique=True, comment="分类名称")
    slug: Mapped[str] = mapped_column(String(50), unique=True, index=True, comment="别名/路径")
    description: Mapped[Optional[str]] = mapped_column(String(200), nullable=True, comment="描述")
    order: Mapped[int] = mapped_column(Integer, default=0, comment="排序权重")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")


class BlogPost(Base):
    """博客文章"""
    __tablename__ = "blog_posts"
    __table_args__ = {"extend_existing": True, "comment": "博客文章表"}
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    title: Mapped[str] = mapped_column(String(200), comment="文章标题")
    slug: Mapped[str] = mapped_column(String(200), unique=True, index=True, comment="文章别名/路径")
    summary: Mapped[Optional[str]] = mapped_column(String(500), nullable=True, comment="摘要")
    content: Mapped[str] = mapped_column(Text, comment="文章内容")
    cover: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, comment="封面图")
    
    # 分类
    category_id: Mapped[Optional[int]] = mapped_column(
        Integer, 
        ForeignKey("blog_categories.id", ondelete="SET NULL"),
        nullable=True,
        comment="分类ID"
    )
    
    # 作者
    author_id: Mapped[int] = mapped_column(Integer, index=True, comment="作者用户ID")
    
    # 状态
    status: Mapped[str] = mapped_column(String(20), default="draft", comment="状态：draft草稿, published已发布, archived已归档")
    is_top: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否置顶")
    
    # 统计
    views: Mapped[int] = mapped_column(Integer, default=0, comment="阅读量")
    likes: Mapped[int] = mapped_column(Integer, default=0, comment="点赞量")
    
    # 时间
    published_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, comment="发布时间")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")

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
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    name: Mapped[str] = mapped_column(String(30), unique=True, comment="标签名称")
    slug: Mapped[str] = mapped_column(String(30), unique=True, index=True, comment="标签别名")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")


class BlogPostTag(Base):
    """文章标签关联"""
    __tablename__ = "blog_post_tags"
    __table_args__ = {"extend_existing": True, "comment": "文章与标签关联表"}
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="主键ID")
    post_id: Mapped[int] = mapped_column(Integer, ForeignKey("blog_posts.id", ondelete="CASCADE"), comment="文章ID")
    tag_id: Mapped[int] = mapped_column(Integer, ForeignKey("blog_tags.id", ondelete="CASCADE"), comment="标签ID")

