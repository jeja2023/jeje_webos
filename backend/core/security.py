"""
统一鉴权模块
提供JWT令牌生成、验证和密码处理功能
"""

from datetime import datetime, timedelta, timezone
from typing import Optional
import bcrypt
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from cachetools import TTLCache

from .config import get_settings

settings = get_settings()

# 动态配置: JWT 过期时间(允许在运行时更新)
_jwt_expire_minutes = settings.jwt_expire_minutes

def set_jwt_expire_minutes(minutes: int):
    """动态更新 JWT 过期时间"""
    global _jwt_expire_minutes
    _jwt_expire_minutes = minutes


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

# Bearer令牌认证，设置为 auto_error=False 以支持从 Query 参数中读取 token
security = HTTPBearer(auto_error=False)



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


def hash_password(password: str) -> str:
    """
    加密密码
    bcrypt 限制密码长度不超过 72 字节
    """
    # 确保密码是字符串
    if not isinstance(password, str):
        password = str(password)
    
    # bcrypt 限制：密码不能超过 72 字节
    password_bytes = password.encode('utf-8')[:72]
    
    # 直接使用 bcrypt 库（避免 passlib 兼容性问题）
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password_bytes, salt)
    return hashed.decode('utf-8')


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """验证密码"""
    # 确保密码是字符串
    if not isinstance(plain_password, str):
        plain_password = str(plain_password)
    
    # bcrypt 限制：密码不能超过 72 字节
    password_bytes = plain_password.encode('utf-8')[:72]
    hashed_bytes = hashed_password.encode('utf-8')
    
    try:
        return bcrypt.checkpw(password_bytes, hashed_bytes)
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
            # 访问令牌有效期：7天（或配置值）
            expire = datetime.now(timezone.utc) + timedelta(minutes=_jwt_expire_minutes)
    
    to_encode.update({
        "exp": expire,
        "type": token_type  # 标记令牌类型
    })
    
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def create_token_pair(data: TokenData) -> tuple[str, str]:
    """
    创建访问令牌和刷新令牌对
    
    Returns:
        (access_token, refresh_token)
    """
    # 访问令牌：较短有效期（默认7天，可配置）
    access_token = create_token(
        data,
        expires_delta=timedelta(minutes=_jwt_expire_minutes),
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
    def _decode(secret: str):
        payload = jwt.decode(token, secret, algorithms=[settings.jwt_algorithm])
        if expected_type and payload.get("type") != expected_type:
            raise JWTError("令牌类型不匹配")
        return TokenData(**payload)
    
    # 先尝试新密钥
    try:
        return _decode(settings.jwt_secret)
    except JWTError:
        if settings.jwt_secret_old:
            try:
                return _decode(settings.jwt_secret_old)
            except JWTError:
                return None
        return None


async def get_current_user(
    token: Optional[str] = Query(None),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> TokenData:
    """获取当前用户(实时从数据库同步最新权限和角色)"""
    jwt_token = None
    if credentials:
        jwt_token = credentials.credentials
    elif token:
        jwt_token = token
    
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
    
    # --- 实时权限同步逻辑 ---
    # 检查缓存是否存在
    cached_data = permission_cache.get(token_data.user_id)
    if cached_data:
        token_data.role = cached_data["role"]
        token_data.permissions = cached_data["permissions"]
        return token_data

    # 为了避免循环导入，在函数内部导入相关模型和数据库方法
    try:
        from core.database import async_session
        from models import User, UserGroup
        from sqlalchemy import select

        async with async_session() as db:
            result = await db.execute(select(User).where(User.id == token_data.user_id))
            user = result.scalar_one_or_none()
            if user and user.is_active:
                # 动态汇总权限: 直接权限 + 角色权限(实现即时同步)
                all_perms = list(user.permissions or [])
                if user.role_ids:
                    role_result = await db.execute(select(UserGroup).where(UserGroup.id.in_(user.role_ids)))
                    roles = role_result.scalars().all()
                    for r in roles:
                        if r.permissions:
                            all_perms.extend(r.permissions)
                
                # 更新 token_data 中的权限和角色(内存中更新, 不修改原始 JWT)
                token_data.permissions = list(set(all_perms))
                token_data.role = user.role

                # 写入缓存
                permission_cache[token_data.user_id] = {
                    "role": user.role,
                    "permissions": token_data.permissions
                }

            elif user and not user.is_active:
                raise HTTPException(status_code=401, detail="账户已被禁用")
    except ImportError:
        # 如果导入失败（通常只会发生在复杂的循环引用场景），回退到 JWT 自带的静态权限
        pass
    except Exception as e:
        # 其他数据库异常也回退，确保系统可用性，但打印日志
        import logging
        logging.getLogger(__name__).warning(f"获取实时权限失败，回退到令牌权限: {e}")
    
    return token_data


async def get_optional_user(
    token: Optional[str] = Query(None),
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Optional[TokenData]:
    """获取当前用户(可选, 实时同步最新权限)"""
    jwt_token = None
    if credentials:
        jwt_token = credentials.credentials
    elif token:
        jwt_token = token
    
    if not jwt_token:
        return None

    token_data = decode_token(jwt_token)
    if not token_data:
        return None
        
    # 同步最新权限逻辑（复用 get_current_user 思路，但不抛出 401/403）
    # 检查缓存
    cached_data = permission_cache.get(token_data.user_id)
    if cached_data:
        token_data.role = cached_data["role"]
        token_data.permissions = cached_data["permissions"]
        return token_data

    try:
        from core.database import async_session
        from models import User, UserGroup
        from sqlalchemy import select
        async with async_session() as db:
            result = await db.execute(select(User).where(User.id == token_data.user_id))
            user = result.scalar_one_or_none()
            if user and user.is_active:
                all_perms = list(user.permissions or [])
                if user.role_ids:
                    role_result = await db.execute(select(UserGroup).where(UserGroup.id.in_(user.role_ids)))
                    roles = role_result.scalars().all()
                    for r in roles:
                        if r.permissions:
                            all_perms.extend(r.permissions)
                token_data.permissions = list(set(all_perms))
                token_data.role = user.role
                
                # 写入缓存
                permission_cache[token_data.user_id] = {
                    "role": user.role,
                    "permissions": token_data.permissions
                }
    except:
        pass
        
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
        
        # 权限不足
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"缺少权限: {permission}"
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

def _get_fernet() -> Fernet:
    """
    根据 JWT_SECRET 生成 Fernet 实例
    确保相同的 JWT_SECRET 生成相同的加密密钥
    """
    # 1. 对 JWT_SECRET 进行哈希，得到 32 字节的摘要
    secret_bytes = settings.jwt_secret.encode('utf-8')
    key_hash = hashlib.sha256(secret_bytes).digest()
    
    # 2. 将哈希值进行 URL-safe Base64 编码，符合 Fernet 密钥要求
    fernet_key = base64.urlsafe_b64encode(key_hash)
    
    return Fernet(fernet_key)

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


