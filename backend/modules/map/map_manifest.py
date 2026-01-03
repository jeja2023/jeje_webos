"""
地图模块清单
"""

from core.loader import ModuleManifest
from .map_router import router

manifest = ModuleManifest(
    id="map",
    name="智能地图",
    version="1.0.0",
    description="支持离线瓦片、混合地图展示及多源 GPS 轨迹数据分析",
    icon="🗺️",
    author="JeJe",
    
    router_prefix="/api/v1/map",
    router=router,
    
    menu={
        "title": "地理信息",
        "icon": "🗺️",
        "path": "/map",
        "order": 8,
        "children": [
            {"title": "地图概览", "path": "/map", "icon": "🌍"}
        ]
    },
    
    permissions=[
        "map.use",
        "map.upload"
    ],
    
    enabled=True
)
