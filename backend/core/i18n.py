"""
国际化支持
提供多语言翻译功能
"""

import json
import logging
from pathlib import Path
from typing import Dict, Optional
from functools import lru_cache

logger = logging.getLogger(__name__)

# 默认语言
DEFAULT_LANGUAGE = "zh_CN"

# 支持的语言
SUPPORTED_LANGUAGES = {
    "zh_CN": "简体中文",
    "zh_TW": "繁体中文",
    "en_US": "English",
    "es_ES": "Español"
}

# 语言包目录
LOCALES_DIR = Path(__file__).parent.parent / "locales"


class I18n:
    """国际化管理器"""
    
    def __init__(self):
        self._translations: Dict[str, Dict[str, str]] = {}
        self._current_language = DEFAULT_LANGUAGE
        self._load_translations()
    
    def _load_translations(self):
        """加载所有语言包"""
        if not LOCALES_DIR.exists():
            LOCALES_DIR.mkdir(parents=True, exist_ok=True)
            logger.warning(f"语言包目录不存在，已创建: {LOCALES_DIR}")
            return
        
        for lang_code in SUPPORTED_LANGUAGES.keys():
            lang_file = LOCALES_DIR / f"{lang_code}.json"
            if lang_file.exists():
                try:
                    with open(lang_file, "r", encoding="utf-8") as f:
                        self._translations[lang_code] = json.load(f)
                    logger.info(f"已加载语言包: {lang_code}")
                except Exception as e:
                    logger.error(f"加载语言包失败 {lang_code}: {e}")
            else:
                # 创建默认语言包文件
                self._create_default_locale(lang_code)
    
    def _create_default_locale(self, lang_code: str):
        """创建默认语言包"""
        default_translations = {
            "common": {
                "success": "成功",
                "error": "错误",
                "warning": "警告",
                "info": "信息",
                "confirm": "确认",
                "cancel": "取消",
                "save": "保存",
                "delete": "删除",
                "edit": "编辑",
                "create": "创建",
                "search": "搜索",
                "loading": "加载中...",
                "no_data": "暂无数据"
            },
            "auth": {
                "login_success": "登录成功",
                "login_failed": "登录失败",
                "logout_success": "登出成功",
                "unauthorized": "未授权",
                "forbidden": "无权限"
            },
            "user": {
                "user_created": "用户创建成功",
                "user_updated": "用户更新成功",
                "user_deleted": "用户删除成功"
            }
        }
        
        lang_file = LOCALES_DIR / f"{lang_code}.json"
        try:
            with open(lang_file, "w", encoding="utf-8") as f:
                json.dump(default_translations, f, ensure_ascii=False, indent=2)
            self._translations[lang_code] = default_translations
            logger.info(f"已创建默认语言包: {lang_code}")
        except Exception as e:
            logger.error(f"创建语言包失败 {lang_code}: {e}")
    
    def set_language(self, lang_code: str):
        """设置当前语言"""
        if lang_code in SUPPORTED_LANGUAGES:
            self._current_language = lang_code
        else:
            logger.warning(f"不支持的语言代码: {lang_code}，使用默认语言")
            self._current_language = DEFAULT_LANGUAGE
    
    def get_language(self) -> str:
        """获取当前语言"""
        return self._current_language
    
    def translate(self, key: str, lang_code: Optional[str] = None, default: Optional[str] = None) -> str:
        """
        翻译文本
        
        Args:
            key: 翻译键（格式: category.key 或 category.subcategory.key）
            lang_code: 语言代码（可选，默认使用当前语言）
            default: 默认值（如果找不到翻译）
        
        Returns:
            翻译后的文本
        """
        lang = lang_code or self._current_language
        translations = self._translations.get(lang, {})
        
        # 按点分割键
        keys = key.split(".")
        value = translations
        
        try:
            for k in keys:
                if isinstance(value, dict):
                    value = value.get(k)
                else:
                    break
            
            if value and isinstance(value, str):
                return value
        except Exception:
            pass
        
        # 如果找不到翻译，尝试使用默认语言
        if lang != DEFAULT_LANGUAGE:
            return self.translate(key, DEFAULT_LANGUAGE, default)
        
        # 如果还是找不到，返回默认值或键本身
        return default or key
    
    def t(self, key: str, **kwargs) -> str:
        """
        翻译文本（便捷方法）
        支持参数替换，使用 {key} 格式
        
        Args:
            key: 翻译键
            **kwargs: 替换参数
        
        Returns:
            翻译后的文本
        """
        text = self.translate(key)
        if kwargs:
            try:
                return text.format(**kwargs)
            except Exception:
                return text
        return text
    
    def get_supported_languages(self) -> Dict[str, str]:
        """获取支持的语言列表"""
        return SUPPORTED_LANGUAGES.copy()


# 全局国际化实例
_i18n: Optional[I18n] = None


def get_i18n() -> I18n:
    """获取国际化实例"""
    global _i18n
    if _i18n is None:
        _i18n = I18n()
    return _i18n


# 便捷函数
def t(key: str, lang_code: Optional[str] = None, **kwargs) -> str:
    """翻译文本（全局便捷函数）"""
    return get_i18n().t(key, **kwargs) if not lang_code else get_i18n().translate(key, lang_code)



