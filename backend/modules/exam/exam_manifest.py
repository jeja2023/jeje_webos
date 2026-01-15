"""
考试模块清单
定义模块元信息、路由入口、权限声明等
"""

from core.loader import ModuleManifest, ModuleAssets
from .exam_router import router

manifest = ModuleManifest(
    id="exam",
    name="在线考试",
    version="1.0.0",
    description="题库管理、智能组卷、在线考试与自动阅卷系统",
    icon="📝",
    author="JeJe WebOS",
    
    router_prefix="/api/v1/exam",
    router=router,
    
    menu={
        "title": "考试",
        "icon": "📝",
        "path": "/exam",
        "order": 20,
        "children": [
            {"title": "考试中心", "path": "/exam", "icon": "📋"},
            {"title": "题库管理", "path": "/exam/questions", "icon": "📚"},
            {"title": "试卷管理", "path": "/exam/papers", "icon": "📄"}
        ]
    },
    
    # 前端资源
    assets=ModuleAssets(
        css=[],
        js=[]
    ),
    
    permissions=[
        "exam.read",
        "exam.create",
        "exam.update",
        "exam.delete",
        "exam.take",      # 参加考试
        "exam.grade"      # 阅卷权限
    ],
    
    dependencies=[],
    
    enabled=True,
)
