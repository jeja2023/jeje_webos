"""
数据备份路由
处理数据库和文件存储的备份与恢复
"""

import logging
from typing import Optional
from utils.timezone import get_beijing_time
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from pathlib import Path
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from core.database import get_db
from core.security import require_admin, TokenData, decode_token
from models.backup import BackupRecord, BackupType, BackupStatus
from schemas.backup import BackupInfo, BackupCreate, BackupRestore, BackupListResponse
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


def execute_backup_task_sync(backup_id: int, backup_type: str):
    """执行备份任务（同步方法，在线程池中运行）"""
    import threading
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from core.config import get_settings
    
    logger.info(f"开始执行备份任务（线程 {threading.current_thread().name}）: {backup_id}, 类型: {backup_type}")
    settings = get_settings()
    
    # 使用同步数据库引擎
    engine = create_engine(settings.db_url_sync, pool_pre_ping=True)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    
    backup_manager = get_backup_manager()
    
    try:
        # 查询备份记录
        from models.backup import BackupRecord, BackupStatus
        backup = db.query(BackupRecord).filter(BackupRecord.id == backup_id).first()
        if not backup:
            logger.error(f"备份记录不存在: {backup_id}")
            return
        
        # 更新状态为执行中
        backup.status = BackupStatus.RUNNING.value
        backup.started_at = get_beijing_time()
        db.commit()
        
        error_messages = []
        
        if backup_type == BackupType.DATABASE.value or backup_type == BackupType.FULL.value:
            # 备份数据库
            logger.info(f"备份数据库: {backup_id}")
            db_success, file_path, file_size = backup_manager.backup_database(str(backup_id))
            if db_success:
                backup.file_path = file_path
                backup.file_size = file_size
                logger.info(f"数据库备份成功: {file_path}")
            else:
                error_messages.append("数据库备份失败（可能需要安装 mysqldump 工具）")
                logger.error(f"数据库备份失败: {backup_id}")
        
        if backup_type == BackupType.FILES.value or backup_type == BackupType.FULL.value:
            # 备份文件
            logger.info(f"备份文件: {backup_id}")
            files_success, file_path, file_size = backup_manager.backup_files(str(backup_id))
            if files_success:
                # 如果是全量备份，文件路径会追加
                if backup.file_path:
                    backup.file_path += f",{file_path}"
                else:
                    backup.file_path = file_path
                if backup.file_size:
                    backup.file_size += file_size
                else:
                    backup.file_size = file_size
                logger.info(f"文件备份成功: {file_path}")
            else:
                error_messages.append("文件备份失败")
                logger.error(f"文件备份失败: {backup_id}")
        
        # 判断最终状态
        if error_messages:
            if backup.file_path:
                # 部分成功
                backup.status = BackupStatus.SUCCESS.value
                backup.error_message = "部分完成: " + "; ".join(error_messages)
            else:
                # 完全失败
                backup.status = BackupStatus.FAILED.value
                backup.error_message = "; ".join(error_messages)
        else:
            backup.status = BackupStatus.SUCCESS.value
        
        backup.completed_at = get_beijing_time()
        db.commit()
        logger.info(f"备份任务完成: {backup_id}, 状态: {backup.status}")
        
    except Exception as e:
        logger.error(f"备份任务失败: {backup_id}, 错误: {e}", exc_info=True)
        try:
            backup = db.query(BackupRecord).filter(BackupRecord.id == backup_id).first()
            if backup:
                backup.status = BackupStatus.FAILED.value
                backup.error_message = f"备份异常: {str(e)}"
                backup.completed_at = get_beijing_time()
                db.commit()
        except Exception as commit_error:
            logger.error(f"更新备份状态失败: {commit_error}")
    finally:
        db.close()
        engine.dispose()




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
    
    # 创建备份记录
    backup = BackupRecord(
        backup_type=data.backup_type,
        status=BackupStatus.PENDING.value,
        description=data.description,
        created_by=current_user.user_id
    )
    db.add(backup)
    await db.commit()
    await db.refresh(backup)
    
    # 在后台执行备份（使用同步包装器，后台任务会创建新的数据库会话）
    background_tasks.add_task(execute_backup_task_sync, backup.id, data.backup_type)
    
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
    
    # 提取所需数据，避免在关闭事务后访问 ORM 对象
    backup_type = backup.backup_type
    file_path = backup.file_path
    
    # 显式提交事务，释放数据库锁！
    # 这是防止死锁的关键：如果当前事务未提交，它持有某些表的元数据锁
    # 而 mysql 恢复进程尝试 DROP/CREATE 这些表时会请求排他锁，导致互相等待
    await db.commit()
    
    backup_manager = get_backup_manager()
    
    try:
        # 根据备份类型恢复
        file_paths = file_path.split(",")
        
        if backup_type == BackupType.DATABASE.value or backup_type == BackupType.FULL.value:
            # 恢复数据库
            db_path = file_paths[0] if file_paths else file_path
            logger.info(f"开始恢复数据库: {db_path}")
            
            try:
                restore_ok, error = backup_manager.restore_database(db_path)
            except Exception as e:
                logger.error(f"restore_database 内部异常: {e}")
                raise

            if not restore_ok:
                logger.error(f"数据库恢复失败: {error}")
                raise HTTPException(status_code=500, detail=f"数据库恢复失败: {error}")
            logger.info("数据库恢复完成")
        
        if backup_type == BackupType.FILES.value or backup_type == BackupType.FULL.value:
            # 恢复文件
            files_path = file_paths[-1] if len(file_paths) > 1 else (file_paths[0] if backup_type == BackupType.FILES.value else None)
            if files_path:
                logger.info(f"开始恢复文件: {files_path}")
                restore_ok, error = backup_manager.restore_files(files_path)
                if not restore_ok:
                    logger.error(f"文件恢复失败: {error}")
                    raise HTTPException(status_code=500, detail=f"文件恢复失败: {error}")
                logger.info("文件恢复完成")
        
        # 修复数据状态和文件大小：
        # 由于备份是在 status=RUNNING 且 file_size 未知时进行的，恢复后的数据库中该记录状态会变回 RUNNING 且无大小
        # 我们需要将其修正为 SUCCESS，并重新计算文件大小
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
             
             # 使用新的 Session 执行更新，避免原 Session 因数据库重建导致的状态问题
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
    """
    下载备份文件
    
    仅系统管理员可访问
    """
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

