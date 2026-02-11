"""
统一鉴权模块
提供JWT令牌生成、验证和密码处理功能
"""

from datetime import datetime, timedelta, timezone
from typing import Optional
import bcrypt
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status, Query, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from cachetools import TTLCache

from .config import get_settings

# 注意: 不再使用模块级 settings 变量缓存，避免 reload_settings() 后引用旧对象
# 需要使用时通过 get_settings() 获取当前实例

def set_jwt_expire_minutes(minutes: int):
    """动态更新 JWT 过期时间（兼容接口，实际值从 settings 读取）"""
    # 现在 create_token/create_token_pair 每次调用 get_settings() 获取最新值
    # 此函数保留以兼容 system_settings 路由调用，不再需要手动同步
    pass


# 权限缓存配置
# - maxsize: 缓存容量上限(用户数量)
# - ttl: 缓存过期时间(秒), 在此时间内不会重新查询数据库
# 注意: 修改用户权限后应调用 invalidate_permission_cache() 立即生效
permission_cache = TTLCache(maxsize=2000, ttl=120)


def invalidate_permission_cache(user_id: int = None):
    """
    使权限缓存失效
    """
    if user_id is not None:
        permission_cache.pop(user_id, None)
    else:
        permission_cache.clear()

# Bearer令牌认证，设置为 auto_error=False 以支持从 Query 参数或 Cookie 中读取 token
security = HTTPBearer(auto_error=False)

# HttpOnly Cookie 下的 token 键名（与 config.auth_use_httponly_cookie 配合）
COOKIE_ACCESS_TOKEN = "access_token"
COOKIE_REFRESH_TOKEN = "refresh_token"


def _get_jwt_token_from_request(
    request: Request,
    token_query: Optional[str],
    credentials: Optional[HTTPAuthorizationCredentials],
) -> Optional[str]:
    """从请求中解析 JWT：优先 Cookie（HttpOnly 模式），其次 Authorization 头，最后 Query。"""
    s = get_settings()
    if s.auth_use_httponly_cookie:
        cookie_token = request.cookies.get(COOKIE_ACCESS_TOKEN)
        if cookie_token:
            return cookie_token
    if credentials:
        return credentials.credentials
    if token_query:
        return token_query
    return None



class TokenData(BaseModel):
    """令牌数据"""
    user_id: int
    username: str
    role: str = "user"
    permissions: list[str] = []


class TokenResponse(BaseModel):
    """令牌响应"""
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"
    expires_in: int
    refresh_expires_in: Optional[int] = None


def _prehash_password(password: str) -> bytes:
    """
    对密码进行 SHA-256 预哈希，解决 bcrypt 72 字节截断问题。
    这确保任意长度的密码都能完整参与哈希计算。
    """
    import hashlib
    # SHA-256 产生 64 字符的十六进制字符串（< 72 字节）
    return hashlib.sha256(password.encode('utf-8')).hexdigest().encode('utf-8')


def hash_password(password: str) -> str:
    """
    加密密码
    使用 SHA-256 预哈希 + bcrypt，避免 72 字节截断问题
    """
    # 确保密码是字符串
    if not isinstance(password, str):
        password = str(password)
    
    # 使用预哈希解决 bcrypt 72 字节限制
    password_bytes = _prehash_password(password)
    
    # 直接使用 bcrypt 库（避免 passlib 兼容性问题）
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码"""
    # 确保密码是字符串
    if not isinstance(plain_password, str):
        plain_password = str(plain_password)
    
    # 校验哈希格式（防止无效哈希导致 bcrypt崩溃）
    if not hashed_password or not hashed_password.startswith("$"):
        return False

    # 使用与 hash_password 相同的预哈希
    password_bytes = _prehash_password(plain_password)
    
    try:
        hashed_bytes = hashed_password.encode('utf-8')
        # 尝试新版验证（带预哈希）
        if bcrypt.checkpw(password_bytes, hashed_bytes):
            return True
    except Exception:
        pass

    # 如果新版验证失败（不匹配或异常），尝试旧版验证
    # 兼容旧版直接 bcrypt（无预哈希）的密码
    try:
        old_password_bytes = plain_password.encode('utf-8')[:72]
        # 再次检查哈希格式
        if not hashed_password or not hashed_password.startswith("$"):
            return False
        hashed_bytes = hashed_password.encode('utf-8')
        return bcrypt.checkpw(old_password_bytes, hashed_bytes)
    except Exception:
        return False


def create_token(data: TokenData, expires_delta: Optional[timedelta] = None, token_type: str = "access") -> str:
    """
    创建JWT令牌
    
    Args:
        data: 令牌数据
        expires_delta: 过期时间增量
        token_type: 令牌类型(access 或 refresh)
    """
    to_encode = data.model_dump()
    
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        if token_type == "refresh":
            # 刷新令牌有效期：30天
            expire = datetime.now(timezone.utc) + timedelta(days=30)
        else:
            # 访问令牌有效期（或配置值）
            expire = datetime.now(timezone.utc) + timedelta(minutes=get_settings().jwt_expire_minutes)
    
    to_encode.update({
        "exp": expire,
        "type": token_type  # 标记令牌类型
    })
    
    _s = get_settings()
    return jwt.encode(to_encode, _s.jwt_secret, algorithm=_s.jwt_algorithm)


def create_token_pair(data: TokenData) -> tuple[str, str]:
    """
    创建访问令牌和刷新令牌对
    
    Returns:
        (access_token, refresh_token)
    """
    # 访问令牌：较短有效期（可配置）
    access_token = create_token(
        data,
        expires_delta=timedelta(minutes=get_settings().jwt_expire_minutes),
        token_type="access"
    )
    
    # 刷新令牌：较长有效期（30天）
    refresh_token = create_token(
        data,
        expires_delta=timedelta(days=30),
        token_type="refresh"
    )
    
    return access_token, refresh_token


def decode_token(token: str, expected_type: Optional[str] = None) -> Optional[TokenData]:
    """
    解码JWT令牌
    支持密钥轮换: 先尝试新密钥, 失败则尝试旧密钥
    
    Args:
        token: 待解码的JWT
        expected_type: 期望的令牌类型("access"/"refresh"), 不匹配则返回None
    """
    _s = get_settings()
    
    def _decode(secret: str):
        payload = jwt.decode(token, secret, algorithms=[_s.jwt_algorithm])
        if expected_type and payload.get("type") != expected_type:
            raise JWTError("令牌类型不匹配")
        return TokenData(**payload)
    
    # 先尝试新密钥
    try:
        return _decode(_s.jwt_secret)
    except JWTError:
        if _s.jwt_secret_old:
            try:
                return _decode(_s.jwt_secret_old)
            except JWTError:
                return None
        return None


async def resolve_permissions(db: "AsyncSession", permissions: Optional[list[str]], role_ids: Optional[list[int]]) -> list[str]:
    """汇总直接权限与角色权限（去重）"""
    try:
        from models import UserGroup
        from sqlalchemy import select
    except ImportError:
        return list(set(permissions or []))

    all_perms = list(permissions or [])
    if role_ids:
        role_result = await db.execute(
            select(UserGroup.permissions).where(UserGroup.id.in_(role_ids))
        )
        for (p,) in role_result.all():
            if p:
                all_perms.extend(p)
    return list(set(all_perms))


def compress_permissions(permissions: list[str]) -> list[str]:
    """
    压缩权限列表，移除通配符已覆盖的细粒度权限
    
    用于减少 JWT token 体积，防止 Set-Cookie 头超过 nginx 代理缓冲区限制。
    例如：["notes.*", "notes.read", "notes.create", "blog.*", "blog.read"]
    压缩为：["notes.*", "blog.*"]
    
    注意：仅用于 JWT token 内的权限存储，前端 UI 展示仍使用完整权限列表。
    后端每次请求时会通过 _sync_user_permissions 从数据库实时加载完整权限。
    """
    if not permissions:
        return []
    
    # 全局通配符，直接返回
    if "*" in permissions:
        return ["*"]
    
    # 收集所有通配符覆盖的模块（如 "notes.*" → "notes"）
    wildcard_modules = set()
    for p in permissions:
        if p.endswith(".*"):
            wildcard_modules.add(p[:-2])
    
    # 过滤掉被通配符覆盖的细粒度权限
    compressed = []
    seen = set()
    for p in permissions:
        # 跳过重复
        if p in seen:
            continue
        seen.add(p)
        
        # 如果是细粒度权限（如 "notes.read"），检查是否被通配符覆盖
        if "." in p and not p.endswith(".*"):
            module = p.split(".")[0]
            if module in wildcard_modules:
                continue  # 已被 module.* 覆盖，跳过
        
        compressed.append(p)
    
    return compressed


async def _sync_user_permissions(token_data: TokenData, raise_on_error: bool = True) -> TokenData:
    """
    共享的权限同步逻辑：从数据库实时加载用户最新权限和角色
    去重 get_current_user 和 get_optional_user 中的重复代码
    
    Args:
        token_data: 已解码的 JWT 令牌数据
        raise_on_error: 出错时是否抛出异常（get_current_user=True, get_optional_user=False）
    """
    # 检查缓存是否存在
    cached_data = permission_cache.get(token_data.user_id)
    if cached_data:
        token_data.role = cached_data["role"]
        token_data.permissions = cached_data["permissions"]
        return token_data

    try:
        from core.database import async_session
        from models import User
        from sqlalchemy import select

        async with async_session() as db:
            result = await db.execute(select(User).where(User.id == token_data.user_id))
            user = result.scalar_one_or_none()
            if user and user.is_active:
                # 动态汇总权限: 直接权限 + 角色权限(实现即时同步)
                token_data.permissions = await resolve_permissions(db, user.permissions, user.role_ids)
                token_data.role = user.role

                permission_cache[token_data.user_id] = {
                    "role": user.role,
                    "permissions": token_data.permissions
                }
            elif user and not user.is_active:
                if raise_on_error:
                    raise HTTPException(status_code=401, detail="账户已被禁用")
    except ImportError:
        import logging
        logging.getLogger(__name__).warning("权限模块导入失败，使用 JWT 静态权限（功能受限）")
    except HTTPException:
        raise
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"获取实时权限失败: {e}")
        if raise_on_error:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="权限服务暂时不可用，请稍后重试"
            )
    
    return token_data


async def get_current_user(
    request: Request,
    token: Optional[str] = Query(None),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> TokenData:
    """获取当前用户(实时从数据库同步最新权限和角色)；支持 HttpOnly Cookie / Authorization / Query"""
    jwt_token = _get_jwt_token_from_request(request, token, credentials)

    if not jwt_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的认证凭证",
            headers={"WWW-Authenticate": "Bearer"}
        )

    token_data = decode_token(jwt_token)
    if token_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的认证凭据",
            headers={"WWW-Authenticate": "Bearer"}
        )
    
    # 使用共享的权限同步逻辑
    await _sync_user_permissions(token_data, raise_on_error=True)
    return token_data


async def get_optional_user(
    request: Request,
    token: Optional[str] = Query(None),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Optional[TokenData]:
    """获取当前用户(可选, 实时同步最新权限)；支持 HttpOnly Cookie / Authorization / Query"""
    jwt_token = _get_jwt_token_from_request(request, token, credentials)

    if not jwt_token:
        return None

    token_data = decode_token(jwt_token)
    if not token_data:
        return None
        
    # 同步最新权限（复用共享逻辑，不抛出异常）
    await _sync_user_permissions(token_data, raise_on_error=False)
    return token_data


def require_permission(permission: str):
    """
    权限检查装饰器工厂, 支持通配符匹配
    
    权限检查规则:
    1. role="admin" 的用户自动拥有所有权限(即使 permissions 被收紧)
    2. role="manager" 的用户根据 permissions 字段判断(可被收紧权限)
    3. 其他用户根据 permissions 字段判断
    
    权限格式支持:
    - "*" : 所有权限
    - "module.*" : 模块所有权限
    - "module.action" : 具体操作权限
    - "module.submodule.*" : 多层通配符
    """
    async def permission_checker(user: TokenData = Depends(get_current_user)) -> TokenData:
        # 系统管理员(role="admin")自动拥有所有权限
        # 即使 permissions 被收紧, admin 角色仍然拥有所有权限
        if user.role == "admin":
            return user
        
        # 业务管理员（role="manager"）和其他用户根据 permissions 字段判断
        # 检查精确匹配
        if permission in user.permissions:
            return user
        
        # 检查通配符匹配
        # 1. 如果用户有 "*" 权限，允许所有操作
        if "*" in user.permissions:
            return user
        
        # 2. 如果用户有 "module.*" 权限，允许该模块的所有操作
        if "." in permission:
            module = permission.split(".")[0]
            module_wildcard = f"{module}.*"
            if module_wildcard in user.permissions:
                return user
        
        # 3. 检查多层通配符(如 datalens.source.* 匹配 datalens.source.manage)
        parts = permission.split(".")
        for i in range(len(parts) - 1, 0, -1):
            wildcard = ".".join(parts[:i]) + ".*"
            if wildcard in user.permissions:
                return user
        
        # 权限不足（不泄露具体权限名称）
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="权限不足，无法执行此操作"
        )
    return permission_checker


def require_admin():
    """
    仅允许系统管理员访问(role=admin)
    
    说明:
    - admin: 系统管理员, 拥有所有系统级权限, 权限不可被收紧
    - manager: 业务管理员, 拥有业务权限, 但权限可以被收紧
    """
    async def admin_checker(user: TokenData = Depends(get_current_user)) -> TokenData:
        if user.role != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="仅系统管理员可执行此操作"
            )
        return user
    return admin_checker


def require_manager():
    """
    允许业务管理员及以上访问(role=manager 或 admin)
    
    说明:
    - admin: 系统管理员, 拥有所有权限
    - manager: 业务管理员, 拥有业务权限(可被收紧)
    - 两者的区别: admin 可以执行系统级操作(如用户管理, 系统设置), manager 只能执行业务操作
    """
    async def manager_checker(user: TokenData = Depends(get_current_user)) -> TokenData:
        if user.role not in ("manager", "admin"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="仅管理员可执行此操作"
            )
        return user
    return manager_checker


# ==================== 数据加密工具 ====================
import base64
import hashlib
from cryptography.fernet import Fernet

_fernet_instance: Optional[Fernet] = None
_fernet_secret: Optional[str] = None

def _get_fernet() -> Fernet:
    """
    根据 JWT_SECRET 生成 Fernet 实例（带缓存，避免重复创建）
    确保相同的 JWT_SECRET 生成相同的加密密钥
    """
    global _fernet_instance, _fernet_secret
    current_secret = get_settings().jwt_secret
    
    # 缓存：仅在 secret 变化时重建
    if _fernet_instance is not None and _fernet_secret == current_secret:
        return _fernet_instance
    
    # 1. 对 JWT_SECRET 进行哈希，得到 32 字节的摘要
    secret_bytes = current_secret.encode('utf-8')
    key_hash = hashlib.sha256(secret_bytes).digest()
    
    # 2. 将哈希值进行 URL-safe Base64 编码，符合 Fernet 密钥要求
    fernet_key = base64.urlsafe_b64encode(key_hash)
    
    _fernet_instance = Fernet(fernet_key)
    _fernet_secret = current_secret
    return _fernet_instance

def encrypt_data(data: str) -> str:
    """加密字符串数据"""
    if not data:
        return ""
    f = _get_fernet()
    return f.encrypt(data.encode('utf-8')).decode('utf-8')

def decrypt_data(encrypted_data: str) -> Optional[str]:
    """解密字符串数据"""
    if not encrypted_data:
        return None
    try:
        f = _get_fernet()
        return f.decrypt(encrypted_data.encode('utf-8')).decode('utf-8')
    except Exception:
        # 解密失败（如密钥变更或数据损坏）返回 None
        return None


