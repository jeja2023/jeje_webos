"""
统一鉴权模块
提供JWT令牌生成、验证和密码处理功能
"""

from datetime import datetime, timedelta, timezone
from typing import Optional
import bcrypt
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

from .config import get_settings

settings = get_settings()

# Bearer令牌认证
security = HTTPBearer()


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
        token_type: 令牌类型（access 或 refresh）
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
            expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    
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
        expires_delta=timedelta(minutes=settings.jwt_expire_minutes),
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
    支持密钥轮换：先尝试新密钥，失败则尝试旧密钥
    
    Args:
        token: 待解码的JWT
        expected_type: 期望的令牌类型（"access"/"refresh"），不匹配则返回None
    """
    def _decode(secret: str):
        payload = jwt.decode(token, secret, algorithms=[settings.jwt_algorithm])
        if expected_type and payload.get("type") != expected_type:
            raise JWTError("token type mismatch")
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
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> TokenData:
    """获取当前用户（依赖注入用）"""
    token = credentials.credentials
    token_data = decode_token(token)
    
    if token_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的认证凭据",
            headers={"WWW-Authenticate": "Bearer"}
        )
    
    return token_data


def require_permission(permission: str):
    """权限检查装饰器工厂"""
    async def permission_checker(user: TokenData = Depends(get_current_user)) -> TokenData:
        if permission not in user.permissions and user.role != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"缺少权限: {permission}"
            )
        return user
    return permission_checker


def require_admin():
    """仅允许系统管理员访问（role=admin）"""
    async def admin_checker(user: TokenData = Depends(get_current_user)) -> TokenData:
        if user.role != "admin":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="仅系统管理员可执行此操作"
            )
        return user
    return admin_checker


def require_manager():
    """允许业务管理员及以上访问（role=manager 或 admin）"""
    async def manager_checker(user: TokenData = Depends(get_current_user)) -> TokenData:
        if user.role not in ("manager", "admin"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="仅管理员可执行此操作"
            )
        return user
    return manager_checker

