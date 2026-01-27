"""
AI助手模块清单
"""

from core.loader import ModuleManifest
from .ai_router import router

# 导入模型以确保它们被注册到Base.metadata
from . import ai_models  # noqa: F401

manifest = ModuleManifest(
    id="ai",
    name="AI助手",
    version="1.0.0",
    description="本地大模型驱动的智能助手，集成知识库与数据分析能力",
    icon="🧠",
    author="JeJe",
    
    router_prefix="/api/v1/ai",
    router=router,
    
    menu={
        "title": "AI助手",
        "icon": "🧠",
        "path": "/ai",
        "order": 0,
        "children": [
            {"title": "聊天对话", "path": "/ai/chat", "icon": "💬"},
            {"title": "AI设置", "path": "/ai/settings", "icon": "⚙️"}
        ]
    },
    
    permissions=[
        "ai.use",
        "ai.admin" 
    ],
    
    enabled=True,
    
    # 生命周期钩子
    on_enable=lambda: None,  # 占位
)

async def on_enable():
    pass

async def on_disable():
    pass

# 重新注入钩子
manifest.on_enable = on_enable
manifest.on_disable = on_disable
