"""
反馈模块清单
定义模块元信息、路由入口、权限声明等
"""

from core.loader import ModuleManifest, ModuleAssets
import logging

logger = logging.getLogger(__name__)


from .feedback_events import register_feedback_events

async def on_enable():
    register_feedback_events()
    # logger.info("反馈模块已启用")


manifest = ModuleManifest(
    id="feedback",
    name="反馈",
    version="1.0.0",
    description="用户反馈系统，支持提交、查看、回复和处理",
    icon="💬",
    author="JeJe",
    
    router_prefix="/api/v1/feedback",
    
    menu={
        "title": "反馈",
        "icon": "💬",
        "path": "/feedback",
        "order": 10,
        "children": [
            {"title": "我的反馈", "path": "/feedback/my", "icon": "📨"},
            {"title": "提交反馈", "path": "/feedback/create", "icon": "➕"},
            {"title": "反馈管理", "path": "/feedback/admin", "icon": "🗂️"}
        ]
    },
    
    permissions=[
        "feedback.read",      # 查看反馈
        "feedback.create",    # 提交反馈
        "feedback.update",    # 更新反馈（回复、处理）
        "feedback.delete",    # 删除反馈
        "feedback.admin"      # 管理所有反馈（管理员）
    ],
    
    enabled=True,
    
    on_enable=on_enable,
)
