"""
系统设置接口
仅管理员可修改
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.database import get_db
from core.security import get_current_user, TokenData, require_admin
from core.config import get_settings
from schemas import success
from schemas.system_setting import SystemSettingInfo, SystemSettingUpdate
from models import SystemSetting, SystemLog

router = APIRouter(prefix="/api/v1", tags=["系统设置"])

# 默认设置（当数据库未保存时使用）
def _default_settings():
    settings = get_settings()
    return SystemSettingInfo(
        theme_mode="dark",
        password_min_length=8,
        jwt_expire_minutes=settings.jwt_expire_minutes,
        login_fail_lock=5,
        jwt_rotate_enabled=settings.jwt_auto_rotate,
    )


async def _get_settings(db: AsyncSession) -> SystemSettingInfo:
    result = await db.execute(select(SystemSetting).where(SystemSetting.key == "system"))
    row = result.scalar_one_or_none()
    if not row:
        return _default_settings()
    value = row.value or {}
    return SystemSettingInfo(**{**_default_settings().model_dump(), **value})


@router.get("/system/settings")
async def get_system_settings(
    db: AsyncSession = Depends(get_db),
):
    """获取系统设置（公开，用于前端默认主题等）"""
    data = await _get_settings(db)
    return success(data.model_dump())


@router.put("/system/settings")
async def update_system_settings(
    data: SystemSettingUpdate,
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_admin())
):
    """更新系统设置（仅管理员）"""
    current = await _get_settings(db)
    new_data = current.model_dump()
    for k, v in data.model_dump(exclude_unset=True).items():
        new_data[k] = v
    
    result = await db.execute(select(SystemSetting).where(SystemSetting.key == "system"))
    row = result.scalar_one_or_none()
    if row:
        row.value = new_data
    else:
        row = SystemSetting(key="system", value=new_data)
        db.add(row)

    # 审计日志
    log = SystemLog(
        level="INFO",
        module="system",
        action="settings.update",
        message="系统设置已更新",
        user_id=user.user_id
    )
    db.add(log)
    
    await db.commit()
    return success(new_data, "更新成功")

