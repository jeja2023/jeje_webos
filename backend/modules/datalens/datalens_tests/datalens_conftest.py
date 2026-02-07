"""
数据透镜模块测试配置
使用 pytest_plugins 导入共享的测试 fixtures
"""
import sys
import os
from pathlib import Path

# 添加 backend 目录到路径，以便导入 tests.tests_conftest
# 注意：路径深度可能因模块而异，这里使用寻找 backend 目录的通用逻辑
current_path = Path(__file__).resolve()
backend_path = None
for parent in current_path.parents:
    if parent.name == "backend":
        backend_path = parent
        break

if backend_path:
    sys.path.insert(0, str(backend_path))

# 导入共享的 fixtures
# from tests.tests_conftest import *
