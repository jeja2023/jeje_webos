"""
审计日志工具
提供便捷的审计日志记录功能

安全特性：
- 敏感数据自动脱敏（密码、令牌、手机号等）
- IP 地址记录
- 操作追踪
"""

import re
import logging
from typing import Optional, Any, Dict
from datetime import datetime, timezone
from fastapi import Request

from core.database import async_session
from models import SystemLog

logger = logging.getLogger(__name__)


# ==================== 日志脱敏工具 ====================

class DataMasker:
    """
    敏感数据脱敏工具
    
    自动识别并脱敏以下数据类型：
    - 密码
    - 令牌/Token
    - 手机号
    - 邮箱
    - 身份证号
    """
    
    # 敏感字段名（不区分大小写）
    SENSITIVE_FIELDS = {
        'password', 'passwd', 'pwd', 'secret', 
        'token', 'access_token', 'refresh_token', 'api_key', 'apikey',
        'authorization', 'auth', 'credential', 'credentials',
        'private_key', 'privatekey', 'secret_key', 'secretkey'
    }
    
    @staticmethod
    def mask_password(value: str) -> str:
        """脱敏密码"""
        if not value:
            return value
        return "******"
    
    @staticmethod
    def mask_token(value: str) -> str:
        """脱敏令牌"""
        if not value or len(value) < 10:
            return "***"
        return f"{value[:6]}...{value[-4:]}"
    
    @staticmethod
    def mask_phone(value: str) -> str:
        """脱敏手机号：138****8000"""
        if not value or len(value) != 11:
            return value
        return f"{value[:3]}****{value[-4:]}"
    
    @staticmethod
    def mask_email(value: str) -> str:
        """脱敏邮箱：t***@example.com"""
        if not value or '@' not in value:
            return value
        local, domain = value.rsplit('@', 1)
        if len(local) <= 2:
            masked_local = local[0] + "***"
        else:
            masked_local = local[0] + "***" + local[-1]
        return f"{masked_local}@{domain}"
    
    @staticmethod
    def mask_id_card(value: str) -> str:
        """脱敏身份证号：110***********1234"""
        if not value or len(value) < 15:
            return value
        return f"{value[:3]}{'*' * (len(value) - 7)}{value[-4:]}"
    
    @staticmethod
    def mask_ip(value: str, full: bool = False) -> str:
        """
        脱敏 IP 地址
        full=False: 192.168.1.* (部分脱敏)
        full=True: *.*.*.* (完全脱敏)
        """
        if not value:
            return value
        if full:
            return "*.*.*.*"
        parts = value.split('.')
        if len(parts) == 4:
            return f"{parts[0]}.{parts[1]}.{parts[2]}.*"
        return value
    
    @classmethod
    def is_sensitive_field(cls, field_name: str) -> bool:
        """检查是否是敏感字段"""
        return field_name.lower() in cls.SENSITIVE_FIELDS
    
    @classmethod
    def mask_dict(cls, data: Dict[str, Any], mask_keys: set = None) -> Dict[str, Any]:
        """
        脱敏字典中的敏感数据
        
        Args:
            data: 原始数据字典
            mask_keys: 额外需要脱敏的字段名集合
        
        Returns:
            脱敏后的字典（不修改原数据）
        """
        if not isinstance(data, dict):
            return data
        
        mask_keys = mask_keys or set()
        result = {}
        
        for key, value in data.items():
            key_lower = key.lower()
            
            # 检查是否需要脱敏
            if cls.is_sensitive_field(key) or key_lower in mask_keys:
                if 'password' in key_lower or 'passwd' in key_lower or 'pwd' in key_lower:
                    result[key] = cls.mask_password(str(value) if value else '')
                elif 'token' in key_lower or 'key' in key_lower:
                    result[key] = cls.mask_token(str(value) if value else '')
                else:
                    result[key] = "******"
            elif key_lower == 'phone' or key_lower == 'mobile':
                result[key] = cls.mask_phone(str(value)) if value else value
            elif key_lower == 'email':
                result[key] = cls.mask_email(str(value)) if value else value
            elif key_lower in ('id_card', 'idcard', 'identity'):
                result[key] = cls.mask_id_card(str(value)) if value else value
            elif isinstance(value, dict):
                result[key] = cls.mask_dict(value, mask_keys)
            elif isinstance(value, list):
                result[key] = [
                    cls.mask_dict(item, mask_keys) if isinstance(item, dict) else item
                    for item in value
                ]
            else:
                result[key] = value
        
        return result
    
    @classmethod
    def mask_message(cls, message: str) -> str:
        """
        脱敏日志消息中的敏感信息
        
        自动识别并脱敏：
        - 手机号
        - 邮箱
        - Token/密钥
        """
        if not message:
            return message
        
        # 脱敏手机号
        message = re.sub(
            r'1[3-9]\d{9}',
            lambda m: cls.mask_phone(m.group()),
            message
        )
        
        # 脱敏邮箱
        message = re.sub(
            r'[\w.-]+@[\w.-]+\.\w+',
            lambda m: cls.mask_email(m.group()),
            message
        )
        
        # 脱敏 JWT Token（Bearer xxx...）
        message = re.sub(
            r'Bearer\s+([A-Za-z0-9_-]+\.){2}[A-Za-z0-9_-]+',
            lambda m: f"Bearer {cls.mask_token(m.group().split(' ')[1])}",
            message
        )
        
        # 脱敏长字符串（可能是密钥/Token）
        message = re.sub(
            r'[A-Za-z0-9_-]{32,}',
            lambda m: cls.mask_token(m.group()),
            message
        )
        
        return message


# 全局脱敏工具实例
data_masker = DataMasker()


# 操作类型常量
class AuditAction:
    """审计操作类型"""
    # 认证操作
    LOGIN = "login"
    LOGOUT = "logout"
    REGISTER = "register"
    PASSWORD_CHANGE = "password_change"
    
    # 用户管理
    USER_CREATE = "user_create"
    USER_UPDATE = "user_update"
    USER_DELETE = "user_delete"
    USER_ENABLE = "user_enable"
    USER_DISABLE = "user_disable"
    
    # 模块管理
    MODULE_CREATE = "module_create"
    MODULE_DELETE = "module_delete"
    MODULE_ENABLE = "module_enable"
    MODULE_DISABLE = "module_disable"
    
    # 系统设置
    SETTING_UPDATE = "setting_update"
    
    # 文件操作
    FILE_UPLOAD = "file_upload"
    FILE_DELETE = "file_delete"
    
    # 备份操作
    BACKUP_CREATE = "backup_create"
    BACKUP_RESTORE = "backup_restore"
    BACKUP_DELETE = "backup_delete"
    
    # 通用 CRUD
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    BATCH_DELETE = "batch_delete"
    EXPORT = "export"
    IMPORT = "import"


class AuditLogger:
    """审计日志记录器"""
    
    @staticmethod
    def get_client_ip(request: Request) -> str:
        """获取客户端 IP"""
        # 尝试从代理头获取真实 IP
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        
        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip
        
        return request.client.host if request.client else "unknown"
    
    @staticmethod
    async def log(
        module: str,
        action: str,
        message: str,
        user_id: Optional[int] = None,
        ip_address: Optional[str] = None,
        level: str = "INFO",
        mask_sensitive: bool = True
    ):
        """
        记录审计日志
        
        Args:
            module: 模块名称（如 auth, user, blog）
            action: 操作类型（如 login, create, delete）
            message: 日志描述
            user_id: 操作用户 ID
            ip_address: 客户端 IP
            level: 日志级别（INFO, WARNING, ERROR）
            mask_sensitive: 是否自动脱敏敏感信息
        """
        try:
            # 自动脱敏敏感信息
            if mask_sensitive:
                message = data_masker.mask_message(message)
            
            async with async_session() as db:
                log_entry = SystemLog(
                    level=level,
                    module=module,
                    action=action,
                    message=message,
                    user_id=user_id,
                    ip_address=ip_address
                )
                db.add(log_entry)
                await db.commit()
                
            logger.debug(f"[审计] {module}.{action}: {message}")
        except Exception as e:
            logger.error(f"记录审计日志失败: {e}")
    
    @staticmethod
    async def log_request(
        request: Request,
        module: str,
        action: str,
        message: str,
        user_id: Optional[int] = None,
        level: str = "INFO"
    ):
        """
        从请求对象记录审计日志
        自动提取 IP 地址
        """
        ip_address = AuditLogger.get_client_ip(request)
        await AuditLogger.log(
            module=module,
            action=action,
            message=message,
            user_id=user_id,
            ip_address=ip_address,
            level=level
        )


# 全局实例
audit_logger = AuditLogger()


# 便捷函数
async def log_audit(
    module: str,
    action: str,
    message: str,
    user_id: Optional[int] = None,
    ip_address: Optional[str] = None,
    level: str = "INFO"
):
    """记录审计日志的便捷函数"""
    await AuditLogger.log(
        module=module,
        action=action,
        message=message,
        user_id=user_id,
        ip_address=ip_address,
        level=level
    )


def mask_sensitive_data(data: Dict[str, Any]) -> Dict[str, Any]:
    """脱敏字典中的敏感数据"""
    return data_masker.mask_dict(data)


def mask_sensitive_message(message: str) -> str:
    """脱敏消息中的敏感信息"""
    return data_masker.mask_message(message)
