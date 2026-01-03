# -*- coding: utf-8 -*-
"""
日程管理模块 - 数据验证模型
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, date, time
from enum import Enum


class EventType(str, Enum):
    """日程类型"""
    MEETING = "meeting"
    TASK = "task"
    REMINDER = "reminder"
    BIRTHDAY = "birthday"
    HOLIDAY = "holiday"
    OTHER = "other"


class RepeatType(str, Enum):
    """重复类型"""
    NONE = "none"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    YEARLY = "yearly"


# ========== 日程相关 Schema ==========

class EventCreate(BaseModel):
    """创建日程请求"""
    title: str = Field(..., min_length=1, max_length=200, description="日程标题")
    description: Optional[str] = Field(None, description="详细描述")
    start_date: date = Field(..., description="开始日期")
    start_time: Optional[time] = Field(None, description="开始时间")
    end_date: Optional[date] = Field(None, description="结束日期")
    end_time: Optional[time] = Field(None, description="结束时间")
    is_all_day: bool = Field(False, description="是否全天事件")
    event_type: str = Field("other", description="事件类型")
    color: Optional[str] = Field(None, description="自定义颜色")
    location: Optional[str] = Field(None, max_length=200, description="地点")
    repeat_type: str = Field("none", description="重复类型")
    repeat_end_date: Optional[date] = Field(None, description="重复结束日期")
    remind_before_minutes: Optional[int] = Field(None, ge=0, description="提前提醒分钟数")


class EventUpdate(BaseModel):
    """更新日程请求"""
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    start_date: Optional[date] = None
    start_time: Optional[time] = None
    end_date: Optional[date] = None
    end_time: Optional[time] = None
    is_all_day: Optional[bool] = None
    event_type: Optional[str] = None
    color: Optional[str] = None
    location: Optional[str] = None
    repeat_type: Optional[str] = None
    repeat_end_date: Optional[date] = None
    is_completed: Optional[bool] = None


class ReminderResponse(BaseModel):
    """提醒响应"""
    id: int
    event_id: int
    remind_before_minutes: int
    remind_time: datetime
    is_sent: bool
    
    class Config:
        from_attributes = True


class EventResponse(BaseModel):
    """日程响应"""
    id: int
    user_id: int
    title: str
    description: Optional[str] = None
    start_date: date
    start_time: Optional[time] = None
    end_date: Optional[date] = None
    end_time: Optional[time] = None
    is_all_day: bool
    event_type: str
    color: Optional[str] = None
    location: Optional[str] = None
    repeat_type: str
    repeat_end_date: Optional[date] = None
    is_completed: bool
    created_at: datetime
    updated_at: datetime
    reminders: List[ReminderResponse] = []
    
    class Config:
        from_attributes = True


# ========== 分类相关 Schema ==========

class CategoryCreate(BaseModel):
    """创建分类请求"""
    name: str = Field(..., min_length=1, max_length=50, description="分类名称")
    color: str = Field("#3b82f6", description="分类颜色")
    icon: Optional[str] = Field(None, description="分类图标")


class CategoryUpdate(BaseModel):
    """更新分类请求"""
    name: Optional[str] = Field(None, min_length=1, max_length=50)
    color: Optional[str] = None
    icon: Optional[str] = None
    sort_order: Optional[int] = None


class CategoryResponse(BaseModel):
    """分类响应"""
    id: int
    user_id: int
    name: str
    color: str
    icon: Optional[str] = None
    sort_order: int
    
    class Config:
        from_attributes = True


# ========== 统计相关 Schema ==========

class ScheduleStats(BaseModel):
    """日程统计"""
    total_events: int = 0
    today_events: int = 0
    upcoming_events: int = 0
    completed_events: int = 0
    overdue_events: int = 0


class MonthEventsResponse(BaseModel):
    """月度日程响应"""
    year: int
    month: int
    events: List[EventResponse] = []
    event_dates: List[str] = []  # 有日程的日期列表
