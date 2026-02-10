"""
反馈模块事件处理器
处理用户提交反馈后的通知推送
"""

import logging
from sqlalchemy import select, or_
from core.events import event_bus, Events, Event
from core.database import get_db_session
from core.ws_manager import manager as ws_manager
from models.account import User
from models.notification import Notification

logger = logging.getLogger(__name__)

async def handle_feedback_created(event: Event):
    """处理反馈创建事件并通知管理员"""
    # 过滤非反馈创建事件
    if event.data.get("type") != "feedback":
        return
        
    feedback_id = event.data.get("id")
    user_id = event.data.get("user_id")
    
    async with get_db_session() as db:
        # 1. 获取提交者信息
        result = await db.execute(select(User).where(User.id == user_id))
        submitter = result.scalar_one_or_none()
        submitter_name = submitter.nickname or submitter.username if submitter else "匿名用户"
        
        # 2. 找到所有管理员和经理（包含 super_admin）
        admin_result = await db.execute(
            select(User.id).where(
                User.role.in_(["admin", "manager", "super_admin", "super"])
            )
        )
        admin_ids = list({row[0] for row in admin_result.all()})
        
        # 排除提交者本人
        if user_id in admin_ids:
            admin_ids.remove(user_id)
            
        if not admin_ids:
            logger.info(f"没有需要通知的管理员 (反馈ID: {feedback_id})")
            return
            
        # 3. 创建系统通知记录（持久化）
        notifications = []
        for admin_id in admin_ids:
            notif = Notification(
                user_id=admin_id,
                sender_id=user_id,
                title="收到新反馈",
                content=f"用户 {submitter_name} 提交了一条新反馈，请及时处理。",
                type="feedback",
                action_url=f"/feedback/view/{feedback_id}"
            )
            notifications.append(notif)
            
        db.add_all(notifications)
        await db.commit()
        
        # 4. WebSocket 实时推送
        # 为每个管理员发送带有个性化通知ID的消息
        for i, admin_id in enumerate(admin_ids):
            notif = notifications[i]
            push_msg = {
                "type": "notification",
                "data": {
                    "id": notif.id,
                    "title": notif.title,
                    "content": notif.content,
                    "type": "warning",
                    "action_url": notif.action_url,
                    "sender_name": submitter_name,
                    "is_read": False,
                    "created_at": notif.created_at.isoformat() if notif.created_at else get_beijing_time().isoformat()
                }
            }
            await ws_manager.send_personal_message(push_msg, admin_id)
            
        logger.info(f"已推送反馈通知给 {len(admin_ids)} 位管理员 (反馈ID: {feedback_id})")

def register_feedback_events():
    """注册反馈相关的事件监听力"""
    event_bus.subscribe(Events.CONTENT_CREATED, handle_feedback_created)
    logger.debug("已注册反馈事件监听器")
