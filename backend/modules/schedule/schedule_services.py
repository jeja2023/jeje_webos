# -*- coding: utf-8 -*-
"""
日程管理模块 - 业务逻辑服务
"""

import logging
from typing import List, Optional, Tuple
from datetime import datetime, date, time, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete, func, and_, or_
from calendar import monthrange

from .schedule_models import ScheduleEvent, ScheduleReminder, ScheduleCategory
from .schedule_schemas import EventCreate, EventUpdate, CategoryCreate, CategoryUpdate

logger = logging.getLogger(__name__)


class ScheduleService:
    """日程服务"""
    
    # ========== 日程 CRUD ==========
    
    @staticmethod
    async def create_event(db: AsyncSession, user_id: int, data: EventCreate) -> ScheduleEvent:
        """创建日程"""
        event = ScheduleEvent(
            user_id=user_id,
            title=data.title,
            description=data.description,
            start_date=data.start_date,
            start_time=data.start_time,
            end_date=data.end_date or data.start_date,
            end_time=data.end_time,
            is_all_day=data.is_all_day,
            event_type=data.event_type,
            color=data.color,
            location=data.location,
            repeat_type=data.repeat_type,
            repeat_end_date=data.repeat_end_date
        )
        db.add(event)
        await db.flush()
        
        # 创建提醒
        if data.remind_before_minutes is not None and data.remind_before_minutes >= 0:
            remind_time = ScheduleService._calculate_remind_time(
                data.start_date, 
                data.start_time, 
                data.remind_before_minutes
            )
            if remind_time:
                reminder = ScheduleReminder(
                    event_id=event.id,
                    remind_before_minutes=data.remind_before_minutes,
                    remind_time=remind_time
                )
                db.add(reminder)
        
        await db.commit()
        await db.refresh(event)
        logger.info(f"用户 {user_id} 创建日程: {event.title}")
        return event
    
    @staticmethod
    def _calculate_remind_time(start_date: date, start_time: Optional[time], minutes_before: int) -> Optional[datetime]:
        """计算提醒时间"""
        if start_time:
            event_datetime = datetime.combine(start_date, start_time)
        else:
            event_datetime = datetime.combine(start_date, time(9, 0))  # 默认早上9点
        
        remind_datetime = event_datetime - timedelta(minutes=minutes_before)
        return remind_datetime
    
    @staticmethod
    async def get_event_by_id(db: AsyncSession, event_id: int, user_id: int = None) -> Optional[ScheduleEvent]:
        """根据ID获取日程"""
        stmt = select(ScheduleEvent).where(
            and_(
                ScheduleEvent.id == event_id,
                ScheduleEvent.is_deleted == False
            )
        )
        if user_id:
            stmt = stmt.where(ScheduleEvent.user_id == user_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_events_by_date_range(
        db: AsyncSession,
        user_id: int,
        start_date: date,
        end_date: date
    ) -> List[ScheduleEvent]:
        """获取日期范围内的日程"""
        stmt = select(ScheduleEvent).where(
            and_(
                ScheduleEvent.user_id == user_id,
                ScheduleEvent.is_deleted == False,
                or_(
                    # 开始日期在范围内
                    and_(ScheduleEvent.start_date >= start_date, ScheduleEvent.start_date <= end_date),
                    # 结束日期在范围内
                    and_(ScheduleEvent.end_date >= start_date, ScheduleEvent.end_date <= end_date),
                    # 跨越整个范围
                    and_(ScheduleEvent.start_date <= start_date, ScheduleEvent.end_date >= end_date)
                )
            )
        ).order_by(ScheduleEvent.start_date, ScheduleEvent.start_time)
        
        result = await db.execute(stmt)
        return list(result.scalars().all())
    
    @staticmethod
    async def get_events_by_month(db: AsyncSession, user_id: int, year: int, month: int) -> List[ScheduleEvent]:
        """获取某月的所有日程"""
        first_day = date(year, month, 1)
        last_day = date(year, month, monthrange(year, month)[1])
        return await ScheduleService.get_events_by_date_range(db, user_id, first_day, last_day)
    
    @staticmethod
    async def get_today_events(db: AsyncSession, user_id: int) -> List[ScheduleEvent]:
        """获取今日日程"""
        today = date.today()
        return await ScheduleService.get_events_by_date_range(db, user_id, today, today)
    
    @staticmethod
    async def get_upcoming_events(db: AsyncSession, user_id: int, days: int = 7) -> List[ScheduleEvent]:
        """获取未来几天的日程"""
        today = date.today()
        end_date = today + timedelta(days=days)
        return await ScheduleService.get_events_by_date_range(db, user_id, today, end_date)
    
    @staticmethod
    async def update_event(db: AsyncSession, event_id: int, user_id: int, data: EventUpdate) -> Optional[ScheduleEvent]:
        """更新日程"""
        event = await ScheduleService.get_event_by_id(db, event_id, user_id)
        if not event:
            return None
        
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(event, key, value)
        
        await db.commit()
        await db.refresh(event)
        return event
    
    @staticmethod
    async def delete_event(db: AsyncSession, event_id: int, user_id: int) -> bool:
        """删除日程（软删除）"""
        event = await ScheduleService.get_event_by_id(db, event_id, user_id)
        if not event:
            return False
        
        event.is_deleted = True
        await db.commit()
        logger.info(f"日程已删除: {event_id}")
        return True
    
    @staticmethod
    async def complete_event(db: AsyncSession, event_id: int, user_id: int) -> Optional[ScheduleEvent]:
        """完成日程"""
        event = await ScheduleService.get_event_by_id(db, event_id, user_id)
        if not event:
            return None
        
        event.is_completed = True
        await db.commit()
        await db.refresh(event)
        return event
    
    # ========== 统计 ==========
    
    @staticmethod
    async def get_stats(db: AsyncSession, user_id: int) -> dict:
        """获取日程统计"""
        today = date.today()
        
        # 总数
        total_stmt = select(func.count(ScheduleEvent.id)).where(
            and_(ScheduleEvent.user_id == user_id, ScheduleEvent.is_deleted == False)
        )
        total_result = await db.execute(total_stmt)
        total = total_result.scalar() or 0
        
        # 今日
        today_events = await ScheduleService.get_today_events(db, user_id)
        today_count = len(today_events)
        
        # 未来7天
        upcoming_events = await ScheduleService.get_upcoming_events(db, user_id, 7)
        upcoming_count = len(upcoming_events)
        
        # 已完成
        completed_stmt = select(func.count(ScheduleEvent.id)).where(
            and_(
                ScheduleEvent.user_id == user_id,
                ScheduleEvent.is_deleted == False,
                ScheduleEvent.is_completed == True
            )
        )
        completed_result = await db.execute(completed_stmt)
        completed_count = completed_result.scalar() or 0
        
        # 逾期（未完成且结束日期已过）
        overdue_stmt = select(func.count(ScheduleEvent.id)).where(
            and_(
                ScheduleEvent.user_id == user_id,
                ScheduleEvent.is_deleted == False,
                ScheduleEvent.is_completed == False,
                ScheduleEvent.end_date < today
            )
        )
        overdue_result = await db.execute(overdue_stmt)
        overdue_count = overdue_result.scalar() or 0
        
        return {
            "total_events": total,
            "today_events": today_count,
            "upcoming_events": upcoming_count,
            "completed_events": completed_count,
            "overdue_events": overdue_count
        }


class CategoryService:
    """分类服务"""
    
    @staticmethod
    async def create_category(db: AsyncSession, user_id: int, data: CategoryCreate) -> ScheduleCategory:
        """创建分类"""
        category = ScheduleCategory(
            user_id=user_id,
            name=data.name,
            color=data.color,
            icon=data.icon
        )
        db.add(category)
        await db.commit()
        await db.refresh(category)
        return category
    
    @staticmethod
    async def get_user_categories(db: AsyncSession, user_id: int) -> List[ScheduleCategory]:
        """获取用户的所有分类"""
        stmt = select(ScheduleCategory).where(
            ScheduleCategory.user_id == user_id
        ).order_by(ScheduleCategory.sort_order)
        result = await db.execute(stmt)
        return list(result.scalars().all())
    
    @staticmethod
    async def update_category(db: AsyncSession, category_id: int, user_id: int, data: CategoryUpdate) -> Optional[ScheduleCategory]:
        """更新分类"""
        stmt = select(ScheduleCategory).where(
            and_(
                ScheduleCategory.id == category_id,
                ScheduleCategory.user_id == user_id
            )
        )
        result = await db.execute(stmt)
        category = result.scalar_one_or_none()
        
        if not category:
            return None
        
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(category, key, value)
        
        await db.commit()
        await db.refresh(category)
        return category
    
    @staticmethod
    async def delete_category(db: AsyncSession, category_id: int, user_id: int) -> bool:
        """删除分类"""
        stmt = delete(ScheduleCategory).where(
            and_(
                ScheduleCategory.id == category_id,
                ScheduleCategory.user_id == user_id
            )
        )
        result = await db.execute(stmt)
        await db.commit()
        return result.rowcount > 0


class ReminderService:
    """提醒服务"""
    
    @staticmethod
    async def get_pending_reminders(db: AsyncSession) -> List[ScheduleReminder]:
        """获取待发送的提醒"""
        now = datetime.now()
        stmt = select(ScheduleReminder).where(
            and_(
                ScheduleReminder.is_sent == False,
                ScheduleReminder.remind_time <= now
            )
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())
    
    @staticmethod
    async def mark_reminder_sent(db: AsyncSession, reminder_id: int) -> bool:
        """标记提醒已发送"""
        stmt = update(ScheduleReminder).where(
            ScheduleReminder.id == reminder_id
        ).values(is_sent=True, sent_at=datetime.now())
        result = await db.execute(stmt)
        await db.commit()
        return result.rowcount > 0
    
    @staticmethod
    async def get_user_reminders(db: AsyncSession, user_id: int, include_sent: bool = False) -> List[dict]:
        """获取用户的提醒列表"""
        stmt = select(ScheduleReminder, ScheduleEvent).join(
            ScheduleEvent, ScheduleReminder.event_id == ScheduleEvent.id
        ).where(
            and_(
                ScheduleEvent.user_id == user_id,
                ScheduleEvent.is_deleted == False
            )
        )
        
        if not include_sent:
            stmt = stmt.where(ScheduleReminder.is_sent == False)
        
        stmt = stmt.order_by(ScheduleReminder.remind_time)
        result = await db.execute(stmt)
        
        reminders = []
        for reminder, event in result.fetchall():
            reminders.append({
                "reminder": reminder,
                "event": event
            })
        
        return reminders
