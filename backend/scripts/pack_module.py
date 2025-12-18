#!/usr/bin/env python
"""
模块打包脚本 (Module Packer)

用于将开发好的模块打包为 .jwapp 离线安装包。
使用方法：
    python scripts/pack_module.py <module_id> [output_dir]

示例：
    python scripts/pack_module.py todo ./dist
"""

import os
import sys
import shutil
import zipfile
import argparse
from pathlib import Path

# 添加 backend 目录到 sys.path
BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

try:
    from core.loader import ModuleManifest
except ImportError:
    # 如果运行环境问题导致导入失败，尝试简单路径猜测
    pass

def pack_module(module_id: str, output_dir: str = "dist"):
    """
    打包模块
    :param module_id: 模块ID
    :param output_dir: 输出目录
    """
    # 1. 检查模块是否存在
    module_path = BACKEND_DIR / "modules" / module_id
    if not module_path.exists():
        print(f"❌ 错误：模块 '{module_id}' 不存在 ({module_path})")
        return False
    
    # 2. 检查必需文件
    required_files = [
        "__init__.py",
        f"{module_id}_manifest.py",
        f"{module_id}_router.py",
    ]
    for f in required_files:
        if not (module_path / f).exists():
            print(f"❌ 错误：模块缺失关键文件: {f}")
            return False
            
    # 3. 准备输出目录
    out_path = Path(output_dir)
    if not out_path.is_absolute():
        out_path = BACKEND_DIR.parent / output_dir
    
    out_path.mkdir(exist_ok=True, parents=True)
    
    # 4. 创建压缩包
    file_name = f"{module_id}.jwapp"
    zip_path = out_path / file_name
    
    print(f"📦 正在打包: {module_id} ...")
    
    ignore_patterns = [
        "__pycache__", 
        "*.pyc", 
        ".DS_Store", 
        ".git",
        "tests",
        "test_*.py"
    ]
    
    try:
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            # 遍历模块目录
            for root, dirs, files in os.walk(module_path):
                # 过滤目录
                dirs[:] = [d for d in dirs if d not in ["__pycache__"]]
                
                for file in files:
                    if file.endswith(".pyc") or file == ".DS_Store":
                        continue
                        
                    file_path = Path(root) / file
                    # 计算在压缩包中的相对路径
                    # 结构应为:
                    # module_id/
                    #   manifest.py
                    #   ...
                    arcname = file_path.relative_to(module_path.parent)
                    zf.write(file_path, arcname)
                    
        print(f"✅ 打包成功！")
        print(f"📁 输出文件: {zip_path}")
        print(f"📏 文件大小: {zip_path.stat().st_size / 1024:.2f} KB")
        return True
        
    except Exception as e:
        print(f"❌ 打包失败: {e}")
        if zip_path.exists():
            os.remove(zip_path)
        return False

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="JeJe WebOS 模块打包工具")
    parser.add_argument("module_id", help="要打包的模块ID")
    parser.add_argument("output_dir", nargs="?", default="dist", help="输出目录 (默认为项目根目录/dist)")
    
    args = parser.parse_args()
    pack_module(args.module_id, args.output_dir)
