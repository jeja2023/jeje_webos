"""
公告系统路由
处理系统公告的创建、查询、更新、删除等
"""

from typing import Optional, List, Tuple
from utils.timezone import get_beijing_time, to_beijing_naive
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, and_, or_
from sqlalchemy.orm import selectinload

from core.database import get_db
from core.security import get_current_user, require_admin, TokenData
from models.announcement import Announcement
from schemas.announcement import (
    AnnouncementCreate, AnnouncementUpdate, AnnouncementInfo, AnnouncementListItem, BatchOperationRequest
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
    include_expired: bool = Query(True, description="是否包含已过期公告"),
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user)
):
    """获取公告列表"""
    query = select(Announcement).options(selectinload(Announcement.author))
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
        now = get_beijing_time().replace(tzinfo=None)
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
    
    items = [_enrich_announcement(a, AnnouncementListItem) for a in announcements]
    return paginate(items, total, page, size)


def _generate_summary(content: str, max_length: int = 100) -> str:
    """生成内容摘要，去除 Markdown 格式"""
    import re
    # 去除 Markdown 标记
    text = re.sub(r'[#*`~>\[\]\(\)\-_|]', '', content)
    text = re.sub(r'\n+', ' ', text)
    text = text.strip()
    if len(text) > max_length:
        return text[:max_length] + '...'
    return text


def _enrich_announcement(a: Announcement, schema):
    """填充公告的作者名称和摘要等关联数据"""
    data = schema.model_validate(a).model_dump()
    if a.author:
        data["author_name"] = a.author.nickname or a.author.username
    else:
        # 如果是作者 ID 为 0 或 1(通常是系统管理员)，或者作者被删除了
        data["author_name"] = "管理员"
    # 为列表项生成摘要
    if schema == AnnouncementListItem and a.content:
        data["summary"] = _generate_summary(a.content)
    return data


@router.get("/published")
async def list_published_announcements(
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db)
):
    """获取已发布的公告（公开接口，无需登录）"""
    now = get_beijing_time().replace(tzinfo=None)
    query = select(Announcement).options(selectinload(Announcement.author)).where(
        and_(
            Announcement.is_published == True,
            or_(Announcement.start_at.is_(None), Announcement.start_at <= now),
            or_(Announcement.end_at.is_(None), Announcement.end_at >= now)
        )
    ).order_by(desc(Announcement.is_top), desc(Announcement.created_at)).limit(limit)
    
    result = await db.execute(query)
    announcements = result.scalars().all()
    items = [_enrich_announcement(a, AnnouncementInfo) for a in announcements]
    return success(items)


@router.get("/{announcement_id}")
async def get_announcement(
    announcement_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(get_current_user)
):
    """获取公告详情"""
    result = await db.execute(
        select(Announcement).options(selectinload(Announcement.author)).where(Announcement.id == announcement_id)
    )
    announcement = result.scalar_one_or_none()
    if not announcement:
        raise HTTPException(status_code=404, detail="公告不存在")
    return success(_enrich_announcement(announcement, AnnouncementInfo))


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
        start_at=to_beijing_naive(data.start_at),
        end_at=to_beijing_naive(data.end_at)
    )
    db.add(announcement)
    await db.commit()
    await db.refresh(announcement)
    return success(_enrich_announcement(announcement, AnnouncementInfo))


@router.put("/{announcement_id}")
async def update_announcement(
    announcement_id: int,
    data: AnnouncementUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_admin())
):
    """更新公告（仅系统管理员）"""
    result = await db.execute(
        select(Announcement).options(selectinload(Announcement.author)).where(Announcement.id == announcement_id)
    )
    announcement = result.scalar_one_or_none()
    if not announcement:
        raise HTTPException(status_code=404, detail="公告不存在")
    
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if key in ["start_at", "end_at"] and value is not None:
            value = to_beijing_naive(value)
        setattr(announcement, key, value)
    
    await db.commit()
    await db.refresh(announcement)
    return success(_enrich_announcement(announcement, AnnouncementInfo))


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
    await db.flush()
    await db.commit()
    return success(None)


@router.post("/{announcement_id}/view")
async def view_announcement(
    announcement_id: int,
    db: AsyncSession = Depends(get_db)
):
    """增加公告浏览次数（公开接口，使用原子操作避免并发问题）"""
    from sqlalchemy import update
    stmt = update(Announcement).where(
        Announcement.id == announcement_id
    ).values(views=Announcement.views + 1)
    await db.execute(stmt)
    await db.commit()
    return success(None)


@router.post("/batch")
async def batch_operation(
    data: BatchOperationRequest,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_admin())
):
    """批量操作公告（仅系统管理员）"""
    from sqlalchemy import update, delete
    
    if data.action == "delete":
        # 批量删除
        stmt = delete(Announcement).where(Announcement.id.in_(data.ids))
        result = await db.execute(stmt)
        await db.commit()
        return success({"affected": result.rowcount})
    
    elif data.action == "publish":
        # 批量发布
        stmt = update(Announcement).where(
            Announcement.id.in_(data.ids)
        ).values(is_published=True)
        result = await db.execute(stmt)
        await db.commit()
        return success({"affected": result.rowcount})
    
    elif data.action == "unpublish":
        # 批量取消发布
        stmt = update(Announcement).where(
            Announcement.id.in_(data.ids)
        ).values(is_published=False)
        result = await db.execute(stmt)
        await db.commit()
        return success({"affected": result.rowcount})
    
    else:
        raise HTTPException(status_code=400, detail="不支持的操作类型")







