"""
系统监控工具
收集系统资源使用情况、性能指标
"""

import os
import sys
import platform
import psutil
import logging
from typing import Dict, Any
from datetime import datetime
from utils.timezone import get_beijing_time, BEIJING_TZ

logger = logging.getLogger(__name__)


class SystemMonitor:
    """系统监控器"""
    
    @staticmethod
    def get_system_info() -> Dict[str, Any]:
        """
        获取系统信息
        
        Returns:
            系统信息字典
        """
        try:
            # CPU 信息（不阻塞）
            cpu_percent = psutil.cpu_percent(interval=None)  # 非阻塞调用
            
            # 内存信息
            memory = psutil.virtual_memory()
            
            # 磁盘信息（兼容 Windows）
            try:
                if platform.system() == 'Windows':
                    disk = psutil.disk_usage('C:')
                else:
                    disk = psutil.disk_usage('/')
            except Exception:
                disk = None
            
            # 系统启动时间
            boot_time = psutil.boot_time()
            uptime_seconds = int(datetime.now().timestamp() - boot_time)
            
            return {
                "cpu": {
                    "percent": cpu_percent,
                    "cores": psutil.cpu_count(logical=False) or psutil.cpu_count(),
                    "logical_cores": psutil.cpu_count(logical=True)
                },
                "memory": {
                    "total": memory.total,
                    "available": memory.available,
                    "used": memory.used,
                    "percent": memory.percent
                },
                "disk": {
                    "total": disk.total if disk else 0,
                    "used": disk.used if disk else 0,
                    "free": disk.free if disk else 0,
                    "percent": (disk.used / disk.total * 100) if disk and disk.total > 0 else 0
                },
                "platform": f"{platform.system()} {platform.release()}",
                "hostname": platform.node(),
                "boot_time": uptime_seconds,
                "python_version": platform.python_version(),
                "timestamp": get_beijing_time().isoformat()
            }
        except Exception as e:
            logger.error(f"获取系统信息失败: {e}")
            return {
                "cpu": {"percent": 0, "cores": 0, "logical_cores": 0},
                "memory": {"total": 0, "available": 0, "used": 0, "percent": 0},
                "disk": {"total": 0, "used": 0, "free": 0, "percent": 0},
                "platform": platform.system(),
                "hostname": platform.node(),
                "boot_time": 0,
                "python_version": platform.python_version(),
                "error": str(e),
                "timestamp": get_beijing_time().isoformat()
            }
    
    @staticmethod
    def get_process_info() -> Dict[str, Any]:
        """
        获取当前进程信息
        
        Returns:
            进程信息字典
        """
        try:
            process = psutil.Process()
            memory_info = process.memory_info()
            
            # 计算进程运行时间
            create_time = process.create_time()
            uptime_seconds = int(datetime.now().timestamp() - create_time)
            
            # 获取打开的文件数（某些系统可能不支持）
            try:
                open_files = len(process.open_files())
            except (psutil.AccessDenied, psutil.NoSuchProcess):
                open_files = 0
            except Exception:
                open_files = 0
            
            return {
                "pid": process.pid,
                "memory_info": {
                    "rss": memory_info.rss,  # 物理内存
                    "vms": memory_info.vms,  # 虚拟内存
                },
                "cpu_percent": process.cpu_percent(interval=None),  # 非阻塞
                "num_threads": process.num_threads(),
                "uptime": uptime_seconds,
                "open_files": open_files,
                "create_time": datetime.fromtimestamp(create_time, tz=BEIJING_TZ).isoformat()
            }
        except Exception as e:
            logger.error(f"获取进程信息失败: {e}")
            return {
                "pid": os.getpid(),
                "memory_info": {"rss": 0, "vms": 0},
                "cpu_percent": 0,
                "num_threads": 0,
                "uptime": 0,
                "open_files": 0,
                "error": str(e)
            }


# 全局监控器实例
_monitor: SystemMonitor = None


def get_monitor() -> SystemMonitor:
    """获取监控器实例"""
    global _monitor
    if _monitor is None:
        _monitor = SystemMonitor()
    return _monitor





