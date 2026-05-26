from __future__ import annotations

import os
import shutil
import time
from types import SimpleNamespace


def _build_fallback_psutil():
    class AccessDenied(Exception):
        pass

    class NoSuchProcess(Exception):
        pass

    def cpu_percent(interval=None):
        return 0.0

    def virtual_memory():
        total = 0
        available = 0
        if hasattr(os, "sysconf"):
            try:
                page_size = os.sysconf("SC_PAGE_SIZE")
                phys_pages = os.sysconf("SC_PHYS_PAGES")
                available_pages = os.sysconf("SC_AVPHYS_PAGES")
                total = int(page_size * phys_pages)
                available = int(page_size * available_pages)
            except Exception:
                pass

        used = max(total - available, 0)
        percent = (used / total * 100) if total else 0.0
        return SimpleNamespace(
            total=total,
            available=available,
            used=used,
            percent=percent,
        )

    def disk_usage(path):
        return shutil.disk_usage(path)

    def boot_time():
        return time.time()

    def cpu_count(logical=True):
        return os.cpu_count() or 0

    class Process:
        def __init__(self, pid=None):
            self.pid = pid or os.getpid()

        def memory_info(self):
            return SimpleNamespace(rss=0, vms=0)

        def create_time(self):
            return time.time()

        def open_files(self):
            return []

        def cpu_percent(self, interval=None):
            return 0.0

        def num_threads(self):
            return 1

    return SimpleNamespace(
        AccessDenied=AccessDenied,
        NoSuchProcess=NoSuchProcess,
        Process=Process,
        __version__="0.0.0-fallback",
        boot_time=boot_time,
        cpu_count=cpu_count,
        cpu_percent=cpu_percent,
        disk_usage=disk_usage,
        virtual_memory=virtual_memory,
    )


try:
    import psutil as psutil
except ModuleNotFoundError:
    psutil = _build_fallback_psutil()
