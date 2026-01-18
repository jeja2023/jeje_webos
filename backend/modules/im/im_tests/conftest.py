"""
im测试配置
使用pytest_plugins导入共享的测试fixtures
"""
import sys
import os
from pathlib import Path

# 添加backend目录到路径，以便导入tests.conftest
# 注意：路径深度可能因模块而异，这里使用寻找 backend 目录的通用邏輯
current_path = Path(__file__).resolve()
backend_path = None
for parent in current_path.parents:
    if parent.name == "backend":
        backend_path = parent
        break

if backend_path:
    sys.path.insert(0, str(backend_path))

# 使用pytest_plugins导入共享的fixtures

# Added by restore script

from tests.test_conftest import *
