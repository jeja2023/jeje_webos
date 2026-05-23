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
import tempfile
from contextlib import contextmanager
from typing import Dict, List, Optional, Any, Callable, Awaitable
from dataclasses import dataclass, field
from pathlib import Path
from datetime import datetime

from fastapi import FastAPI, APIRouter

from .config import get_settings
from .events import event_bus, Events, Event
from utils.timezone import get_beijing_time

logger = logging.getLogger(__name__)
settings = get_settings()

CORE_MODULES = [
    "system", "user", "auth", "boot", "roles",
    "audit", "backup", "monitor", "notification", "announcement",
    "storage", "websocket", "import_export"
]


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
    loaded_at: datetime = field(default_factory=get_beijing_time)
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
    
    def __init__(
        self, 
        app: Optional[FastAPI] = None, 
        modules_dir: Optional[str] = None,
        state_file: Optional[str] = None
    ):
        self.app = app
        self.modules: Dict[str, LoadedModule] = {}
        # 允许显式指定目录，否则使用配置
        if modules_dir:
            self.modules_path = Path(modules_dir)
        else:
            self.modules_path = Path(_backend_path) / settings.modules_dir
            
        # 允许显式指定状态文件
        if state_file:
            self._state_file = Path(state_file)
        else:
            self._state_file = Path(_backend_path) / "state" / "module_states.json"
            
        self._states: Dict[str, ModuleState] = {}
        self._manifest_cache: Dict[str, ModuleManifest] = {}
        self._atomic_write_warned = False
        self._state_save_depth = 0
        self._state_save_pending = False
        # 加载持久化状态
        self._load_states()
    
    def _load_states(self):
        """加载模块状态（容错：JSON损坏时不影响系统启动）"""
        if self._state_file.exists():
            try:
                with open(self._state_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    for module_id, state_data in data.items():
                        try:
                            state_data["installed_at"] = datetime.fromisoformat(state_data["installed_at"])
                            if state_data.get("last_enabled_at"):
                                state_data["last_enabled_at"] = datetime.fromisoformat(state_data["last_enabled_at"])
                            self._states[module_id] = ModuleState(**state_data)
                        except (KeyError, ValueError, TypeError) as e:
                            logger.warning(f"跳过损坏的模块状态 {module_id}: {e}")
                            continue
                logger.debug(f"加载模块状态: {len(self._states)} 个")
            except json.JSONDecodeError as e:
                logger.error(f"模块状态文件 JSON 格式损坏，将重新初始化: {e}")
                self._states = {}
                # 备份损坏的文件
                try:
                    backup_path = self._state_file.with_suffix('.json.bak')
                    import shutil
                    shutil.copy2(self._state_file, backup_path)
                    logger.info(f"已备份损坏的状态文件到: {backup_path}")
                except Exception:
                    pass
            except Exception as e:
                logger.warning(f"加载模块状态失败: {e}")
    
    def _write_states_now(self):
        """保存模块状态"""
        def _write_direct(data: dict):
            with open(self._state_file, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)

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
            fd, tmp_name = tempfile.mkstemp(
                prefix=f"{self._state_file.name}.",
                suffix=".tmp",
                dir=str(self._state_file.parent)
            )
            try:
                with os.fdopen(fd, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
                    f.flush()
                    os.fsync(f.fileno())
                os.replace(tmp_name, self._state_file)
            except OSError as e:
                # Windows/NAS 环境下临时文件替换偶尔会被实时扫描或文件锁拦截。
                # 回退到原有直接写入策略，避免模块状态无法保存。
                if not self._atomic_write_warned:
                    logger.warning(f"模块状态原子写入失败，回退到直接写入: {e}")
                    self._atomic_write_warned = True
                else:
                    logger.debug(f"模块状态原子写入失败，继续使用直接写入: {e}")
                _write_direct(data)
            finally:
                try:
                    if os.path.exists(tmp_name):
                        os.unlink(tmp_name)
                except OSError:
                    pass
        except Exception as e:
            logger.error(f"保存模块状态失败: {e}")
    
    def _save_states(self):
        """Save module states, deferring disk writes inside batch contexts."""
        if self._state_save_depth > 0:
            self._state_save_pending = True
            return
        self._write_states_now()

    @contextmanager
    def batch_state_writes(self):
        """Batch module state writes during bulk operations."""
        self._state_save_depth += 1
        try:
            yield
        finally:
            self._state_save_depth -= 1
            if self._state_save_depth == 0 and self._state_save_pending:
                self._state_save_pending = False
                self._write_states_now()

    @staticmethod
    def _is_version_newer(new_version: str, old_version: str) -> bool:
        """
        语义化版本比较：判断 new_version 是否比 old_version 更新
        支持 "1.2.3" 格式，避免字符串比较导致 "1.10" < "1.2" 的问题
        """
        if new_version == old_version:
            return False
        try:
            new_parts = [int(x) for x in new_version.split('.')]
            old_parts = [int(x) for x in old_version.split('.')]
            # 补齐长度
            max_len = max(len(new_parts), len(old_parts))
            new_parts.extend([0] * (max_len - len(new_parts)))
            old_parts.extend([0] * (max_len - len(old_parts)))
            return new_parts > old_parts
        except (ValueError, AttributeError):
            # 无法解析时降级为字符串比较
            return new_version != old_version
    
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
    
    def _import_module(self, module_name: str, file_path: Path) -> Optional[Any]:
        """安全导入模块（优先使用标准导入，失败则回退到路径加载）"""
        try:
            # 尝试标准导入（如果已在 sys.path 中）
            return importlib.import_module(module_name)
        except ImportError:
            # 如果标准导入失败，尝试从文件路径加载
            if not file_path.exists():
                return None
            try:
                spec = importlib.util.spec_from_file_location(module_name, file_path)
                if spec and spec.loader:
                    module = importlib.util.module_from_spec(spec)
                    sys.modules[module_name] = module
                    spec.loader.exec_module(module)
                    return module
            except Exception as e:
                # 清理 sys.modules 中的残留部分初始化模块，避免后续 import 拿到损坏对象
                sys.modules.pop(module_name, None)
                logger.error(f"路径加载模块失败 {module_name} ({file_path}): {e}")
                return None
        return None

    def load_manifest(self, module_id: str) -> Optional[ModuleManifest]:
        """加载模块清单"""
        if module_id in self._manifest_cache:
            return self._manifest_cache[module_id]

        module_path = self.modules_path / module_id
        # 按命名规范，清单文件为 {module_id}_manifest.py
        manifest_file = module_path / f"{module_id}_manifest.py"
        module_name = f"modules.{module_id}.{module_id}_manifest"
        
        module = self._import_module(module_name, manifest_file)
        if not module:
            return None
        
        if hasattr(module, "manifest"):
            manifest = module.manifest
            # 自动发现前端资源
            self._discover_assets(module_id, manifest)
            self._manifest_cache[module_id] = manifest
            return manifest
        else:
            logger.error(f"清单文件缺少manifest对象: {module_id}")
        return None

    def clear_manifest_cache(self, module_id: Optional[str] = None):
        """清理 manifest 缓存，用于安装、卸载或开发态热更新后重新读取清单。"""
        if module_id:
            self._manifest_cache.pop(module_id, None)
        else:
            self._manifest_cache.clear()
    
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
        
        # 拓扑排序（使用 deque 提升 popleft 性能 O(1) vs list.pop(0) O(n)）
        from collections import deque
        sorted_ids = []
        queue = deque(mid for mid in in_degree if in_degree[mid] == 0)
        
        while queue:
            mid = queue.popleft()
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
    
    def load_module(self, module_id: str, install: bool = False) -> bool:
        """加载单个模块"""
        if module_id in self.modules:
            logger.warning(f"模块已加载: {module_id}")
            return True
        
        module_path = self.modules_path / module_id
        
        # 1. 加载清单
        manifest = self.load_manifest(module_id)
        if not manifest:
            return False
        
        # 预检查安装状态
        state = self._states.get(module_id)
        is_new_install = state is None
        
        if is_new_install and not install and module_id not in CORE_MODULES and not manifest.enabled:
            return False

        # 优先使用持久化状态中的启用配置
        is_enabled = manifest.enabled
        if state:
            is_enabled = state.enabled
            
        if not is_enabled and not install:
            logger.debug(f"模块已禁用: {module_id}")
            return False
        
        # 2. 检查依赖
        satisfied, missing = self._check_dependencies(manifest)
        if not satisfied:
            logger.error(f"模块 {module_id} 依赖未满足，缺失: {missing}")
            return False
        
        # 3. 加载模型（确保数据库表能被创建）
        # 按命名规范，模型文件为 {module_id}_models.py
        models_file = module_path / f"{module_id}_models.py"
        models_module_name = f"modules.{module_id}.{module_id}_models"
        if self._import_module(models_module_name, models_file):
            logger.debug(f"加载模型成功: {module_id}")
        
        # 4. 加载路由
        # 按命名规范，路由文件为 {module_id}_router.py
        router_file = module_path / f"{module_id}_router.py"
        router_module_name = f"modules.{module_id}.{module_id}_router"
        router_module = self._import_module(router_module_name, router_file)
        
        if router_module and hasattr(router_module, "router"):
            manifest.router = router_module.router
            
            # 注册路由到FastAPI
            prefix = manifest.router_prefix or f"/api/v1/{module_id}"
            if not self.app:
                logger.error(f"无法注册模块 {module_id} 路由: FastAPI app 未初始化")
                return False
            self.app.include_router(
                manifest.router,
                prefix=prefix,
                tags=[manifest.name]
            )
            logger.debug(f"注册路由成功: {prefix}")
        elif router_file.exists():
            logger.error(f"加载路由失败 {module_id}: 无法找到 router 对象")
            return False
        
        # 5. 确定是否首次安装或升级
        state = self._states.get(module_id)
        is_new_install = state is None
        is_upgrade = state and self._is_version_newer(manifest.version, state.version)
        
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
                enabled=manifest.enabled,
                installed_at=get_beijing_time(),
                last_enabled_at=get_beijing_time() if manifest.enabled else None
            )
        else:
            self._states[module_id].version = manifest.version
            self._states[module_id].enabled = True
            self._states[module_id].last_enabled_at = get_beijing_time()
        
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
        
        with self.batch_state_writes():
            for module_id in sorted_ids:
                results[module_id] = self.load_module(module_id)
        
        return results

    async def install_module(self, module_id: str) -> bool:
        """安装模块（默认不启用，不加载代码）"""
        # 只加载清单获取模块信息
        manifest = self.load_manifest(module_id)
        if not manifest:
            return False
        
        # 检查是否已安装
        if module_id in self._states:
            logger.warning(f"模块已安装: {module_id}")
            return True
        
        # 创建状态记录（默认不启用）
        self._states[module_id] = ModuleState(
            module_id=module_id,
            version=manifest.version,
            enabled=False,
            installed_at=get_beijing_time(),
            last_enabled_at=None
        )
        self._save_states()
        
        # 运行安装钩子
        if manifest.on_install:
            await self._call_lifecycle_hook(module_id, manifest.on_install, "on_install")
        
        logger.info(f"模块安装成功（未启用）: {module_id}")
        return True

    async def uninstall_module(self, module_id: str) -> bool:
        """卸载模块（删除状态）"""
        # 运行卸载钩子
        loaded = self.modules.get(module_id)
        if loaded and loaded.manifest.on_uninstall:
            await self._call_lifecycle_hook(module_id, loaded.manifest.on_uninstall, "on_uninstall")
        
        # 卸载内存
        await self.unload_module(module_id)
        
        # 删除状态
        if module_id in self._states:
            del self._states[module_id]
            self._save_states()
        return True

    def get_module_state(self, module_id: str) -> Optional[ModuleState]:
        return self._states.get(module_id)
    
    def set_module_enabled(self, module_id: str, enabled: bool):
        """设置模块启用状态并保存"""
        if module_id in self._states:
            self._states[module_id].enabled = enabled
            self._save_states()
    
    async def unload_module(self, module_id: str) -> bool:
        """卸载模块（从内存中移除，不执行 on_uninstall 永久性钩子）"""
        if module_id not in self.modules:
            return False
        
        loaded = self.modules[module_id]
        manifest = loaded.manifest
        
        # 调用禁用钩子（非永久性卸载钩子，防止 uninstall_module 重复调用 on_uninstall）
        if manifest.on_disable:
            await self._call_lifecycle_hook(
                module_id, manifest.on_disable, "on_disable"
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
