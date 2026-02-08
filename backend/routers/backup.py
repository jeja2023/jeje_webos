"""
数据备份路由
处理数据库和文件存储的备份与恢复
"""

import logging
from typing import Optional
from datetime import datetime, timedelta
from utils.timezone import get_beijing_time
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from pathlib import Path
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, update, delete

from core.database import get_db
from core.security import require_admin, TokenData, decode_token
from models.backup import BackupRecord, BackupType, BackupStatus, BackupSchedule
from schemas.backup import (
    BackupInfo, BackupCreate, BackupRestore, BackupListResponse,
    ScheduleInfo, ScheduleCreate, ScheduleUpdate, ScheduleListResponse
)
from schemas.response import success
from utils.backup import get_backup_manager

router = APIRouter(prefix="/api/v1/backup", tags=["数据备份"])
logger = logging.getLogger(__name__)

def get_user_from_token(token: Optional[str] = Query(None)) -> TokenData:
    """从URL参数获取Token并验证管理员权限"""
    if not token:
        raise HTTPException(status_code=401, detail="未认证")
    
    token_data = decode_token(token)
    if not token_data:
        raise HTTPException(status_code=401, detail="无效的令牌")
    
    if token_data.role != "admin":
        raise HTTPException(status_code=403, detail="仅系统管理员可执行此操作")
    
    return token_data


from utils.backup_executor import execute_backup_task_sync, calculate_next_run




@router.post("/create")
async def create_backup(
    data: BackupCreate,
    background_tasks: BackgroundTasks,
    current_user: TokenData = Depends(require_admin()),
    db: AsyncSession = Depends(get_db)
):
    """
    创建备份
    
    仅系统管理员可执行
    """
    # 验证备份类型
    if data.backup_type not in [t.value for t in BackupType]:
        raise HTTPException(status_code=400, detail="无效的备份类型")
    
    # 如果启用加密，必须提供密码
    if data.is_encrypted and not data.encrypt_password:
        raise HTTPException(status_code=400, detail="加密备份必须提供密码")
    
    # 创建备份记录
    backup = BackupRecord(
        backup_type=data.backup_type,
        status=BackupStatus.PENDING.value,
        description=data.note or data.description,  # 优先使用 note 字段
        is_encrypted=data.is_encrypted,
        created_by=current_user.user_id
    )
    db.add(backup)
    await db.commit()
    await db.refresh(backup)
    
    # 在后台执行备份（使用同步包装器，后台任务会创建新的数据库会话）
    encrypt_password = data.encrypt_password if data.is_encrypted else None
    background_tasks.add_task(execute_backup_task_sync, backup.id, data.backup_type, encrypt_password)
    
    return success(BackupInfo.model_validate(backup).model_dump(), "备份任务已创建")


@router.get("/list")
async def list_backups(
    page: int = 1,
    size: int = 20,
    backup_type: Optional[str] = None,
    status: Optional[str] = None,
    current_user: TokenData = Depends(require_admin()),
    db: AsyncSession = Depends(get_db)
):
    """
    获取备份列表
    
    仅系统管理员可访问
    """
    # 构建查询
    query = select(BackupRecord)
    
    if backup_type:
        query = query.where(BackupRecord.backup_type == backup_type)
    if status:
        query = query.where(BackupRecord.status == status)
    
    # 总数查询
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()
    
    # 分页查询
    query = query.order_by(desc(BackupRecord.created_at))
    query = query.offset((page - 1) * size).limit(size)
    
    result = await db.execute(query)
    backups = result.scalars().all()
    
    return success(
        BackupListResponse(
            items=[BackupInfo.model_validate(b) for b in backups],
            total=total,
            page=page,
            size=size
        ).model_dump()
    )


# ========== 备份调度 API ==========

@router.get("/schedules")
async def list_schedules(
    current_user: TokenData = Depends(require_admin()),
    db: AsyncSession = Depends(get_db)
):
    """获取备份调度列表"""
    result = await db.execute(
        select(BackupSchedule).order_by(desc(BackupSchedule.created_at))
    )
    schedules = result.scalars().all()
    
    return success(ScheduleListResponse(
        items=[ScheduleInfo.model_validate(s) for s in schedules],
        total=len(schedules)
    ).model_dump())


@router.post("/schedules")
async def create_schedule(
    data: ScheduleCreate,
    current_user: TokenData = Depends(require_admin()),
    db: AsyncSession = Depends(get_db)
):
    """创建备份调度计划"""
    # 验证调度类型
    if data.schedule_type not in ["daily", "weekly", "monthly"]:
        raise HTTPException(status_code=400, detail="无效的调度类型")
    
    # 验证时间格式
    try:
        hour, minute = map(int, data.schedule_time.split(":"))
        if not (0 <= hour <= 23 and 0 <= minute <= 59):
            raise ValueError()
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail="无效的时间格式，请使用 HH:MM")
    
    # 计算下次执行时间
    next_run = calculate_next_run(data.schedule_type, data.schedule_time, data.schedule_day)
    
    schedule = BackupSchedule(
        name=data.name,
        backup_type=data.backup_type,
        schedule_type=data.schedule_type,
        schedule_time=data.schedule_time,
        schedule_day=data.schedule_day,
        is_encrypted=data.is_encrypted,
        is_enabled=data.is_enabled,
        retention_days=data.retention_days,
        next_run_at=next_run,
        created_by=current_user.user_id
    )
    db.add(schedule)
    await db.commit()
    await db.refresh(schedule)
    
    return success(ScheduleInfo.model_validate(schedule).model_dump(), "调度计划已创建")


@router.put("/schedules/{schedule_id}")
async def update_schedule(
    schedule_id: int,
    data: ScheduleUpdate,
    current_user: TokenData = Depends(require_admin()),
    db: AsyncSession = Depends(get_db)
):
    """更新备份调度计划"""
    result = await db.execute(select(BackupSchedule).where(BackupSchedule.id == schedule_id))
    schedule = result.scalar_one_or_none()
    
    if not schedule:
        raise HTTPException(status_code=404, detail="调度计划不存在")
    
    # 更新字段
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if value is not None:
            setattr(schedule, key, value)
    
    # 如果更新了时间相关字段，重新计算下次执行时间
    if any(k in update_data for k in ["schedule_type", "schedule_time", "schedule_day"]):
        schedule.next_run_at = calculate_next_run(
            schedule.schedule_type, 
            schedule.schedule_time, 
            schedule.schedule_day
        )
    
    await db.commit()
    await db.refresh(schedule)
    
    return success(ScheduleInfo.model_validate(schedule).model_dump(), "调度计划已更新")


@router.delete("/schedules/{schedule_id}")
async def delete_schedule(
    schedule_id: int,
    current_user: TokenData = Depends(require_admin()),
    db: AsyncSession = Depends(get_db)
):
    """删除备份调度计划"""
    result = await db.execute(select(BackupSchedule).where(BackupSchedule.id == schedule_id))
    schedule = result.scalar_one_or_none()
    
    if not schedule:
        raise HTTPException(status_code=404, detail="调度计划不存在")
    
    await db.delete(schedule)
    await db.commit()
    
    return success(message="调度计划已删除")


@router.post("/schedules/{schedule_id}/toggle")
async def toggle_schedule(
    schedule_id: int,
    current_user: TokenData = Depends(require_admin()),
    db: AsyncSession = Depends(get_db)
):
    """切换调度计划启用状态"""
    result = await db.execute(select(BackupSchedule).where(BackupSchedule.id == schedule_id))
    schedule = result.scalar_one_or_none()
    
    if not schedule:
        raise HTTPException(status_code=404, detail="调度计划不存在")
    
    schedule.is_enabled = not schedule.is_enabled
    
    # 如果启用，重新计算下次执行时间
    if schedule.is_enabled:
        schedule.next_run_at = calculate_next_run(
            schedule.schedule_type, 
            schedule.schedule_time, 
            schedule.schedule_day
        )
    
    await db.commit()
    await db.refresh(schedule)
    
    status_text = "已启用" if schedule.is_enabled else "已禁用"
    return success(ScheduleInfo.model_validate(schedule).model_dump(), f"调度计划{status_text}")


@router.get("/{backup_id}")
async def get_backup_info(
    backup_id: int,
    current_user: TokenData = Depends(require_admin()),
    db: AsyncSession = Depends(get_db)
):
    """
    获取备份信息
    
    仅系统管理员可访问
    """
    result = await db.execute(select(BackupRecord).where(BackupRecord.id == backup_id))
    backup = result.scalar_one_or_none()
    
    if not backup:
        raise HTTPException(status_code=404, detail="备份记录不存在")
    
    return success(BackupInfo.model_validate(backup).model_dump())


@router.post("/restore")
async def restore_backup(
    data: BackupRestore,
    current_user: TokenData = Depends(require_admin()),
    db: AsyncSession = Depends(get_db)
):
    """
    恢复备份
    
    仅系统管理员可执行
    警告：此操作会覆盖现有数据！
    """
    logger.info(f"收到恢复请求，备份ID: {data.backup_id}")
    
    # 查询备份记录
    result = await db.execute(select(BackupRecord).where(BackupRecord.id == data.backup_id))
    backup = result.scalar_one_or_none()
    
    if not backup:
        logger.warning(f"备份不存在: {data.backup_id}")
        raise HTTPException(status_code=404, detail="备份记录不存在")
    
    if backup.status != BackupStatus.SUCCESS.value:
        raise HTTPException(status_code=400, detail="备份未完成或已失败，无法恢复")
    
    if not backup.file_path:
        raise HTTPException(status_code=400, detail="备份文件不存在")
    
    # 提取所需数据
    backup_type = backup.backup_type
    file_path = backup.file_path
    is_encrypted = backup.is_encrypted
    
    # 显式提交事务，释放数据库锁
    await db.commit()
    
    backup_manager = get_backup_manager()
    temp_decrypted_files = [] 
    
    try:
        try:
            raw_paths = file_path.split(",")
            restore_paths = [] 
            
            # 处理解密
            if is_encrypted:
                if not data.decrypt_password:
                    raise HTTPException(status_code=400, detail="该备份已加密，请提供解密密码")
                
                logger.info(f"开始解密备份文件 (ID: {data.backup_id})...")
                for p in raw_paths:
                    p_obj = Path(p)
                    if not p_obj.exists():
                         logger.warning(f"文件丢失: {p}")
                         continue
                         
                    success_dec, result_dec = backup_manager.decrypt_file(p_obj, data.decrypt_password)
                    if not success_dec:
                        raise HTTPException(status_code=400, detail=f"解密失败: {result_dec}")
                    
                    restore_paths.append(result_dec)
                    temp_decrypted_files.append(result_dec)
            else:
                restore_paths = raw_paths
                
            # 根据备份类型恢复
            if backup_type == BackupType.DATABASE.value:
                 # 只有 DB
                 if restore_paths:
                     logger.info(f"开始恢复数据库: {restore_paths[0]}")
                     ok, err = backup_manager.restore_database(restore_paths[0])
                     if not ok: raise HTTPException(status_code=500, detail=f"数据库恢复失败: {err}")
                     
            elif backup_type == BackupType.FILES.value:
                 # 只有 Files
                 if restore_paths:
                     logger.info(f"开始恢复文件: {restore_paths[0]}")
                     ok, err = backup_manager.restore_files(restore_paths[0])
                     if not ok: raise HTTPException(status_code=500, detail=f"文件恢复失败: {err}")
                     
            elif backup_type == BackupType.FULL.value:
                 # DB + Files
                 db_path = restore_paths[0] if len(restore_paths) > 0 else None
                 files_path = restore_paths[1] if len(restore_paths) > 1 else None
                 
                 if db_path:
                     logger.info(f"开始恢复数据库: {db_path}")
                     ok, err = backup_manager.restore_database(db_path)
                     if not ok: raise HTTPException(status_code=500, detail=f"数据库恢复失败: {err}")
                 
                 if files_path:
                     logger.info(f"开始恢复文件: {files_path}")
                     ok, err = backup_manager.restore_files(files_path)
                     if not ok: raise HTTPException(status_code=500, detail=f"文件恢复失败: {err}")
                     
            logger.info("备份恢复操作完成")
            
        finally:
            # 清理临时解密文件
            for temp_file in temp_decrypted_files:
                try:
                    Path(temp_file).unlink(missing_ok=True)
                    logger.debug(f"已清理临时文件: {temp_file}")
                except Exception as e:
                    logger.warning(f"无法删除临时文件 {temp_file}: {e}")
            
        # 修复数据状态和文件大小
        try:
             # 计算文件总大小
             total_size = 0
             if file_path:
                 try:
                    for path in file_path.split(","):
                        p = Path(path)
                        if p.exists():
                            total_size += p.stat().st_size
                 except Exception:
                    pass

             from sqlalchemy import update
             from core.database import async_session
             
             async with async_session() as new_session:
                stmt = (
                    update(BackupRecord)
                    .where(BackupRecord.id == data.backup_id)
                    .where(BackupRecord.status == BackupStatus.RUNNING.value)
                    .values(status=BackupStatus.SUCCESS.value, file_size=total_size)
                )
                await new_session.execute(stmt)
                await new_session.commit()
                
             logger.info(f"已修复备份记录状态和大小: {data.backup_id}")
        except Exception as fix_error:
             logger.warning(f"尝试修复备份状态失败: {fix_error}")

        logger.info(f"备份恢复全部完成: {data.backup_id}")
        return success(message="备份恢复成功，请重启系统以确保数据一致性")
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"恢复过程发生未捕获异常: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"恢复过程出错: {str(e)}")


@router.delete("/{backup_id}")
async def delete_backup(
    backup_id: int,
    current_user: TokenData = Depends(require_admin()),
    db: AsyncSession = Depends(get_db)
):
    """
    删除备份
    
    仅系统管理员可执行
    """
    result = await db.execute(select(BackupRecord).where(BackupRecord.id == backup_id))
    backup = result.scalar_one_or_none()
    
    if not backup:
        raise HTTPException(status_code=404, detail="备份记录不存在")
    
    # 删除备份文件
    backup_manager = get_backup_manager()
    if backup.file_path:
        for file_path in backup.file_path.split(","):
            backup_manager.delete_backup(file_path)
    
    # 删除数据库记录
    await db.delete(backup)
    await db.flush()
    await db.commit()
    
    return success(message="备份已删除")


@router.get("/{backup_id}/download")
async def download_backup(
    backup_id: int,
    file_index: int = 0,
    token: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """
    下载备份文件
    
    仅系统管理员可访问（通过URL Token验证）
    """
    # 验证 Token
    current_user = get_user_from_token(token)
    
    result = await db.execute(select(BackupRecord).where(BackupRecord.id == backup_id))
    backup = result.scalar_one_or_none()
    
    if not backup:
        raise HTTPException(status_code=404, detail="备份记录不存在")
    
    if not backup.file_path:
        raise HTTPException(status_code=404, detail="备份文件不存在")
    
    # 获取文件路径
    file_paths = backup.file_path.split(",")
    if file_index >= len(file_paths):
        raise HTTPException(status_code=400, detail="文件索引超出范围")
    
    file_path = file_paths[file_index]
    full_path = Path(file_path)
    
    if not full_path.exists():
        raise HTTPException(status_code=404, detail="备份文件已丢失")
    
    return FileResponse(
        path=str(full_path),
        filename=full_path.name,
        media_type="application/octet-stream"
    )



