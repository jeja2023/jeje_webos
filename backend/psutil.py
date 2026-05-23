from __future__ import annotations

import importlib.machinery
import importlib.util
import os
import shutil
import sys
import time
from pathlib import Path
from types import SimpleNamespace


def _load_real_psutil():
    module_path = Path(__file__).resolve()
    module_dir = module_path.parent
    search_paths = []
    for entry in sys.path:
        try:
            resolved = Path(entry or os.getcwd()).resolve()
        except Exception:
            continue
        if resolved == module_dir:
            continue
        search_paths.append(entry)

    spec = importlib.machinery.PathFinder.find_spec("psutil", search_paths)
    if not spec or not spec.loader or not spec.origin:
        return None

    try:
        if Path(spec.origin).resolve() == module_path:
            return None
    except Exception:
        return None

    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_real = _load_real_psutil()

if _real is not None:
    for name, value in vars(_real).items():
        if name.startswith("__") and name not in {"__version__", "__all__"}:
            continue
        globals()[name] = value
else:
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
                total = int(page_size * phys_pages)
                available_pages = os.sysconf("SC_AVPHYS_PAGES")
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

    __version__ = "0.0.0"

