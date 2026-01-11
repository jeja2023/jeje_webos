# -*- coding: utf-8 -*-
"""
日程管理模块 - 数据模型
"""

from datetime import datetime, date, time
from typing import Optional, List
from sqlalchemy import String, Text, Integer, DateTime, Date, Time, ForeignKey, Boolean, Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum

from core.database import Base
from models import User
from utils.timezone import get_beijing_time


class EventType(str, enum.Enum):
    """日程类型"""
    MEETING = "meeting"      # 会议
    TASK = "task"            # 任务
    REMINDER = "reminder"    # 提醒
    BIRTHDAY = "birthday"    # 生日
    HOLIDAY = "holiday"      # 节假日
    OTHER = "other"          # 其他


class RepeatType(str, enum.Enum):
    """重复类型"""
    NONE = "none"            # 不重复
    DAILY = "daily"          # 每天
    WEEKLY = "weekly"        # 每周
    MONTHLY = "monthly"      # 每月
    YEARLY = "yearly"        # 每年


class ScheduleEvent(Base):
    """日程事件表"""
    __tablename__ = "schedule_events"
    __table_args__ = {'extend_existing': True, 'comment': '日程事件表'}
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey(User.id), comment="用户ID")
    title: Mapped[str] = mapped_column(String(200), nullable=False, comment="日程标题")
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="详细描述")
    
    # 时间相关
    start_date: Mapped[date] = mapped_column(Date, nullable=False, comment="开始日期")
    start_time: Mapped[Optional[time]] = mapped_column(Time, nullable=True, comment="开始时间")
    end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True, comment="结束日期")
    end_time: Mapped[Optional[time]] = mapped_column(Time, nullable=True, comment="结束时间")
    is_all_day: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否全天事件")
    
    # 分类相关
    event_type: Mapped[str] = mapped_column(String(20), default=EventType.OTHER.value, comment="事件类型")
    color: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, comment="自定义颜色")
    location: Mapped[Optional[str]] = mapped_column(String(200), nullable=True, comment="地点")
    
    # 重复相关
    repeat_type: Mapped[str] = mapped_column(String(20), default=RepeatType.NONE.value, comment="重复类型")
    repeat_end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True, comment="重复结束日期")
    
    # 状态
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否已完成")
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否已删除")
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, onupdate=get_beijing_time, comment="更新时间")
    
    # 关联
    reminders: Mapped[List["ScheduleReminder"]] = relationship("ScheduleReminder", back_populates="event", cascade="all, delete-orphan")


class ScheduleReminder(Base):
    """日程提醒表"""
    __tablename__ = "schedule_reminders"
    __table_args__ = {'extend_existing': True, 'comment': '日程提醒表'}
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("schedule_events.id", ondelete="CASCADE"), comment="关联日程ID")
    remind_before_minutes: Mapped[int] = mapped_column(Integer, default=15, comment="提前提醒分钟数")
    remind_time: Mapped[datetime] = mapped_column(DateTime, nullable=False, comment="提醒时间")
    is_sent: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否已发送")
    sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True, comment="发送时间")
    
    # 关联
    event: Mapped["ScheduleEvent"] = relationship("ScheduleEvent", back_populates="reminders")


class ScheduleCategory(Base):
    """日程分类表（用户自定义）"""
    __tablename__ = "schedule_categories"
    __table_args__ = {'extend_existing': True, 'comment': '日程分类表'}
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(ForeignKey(User.id), comment="用户ID")
    name: Mapped[str] = mapped_column(String(50), nullable=False, comment="分类名称")
    color: Mapped[str] = mapped_column(String(20), default="#3b82f6", comment="分类颜色")
    icon: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, comment="分类图标")
    sort_order: Mapped[int] = mapped_column(Integer, default=0, comment="排序序号")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=get_beijing_time, comment="创建时间")
