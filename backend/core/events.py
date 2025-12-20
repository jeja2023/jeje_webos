"""
事件总线系统
实现模块间的松耦合通信
"""

from typing import Callable, Dict, List, Any
from dataclasses import dataclass, field
from datetime import datetime, timezone
import asyncio
import logging

logger = logging.getLogger(__name__)


@dataclass
class Event:
    """事件数据结构"""
    name: str
    source: str  # 发送模块ID
    data: Dict[str, Any] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


# 事件处理器类型
EventHandler = Callable[[Event], Any]


class EventBus:
    """事件总线 - 模块间通信桥梁"""
    
    def __init__(self):
        self._handlers: Dict[str, List[EventHandler]] = {}
        self._history: List[Event] = []
        self._max_history = 1000
    
    def subscribe(self, event_name: str, handler: EventHandler):
        """订阅事件"""
        if event_name not in self._handlers:
            self._handlers[event_name] = []
        self._handlers[event_name].append(handler)
        logger.debug(f"订阅事件: {event_name}")
    
    def unsubscribe(self, event_name: str, handler: EventHandler):
        """取消订阅"""
        if event_name in self._handlers:
            self._handlers[event_name].remove(handler)
            logger.debug(f"取消订阅: {event_name}")
    
    async def publish(self, event: Event):
        """发布事件"""
        # 记录历史
        self._history.append(event)
        if len(self._history) > self._max_history:
            self._history = self._history[-self._max_history:]
        
        logger.debug(f"发布事件: {event.name} 来自 {event.source}")
        
        # 通知所有订阅者
        handlers = self._handlers.get(event.name, [])
        for handler in handlers:
            try:
                if asyncio.iscoroutinefunction(handler):
                    await handler(event)
                else:
                    handler(event)
            except Exception as e:
                logger.error(f"事件处理错误 {event.name}: {e}")
    
    def emit(self, name: str, source: str, data: Dict[str, Any] = None):
        """便捷发布方法（同步包装）"""
        event = Event(name=name, source=source, data=data or {})
        try:
            loop = asyncio.get_running_loop()
            if loop.is_running():
                asyncio.create_task(self.publish(event))
            else:
                # 循环未运行（可能在关闭中），记录历史并记录日志
                self._history.append(event)
                logger.debug(f"EventBus.emit: 循环未运行，仅记录历史: {name}")
        except RuntimeError:
            # 完全没有运行中的循环（启动阶段），仅记录历史
            self._history.append(event)
            logger.debug(f"EventBus.emit: 没有运行中的循环，仅记录历史: {name}")
    
    def get_history(self, event_name: str = None, limit: int = 100) -> List[Event]:
        """获取事件历史"""
        if event_name:
            filtered = [e for e in self._history if e.name == event_name]
        else:
            filtered = self._history
        return filtered[-limit:]


# 全局事件总线实例
event_bus = EventBus()


# 预定义事件名称常量
class Events:
    """系统事件名称"""
    # 系统事件
    SYSTEM_STARTUP = "system.startup"
    SYSTEM_SHUTDOWN = "system.shutdown"
    
    # 模块事件
    MODULE_LOADED = "module.loaded"
    MODULE_UNLOADED = "module.unloaded"
    MODULE_ERROR = "module.error"
    
    # 用户事件
    USER_LOGIN = "user.login"
    USER_LOGOUT = "user.logout"
    USER_REGISTER = "user.register"
    
    # 内容事件
    CONTENT_CREATED = "content.created"
    CONTENT_UPDATED = "content.updated"
    CONTENT_DELETED = "content.deleted"



