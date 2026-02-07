"""
pytest 测试配置入口
这个文件是 pytest 自动识别的入口点，用于在任何测试模块加载之前设置环境变量，
并从 tests/test_conftest.py 导入所有 fixtures。
"""

import os

# 在导入任何其他模块之前设置测试环境变量
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")
os.environ.setdefault("ENV", "test")

# 从 test_conftest.py 导入所有 fixtures
from tests.test_conftest import *
