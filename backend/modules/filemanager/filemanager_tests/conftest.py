"""
文件管理模块测试配置
使用pytest_plugins导入共享的测试fixtures
"""
import sys
import os
from pathlib import Path

# 添加backend目录到路径，以便导入tests.conftest
backend_dir = Path(__file__).parent.parent.parent.parent
sys.path.insert(0, str(backend_dir))

# 使用pytest_plugins导入共享的fixtures


# Added by restore script

from tests.test_conftest import *
