"""
DataLens 数据透镜模块清单
系统的万能视窗 - 支持连接多种外部数据源进行数据查看
"""

from core.loader import ModuleManifest, ModuleAssets
import logging

logger = logging.getLogger(__name__)


# 生命周期钩子
async def on_install():
    """模块安装时执行"""
    pass


async def on_enable():
    """模块启用时执行"""
    pass


async def on_disable():
    """模块禁用时执行"""
    pass


# 模块清单
manifest = ModuleManifest(
    # 基本信息
    id="datalens",
    name="数据透镜",
    version="1.0.0",
    description="系统的万能视窗，支持连接 MySQL、PostgreSQL、SQL Server、Oracle、SQLite、CSV、Excel、API 等多种数据源",
    icon="🔬",
    author="JeJe WebOS",

    # 路由配置
    router_prefix="/api/v1/lens",

    # 菜单配置
    menu={
        "title": "数据透镜",
        "icon": "🔬",
        "path": "/lens",
        "order": 50,
        "children": []
    },

    # 前端资源
    assets=ModuleAssets(
        css=[],
        js=[]
    ),

    # 权限声明
    permissions=[
        "datalens.view",             # 查看视图（基础权限）
        "datalens.create",           # 创建视图
        "datalens.update",           # 修改视图
        "datalens.delete",           # 删除视图
        "datalens.source.manage",    # 管理数据源
        "datalens.category.manage",  # 管理分类
        "datalens.admin",            # 管理所有用户的视图
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
