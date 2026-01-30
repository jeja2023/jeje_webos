"""
NotebookLM水印清除模块清单
定义模块元信息、路由入口、权限声明等
"""

from core.loader import ModuleManifest, ModuleAssets

manifest = ModuleManifest(
    id="lm_cleaner",
    name="NotebookLM水印清除",
    version="1.0.0",
    description="专门用于去除 NotebookLM 生成的 PDF 和图片页面上的右下角水印。",
    icon="🪄",
    author="JeJe WebOS",
    
    router_prefix="/api/v1/lm_cleaner",
    
    menu={
        "title": "LM 水印清除",
        "icon": "🪄",
        "path": "/lm_cleaner",
        "order": 50,
        "children": [
            {"title": "开始清除", "path": "/lm_cleaner", "icon": "⚡"},
            {"title": "历史记录", "path": "/lm_cleaner/list", "icon": "📜"}
        ]
    },
    
    # 前端资源
    assets=ModuleAssets(
        css=["/static/css/pages/lm_cleaner.css"],
        js=["/static/js/pages/lm_cleaner.js"]
    ),
    
    permissions=[
        "lm_cleaner.read",
        "lm_cleaner.delete"
    ],
    
    dependencies=[],
)



