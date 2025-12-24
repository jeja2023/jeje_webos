"""
数据分析模块清单
基于 DuckDB 的高性能数据分析中心
"""

from core.loader import ModuleManifest, ModuleAssets
import logging

logger = logging.getLogger(__name__)


# 生命周期钩子
async def on_install():
    """模块安装时执行"""
    logger.info("数据分析模块正在安装...")


async def on_enable():
    """模块启用时执行"""
    logger.info("数据分析模块已启用")


async def on_disable():
    """模块禁用时执行"""
    logger.info("数据分析模块已禁用")


# 模块清单
manifest = ModuleManifest(
    # 基本信息
    id="analysis",
    name="数据分析",
    version="1.0.0",
    description="基于 DuckDB 的高性能数据分析中心，支持数据清洗、比对、建模、BI 仪表盘等功能",
    icon="📊",
    author="JeJe WebOS",

    # 路由配置
    router_prefix="/api/v1/analysis",

    # 菜单配置
    menu={
        "title": "数据分析",
        "icon": "📈",
        "path": "/analysis",
        "order": 100,
        "children": []
    },

    # 前端资源 (留空表示自动发现)
    assets=ModuleAssets(
        css=[],
        js=[]
    ),

    # 权限声明
    permissions=[
        "analysis:view",     # 查看数据集
        "analysis:import",   # 导入数据
        "analysis:clean",    # 数据清洗
        "analysis:compare",  # 数据比对
        "analysis:model"     # 数据建模
    ],

    # 模块依赖
    dependencies=[],

    # 内核版本要求
    kernel_version=">=1.0.0",

    # 是否启用
    enabled=True,

    # 生命周期钩子
    on_install=on_install,
    on_enable=on_enable,
    on_disable=on_disable,
)

# 导出清单
__all__ = ["manifest"]

