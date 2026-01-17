"""
文件管理模块清单
基于 WebDAV 协议的全功能云端文件管理
"""

from core.loader import ModuleManifest, ModuleAssets

# 模块清单
manifest = ModuleManifest(
    # 基本信息
    id="filemanager",
    name="文件管理",
    version="1.0.0",
    description="基于 WebDAV 协议的全功能云端文件管理，支持文件夹管理、上传下载、预览等",
    icon="📁",
    author="JeJe WebOS",
    
    # 路由配置
    router_prefix="/api/v1/filemanager",
    
    # 菜单配置
    menu={
        "title": "文件管理",
        "icon": "📁",
        "path": "/filemanager",
        "order": 5,
        "children": []
    },
    
    # 前端资源
    assets=ModuleAssets(
        css=[],
        js=[]
    ),
    
    # 权限声明
    permissions=[
        "filemanager.read",      # 浏览文件
        "filemanager.upload",    # 上传文件
        "filemanager.download",  # 下载文件
        "filemanager.create",    # 创建文件夹
        "filemanager.update",    # 重命名/移动
        "filemanager.delete"     # 删除文件/文件夹
    ],
    
    # 模块依赖
    dependencies=[],
    
    # 内核版本要求
    kernel_version=">=1.0.0",
    
    # 是否启用
    enabled=False,
)
