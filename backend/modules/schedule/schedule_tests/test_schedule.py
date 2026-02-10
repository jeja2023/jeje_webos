# -*- coding: utf-8 -*-
"""
日程模块测试
覆盖：模型、Schema、服务层 CRUD、API 路由端点
"""
import pytest
from httpx import AsyncClient
from datetime import date, timedelta


# ==================== 服务层测试 ====================
class TestScheduleService:
    @pytest.mark.asyncio
    async def test_create_category(self, db_session):
        from modules.schedule.schedule_services import CategoryService
        from modules.schedule.schedule_schemas import CategoryCreate
        cat = await CategoryService.create_category(db_session, user_id=1, data=CategoryCreate(name="工作", color="#FF0000"))
        assert cat.id is not None
        assert cat.name == "工作"

    @pytest.mark.asyncio
    async def test_get_user_categories(self, db_session):
        from modules.schedule.schedule_services import CategoryService
        from modules.schedule.schedule_schemas import CategoryCreate
        await CategoryService.create_category(db_session, user_id=1, data=CategoryCreate(name="分类1"))
        cats = await CategoryService.get_user_categories(db_session, user_id=1)
        assert len(cats) >= 1

    @pytest.mark.asyncio
    async def test_create_event(self, db_session):
        from modules.schedule.schedule_services import ScheduleService
        from modules.schedule.schedule_schemas import EventCreate
        today = date.today()
        event = await ScheduleService.create_event(db_session, user_id=1, data=EventCreate(
            title="会议", start_date=today.isoformat(), end_date=today.isoformat(), event_type="event"
        ))
        assert event.id is not None
        assert event.title == "会议"

    @pytest.mark.asyncio
    async def test_get_today_events(self, db_session):
        from modules.schedule.schedule_services import ScheduleService
        from modules.schedule.schedule_schemas import EventCreate
        today = date.today()
        await ScheduleService.create_event(db_session, user_id=1, data=EventCreate(
            title="今日任务", start_date=today.isoformat(), end_date=today.isoformat(), event_type="task"
        ))
        events = await ScheduleService.get_today_events(db_session, user_id=1)
        assert len(events) >= 1

    @pytest.mark.asyncio
    async def test_get_upcoming_events(self, db_session):
        from modules.schedule.schedule_services import ScheduleService
        from modules.schedule.schedule_schemas import EventCreate
        future = (date.today() + timedelta(days=3)).isoformat()
        await ScheduleService.create_event(db_session, user_id=1, data=EventCreate(
            title="未来事件", start_date=future, end_date=future, event_type="event"
        ))
        events = await ScheduleService.get_upcoming_events(db_session, user_id=1, days=7)
        assert len(events) >= 1

    @pytest.mark.asyncio
    async def test_update_event(self, db_session):
        from modules.schedule.schedule_services import ScheduleService
        from modules.schedule.schedule_schemas import EventCreate, EventUpdate
        today = date.today()
        event = await ScheduleService.create_event(db_session, user_id=1, data=EventCreate(
            title="原标题", start_date=today.isoformat(), end_date=today.isoformat(), event_type="event"
        ))
        updated = await ScheduleService.update_event(db_session, event.id, user_id=1, data=EventUpdate(title="新标题"))
        assert updated.title == "新标题"

    @pytest.mark.asyncio
    async def test_delete_event(self, db_session):
        from modules.schedule.schedule_services import ScheduleService
        from modules.schedule.schedule_schemas import EventCreate
        today = date.today()
        event = await ScheduleService.create_event(db_session, user_id=1, data=EventCreate(
            title="待删除", start_date=today.isoformat(), end_date=today.isoformat(), event_type="event"
        ))
        result = await ScheduleService.delete_event(db_session, event.id, user_id=1)
        assert result is True

    @pytest.mark.asyncio
    async def test_complete_event(self, db_session):
        from modules.schedule.schedule_services import ScheduleService
        from modules.schedule.schedule_schemas import EventCreate
        today = date.today()
        event = await ScheduleService.create_event(db_session, user_id=1, data=EventCreate(
            title="待完成", start_date=today.isoformat(), end_date=today.isoformat(), event_type="task"
        ))
        completed = await ScheduleService.complete_event(db_session, event.id, user_id=1)
        assert completed is not None

    @pytest.mark.asyncio
    async def test_get_stats(self, db_session):
        from modules.schedule.schedule_services import ScheduleService
        stats = await ScheduleService.get_stats(db_session, user_id=1)
        assert isinstance(stats, dict)


# ==================== API 路由测试 ====================
@pytest.mark.asyncio
class TestScheduleEventAPI:
    async def test_create_event(self, admin_client: AsyncClient):
        today = date.today().isoformat()
        resp = await admin_client.post("/api/v1/schedule/events", json={
            "title": "API日程", "start_date": today, "end_date": today, "event_type": "event"
        })
        assert resp.status_code == 200

    async def test_get_today_events(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/schedule/events/today")
        assert resp.status_code == 200

    async def test_get_upcoming_events(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/schedule/events/upcoming")
        assert resp.status_code == 200

    async def test_get_stats(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/schedule/stats")
        assert resp.status_code == 200

    async def test_get_categories(self, admin_client: AsyncClient):
        resp = await admin_client.get("/api/v1/schedule/categories")
        assert resp.status_code == 200

    async def test_create_category(self, admin_client: AsyncClient):
        resp = await admin_client.post("/api/v1/schedule/categories", json={
            "name": "API分类", "color": "#00FF00"
        })
        assert resp.status_code == 200


class TestScheduleManifest:
    def test_manifest(self):
        from modules.schedule.schedule_manifest import manifest
        assert manifest.id == "schedule"
        assert manifest.enabled is True
