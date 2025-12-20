from core.loader import ModuleManifest, ModuleAssets
import logging

logger = logging.getLogger(__name__)

# 模块清单
manifest = ModuleManifest(
    id="analysis",
    name="数据分析",
    version="1.0.0",
    description="基于 DuckDB 的高性能数据分析中心，支持数据清洗、比对、建模功能",
    icon="📊",
    author="JeJe WebOS",
    router_prefix="/api/v1/analysis",
    permissions=["analysis:view", "analysis:import", "analysis:clean", "analysis:compare", "analysis:model"],
    menu={
        "title": "数据分析",
        "icon": "📈",
        "path": "/analysis",
        "order": 100
    }
)

async def on_install():
    logger.info("数据分析模块正在安装...")
    # 这里可以进行初始化的数据库表创建等操作

async def on_enable():
    logger.info("数据分析模块已启启用")

async def on_disable():
    logger.info("数据分析模块已禁用")

# 导出清单
__all__ = ["manifest"]
