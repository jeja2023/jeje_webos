# -*- coding: utf-8 -*-
"""
日程管理模块 - API 路由
"""

import logging
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional
from datetime import date

from core.database import get_db
from core.security import get_current_user, TokenData
from schemas.response import success, error

from .schedule_schemas import (
    EventCreate, EventUpdate, EventResponse,
    CategoryCreate, CategoryUpdate, CategoryResponse,
    ReminderResponse, ScheduleStats, MonthEventsResponse
)
from .schedule_services import ScheduleService, CategoryService, ReminderService

logger = logging.getLogger(__name__)
router = APIRouter()


# ========== 日程相关接口 ==========

@router.post("/events")
async def create_event(
    data: EventCreate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """创建日程"""
    try:
        event = await ScheduleService.create_event(db, user.user_id, data)
        return success(data=EventResponse.model_validate(event).model_dump(mode='json'), message="日程创建成功")
    except Exception as e:
        logger.error(f"创建日程失败: {e}")
        return error(message=f"创建失败: {str(e)}")


@router.get("/events")
async def get_events(
    start_date: date = Query(..., description="开始日期"),
    end_date: date = Query(..., description="结束日期"),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取日期范围内的日程"""
    events = await ScheduleService.get_events_by_date_range(db, user.user_id, start_date, end_date)
    return success(data=[EventResponse.model_validate(e).model_dump(mode='json') for e in events])


@router.get("/events/month")
async def get_month_events(
    year: int = Query(..., ge=2000, le=2100),
    month: int = Query(..., ge=1, le=12),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取某月的所有日程"""
    events = await ScheduleService.get_events_by_month(db, user.user_id, year, month)
    
    # 获取有日程的日期列表
    event_dates = set()
    for event in events:
        current = event.start_date
        end = event.end_date or event.start_date
        while current <= end:
            event_dates.add(current.isoformat())
            from datetime import timedelta
            current = current + timedelta(days=1)
    
    return success(data={
        "year": year,
        "month": month,
        "events": [EventResponse.model_validate(e).model_dump(mode='json') for e in events],
        "event_dates": sorted(list(event_dates))
    })


@router.get("/events/today")
async def get_today_events(
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取今日日程"""
    events = await ScheduleService.get_today_events(db, user.user_id)
    return success(data=[EventResponse.model_validate(e).model_dump(mode='json') for e in events])


@router.get("/events/upcoming")
async def get_upcoming_events(
    days: int = Query(7, ge=1, le=30, description="未来天数"),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取未来日程"""
    events = await ScheduleService.get_upcoming_events(db, user.user_id, days)
    return success(data=[EventResponse.model_validate(e).model_dump(mode='json') for e in events])


@router.get("/events/{event_id}")
async def get_event_detail(
    event_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取日程详情"""
    event = await ScheduleService.get_event_by_id(db, event_id, user.user_id)
    if not event:
        return error(code=404, message="日程不存在")
    return success(data=EventResponse.model_validate(event).model_dump(mode='json'))


@router.put("/events/{event_id}")
async def update_event(
    event_id: int,
    data: EventUpdate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """更新日程"""
    event = await ScheduleService.update_event(db, event_id, user.user_id, data)
    if not event:
        return error(code=404, message="日程不存在")
    return success(data=EventResponse.model_validate(event).model_dump(mode='json'), message="更新成功")


@router.delete("/events/{event_id}")
async def delete_event(
    event_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """删除日程"""
    result = await ScheduleService.delete_event(db, event_id, user.user_id)
    if not result:
        return error(code=404, message="日程不存在")
    return success(message="日程已删除")


@router.post("/events/{event_id}/complete")
async def complete_event(
    event_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """完成日程"""
    event = await ScheduleService.complete_event(db, event_id, user.user_id)
    if not event:
        return error(code=404, message="日程不存在")
    return success(data=EventResponse.model_validate(event).model_dump(mode='json'), message="日程已完成")


# ========== 统计接口 ==========

@router.get("/stats")
async def get_stats(
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取日程统计"""
    stats = await ScheduleService.get_stats(db, user.user_id)
    return success(data=stats)


# ========== 分类相关接口 ==========

@router.get("/categories")
async def get_categories(
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取用户分类列表"""
    categories = await CategoryService.get_user_categories(db, user.user_id)
    return success(data=[CategoryResponse.model_validate(c).model_dump() for c in categories])


@router.post("/categories")
async def create_category(
    data: CategoryCreate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """创建分类"""
    category = await CategoryService.create_category(db, user.user_id, data)
    return success(data=CategoryResponse.model_validate(category).model_dump(), message="分类创建成功")


@router.put("/categories/{category_id}")
async def update_category(
    category_id: int,
    data: CategoryUpdate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """更新分类"""
    category = await CategoryService.update_category(db, category_id, user.user_id, data)
    if not category:
        return error(code=404, message="分类不存在")
    return success(data=CategoryResponse.model_validate(category).model_dump(), message="更新成功")


@router.delete("/categories/{category_id}")
async def delete_category(
    category_id: int,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """删除分类"""
    result = await CategoryService.delete_category(db, category_id, user.user_id)
    if not result:
        return error(code=404, message="分类不存在")
    return success(message="分类已删除")


# ========== 提醒相关接口 ==========

@router.get("/reminders")
async def get_reminders(
    include_sent: bool = Query(False, description="是否包含已发送的提醒"),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(get_current_user)
):
    """获取用户提醒列表"""
    reminders = await ReminderService.get_user_reminders(db, user.user_id, include_sent)
    
    result = []
    for item in reminders:
        result.append({
            "reminder": ReminderResponse.model_validate(item["reminder"]).model_dump(),
            "event": EventResponse.model_validate(item["event"]).model_dump(mode='json')
        })
    
    return success(data=result)
