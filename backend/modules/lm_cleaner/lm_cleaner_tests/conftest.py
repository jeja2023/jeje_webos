"""
LM Cleaner 模块测试配置
"""
import sys
from pathlib import Path

# 添加 backend 目录到路径，以便导入核心组件
backend_dir = Path(__file__).parent.parent.parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# 导入共享的测试 fixtures
from tests.test_conftest import *
