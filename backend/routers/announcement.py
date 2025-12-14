"""
公告系统路由
处理系统公告的创建、查询、更新、删除等
"""

from typing import Optional, List, Tuple
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, and_, or_

from core.database import get_db
from core.security import get_current_user, require_admin, TokenData
from models.announcement import Announcement
from schemas.announcement import (
    AnnouncementCreate, AnnouncementUpdate, AnnouncementInfo, AnnouncementListItem
)
from schemas.response import success, paginate

router = APIRouter(prefix="/api/v1/announcements", tags=["公告系统"])


@router.get("")
async def list_announcements(
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
    is_published: Optional[bool] = None,
    type: Optional[str] = None,
    keyword: Optional[str] = None,
    include_expired: bool = Query(False, description="是否包含已过期公告"),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user)
):
    """获取公告列表"""
    query = select(Announcement)
    conditions = []
    
    # 筛选条件
    if is_published is not None:
        conditions.append(Announcement.is_published == is_published)
    
    if type:
        conditions.append(Announcement.type == type)
    
    if keyword:
        conditions.append(
            or_(
                Announcement.title.contains(keyword),
                Announcement.content.contains(keyword)
            )
        )
    
    # 有效期筛选
    if not include_expired:
        now = datetime.now(timezone.utc)
        conditions.append(
            or_(
                Announcement.start_at.is_(None),
                Announcement.start_at <= now
            )
        )
        conditions.append(
            or_(
                Announcement.end_at.is_(None),
                Announcement.end_at >= now
            )
        )
    
    if conditions:
        query = query.where(and_(*conditions))
    
    # 排序：置顶优先，然后按创建时间倒序
    query = query.order_by(desc(Announcement.is_top), desc(Announcement.created_at))
    
    # 总数
    count_query = select(func.count()).select_from(Announcement)
    if conditions:
        count_query = count_query.where(and_(*conditions))
    total_result = await db.execute(count_query)
    total = total_result.scalar() or 0
    
    # 分页
    query = query.offset((page - 1) * size).limit(size)
    
    result = await db.execute(query)
    announcements = result.scalars().all()
    
    items = [AnnouncementListItem.model_validate(a).model_dump() for a in announcements]
    return paginate(items, total, page, size)


@router.get("/published")
async def list_published_announcements(
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db)
):
    """获取已发布的公告（公开接口，无需登录）"""
    now = datetime.now(timezone.utc)
    query = select(Announcement).where(
        and_(
            Announcement.is_published == True,
            or_(Announcement.start_at.is_(None), Announcement.start_at <= now),
            or_(Announcement.end_at.is_(None), Announcement.end_at >= now)
        )
    ).order_by(desc(Announcement.is_top), desc(Announcement.created_at)).limit(limit)
    
    result = await db.execute(query)
    announcements = result.scalars().all()
    items = [AnnouncementInfo.model_validate(a).model_dump() for a in announcements]
    return success(items)


@router.get("/{announcement_id}")
async def get_announcement(
    announcement_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user)
):
    """获取公告详情"""
    result = await db.execute(
        select(Announcement).where(Announcement.id == announcement_id)
    )
    announcement = result.scalar_one_or_none()
    if not announcement:
        raise HTTPException(status_code=404, detail="公告不存在")
    return success(AnnouncementInfo.model_validate(announcement).model_dump())


@router.post("")
async def create_announcement(
    data: AnnouncementCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_admin())
):
    """创建公告（仅系统管理员）"""
    announcement = Announcement(
        title=data.title,
        content=data.content,
        type=data.type,
        author_id=current_user.user_id,
        is_published=data.is_published,
        is_top=data.is_top,
        start_at=data.start_at,
        end_at=data.end_at
    )
    db.add(announcement)
    await db.commit()
    await db.refresh(announcement)
    return success(AnnouncementInfo.model_validate(announcement).model_dump())


@router.put("/{announcement_id}")
async def update_announcement(
    announcement_id: int,
    data: AnnouncementUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_admin())
):
    """更新公告（仅系统管理员）"""
    result = await db.execute(
        select(Announcement).where(Announcement.id == announcement_id)
    )
    announcement = result.scalar_one_or_none()
    if not announcement:
        raise HTTPException(status_code=404, detail="公告不存在")
    
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(announcement, key, value)
    
    await db.commit()
    await db.refresh(announcement)
    return success(AnnouncementInfo.model_validate(announcement).model_dump())


@router.delete("/{announcement_id}")
async def delete_announcement(
    announcement_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_admin())
):
    """删除公告（仅系统管理员）"""
    result = await db.execute(
        select(Announcement).where(Announcement.id == announcement_id)
    )
    announcement = result.scalar_one_or_none()
    if not announcement:
        raise HTTPException(status_code=404, detail="公告不存在")
    
    await db.delete(announcement)
    await db.commit()
    return success(None)


@router.post("/{announcement_id}/view")
async def view_announcement(
    announcement_id: int,
    db: AsyncSession = Depends(get_db)
):
    """增加公告浏览次数（公开接口）"""
    result = await db.execute(
        select(Announcement).where(Announcement.id == announcement_id)
    )
    announcement = result.scalar_one_or_none()
    if not announcement:
        return success(None)
    
    announcement.views += 1
    await db.commit()
    return success(None)











