"""
静态资源挂载模块
配置和处理所有静态文件的路由映射，增强缓存和访问控制
"""

from fastapi import FastAPI
from core.static_files import CachedStaticFiles
import os

def mount_static_resources(app: FastAPI, frontend_path: str):
    """
    配置并挂载静态资源目录
    
    :param app: FastAPI 应用实例
    :param frontend_path: 前端根目录路径
    """
    if os.path.exists(frontend_path):
        # 基础静态资源 (CSS, JS, Images, Fonts, Libs)
        # 统一设置缓存策略以提升性能
        static_dirs = {
            "css": "/static/css",
            "js": "/static/js",
            "images": "/static/images",
            "fonts": "/static/fonts",
            "libs": "/static/libs"
        }
        
        for dir_name, mount_path in static_dirs.items():
            dir_path = os.path.join(frontend_path, dir_name)
            if os.path.exists(dir_path):
                app.mount(mount_path, CachedStaticFiles(directory=dir_path), name=dir_name)
        
        # 兼容性挂载: /images -> /static/images
        images_path = os.path.join(frontend_path, "images")
        if os.path.exists(images_path):
            app.mount("/images", CachedStaticFiles(directory=images_path), name="root_images")
            
    # 模块化静态资源: /static/{module}/
    # 获取 backend 目录
    backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    modules_path = os.path.join(backend_dir, "modules")
    
    if os.path.exists(modules_path):
        for module_name in os.listdir(modules_path):
            if module_name.startswith("_"):
                continue
            module_static = os.path.join(modules_path, module_name, "static")
            if os.path.isdir(module_static):
                app.mount(
                    f"/static/{module_name}",
                    CachedStaticFiles(directory=module_static),
                    name=f"static_{module_name}"
                )
    
    # 公共存储目录: /static/storage
    # 默认尝试从上级目录获取 storage，如果在 backend 同级
    storage_root = os.environ.get("STORAGE_PATH", os.path.join(backend_dir, "..", "storage"))
    if os.path.exists(storage_root):
        app.mount("/static/storage", CachedStaticFiles(directory=storage_root), name="static_storage")
