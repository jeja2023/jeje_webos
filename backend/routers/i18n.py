"""
国际化路由
提供语言切换和翻译查询
"""

from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.i18n import get_i18n, SUPPORTED_LANGUAGES
from core.security import get_current_user, TokenData
from core.database import get_db
from models.system import SystemSetting
from schemas.response import success

router = APIRouter(prefix="/api/v1/i18n", tags=["国际化"])


class LanguageSet(BaseModel):
    """设置语言请求"""
    language: str


@router.get("/languages")
async def get_languages(
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    获取支持的语言列表
    如果用户已设置语言偏好，则返回用户设置的语言
    """
    i18n = get_i18n()
    languages = i18n.get_supported_languages()
    
    # 尝试从用户设置中获取语言偏好
    setting_key = f"user_preferences_{current_user.user_id}"
    result = await db.execute(
        select(SystemSetting).where(SystemSetting.key == setting_key)
    )
    setting = result.scalar_one_or_none()
    
    current_language = i18n.get_language()
    if setting and setting.value and "language" in setting.value:
        current_language = setting.value["language"]
    
    return success({
        "languages": languages,
        "current": current_language,
        "default": "zh_CN"
    })


@router.get("/translate")
async def translate(
    key: str,
    lang: Optional[str] = None,
    current_user: TokenData = Depends(get_current_user)
):
    """
    获取翻译文本
    
    Args:
        key: 翻译键（格式: category.key）
        lang: 语言代码（可选）
    """
    i18n = get_i18n()
    text = i18n.translate(key, lang)
    
    return success({
        "key": key,
        "text": text,
        "language": lang or i18n.get_language()
    })


@router.post("/set-language")
async def set_language(
    data: LanguageSet,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    设置用户语言偏好
    保存到用户设置中
    """
    if data.language not in SUPPORTED_LANGUAGES:
        raise HTTPException(status_code=400, detail=f"不支持的语言: {data.language}")
    
    i18n = get_i18n()
    i18n.set_language(data.language)
    
    # 保存到用户设置中
    setting_key = f"user_preferences_{current_user.user_id}"
    result = await db.execute(
        select(SystemSetting).where(SystemSetting.key == setting_key)
    )
    setting = result.scalar_one_or_none()
    
    if setting:
        # 更新现有设置
        preferences = setting.value or {}
        preferences["language"] = data.language
        setting.value = preferences
    else:
        # 创建新设置
        setting = SystemSetting(
            key=setting_key,
            value={"language": data.language}
        )
        db.add(setting)
    
    await db.commit()
    
    return success({
        "language": data.language,
        "name": SUPPORTED_LANGUAGES[data.language]
    }, "语言已设置")





