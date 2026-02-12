"""
应用市场路由
处理模块的在线/离线安装、卸载和列表
"""

import os
import shutil
import zipfile
import tempfile
import logging
from typing import List, Optional
from fastapi import APIRouter, Depends, UploadFile, File
from sqlalchemy.ext.asyncio import AsyncSession
from pathlib import Path

from core.database import get_db
from core.security import TokenData, require_admin, get_current_user
from core.errors import NotFoundException, PermissionException, BusinessException, AppException, ErrorCode
from core.loader import get_module_loader, CORE_MODULES
from core.config import get_settings
from models import UserModule
from schemas import success
from sqlalchemy import select, delete
from utils.timezone import get_beijing_time

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(prefix="/api/v1/system/market", tags=["应用市场"])

@router.get("/list")
async def list_market_modules(
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    获取所有模块列表（及安装状态）
    
    返回字段说明：
    - installed: 系统是否安装（管理员操作）
    - enabled: 系统是否启用（管理员操作）
    - user_installed: 用户是否安装（个人偏好）
    - user_enabled: 用户是否启用（个人偏好）
    """
    loader = get_module_loader()
    if not loader:
        return success([])
    
    is_admin = current_user.role == 'admin'
    user_id = current_user.user_id
    user_perms = current_user.permissions or []
    
    # 获取用户的模块配置
    user_modules_result = await db.execute(
        select(UserModule).where(UserModule.user_id == user_id)
    )
    user_modules = {um.module_id: um for um in user_modules_result.scalars().all()}
    
    market_list = []
    # 扫描磁盘上的所有模块
    module_ids = loader.scan_modules()
    
    for mid in module_ids:
        # 如果已加载，直接用内存中的清单，否则加载清单获取信息
        loaded = loader.modules.get(mid)
        if loaded:
            manifest = loaded.manifest
        else:
            manifest = loader.load_manifest(mid)
            
        if not manifest:
            continue
        
        # 过滤核心模块
        if mid in CORE_MODULES:
            continue
            
        state = loader.get_module_state(mid)
        sys_installed = state is not None
        sys_enabled = state.enabled if state else False
        
        # 获取用户级别状态
        user_module = user_modules.get(mid)
        user_installed = user_module.installed if user_module else False
        user_enabled = user_module.enabled if user_module else False
        
        # 用户组权限检查：管理员全量；普通用户需模块权限
        has_perm = is_admin or ("*" in user_perms) or any(
            p == mid or p.startswith(mid + ".") for p in user_perms
        )
        
        # 对于普通用户：只显示系统已启用且有权限的模块
        if not is_admin:
            if not sys_enabled:
                continue
            if not has_perm:
                continue
        
        market_list.append({
            "id": mid,
            "name": manifest.name,
            "description": manifest.description,
            "icon": manifest.icon,
            "version": manifest.version,
            "author": manifest.author,
            # 系统级状态（管理员控制）
            "installed": sys_installed,
            "enabled": sys_enabled,
            # 用户级状态（个人偏好）
            "user_installed": user_installed,
            "user_enabled": user_enabled
        })
        
    return success(market_list)


@router.post("/install/{module_id}")
async def install_module(
    module_id: str,
    current_user: TokenData = Depends(require_admin())
):
    """安装模块（标记为已安装并运行初始化钩子）"""
    loader = get_module_loader()
    if not loader:
        raise BusinessException(ErrorCode.SERVICE_UNAVAILABLE, "模块加载器未初始化")
        
    try:
        success_flag = await loader.install_module(module_id)
        if success_flag:
            return success(None, f"模块 {module_id} 安装成功")
        else:
            raise BusinessException(ErrorCode.OPERATION_FAILED, "安装失败，可能模块已安装或不存在")
    except Exception as e:
        logger.error(f"安装模块失败 {module_id}: {e}")
        raise BusinessException(ErrorCode.INTERNAL_ERROR, f"安装异常: {str(e)}")

@router.post("/uninstall/{module_id}")
async def uninstall_module(
    module_id: str,
    current_user: TokenData = Depends(require_admin())
):
    """卸载模块（从状态列表中移除，但不删除代码）"""
    loader = get_module_loader()
    if not loader:
        raise BusinessException(ErrorCode.SERVICE_UNAVAILABLE, "模块加载器未初始化")
        
    try:
        success_flag = await loader.uninstall_module(module_id)
        if success_flag:
            return success(None, f"模块 {module_id} 卸载成功")
        else:
            raise BusinessException(ErrorCode.OPERATION_FAILED, "卸载未成功")
    except Exception as e:
        logger.error(f"卸载模块失败 {module_id}: {e}")
        raise BusinessException(ErrorCode.INTERNAL_ERROR, f"卸载异常: {str(e)}")

@router.post("/upload")
async def upload_package(
    current_user: TokenData = Depends(require_admin()),
    file: UploadFile = File(...),
    force: bool = False
):
    """
    通过 .jwapp 离线包上传模块
    1. 接收 zip 文件
    2. 校验文件结构
    3. 解压到 modules 目录
    上传后模块处于"待安装"状态，需要管理员在应用市场中手动安装
    
    Args:
        file: 上传的 .jwapp 或 .zip 文件
        force: 是否强制覆盖已存在的模块（默认 False）
    """
    if not file.filename.endswith(('.jwapp', '.zip')):
        raise BusinessException(ErrorCode.VALIDATION_ERROR, "无效的文件格式，仅支持 .jwapp 或 .zip")
    
    # 获取最新配置（支持测试环境动态切换）
    current_settings = get_settings()
    
    # 模块存放路径
    modules_dir = Path(current_settings.modules_dir)
    if not modules_dir.is_absolute():
        modules_dir = Path(__file__).parent.parent / current_settings.modules_dir
    
    # 确保目录存在
    modules_dir.mkdir(parents=True, exist_ok=True)

    temp_dir = Path(tempfile.mkdtemp())
    try:
        # 1. 保存临时文件（限制大小为 100MB）
        MAX_MODULE_SIZE = 100 * 1024 * 1024  # 100MB
        temp_zip = temp_dir / file.filename
        total_size = 0
        with open(temp_zip, "wb") as buffer:
            while True:
                chunk = file.file.read(1024 * 1024)
                if not chunk:
                    break
                total_size += len(chunk)
                if total_size > MAX_MODULE_SIZE:
                    raise BusinessException(
                        ErrorCode.FILE_TOO_LARGE,
                        f"模块包大小超过限制（最大 {MAX_MODULE_SIZE // 1024 // 1024}MB）"
                    )
                buffer.write(chunk)
        
        # 2. 预检查 zip 内容
        with zipfile.ZipFile(temp_zip, 'r') as zf:
            namelist = zf.namelist()
            
            # 安全检查：防止路径遍历
            for name in namelist:
                if ".." in name or name.startswith("/") or name.startswith("\\"):
                    raise BusinessException(ErrorCode.VALIDATION_ERROR, f"离线包包含非法路径元素: {name}")
            
            # 找到根目录（通常是模块ID）
            root_dirs = set()
            for name in namelist:
                # 获取第一层级
                parts = name.replace('\\', '/').split('/')
                if parts and parts[0]:
                    root_dirs.add(parts[0])
            
            if len(root_dirs) != 1:
                raise BusinessException(ErrorCode.VALIDATION_ERROR, "离线包结构不规范：必须包含且仅包含一个根目录（模块ID）")
            
            module_id = list(root_dirs)[0]
            
            # 校验核心结构：必须有 {module_id}_manifest.py
            manifest_file = f"{module_id}/{module_id}_manifest.py"
            if manifest_file not in namelist:
                # 尝试检查没有父目录的情况（虽然规范是带父目录）
                if f"{module_id}_manifest.py" in namelist:
                    # 这说明 zip 直接把文件打包在根了，不支持这种，必须带一层文件夹
                    raise BusinessException(ErrorCode.VALIDATION_ERROR, f"离线包结构不规范：应为 {module_id}/ 文件夹结构")
                raise BusinessException(ErrorCode.VALIDATION_ERROR, f"离线包缺少清单文件: {manifest_file}")

            # 3. 解压到临时目录后再移动
            extract_path = temp_dir / "extract"
            zf.extractall(extract_path)
            
        target_module_path = modules_dir / module_id
        
        # 如果模块已存在，检查是否强制覆盖
        is_overwrite = target_module_path.exists()
        if is_overwrite:
            if not force:
                # 读取已存在模块的信息
                loader = get_module_loader()
                existing_manifest = loader.load_manifest(module_id) if loader else None
                existing_name = existing_manifest.name if existing_manifest else module_id
                existing_version = existing_manifest.version if existing_manifest else "未知"
                
                # 返回 409 Conflict，让前端弹窗确认
                raise BusinessException(
                    ErrorCode.RESOURCE_CONFLICT,
                    f"模块 \"{existing_name}\" 已存在，是否覆盖？",
                    data={
                        "module_id": module_id,
                        "module_name": existing_name,
                        "existing_version": existing_version
                    }
                )
            
            logger.warning(f"模块 {module_id} 已存在，强制覆盖...")
            shutil.rmtree(target_module_path)
        
        # 4. 移动到正式目录
        shutil.move(str(extract_path / module_id), str(modules_dir))
        
        # 5. 清除导入缓存，确保后续能识别新模块
        import importlib
        importlib.invalidate_caches()
        
        # 读取模块清单获取名称（用于前端显示）
        loader = get_module_loader()
        manifest = loader.load_manifest(module_id) if loader else None
        module_name = manifest.name if manifest else module_id
        
        logger.info(f"离线包解压成功: {module_id} ({module_name})")
        
        # 返回成功信息
        msg = f"模块 \"{module_name}\" 已上传成功！请在「应用市场」中点击安装，然后在「应用管理」中启用。"
        if is_overwrite:
            msg = f"模块 \"{module_name}\" 已覆盖更新！请在「应用市场」中重新安装。"
        
        return success({
            "module_id": module_id,
            "module_name": module_name,
            "is_overwrite": is_overwrite
        }, msg)

    except zipfile.BadZipFile:
        raise BusinessException(ErrorCode.VALIDATION_ERROR, "压缩包损坏")
    except AppException:
        raise
    except Exception as e:
        logger.error(f"离线包上传失败: {e}")
        raise BusinessException(ErrorCode.INTERNAL_ERROR, f"上传失败: {str(e)}")
    finally:
        # 清理临时文件
        if temp_dir.exists():
            shutil.rmtree(temp_dir)


# ==================== 用户级模块管理 ====================

@router.post("/user/install/{module_id}")
async def user_install_module(
    module_id: str,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    用户安装模块（个人偏好）
    只能安装管理员已启用且用户有权限的模块
    """
    loader = get_module_loader()
    if not loader:
        raise BusinessException(ErrorCode.SERVICE_UNAVAILABLE, "模块加载器未初始化")
    
    # 检查系统是否已启用该模块
    state = loader.get_module_state(module_id)
    if not state or not state.enabled:
        raise BusinessException(ErrorCode.INVALID_OPERATION, "该模块未被系统启用，无法安装")
    
    # 检查用户组权限
    user_perms = current_user.permissions or []
    has_perm = current_user.role == 'admin' or ("*" in user_perms) or any(
        p == module_id or p.startswith(module_id + ".") for p in user_perms
    )
    if not has_perm:
        raise PermissionException("您没有权限安装此模块")
    
    user_id = current_user.user_id
    
    # 检查是否已存在记录
    result = await db.execute(
        select(UserModule).where(
            UserModule.user_id == user_id,
            UserModule.module_id == module_id
        )
    )
    user_module = result.scalar_one_or_none()
    
    if user_module:
        user_module.installed = True
        user_module.enabled = True
        user_module.updated_at = get_beijing_time()
    else:
        user_module = UserModule(
            user_id=user_id,
            module_id=module_id,
            installed=True,
            enabled=True,
            installed_at=get_beijing_time(),
            updated_at=get_beijing_time()
        )
        db.add(user_module)
    
    await db.commit()
    logger.info(f"用户 {current_user.username} 安装模块 {module_id}")
    return success(None, f"模块安装成功")


@router.post("/user/uninstall/{module_id}")
async def user_uninstall_module(
    module_id: str,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """用户卸载模块（个人偏好）"""
    user_id = current_user.user_id
    
    result = await db.execute(
        select(UserModule).where(
            UserModule.user_id == user_id,
            UserModule.module_id == module_id
        )
    )
    user_module = result.scalar_one_or_none()
    
    if user_module:
        user_module.installed = False
        user_module.enabled = False
        await db.commit()
        logger.info(f"用户 {current_user.username} 卸载模块 {module_id}")
    
    return success(None, "模块卸载成功")


@router.post("/user/toggle/{module_id}")
async def user_toggle_module(
    module_id: str,
    enabled: bool,
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    用户启用/禁用模块（个人偏好）
    只能操作已安装的模块
    """
    user_id = current_user.user_id
    
    result = await db.execute(
        select(UserModule).where(
            UserModule.user_id == user_id,
            UserModule.module_id == module_id
        )
    )
    user_module = result.scalar_one_or_none()
    
    if not user_module or not user_module.installed:
        raise BusinessException(ErrorCode.INVALID_OPERATION, "请先安装该模块")
    
    user_module.enabled = enabled
    user_module.updated_at = get_beijing_time()
    await db.commit()
    
    action = "启用" if enabled else "禁用"
    logger.info(f"用户 {current_user.username} {action}模块 {module_id}")
    return success(None, f"模块{action}成功")


@router.get("/user/list")
async def list_user_modules(
    current_user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取用户已安装的模块列表"""
    user_id = current_user.user_id
    
    result = await db.execute(
        select(UserModule).where(
            UserModule.user_id == user_id,
            UserModule.installed == True
        )
    )
    user_modules = result.scalars().all()
    
    return success([{
        "module_id": um.module_id,
        "enabled": um.enabled,
        "installed_at": um.installed_at.isoformat() if um.installed_at else None
    } for um in user_modules])

