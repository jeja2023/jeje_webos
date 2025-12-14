"""
事件总线单元测试
"""

import pytest
import asyncio

from core.events import EventBus, Event, Events


class TestEvent:
    """事件数据类测试"""
    
    def test_event_creation(self):
        """测试事件创建"""
        event = Event(
            name="test.event",
            source="test_module"
        )
        
        assert event.name == "test.event"
        assert event.source == "test_module"
        assert event.data == {}
        assert event.timestamp is not None
    
    def test_event_with_data(self):
        """测试带数据的事件"""
        data = {"key": "value", "count": 42}
        event = Event(
            name="test.event",
            source="test_module",
            data=data
        )
        
        assert event.data == data
        assert event.data["key"] == "value"
        assert event.data["count"] == 42


class TestEventBus:
    """事件总线测试"""
    
    def test_eventbus_creation(self):
        """测试事件总线创建"""
        bus = EventBus()
        
        assert bus._handlers == {}
        assert bus._history == []
    
    def test_subscribe(self):
        """测试事件订阅"""
        bus = EventBus()
        
        def handler(event):
            pass
        
        bus.subscribe("test.event", handler)
        
        assert "test.event" in bus._handlers
        assert handler in bus._handlers["test.event"]
    
    def test_unsubscribe(self):
        """测试取消订阅"""
        bus = EventBus()
        
        def handler(event):
            pass
        
        bus.subscribe("test.event", handler)
        bus.unsubscribe("test.event", handler)
        
        assert handler not in bus._handlers.get("test.event", [])
    
    @pytest.mark.asyncio
    async def test_publish(self):
        """测试事件发布"""
        bus = EventBus()
        received_events = []
        
        def handler(event):
            received_events.append(event)
        
        bus.subscribe("test.event", handler)
        
        event = Event(name="test.event", source="test")
        await bus.publish(event)
        
        assert len(received_events) == 1
        assert received_events[0].name == "test.event"
    
    @pytest.mark.asyncio
    async def test_publish_async_handler(self):
        """测试异步处理器"""
        bus = EventBus()
        received_events = []
        
        async def async_handler(event):
            await asyncio.sleep(0.01)
            received_events.append(event)
        
        bus.subscribe("test.event", async_handler)
        
        event = Event(name="test.event", source="test")
        await bus.publish(event)
        
        assert len(received_events) == 1
    
    @pytest.mark.asyncio
    async def test_event_history(self):
        """测试事件历史记录"""
        bus = EventBus()
        
        event1 = Event(name="event1", source="test")
        event2 = Event(name="event2", source="test")
        
        await bus.publish(event1)
        await bus.publish(event2)
        
        history = bus.get_history()
        
        assert len(history) == 2
    
    @pytest.mark.asyncio
    async def test_event_history_filter(self):
        """测试事件历史过滤"""
        bus = EventBus()
        
        await bus.publish(Event(name="type_a", source="test"))
        await bus.publish(Event(name="type_b", source="test"))
        await bus.publish(Event(name="type_a", source="test"))
        
        history_a = bus.get_history(event_name="type_a")
        
        assert len(history_a) == 2


class TestEventNames:
    """预定义事件名称测试"""
    
    def test_system_events(self):
        """测试系统事件名称"""
        assert Events.SYSTEM_STARTUP == "system.startup"
        assert Events.SYSTEM_SHUTDOWN == "system.shutdown"
    
    def test_module_events(self):
        """测试模块事件名称"""
        assert Events.MODULE_LOADED == "module.loaded"
        assert Events.MODULE_UNLOADED == "module.unloaded"
        assert Events.MODULE_ERROR == "module.error"
    
    def test_user_events(self):
        """测试用户事件名称"""
        assert Events.USER_LOGIN == "user.login"
        assert Events.USER_LOGOUT == "user.logout"
        assert Events.USER_REGISTER == "user.register"
