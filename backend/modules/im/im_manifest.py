"""
即时通讯模块清单
定义模块元信息、路由入口、权限声明等
"""

from core.loader import ModuleManifest, ModuleAssets
import logging

logger = logging.getLogger(__name__)


async def on_install():
    """
    首次安装时执行
    初始化默认配置
    """
    logger.debug("即时通讯模块安装完成")


async def on_enable():
    """
    模块启用时执行
    每次系统启动且模块被加载时都会调用
    """
    logger.debug("即时通讯模块已启用")


async def on_disable():
    """
    模块禁用时执行
    """
    logger.debug("即时通讯模块已禁用")


async def on_uninstall():
    """
    模块卸载时执行
    清理资源、备份数据等
    """
    logger.debug("即时通讯模块已卸载")


manifest = ModuleManifest(
    # 基本信息
    id="im",
    name="即时通讯",
    version="1.0.0",
    description="支持私聊、群聊的即时通讯功能，包含消息加密、文件传输等功能",
    icon="💬",
    author="JeJe WebOS",
    
    # 路由配置（不含 prefix，由 loader 自动添加）
    router_prefix="/api/v1/im",
    
    # 菜单配置（用于前端动态渲染）
    menu={
        "title": "即时通讯",
        "icon": "💬",
        "path": "/im",
        "order": 7,  # 菜单排序，数字越小越靠前
        "children": [
            {"title": "消息", "path": "/im/messages", "icon": "💬"},
            {"title": "联系人", "path": "/im/contacts", "icon": "👥"}
        ]
    },
    
    # 前端资源配置（可选，会自动发现 static/ 目录下的资源）
    assets=ModuleAssets(
        css=[],
        js=[]
    ),
    
    # 权限声明
    permissions=[
        "im.read",      # 查看权限
        "im.create",   # 创建会话权限
        "im.update",   # 更新会话权限
        "im.delete",   # 删除会话权限
        "im.send",     # 发送消息权限
        "im.contact"   # 联系人管理权限
    ],
    
    # 模块依赖（依赖的其他模块ID）
    dependencies=[],
    
    # 内核版本要求
    kernel_version=">=1.0.0",
    
    # 是否启用
    enabled=True,
    
    # 生命周期钩子
    on_install=on_install,
    on_enable=on_enable,
    on_disable=on_disable,
    on_uninstall=on_uninstall,
)







