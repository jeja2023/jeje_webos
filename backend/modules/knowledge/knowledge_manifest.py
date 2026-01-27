"""
知识库模块清单
"""

from core.loader import ModuleManifest, ModuleAssets
import logging

logger = logging.getLogger(__name__)


async def on_enable():
    logger.info("知识库模块已启用")


manifest = ModuleManifest(
    # 基本信息
    id="knowledge",
    name="知识库",
    version="1.0.0",
    description="企业级知识管理与文档协作平台",
    icon="📚",
    author="JeJe WebOS",
    
    # 路由配置
    router_prefix="/api/v1/knowledge",
    
    # 菜单配置
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
    
    # 前端资源
    assets=ModuleAssets(
        css=[],
        js=[]
    ),
    
    # 权限声明
    permissions=[
        "knowledge.read",
        "knowledge.create",
        "knowledge.update",
        "knowledge.delete",
        "knowledge.admin"
    ],
    
    # 模块依赖
    dependencies=[],
    
    # 内核版本要求
    kernel_version=">=1.0.0",
    
    # 是否启用
    enabled=True,
    
    on_enable=on_enable,
)

