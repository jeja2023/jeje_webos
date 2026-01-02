"""
路由目录
"""

from . import (
    auth, boot, user, system_settings, audit, roles,
    storage, backup, monitor, notification, websocket,
    import_export, announcement
)

__all__ = [
    "auth", "boot", "user", "system_settings", "audit", "roles",
    "storage", "backup", "monitor", "notification", "websocket",
    "import_export", "announcement"
]
