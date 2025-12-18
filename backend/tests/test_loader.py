"""
模块加载器单元测试
测试模块扫描、清单加载和状态管理
"""

import json
import pytest
from pathlib import Path
from core.loader import ModuleLoader


class TestModuleLoader:
    """模块加载器测试"""

    def test_scan_modules_empty(self, tmp_path):
        """测试空目录扫描"""
        loader = ModuleLoader(modules_dir=str(tmp_path), state_file=str(tmp_path / "state.json"))
        loader.scan_modules()
        assert len(loader.modules) == 0

    @pytest.mark.asyncio
    async def test_load_valid_module(self, tmp_path):
        """测试加载合法模块"""
        mod_id = "test_loader_mod"
        mod_dir = tmp_path / mod_id
        mod_dir.mkdir()
        
        # 清单内容
        content = f"""
from core.loader import ModuleManifest
manifest = ModuleManifest(
    id="{mod_id}",
    name="Test Loader",
    version="1.0.0",
    author="Tester",
    description="desc",
    enabled=True,
    router_prefix="/api/v1/{mod_id}"
)
"""
        (mod_dir / f"{mod_id}_manifest.py").write_text(content, encoding="utf-8")
        (mod_dir / "__init__.py").write_text("")
        
        loader = ModuleLoader(modules_dir=str(tmp_path), state_file=str(tmp_path / "state.json"))
        loader.scan_modules()
        # 必须加载模块才会出现在 loader.modules 中
        loader.load_module(mod_id, install=True)
        
        assert mod_id in loader.modules
        assert loader.modules[mod_id].manifest.name == "Test Loader"

    def test_load_invalid_manifest(self, tmp_path):
        """测试加载配置错误（非法 Python）的模块"""
        mod_id = "invalid_mod"
        mod_dir = tmp_path / mod_id
        mod_dir.mkdir()
        (mod_dir / f"{mod_id}_manifest.py").write_text("invalid python code !!!", encoding="utf-8")
        
        loader = ModuleLoader(modules_dir=str(tmp_path), state_file=str(tmp_path / "state.json"))
        loader.scan_modules()
        # 非法清单不应被加载
        assert mod_id not in loader.modules

    async def test_module_state_management(self, tmp_path):
        """测试模块状态（启用/禁用）持久化"""
        mod_id = "state_mod"
        mod_dir = tmp_path / mod_id
        mod_dir.mkdir()
        
        content = f'from core.loader import ModuleManifest\nmanifest = ModuleManifest(id="{mod_id}", name="State Mod", version="1.0.0", enabled=True)'
        (mod_dir / f"{mod_id}_manifest.py").write_text(content, encoding="utf-8")
        (mod_dir / "__init__.py").write_text("")
        
        loader = ModuleLoader(modules_dir=str(tmp_path), state_file=str(tmp_path / "state.json"))
        loader.scan_modules()
        # 必须安装模块才会创建状态记录
        await loader.install_module(mod_id)
        
        # 初始应为禁用状态（新安装默认为 False）
        assert loader.get_module_state(mod_id).enabled is False
        
        # 启用模块
        loader.set_module_enabled(mod_id, True)
        assert loader.get_module_state(mod_id).enabled is True
        
        # 重新创建加载器，验证状态是否持久化
        loader2 = ModuleLoader(modules_dir=str(tmp_path), state_file=str(tmp_path / "state.json"))
        loader2.scan_modules()
        assert loader2.get_module_state(mod_id).enabled is True
