"""
版本更新日志管理
记录每个版本的新功能和修复
"""

from typing import List, Dict, Optional
from datetime import datetime
from enum import Enum


class ChangeType(str, Enum):
    """变更类型"""
    FEATURE = "feature"  # 新功能
    FIX = "fix"  # 修复
    IMPROVEMENT = "improvement"  # 改进
    SECURITY = "security"  # 安全
    DEPRECATED = "deprecated"  # 废弃


class ChangelogEntry:
    """更新日志条目"""
    
    def __init__(
        self,
        version: str,
        date: str,
        changes: Dict[str, List[str]],
        description: Optional[str] = None
    ):
        self.version = version
        self.date = date
        self.changes = changes  # {type: [descriptions]}
        self.description = description
    
    def to_dict(self) -> dict:
        """转换为字典"""
        return {
            "version": self.version,
            "date": self.date,
            "description": self.description,
            "changes": self.changes
        }


# 版本更新日志
CHANGELOG: List[ChangelogEntry] = [
    ChangelogEntry(
        version="1.0.0",
        date="2024-12-11",
        description="初始版本发布",
        changes={
            "feature": [
                "基于 FastAPI 的微内核架构",
                "模块化设计和热插拔支持",
                "用户认证和权限管理",
                "博客和笔记模块",
                "系统监控和日志审计",
                "数据备份和恢复",
                "国际化支持"
            ],
            "improvement": [
                "响应式前端界面",
                "WebSocket 实时通知",
                "统一错误处理机制"
            ]
        }
    ),
    ChangelogEntry(
        version="1.1.0",
        date="2024-12-11",
        description="安全增强和功能完善",
        changes={
            "feature": [
                "JWT 密钥自动生成和轮换",
                "刷新令牌机制",
                "CSRF 防护支持",
                "文件内容类型验证",
                "密码复杂度验证",
                "速率限制管理接口",
                "使用帮助功能"
            ],
            "security": [
                "增强密码安全策略（8字符+复杂度要求）",
                "CSRF Token 防护机制",
                "文件上传内容验证",
                "敏感数据日志脱敏",
                "登录接口速率限制优化"
            ],
            "improvement": [
                "分页控件添加首页和末页按钮",
                "用户组权限显示优化",
                "系统监控数据获取优化",
                "中间件异常处理优化",
                "Redis 缓存支持"
            ],
            "fix": [
                "修复下拉菜单被遮挡问题",
                "修复系统监控数据获取错误",
                "修复路由注册问题",
                "修复中间件响应错误",
                "修复密码修改验证问题"
            ]
        }
    )
]


def get_changelog(version: Optional[str] = None) -> List[dict]:
    """
    获取更新日志
    
    Args:
        version: 指定版本，如果为 None 则返回所有版本
    
    Returns:
        更新日志列表
    """
    if version:
        entry = next((e for e in CHANGELOG if e.version == version), None)
        return [entry.to_dict()] if entry else []
    
    return [entry.to_dict() for entry in CHANGELOG]


def get_latest_version() -> Optional[dict]:
    """获取最新版本信息"""
    if not CHANGELOG:
        return None
    
    latest = CHANGELOG[0]
    return latest.to_dict()


def get_version_changes(current_version: str, target_version: Optional[str] = None) -> dict:
    """
    获取版本之间的变更
    
    Args:
        current_version: 当前版本
        target_version: 目标版本（None 表示最新版本）
    
    Returns:
        变更信息
    """
    if not target_version:
        target_version = CHANGELOG[0].version if CHANGELOG else current_version
    
    # 找到当前版本和目标版本的索引
    current_idx = next((i for i, e in enumerate(CHANGELOG) if e.version == current_version), -1)
    target_idx = next((i for i, e in enumerate(CHANGELOG) if e.version == target_version), -1)
    
    if current_idx == -1 or target_idx == -1:
        return {
            "current_version": current_version,
            "target_version": target_version,
            "has_updates": False,
            "changes": {}
        }
    
    # 如果目标版本比当前版本新
    if target_idx < current_idx:
        # 收集所有变更
        all_changes = {
            "feature": [],
            "fix": [],
            "improvement": [],
            "security": [],
            "deprecated": []
        }
        
        for i in range(target_idx, current_idx):
            entry = CHANGELOG[i]
            for change_type, descriptions in entry.changes.items():
                all_changes[change_type].extend(descriptions)
        
        return {
            "current_version": current_version,
            "target_version": target_version,
            "has_updates": True,
            "changes": {k: v for k, v in all_changes.items() if v}
        }
    
    return {
        "current_version": current_version,
        "target_version": target_version,
        "has_updates": False,
        "changes": {}
    }

