"""
系统配置管理
统一管理所有配置项，支持环境变量覆盖
"""

import os
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import Optional
from urllib.parse import quote_plus

# 获取backend目录的绝对路径
BACKEND_DIR = Path(__file__).parent.parent.resolve()
ENV_FILE = BACKEND_DIR / ".env"


class Settings(BaseSettings):
    """系统配置"""
    
    # 应用信息
    app_name: str = "JeJe WebOS"
    app_version: str = "2.5.32"
    debug: bool = False
    
    # 备案信息 (ICP/公安备案)
    icp_number: str = ""
    icp_link: str = "https://beian.miit.gov.cn/"
    psb_number: str = ""
    psb_link: str = ""
    
    # 数据库配置
    db_host: str = "localhost"
    db_port: int = 3306
    db_user: str = "root"
    db_password: str = ""
    db_name: str = "jeje_webos"
    db_time_zone: str = "+08:00"  # 数据库会话时区，使用东八区写入
    database_url: Optional[str] = None  # 允许直接提供完整连接串（环境变量 DATABASE_URL）
    
    # 数据库连接池配置
    db_pool_size: int = 10         # 基础连接池大小
    db_max_overflow: int = 20      # 最大溢出连接数
    db_pool_recycle: int = 3600    # 连接回收时间（秒）
    
    @property
    def db_url(self) -> str:
        if self.database_url:
            return self.database_url
        encoded_user = quote_plus(self.db_user)
        encoded_pwd = quote_plus(self.db_password)
        return f"mysql+aiomysql://{encoded_user}:{encoded_pwd}@{self.db_host}:{self.db_port}/{self.db_name}"
    
    @property
    def db_url_sync(self) -> str:
        if self.database_url:
            # 将异步驱动替换为同步驱动，保持与 db_url 一致
            return self.database_url.replace("aiomysql", "pymysql").replace("asyncpg", "psycopg2")
        encoded_user = quote_plus(self.db_user)
        encoded_pwd = quote_plus(self.db_password)
        return f"mysql+pymysql://{encoded_user}:{encoded_pwd}@{self.db_host}:{self.db_port}/{self.db_name}"
    
    # MySQL二进制文件路径（已废弃，不再使用）
    # 备份功能已改为使用纯 Python 方案（pymysql），无需配置此路径
    mysql_bin_path: str = ""  # 保留此字段以保持向后兼容
    
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
    
    # 生产环境安全检查由 get_settings() 在初始化后调用
    
    # JWT密钥自动轮换配置
    jwt_auto_rotate: bool = True  # 是否启用自动轮换
    jwt_rotate_interval_min: int = 25  # 轮换间隔最小值（天）
    jwt_rotate_interval_max: int = 35  # 轮换间隔最大值（天）
    jwt_rotate_check_hour: int = 2  # 每日检查时间（小时，0-23）
    jwt_rotate_check_minute: int = 0  # 每日检查时间（分钟，0-59）
    
    # 文件存储
    upload_dir: str = "storage"
    max_upload_size: int = 100 * 1024 * 1024  # 100MB
    
    # 模块配置
    modules_dir: str = "modules"
    
    # 审计日志配置
    audit_all_operations: bool = False  # 是否记录所有操作（包括 GET 请求）
    
    # CSRF 防护配置
    csrf_enabled: bool = True
    
    # 速率限制配置
    rate_limit_enabled: bool = True
    rate_limit_requests: int = 1000
    rate_limit_window: int = 60
    rate_limit_block_duration: int = 30
    rate_limit_enable_whitelist_localhost: bool = True
    
    # 默认管理员账户配置
    admin_username: str = "admin"
    admin_password: str = "admin123"
    admin_phone: str = "13800138000"
    admin_nickname: str = "系统管理员"

    # CORS 配置
    allow_origins: list[str] = ["*"]

    # 认证：是否使用 HttpOnly Cookie 存放 Token（防 XSS 窃取，需前端 credentials + 同源或正确 CORS）
    auth_use_httponly_cookie: bool = True

    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore"
    )


_settings_instance: Optional[Settings] = None


def get_settings() -> Settings:
    """
    获取配置单例
    支持运行时重新加载（用于密钥轮换）
    """
    global _settings_instance
    if _settings_instance is None:
        _settings_instance = Settings()
        
        import logging
        _logger = logging.getLogger("core.config")
        
        # 生产环境安全检查
        if not _settings_instance.debug:
            # P0: 默认 JWT Secret 必须修改
            if _settings_instance.jwt_secret == "your-secret-key-change-in-production":
                _logger.critical(
                    "🚨 [严重安全风险] 生产环境使用默认 JWT_SECRET！系统拒绝启动。"
                    "请立即在 .env 文件中配置一个安全的 JWT_SECRET（建议至少 32 位随机字符串）。"
                )
                raise SystemExit("安全错误: 生产环境禁止使用默认 JWT_SECRET，请在 .env 中配置")
            
            # P0: 默认管理员密码必须修改
            if _settings_instance.admin_password == "admin123":
                if not _settings_instance.debug:
                    _logger.critical(
                        "🚨 [严重安全风险] 生产环境使用默认管理员密码 'admin123'！"
                        "请立即在 .env 文件中修改 ADMIN_PASSWORD 为强密码。"
                    )
                else:
                    _logger.warning(
                        "⚠️ [安全警告] 管理员密码为默认值 'admin123'，"
                        "请在部署前修改 ADMIN_PASSWORD。"
                    )
            
            # CORS 配置检查
            if _settings_instance.allow_origins == ["*"]:
                _logger.warning(
                    "⚠️ [安全建议] 生产环境 CORS 为 allow_origins=['*']，"
                    "建议在 .env 中设置 ALLOW_ORIGINS 为具体前端域名列表。"
                )
        else:
            # debug 模式下仅警告
            if _settings_instance.jwt_secret == "your-secret-key-change-in-production":
                _logger.warning(
                    "⚠️ [调试模式] 使用默认 JWT_SECRET，请勿在生产环境中使用。"
                )
    return _settings_instance


def reload_settings():
    """
    重新加载配置（用于密钥轮换等场景）
    仅重新加载配置，不清理已签发的Token
    """
    global _settings_instance
    _settings_instance = None  # 先清空，让 get_settings() 重新走安全校验逻辑
    return get_settings()

