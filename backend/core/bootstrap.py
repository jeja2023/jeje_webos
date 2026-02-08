"""
系统引导初始化
首次启动时自动创建默认管理员账户
"""

import re
import logging
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from .database import async_session
from .config import get_settings
from .security import hash_password
from models import User, UserGroup, Role

logger = logging.getLogger(__name__)


async def init_admin_user():
    """
    初始化默认管理员账户
    仅在首次启动时创建，如果已存在管理员账户则跳过
    """
    settings = get_settings()
    
    # 清理密码字符串（移除可能的注释和空白字符）
    admin_password = settings.admin_password.strip()
    # 如果密码包含注释分隔符，只取第一部分
    if '#' in admin_password:
        admin_password = admin_password.split('#')[0].strip()
    
    # 验证密码长度（bcrypt 限制 72 字节）
    password_bytes = admin_password.encode('utf-8')
    if len(password_bytes) > 72:
        logger.warning(f"密码长度超过 72 字节，将被截断")
        admin_password = password_bytes[:72].decode('utf-8', errors='replace')
    
    # 验证密码不为空
    if not admin_password:
        logger.error("管理员密码不能为空")
        return {
            "created": False,
            "message": "管理员密码不能为空"
        }
    
    # 验证手机号格式
    admin_phone = settings.admin_phone.strip() if settings.admin_phone else ""
    if not admin_phone:
        logger.error("管理员手机号不能为空")
        return {
            "created": False,
            "message": "管理员手机号不能为空"
        }
    if not re.match(r'^1[3-9]\d{9}$', admin_phone):
        logger.error(f"管理员手机号格式不正确: {admin_phone}")
        return {
            "created": False,
            "message": "管理员手机号格式不正确，请使用11位有效手机号"
        }
    
    async with async_session() as db:
        try:
            # 优化：合并查询，一次性检查管理员、用户名和手机号
            from sqlalchemy import or_
            result = await db.execute(
                select(User).where(
                    or_(
                        User.role == "admin",
                        User.username == settings.admin_username,
                        User.phone == admin_phone
                    )
                )
            )
            existing_users = result.scalars().all()
            
            # 在内存中检查
            admin_exists = None
            username_exists = None
            phone_exists = None
            
            for user in existing_users:
                if user.role == "admin":
                    admin_exists = user
                if user.username == settings.admin_username:
                    username_exists = user
                if user.phone == admin_phone:
                    phone_exists = user
            
            if admin_exists:
                logger.debug(f"管理员账户已存在: {admin_exists.username}")
                return {
                    "created": False,
                    "message": f"管理员账户已存在: {admin_exists.username}"
                }
            
            if username_exists:
                logger.warning(f"用户名 '{settings.admin_username}' 已被使用，跳过创建默认管理员")
                return {
                    "created": False,
                    "message": f"用户名 '{settings.admin_username}' 已被使用"
                }
            
            if phone_exists:
                logger.warning(f"手机号 '{admin_phone}' 已被使用，跳过创建默认管理员")
                return {
                    "created": False,
                    "message": f"手机号 '{admin_phone}' 已被使用"
                }
            
            # 确保存在系统管理员用户组（admin）
            admin_res = await db.execute(select(UserGroup).where(UserGroup.name == "admin"))
            admin_group = admin_res.scalar_one_or_none()
            if not admin_group:
                admin_group = UserGroup(name="admin", permissions=["*"])
                db.add(admin_group)
                await db.flush()

            # 创建默认管理员账户（系统管理员）
            admin_user = User(
                username=settings.admin_username,
                password_hash=hash_password(admin_password),
                phone=admin_phone,
                nickname=settings.admin_nickname,
                role="admin",
                permissions=["*"],  # 系统管理员拥有所有权限
                role_ids=[admin_group.id],
                is_active=True
            )
            
            db.add(admin_user)
            try:
                await db.commit()
            except Exception as commit_error:
                await db.rollback()
                # 处理并发启动导致的唯一约束冲突
                error_str = str(commit_error)
                if "Duplicate" in error_str or "IntegrityError" in error_str or "1062" in error_str:
                    logger.info("管理员账户已存在（并发创建），跳过")
                    return {"created": False, "message": "管理员账户已存在（并发创建）"}
                raise
            await db.refresh(admin_user)
            
            logger.info(f"默认管理员账户创建成功: {settings.admin_username}")
            logger.warning(f"⚠️  默认密码: {admin_password}，请立即修改！")
            
            return {
                "created": True,
                "username": settings.admin_username,
                "password": admin_password,
                "message": f"默认管理员账户已创建: {settings.admin_username}"
            }
            
        except Exception as e:
            await db.rollback()
            logger.error(f"创建默认管理员账户失败: {e}", exc_info=True)
            raise


async def ensure_default_roles():
    """
    确保存在基础角色模板：
    - admin: ["*"]
    - user:  []（普通用户，按需分配权限）
    - guest: []（访客，默认用于新用户）
    """
    async with async_session() as db:
        try:
            existing = await db.execute(select(UserGroup))
            roles = {r.name: r for r in existing.scalars().all()}

            defaults = {
                "admin": ["*"],         # 系统管理员（超级管理员）
                "manager": ["*"],       # 业务管理员（业务全权，不含系统级操作）
                "user": [],
                "guest": []
            }
            changed = False
            for name, perms in defaults.items():
                if name in roles:
                    # 如果用户组已存在，检查 admin 和 manager 的权限是否为 ["*"]
                    existing_role = roles[name]
                    if name in ("admin", "manager") and existing_role.permissions != ["*"]:
                        existing_role.permissions = ["*"]
                        changed = True
                        logger.debug(f"更新用户组权限: {name} -> ['*']")
                    continue
                role = UserGroup(name=name, permissions=perms)
                db.add(role)
                changed = True
                logger.debug(f"创建默认角色模板: {name}")
            if changed:
                await db.commit()
        except Exception as e:
            await db.rollback()
            logger.error(f"初始化默认角色模板失败: {e}", exc_info=True)
            raise

