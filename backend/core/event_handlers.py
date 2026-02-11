import logging
from sqlalchemy import select
from core.events import event_bus, Events
from core.database import get_db_session
from core.ws_manager import manager
from models import User

logger = logging.getLogger(__name__)

async def on_user_register(event):
    """
    当新用户注册时，通过 WebSocket 通知所有管理员
    """
    try:
        user_id = event.data.get("user_id")
        if not user_id:
            return
            
        async with get_db_session() as db:
            # 获取新用户信息
            result = await db.execute(select(User).where(User.id == user_id))
            new_user = result.scalar_one_or_none()
            if not new_user:
                return
                
            # 仅通知管理员和经理（他们有权限审核）
            admin_query = select(User.id).where(User.role.in_(["admin", "manager"]))
            admin_result = await db.execute(admin_query)
            admin_ids = [row[0] for row in admin_result.all()]
            
            if not admin_ids:
                return

            # 构造通知消息
            # category: user_pending 用于前端识别并刷新待审核计数
            message = {
                "type": "notification",
                "data": {
                    "type": "info",
                    "title": "新用户注册",
                    "content": f"用户 {new_user.username} 已注册，请前往审核。",
                    "action_url": "/users/pending",
                    "sender_name": "系统",
                    "category": "user_pending", 
                    "created_at": event.timestamp.isoformat()
                }
            }
            
            # 推送给所有在线管理员
            logger.info(f"发送新用户注册通知给 {len(admin_ids)} 位管理员")
            for admin_id in admin_ids:
                try:
                    await manager.send_personal_message(message, admin_id)
                except Exception as e:
                    logger.warning(f"发送通知给管理员 {admin_id} 失败: {e}")
                    
    except Exception as e:
        logger.error(f"处理用户注册事件失败: {e}")

def register_event_handlers():
    """注册所有事件处理器"""
    event_bus.subscribe(Events.USER_REGISTER, on_user_register)
    logger.info("已注册系统事件处理器")
