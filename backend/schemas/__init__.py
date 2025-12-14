"""
数据验证模式目录
"""

from .auth import UserCreate, UserLogin, UserUpdate, UserInfo, PasswordChange
from .user import UserListQuery, UserAudit, UserListItem
from .module import ModuleInfo, ModuleToggle, BootData
from .system_setting import SystemSettingInfo, SystemSettingUpdate
from .role import (
    RoleCreate, RoleUpdate, RoleInfo,
    UserGroupCreate, UserGroupUpdate, UserGroupInfo
)
from .storage import FileInfo, FileUploadResponse, FileListResponse
from .backup import BackupInfo, BackupCreate, BackupRestore, BackupListResponse
from .monitor import SystemInfo, ProcessInfo, MetricInfo
from .message import MessageInfo, MessageCreate, MessageUpdate, MessageListResponse
from .announcement import AnnouncementInfo, AnnouncementCreate, AnnouncementUpdate, AnnouncementListItem
from .response import ApiResponse, PageData, ApiPageResponse, success, error, paginate

__all__ = [
    # 认证
    "UserCreate", "UserLogin", "UserUpdate", "UserInfo", "PasswordChange",
    # 用户管理
    "UserListQuery", "UserAudit", "UserListItem",
    # 模块
    "ModuleInfo", "ModuleToggle", "BootData",
    # 系统设置
    "SystemSettingInfo", "SystemSettingUpdate",
    # 用户组 / 角色兼容
    "RoleCreate", "RoleUpdate", "RoleInfo",
    "UserGroupCreate", "UserGroupUpdate", "UserGroupInfo",
    # 文件存储
    "FileInfo", "FileUploadResponse", "FileListResponse",
    # 数据备份
    "BackupInfo", "BackupCreate", "BackupRestore", "BackupListResponse",
    # 系统监控
    "SystemInfo", "ProcessInfo", "MetricInfo",
    # 通知系统
    "MessageInfo", "MessageCreate", "MessageUpdate", "MessageListResponse",
    # 公告系统
    "AnnouncementInfo", "AnnouncementCreate", "AnnouncementUpdate", "AnnouncementListItem",
    # 响应
    "ApiResponse", "PageData", "ApiPageResponse", "success", "error", "paginate"
]
