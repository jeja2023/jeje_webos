"""
意见建议模块清单
定义模块元信息、路由入口、权限声明等
"""

from core.loader import ModuleManifest

manifest = ModuleManifest(
    id="feedback",
    name="意见建议",
    version="1.0.0",
    description="用户意见建议反馈系统，支持提交、查看、回复和处理",
    icon="💬",
    author="JeJe",
    
    router_prefix="/api/v1/feedback",
    
    menu={
        "title": "意见建议",
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
    
    enabled=True
)



