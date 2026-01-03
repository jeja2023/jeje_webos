"""
知识库模块清单
"""

from core.loader import ModuleManifest

manifest = ModuleManifest(
    id="knowledge",
    name="知识库",
    version="1.0.0",
    description="企业级知识管理与文档协作平台",
    icon="📚",
    author="JeJe",
    
    router_prefix="/api/v1/knowledge",
    
    menu={
        "title": "知识库",
        "icon": "📚",
        "path": "/knowledge",
        "order": 6,
        "children": [
            {"title": "知识库概览", "path": "/knowledge/list", "icon": "📊"},
            {"title": "我的文档", "path": "/knowledge/my", "icon": "📁"}
        ]
    },
    
    permissions=[
        "knowledge.read",
        "knowledge.create",
        "knowledge.update",
        "knowledge.delete",
        "knowledge.admin" 
    ],
    
    enabled=True
)
