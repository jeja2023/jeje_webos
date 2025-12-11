"""
模块加载器
负责扫描、校验、加载、卸载模块
这是微内核架构的核心组件

增强功能：
- 生命周期钩子（on_install, on_enable, on_disable, on_uninstall, on_upgrade）
- 模块依赖检查
- 前端资源自动注册
- 模块版本管理
"""

import importlib
import importlib.util
import sys
import os
import json
import logging
from typing import Dict, List, Optional, Any, Callable, Awaitable
from dataclasses import dataclass, field
from pathlib import Path
from datetime import datetime

from fastapi import FastAPI, APIRouter

from .config import get_settings
from .events import event_bus, Events, Event

logger = logging.getLogger(__name__)
settings = get_settings()

# 确保backend目录在sys.path中，以便模块可以导入core等包
_backend_path = str(Path(__file__).parent.parent.absolute())
if _backend_path not in sys.path:
    sys.path.insert(0, _backend_path)


# ==================== 生命周期钩子类型 ====================

# 异步钩子函数类型
LifecycleHook = Callable[[], Awaitable[None]]


@dataclass
class ModuleAssets:
    """模块前端资源配置"""
    css: List[str] = field(default_factory=list)  # CSS文件路径列表
    js: List[str] = field(default_factory=list)   # JS文件路径列表


@dataclass
class ModuleManifest:
    """模块清单协议（增强版）"""
    id: str                          # 唯一标识
    name: str                        # 显示名称
    version: str                     # 版本号
    description: str = ""            # 描述
    icon: str = "📦"                 # 图标
    author: str = ""                 # 作者
    
    # 路由配置
    router_prefix: str = ""          # 路由前缀，如 /api/v1/blog
    router: Optional[APIRouter] = None
    
    # 菜单配置
    menu: Dict[str, Any] = field(default_factory=dict)
    
    # 依赖声明
    kernel_version: str = ">=1.0.0"  # 内核版本要求
    dependencies: List[str] = field(default_factory=list)  # 依赖的其他模块ID
    
    # 权限声明
    permissions: List[str] = field(default_factory=list)
    
    # 前端资源
    assets: ModuleAssets = field(default_factory=ModuleAssets)
    
    # 状态
    enabled: bool = True
    
    # ==================== 生命周期钩子 ====================
    # 首次安装时执行（表创建后）
    on_install: Optional[LifecycleHook] = None
    # 模块启用时执行
    on_enable: Optional[LifecycleHook] = None
    # 模块禁用时执行
    on_disable: Optional[LifecycleHook] = None
    # 模块卸载时执行（表删除前）
    on_uninstall: Optional[LifecycleHook] = None
    # 版本升级时执行
    on_upgrade: Optional[LifecycleHook] = None


@dataclass
class LoadedModule:
    """已加载模块信息"""
    manifest: ModuleManifest
    path: Path
    module: Any  # 模块对象
    loaded_at: datetime = field(default_factory=datetime.utcnow)
    installed_version: Optional[str] = None  # 已安装的版本（用于升级检测）


@dataclass
class ModuleState:
    """模块状态（持久化存储）"""
    module_id: str
    version: str
    enabled: bool
    installed_at: datetime
    last_enabled_at: Optional[datetime] = None
    config: Dict[str, Any] = field(default_factory=dict)


class ModuleLoader:
    """
    模块加载器 - 生命周期管理器
    
    增强功能：
    - 依赖排序和检查
    - 生命周期钩子调用
    - 前端资源自动发现
    - 模块状态持久化
    """
    
    def __init__(self, app: FastAPI):
        self.app = app
        self.modules: Dict[str, LoadedModule] = {}
        # 使用绝对路径，确保模块目录相对于backend目录
        self.modules_path = Path(_backend_path) / settings.modules_dir
        # 模块状态文件
        self._state_file = Path(_backend_path) / "state" / "module_states.json"
        self._states: Dict[str, ModuleState] = {}
        # 加载持久化状态
        self._load_states()
    
    def _load_states(self):
        """加载模块状态"""
        if self._state_file.exists():
            try:
                with open(self._state_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for module_id, state_data in data.items():
                        state_data["installed_at"] = datetime.fromisoformat(state_data["installed_at"])
                        if state_data.get("last_enabled_at"):
                            state_data["last_enabled_at"] = datetime.fromisoformat(state_data["last_enabled_at"])
                        self._states[module_id] = ModuleState(**state_data)
                logger.debug(f"加载模块状态: {len(self._states)} 个")
            except Exception as e:
                logger.warning(f"加载模块状态失败: {e}")
    
    def _save_states(self):
        """保存模块状态"""
        try:
            # 确保目录存在
            self._state_file.parent.mkdir(parents=True, exist_ok=True)
            
            data = {}
            for module_id, state in self._states.items():
                data[module_id] = {
                    "module_id": state.module_id,
                    "version": state.version,
                    "enabled": state.enabled,
                    "installed_at": state.installed_at.isoformat(),
                    "last_enabled_at": state.last_enabled_at.isoformat() if state.last_enabled_at else None,
                    "config": state.config
                }
            
            with open(self._state_file, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            logger.error(f"保存模块状态失败: {e}")
    
    def scan_modules(self) -> List[str]:
        """扫描模块目录"""
        if not self.modules_path.exists():
            logger.warning(f"模块目录不存在: {self.modules_path}")
            return []
        
        module_ids = []
        for item in self.modules_path.iterdir():
            if item.is_dir() and not item.name.startswith("_"):
                # 按命名规范，清单文件为 {module_id}_manifest.py
                manifest_file = item / f"{item.name}_manifest.py"
                if manifest_file.exists():
                    module_ids.append(item.name)
                    logger.debug(f"发现模块: {item.name}")
        
        return module_ids
    
    def load_manifest(self, module_id: str) -> Optional[ModuleManifest]:
        """加载模块清单"""
        module_path = self.modules_path / module_id
        # 按命名规范，清单文件为 {module_id}_manifest.py
        manifest_file = module_path / f"{module_id}_manifest.py"
        
        if not manifest_file.exists():
            logger.error(f"清单文件不存在: {manifest_file}")
            return None
        
        try:
            spec = importlib.util.spec_from_file_location(
                f"modules.{module_id}.{module_id}_manifest",
                manifest_file
            )
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            
            if hasattr(module, "manifest"):
                manifest = module.manifest
                # 自动发现前端资源
                self._discover_assets(module_id, manifest)
                return manifest
            else:
                logger.error(f"清单文件缺少manifest对象: {module_id}")
                return None
                
        except Exception as e:
            logger.error(f"加载清单失败 {module_id}: {e}")
            return None
    
    def _discover_assets(self, module_id: str, manifest: ModuleManifest):
        """自动发现模块前端资源"""
        module_path = self.modules_path / module_id
        static_path = module_path / "static"
        
        if not static_path.exists():
            return
        
        css_files = []
        js_files = []
        
        # 扫描CSS文件
        css_path = static_path / "css"
        if css_path.exists():
            for f in css_path.glob("*.css"):
                css_files.append(f"/static/{module_id}/css/{f.name}")
        
        # 扫描JS文件
        js_path = static_path / "js"
        if js_path.exists():
            for f in js_path.glob("*.js"):
                js_files.append(f"/static/{module_id}/js/{f.name}")
        
        # 如果模块没有显式配置，则使用自动发现的资源
        if not manifest.assets.css:
            manifest.assets.css = css_files
        if not manifest.assets.js:
            manifest.assets.js = js_files
        
        if css_files or js_files:
            logger.debug(f"发现模块 {module_id} 前端资源: CSS={len(css_files)}, JS={len(js_files)}")
    
    def _check_dependencies(self, manifest: ModuleManifest) -> tuple[bool, List[str]]:
        """
        检查模块依赖
        
        Returns:
            (satisfied, missing): 是否满足依赖，缺失的模块列表
        """
        missing = []
        for dep in manifest.dependencies:
            if dep not in self.modules:
                missing.append(dep)
        
        return len(missing) == 0, missing
    
    def _sort_by_dependencies(self, module_ids: List[str]) -> List[str]:
        """
        按依赖关系排序模块
        使用拓扑排序确保依赖先加载
        """
        # 加载所有清单以获取依赖信息
        manifests = {}
        for module_id in module_ids:
            manifest = self.load_manifest(module_id)
            if manifest:
                manifests[module_id] = manifest
        
        # 构建依赖图
        in_degree = {mid: 0 for mid in manifests}
        dependents = {mid: [] for mid in manifests}
        
        for mid, manifest in manifests.items():
            for dep in manifest.dependencies:
                if dep in manifests:
                    in_degree[mid] += 1
                    dependents[dep].append(mid)
        
        # 拓扑排序
        sorted_ids = []
        queue = [mid for mid in in_degree if in_degree[mid] == 0]
        
        while queue:
            mid = queue.pop(0)
            sorted_ids.append(mid)
            
            for dependent in dependents[mid]:
                in_degree[dependent] -= 1
                if in_degree[dependent] == 0:
                    queue.append(dependent)
        
        # 检查循环依赖
        if len(sorted_ids) != len(manifests):
            # 有循环依赖，返回原始顺序并警告
            circular = [mid for mid in manifests if mid not in sorted_ids]
            logger.warning(f"检测到循环依赖，涉及模块: {circular}")
            return module_ids
        
        return sorted_ids
    
    async def _call_lifecycle_hook(
        self,
        module_id: str,
        hook: Optional[LifecycleHook],
        hook_name: str
    ):
        """调用生命周期钩子"""
        if hook is None:
            return
        
        try:
            logger.debug(f"调用模块 {module_id} 的 {hook_name} 钩子")
            await hook()
            logger.debug(f"模块 {module_id} 的 {hook_name} 钩子执行成功")
        except Exception as e:
            logger.error(f"模块 {module_id} 的 {hook_name} 钩子执行失败: {e}")
    
    def load_module(self, module_id: str) -> bool:
        """加载单个模块"""
        if module_id in self.modules:
            logger.warning(f"模块已加载: {module_id}")
            return True
        
        module_path = self.modules_path / module_id
        
        # 1. 加载清单
        manifest = self.load_manifest(module_id)
        if not manifest:
            return False
        
        if not manifest.enabled:
            logger.info(f"模块已禁用: {module_id}")
            return False
        
        # 2. 检查依赖
        satisfied, missing = self._check_dependencies(manifest)
        if not satisfied:
            logger.error(f"模块 {module_id} 依赖未满足，缺失: {missing}")
            return False
        
        # 3. 加载模型（确保数据库表能被创建）
        # 按命名规范，模型文件为 {module_id}_models.py
        models_file = module_path / f"{module_id}_models.py"
        if models_file.exists():
            try:
                spec = importlib.util.spec_from_file_location(
                    f"modules.{module_id}.{module_id}_models",
                    models_file
                )
                models_module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(models_module)
                logger.debug(f"加载模型: {module_id}")
            except Exception as e:
                logger.error(f"加载模型失败 {module_id}: {e}")
                # 模型加载失败不阻止模块加载，但记录警告
        
        # 4. 加载路由
        # 按命名规范，路由文件为 {module_id}_router.py
        router_file = module_path / f"{module_id}_router.py"
        if router_file.exists():
            try:
                spec = importlib.util.spec_from_file_location(
                    f"modules.{module_id}.{module_id}_router",
                    router_file
                )
                router_module = importlib.util.module_from_spec(spec)
                spec.loader.exec_module(router_module)
                
                if hasattr(router_module, "router"):
                    manifest.router = router_module.router
                    
                    # 注册路由到FastAPI
                    prefix = manifest.router_prefix or f"/api/v1/{module_id}"
                    self.app.include_router(
                        manifest.router,
                        prefix=prefix,
                        tags=[manifest.name]
                    )
                    logger.debug(f"注册路由: {prefix}")
                    
            except Exception as e:
                logger.error(f"加载路由失败 {module_id}: {e}")
                return False
        
        # 5. 确定是否首次安装或升级
        state = self._states.get(module_id)
        is_new_install = state is None
        is_upgrade = state and state.version != manifest.version
        
        # 6. 记录加载
        installed_version = state.version if state else None
        self.modules[module_id] = LoadedModule(
            manifest=manifest,
            path=module_path,
            module=None,
            installed_version=installed_version
        )
        
        # 7. 更新状态
        if is_new_install:
            self._states[module_id] = ModuleState(
                module_id=module_id,
                version=manifest.version,
                enabled=True,
                installed_at=datetime.utcnow(),
                last_enabled_at=datetime.utcnow()
            )
        else:
            self._states[module_id].version = manifest.version
            self._states[module_id].enabled = True
            self._states[module_id].last_enabled_at = datetime.utcnow()
        
        self._save_states()
        
        # 8. 发布加载事件
        event_bus.emit(Events.MODULE_LOADED, "kernel", {
            "module_id": module_id,
            "is_new_install": is_new_install,
            "is_upgrade": is_upgrade
        })
        logger.debug(f"模块加载成功: {manifest.name} v{manifest.version}")
        
        return True
    
    async def run_install_hooks(self):
        """
        运行安装钩子
        在数据库初始化后调用
        """
        for module_id, loaded in self.modules.items():
            manifest = loaded.manifest
            state = self._states.get(module_id)
            
            # 首次安装
            if state and state.installed_at == state.last_enabled_at:
                # 刚安装的模块
                if loaded.installed_version is None:
                    await self._call_lifecycle_hook(
                        module_id, manifest.on_install, "on_install"
                    )
            # 版本升级
            elif loaded.installed_version and loaded.installed_version != manifest.version:
                await self._call_lifecycle_hook(
                    module_id, manifest.on_upgrade, "on_upgrade"
                )
            
            # 启用钩子
            await self._call_lifecycle_hook(
                module_id, manifest.on_enable, "on_enable"
            )
    
    def load_all(self) -> Dict[str, bool]:
        """加载所有模块"""
        results = {}
        module_ids = self.scan_modules()
        
        # 按依赖排序
        sorted_ids = self._sort_by_dependencies(module_ids)
        
        for module_id in sorted_ids:
            results[module_id] = self.load_module(module_id)
        
        return results
    
    async def unload_module(self, module_id: str) -> bool:
        """卸载模块"""
        if module_id not in self.modules:
            return False
        
        loaded = self.modules[module_id]
        manifest = loaded.manifest
        
        # 调用卸载钩子
        await self._call_lifecycle_hook(
            module_id, manifest.on_uninstall, "on_uninstall"
        )
        
        # 发布卸载事件
        event_bus.emit(Events.MODULE_UNLOADED, "kernel", {"module_id": module_id})
        
        del self.modules[module_id]
        logger.info(f"模块已卸载: {module_id}")
        
        return True
    
    async def disable_module(self, module_id: str) -> bool:
        """禁用模块"""
        if module_id not in self.modules:
            return False
        
        loaded = self.modules[module_id]
        manifest = loaded.manifest
        
        # 调用禁用钩子
        await self._call_lifecycle_hook(
            module_id, manifest.on_disable, "on_disable"
        )
        
        # 更新状态
        if module_id in self._states:
            self._states[module_id].enabled = False
            self._save_states()
        
        logger.info(f"模块已禁用: {module_id}")
        return True
    
    def get_loaded_modules(self) -> List[ModuleManifest]:
        """获取所有已加载模块清单"""
        return [m.manifest for m in self.modules.values()]
    
    def get_module(self, module_id: str) -> Optional[LoadedModule]:
        """获取指定模块"""
        return self.modules.get(module_id)
    
    def get_module_info_for_frontend(self) -> List[dict]:
        """
        获取前端所需的模块信息
        包含菜单配置和资源路径
        """
        result = []
        for module_id, loaded in self.modules.items():
            manifest = loaded.manifest
            result.append({
                "id": manifest.id,
                "name": manifest.name,
                "version": manifest.version,
                "description": manifest.description,
                "icon": manifest.icon,
                "menu": manifest.menu,
                "permissions": manifest.permissions,
                "assets": {
                    "css": manifest.assets.css,
                    "js": manifest.assets.js
                }
            })
        return result
    
    def get_all_permissions(self) -> List[dict]:
        """获取所有模块声明的权限"""
        permissions = []
        for module_id, loaded in self.modules.items():
            manifest = loaded.manifest
            for perm in manifest.permissions:
                permissions.append({
                    "module_id": module_id,
                    "module_name": manifest.name,
                    "permission": perm
                })
        return permissions


# 全局加载器实例（在main.py中初始化）
module_loader: Optional[ModuleLoader] = None


def init_loader(app: FastAPI) -> ModuleLoader:
    """初始化模块加载器"""
    global module_loader
    module_loader = ModuleLoader(app)
    return module_loader


def get_module_loader() -> Optional[ModuleLoader]:
    """获取模块加载器实例"""
    return module_loader
