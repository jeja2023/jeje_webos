# -*- coding: utf-8 -*-
"""
Markdown 模块测试配置
"""
import sys
from pathlib import Path

# 添加 backend 目录到路径，以便导入 tests.tests_conftest
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
