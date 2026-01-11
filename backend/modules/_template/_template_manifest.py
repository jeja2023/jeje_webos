"""
{模块名称}模块清单
定义模块元信息、路由入口、权限声明等

使用说明：
1. 将此文件重命名为 {module_id}_manifest.py
2. 替换所有占位符：
   - {module_id} -> 模块ID（小写+下划线）
   - {模块名称} -> 模块显示名称（中文）
   - {作者名称} -> 作者名称
"""

from core.loader import ModuleManifest, ModuleAssets


# ==================== 生命周期钩子（可选） ====================

async def on_install():
    """
    首次安装时执行
    适合用于：初始化默认数据、创建默认配置等
    """
    import logging
    logger = logging.getLogger(__name__)
    logger.debug(f"模块 {module_id} 安装完成")


async def on_enable():
    """
    模块启用时执行
    每次系统启动且模块被加载时都会调用
    """
    pass


async def on_disable():
    """
    模块禁用时执行
    """
    pass


async def on_uninstall():
    """
    模块卸载时执行
    适合用于：清理资源、备份数据等
    """
    pass


async def on_upgrade():
    """
    版本升级时执行
    当模块版本号变更时调用
    适合用于：数据迁移、配置升级等
    """
    pass


# ==================== 模块清单 ====================

manifest = ModuleManifest(
    # 基本信息
    id="{module_id}",
    name="{模块名称}",
    version="1.0.0",
    description="{模块名称}模块",
    icon="📦",
    author="{作者名称}",
    
    # 路由配置（不含 prefix，由 loader 自动添加）
    router_prefix="/api/v1/{module_id}",
    
    # 菜单配置（用于前端动态渲染）
    menu={
        "title": "{模块名称}",
        "icon": "📦",
        "path": "/{module_id}",
        "order": 10,  # 菜单排序，数字越小越靠前
        "children": [
            {"title": "列表", "path": "/{module_id}/list", "icon": "📄"},
            {"title": "新建", "path": "/{module_id}/create", "icon": "✏️"}
        ]
    },
    
    # 前端资源配置（可选，会自动发现 static/ 目录下的资源）
    assets=ModuleAssets(
        css=[],  # 如: ["/static/{module_id}/css/style.css"]
        js=[]    # 如: ["/static/{module_id}/js/main.js"]
    ),
    
    # 权限声明
    permissions=[
        "{module_id}.read",    # 查看权限
        "{module_id}.create",  # 创建权限
        "{module_id}.update",  # 更新权限
        "{module_id}.delete"   # 删除权限
    ],
    
    # 模块依赖（依赖的其他模块ID）
    dependencies=[],
    
    # 内核版本要求
    kernel_version=">=1.0.0",
    
    # 是否启用
    enabled=True,
    
    # 生命周期钩子（取消注释以启用）
    # on_install=on_install,
    # on_enable=on_enable,
    # on_disable=on_disable,
    # on_uninstall=on_uninstall,
    # on_upgrade=on_upgrade,
)





