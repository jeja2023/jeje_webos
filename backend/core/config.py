"""
系统配置管理
统一管理所有配置项，支持环境变量覆盖
"""

import os
from pathlib import Path
from pydantic_settings import BaseSettings
from functools import lru_cache
from typing import Optional
from urllib.parse import quote_plus

# 获取backend目录的绝对路径
BACKEND_DIR = Path(__file__).parent.parent.resolve()
ENV_FILE = BACKEND_DIR / ".env"


class Settings(BaseSettings):
    """系统配置"""
    
    # 应用信息
    app_name: str = "JeJe WebOS"
    app_version: str
    debug: bool = False
    
    # 数据库配置
    db_host: str = "localhost"
    db_port: int = 3306
    db_user: str = "root"
    db_password: str = ""
    db_name: str = "jeje_webos"
    db_time_zone: str = "+08:00"  # 数据库会话时区，使用东八区写入
    
    @property
    def db_url(self) -> str:
        encoded_user = quote_plus(self.db_user)
        encoded_pwd = quote_plus(self.db_password)
        return f"mysql+aiomysql://{encoded_user}:{encoded_pwd}@{self.db_host}:{self.db_port}/{self.db_name}"
    
    @property
    def db_url_sync(self) -> str:
        encoded_user = quote_plus(self.db_user)
        encoded_pwd = quote_plus(self.db_password)
        return f"mysql+pymysql://{encoded_user}:{encoded_pwd}@{self.db_host}:{self.db_port}/{self.db_name}"
    
    # MySQL二进制文件路径（可选，用于备份）
    mysql_bin_path: str = ""  # 例如: "C:/Program Files/MySQL/MySQL Server 8.0/bin"
    
    # Redis缓存配置
    redis_host: str = "localhost"
    redis_port: int = 6379
    redis_db: int = 0
    redis_password: Optional[str] = None
    
    @property
    def redis_url(self) -> str:
        if self.redis_password:
            # URL 编码密码中的特殊字符
            from urllib.parse import quote
            encoded_password = quote(self.redis_password, safe='')
            return f"redis://default:{encoded_password}@{self.redis_host}:{self.redis_port}/{self.redis_db}"
        return f"redis://{self.redis_host}:{self.redis_port}/{self.redis_db}"
    
    # JWT令牌配置
    jwt_secret: str = "your-secret-key-change-in-production"
    jwt_secret_old: Optional[str] = None  # 旧密钥（用于密钥轮换）
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60  # 1小时 (配合刷新令牌使用)
    
    @classmethod
    def check_production_security(cls, values):
        """检查生产环境安全配置"""
        # 注意: 在 Pydantic v2 中验证方式有所不同，这里假设是 compat 或 v1 风格，
        # 为了稳健性，我们在 __init__ 后或使用 property 检查，或者简单地在 main.py 启动时检查。
        # 这里仅修改默认值，安全检查建议放在 main.py 启动时统一处理，避免 Pydantic 版本兼容问题干扰。
        pass
    
    # JWT密钥自动轮换配置
    jwt_auto_rotate: bool = True  # 是否启用自动轮换
    jwt_rotate_interval_min: int = 25  # 轮换间隔最小值（天）
    jwt_rotate_interval_max: int = 35  # 轮换间隔最大值（天）
    jwt_rotate_check_hour: int = 2  # 每日检查时间（小时，0-23）
    jwt_rotate_check_minute: int = 0  # 每日检查时间（分钟，0-59）
    
    # 文件存储
    upload_dir: str = "storage/uploads"
    max_upload_size: int = 100 * 1024 * 1024  # 100MB
    
    # 模块配置
    modules_dir: str = "modules"
    
    # 审计日志配置
    audit_all_operations: bool = False  # 是否记录所有操作（包括 GET 请求）
    
    # CSRF 防护配置
    csrf_enabled: bool = False  # 是否启用 CSRF 防护（默认关闭，生产环境建议开启）
    
    # 速率限制配置
    rate_limit_enabled: bool = True  # 是否启用速率限制（开发环境可关闭）
    rate_limit_requests: int = 1000  # 默认请求数限制（每分钟）
    rate_limit_window: int = 60  # 时间窗口（秒）
    rate_limit_block_duration: int = 30  # 超限后封禁时间（秒），开发环境建议30秒，生产环境可设置为60-300秒
    rate_limit_enable_whitelist_localhost: bool = True  # 是否将本地IP加入白名单（开发环境推荐开启）
    
    # 默认管理员账户配置（首次启动时创建）
    admin_username: str = "admin"
    admin_password: str = "admin123"  # 首次启动后请立即修改
    admin_phone: str = "13800138000"  # 管理员手机号（必填）
    admin_nickname: str = "系统管理员"
    
    class Config:
        env_file = str(ENV_FILE)
        env_file_encoding = "utf-8"


_settings_instance: Optional[Settings] = None


def get_settings() -> Settings:
    """
    获取配置单例
    支持运行时重新加载（用于密钥轮换）
    """
    global _settings_instance
    if _settings_instance is None:
        _settings_instance = Settings()
        
        # 安全检查: 如果是生产环境且使用默认密钥，发出警告
        if not _settings_instance.debug and _settings_instance.jwt_secret == "your-secret-key-change-in-production":
            import logging
            logging.getLogger("core.config").warning(
                "🚨 [安全警告] 您正在生产环境模式下使用默认的 JWT_SECRET！"
                "请立即在 .env 文件中配置 JWT_SECRET。"
            )
    return _settings_instance


def reload_settings():
    """
    重新加载配置（用于密钥轮换等场景）
    仅重新加载配置，不清理已签发的Token
    """
    global _settings_instance
    _settings_instance = Settings()
    return _settings_instance

