"""
地图模块清单
"""

from core.loader import ModuleManifest, ModuleAssets
from .map_router import router
import logging

logger = logging.getLogger(__name__)


async def on_enable():
    logger.info("地图模块已启用")


manifest = ModuleManifest(
    # 基本信息
    id="map",
    name="智能地图",
    version="1.0.0",
    description="支持离线瓦片、混合地图展示及多源 GPS 轨迹数据分析",
    icon="🗺️",
    author="JeJe WebOS",
    
    # 路由配置
    router_prefix="/api/v1/map",
    router=router,
    
    # 菜单配置
    menu={
        "title": "地理信息",
        "icon": "🗺️",
        "path": "/map",
        "order": 8,
        "children": [
            {"title": "地图概览", "path": "/map", "icon": "🌍"}
        ]
    },
    
    # 前端资源
    assets=ModuleAssets(
        css=[],
        js=[]
    ),
    
    # 权限声明
    permissions=[
        "map.use",
        "map.upload"
    ],
    
    # 模块依赖
    dependencies=[],
    
    # 内核版本要求
    kernel_version=">=1.0.0",
    
    # 是否启用
    enabled=True,
    
    on_enable=on_enable,
)

