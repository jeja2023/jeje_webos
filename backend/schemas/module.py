"""
模块数据验证
模块信息、开关等
"""

from typing import Optional, List, Dict, Any
from pydantic import BaseModel

from .auth import UserInfo


class ModuleInfo(BaseModel):
    """模块信息"""
    id: str
    name: str
    version: str
    description: str
    icon: str
    author: str
    enabled: bool
    router_prefix: str
    menu: Dict[str, Any]
    permissions: List[str]


class ModuleToggle(BaseModel):
    """模块开关"""
    enabled: bool


class BootData(BaseModel):
    """系统启动信息"""
    app_name: str
    version: str
    user: Optional[UserInfo] = None
    modules: List[ModuleInfo] = []
    menus: List[Dict[str, Any]] = []



