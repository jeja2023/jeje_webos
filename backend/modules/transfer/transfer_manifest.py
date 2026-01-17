"""
快传模块清单
局域网内设备间高速文件传输
"""

from core.loader import ModuleManifest, ModuleAssets

# 模块清单
manifest = ModuleManifest(
    # 基本信息
    id="transfer",
    name="快传",
    version="1.0.0",
    description="局域网内设备间高速文件传输，支持分块传输、断点续传、传输历史记录",
    icon="⚡",
    author="JeJe WebOS",
    
    # 路由配置
    router_prefix="/api/v1/transfer",
    
    # 菜单配置
    menu={
        "title": "快传",
        "icon": "⚡",
        "path": "/transfer",
        "order": 9,
        "children": []
    },
    
    # 前端资源
    assets=ModuleAssets(
        css=[],
        js=[]
    ),
    
    # 权限声明
    permissions=[
        "transfer.send",      # 发送文件
        "transfer.receive",   # 接收文件
        "transfer.history"    # 查看历史
    ],
    
    # 模块依赖
    dependencies=[],
    
    # 内核版本要求
    kernel_version=">=1.0.0",
    
    # 是否启用
    enabled=False,
)
