import logging
import threading
from datetime import datetime, timedelta
from typing import Optional, List
from pathlib import Path

from sqlalchemy import select, update, desc, func
from sqlalchemy.orm import sessionmaker
from sqlalchemy import create_engine

from core.config import get_settings
from core.database import async_session
from models.backup import BackupRecord, BackupType, BackupStatus, BackupSchedule
from utils.backup import get_backup_manager
from utils.timezone import get_beijing_time

logger = logging.getLogger(__name__)

def _notify_backup_status_sync(backup_id: int, status: str, message: str, progress: int = 0):
    """
    通过 WebSocket 发送备份状态更新的同步包装器
    """
    import asyncio
    try:
        from core.ws_manager import manager
        payload = {
            "type": "system.backup_status",
            "data": {
                "id": backup_id,
                "status": status,
                "message": message,
                "progress": progress
            }
        }
        
        # 获取主事件循环并调度广播
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                asyncio.run_coroutine_threadsafe(manager.broadcast(payload), loop)
        except RuntimeError:
            # 某些情况下 get_event_loop 可能失败，尝试 get_running_loop 或直接忽略
            pass
            
    except Exception as e:
        logger.error(f"WebSocket 备份通知失败: {e}")

def calculate_next_run(schedule_type: str, schedule_time: str, schedule_day: Optional[int] = None) -> datetime:
    """计算下次执行时间"""
    now = get_beijing_time()
    try:
        hour, minute = map(int, schedule_time.split(":"))
    except ValueError:
        hour, minute = 0, 0 # Fallback
        
    if schedule_type == "daily":
        # 每日执行
        next_run = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        if next_run <= now:
            next_run += timedelta(days=1)
    elif schedule_type == "weekly":
        # 每周执行（schedule_day: 1-7 表示周一到周日）
        target_weekday = (schedule_day or 1) - 1  # 转换为 0-6
        days_ahead = target_weekday - now.weekday()
        if days_ahead < 0 or (days_ahead == 0 and now.hour * 60 + now.minute >= hour * 60 + minute):
            days_ahead += 7
        next_run = (now + timedelta(days=days_ahead)).replace(hour=hour, minute=minute, second=0, microsecond=0)
    elif schedule_type == "monthly":
        # 每月执行（schedule_day: 1-31 表示几号）
        target_day = schedule_day or 1
        # 处理每月天数不同，简单处理：如果 target_day > 28，可能会有问题，这里简化为 min(target_day, 28)
        # 或者使用更复杂的逻辑
        safe_day = min(target_day, 28)
        next_run = now.replace(day=safe_day, hour=hour, minute=minute, second=0, microsecond=0)
        if next_run <= now:
            # 下个月
            if now.month == 12:
                next_run = next_run.replace(year=now.year + 1, month=1)
            else:
                next_run = next_run.replace(month=now.month + 1)
    else:
        next_run = now + timedelta(days=1)
    
    return next_run

def execute_backup_task_sync(backup_id: int, backup_type: str, encrypt_password: Optional[str] = None):
    """执行备份任务（同步方法，通常在线程池或后台任务中运行）"""
    logger.info(f"开始执行备份任务（线程 {threading.current_thread().name}）: {backup_id}, 类型: {backup_type}, 加密: {bool(encrypt_password)}")
    settings = get_settings()
    
    # 使用同步数据库引擎
    engine = create_engine(settings.db_url_sync, pool_pre_ping=True)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    
    backup_manager = get_backup_manager()
    
    try:
        # 查询备份记录
        backup = db.query(BackupRecord).filter(BackupRecord.id == backup_id).first()
        if not backup:
            logger.error(f"备份记录不存在: {backup_id}")
            return
        
        # 更新状态为执行中
        backup.status = BackupStatus.RUNNING.value
        backup.started_at = get_beijing_time()
        db.commit()
        
        _notify_backup_status_sync(backup_id, "running", "开始执行备份任务", 5)
        
        error_messages = []
        backup_files = []  # 存储需要加密的文件路径
        
        if backup_type == BackupType.DATABASE.value or backup_type == BackupType.FULL.value:
            # 备份数据库
            logger.info(f"备份数据库: {backup_id}")
            db_success, file_path, file_size = backup_manager.backup_database(str(backup_id))

            if db_success:
                backup_files.append(file_path)
                backup.file_path = file_path
                backup.file_size = file_size
                logger.info(f"数据库备份成功: {file_path}")
                _notify_backup_status_sync(backup_id, "running", "数据库备份完成", 30)
            else:
                error_messages.append("数据库备份失败（可能需要安装 mysqldump 工具）")
                logger.error(f"数据库备份失败: {backup_id}")
                _notify_backup_status_sync(backup_id, "running", "数据库备份失败", 30)
        
        if backup_type == BackupType.FILES.value or backup_type == BackupType.FULL.value:
            # 备份文件
            logger.info(f"备份文件: {backup_id}")
            files_success, file_path, file_size = backup_manager.backup_files(str(backup_id))
            if files_success:
                backup_files.append(file_path)
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
                _notify_backup_status_sync(backup_id, "running", "文件备份完成", 60)
            else:
                error_messages.append("文件备份失败")
                logger.error(f"文件备份失败: {backup_id}")
                _notify_backup_status_sync(backup_id, "running", "文件备份失败", 60)
        
        # 如果需要加密，对所有备份文件进行加密
        if encrypt_password and backup_files:
            logger.info(f"开始加密备份文件: {backup_id}")
            encrypted_paths = []
            total_encrypted_size = 0
            
            for file_path in backup_files:
                full_path = Path(file_path)
                if not full_path.is_absolute():
                    # 处理相对路径
                    from pathlib import Path as P
                    project_root = P(__file__).parent.parent.resolve()
                    full_path = project_root / file_path
                
                if full_path.exists():
                    success_enc, result = backup_manager.encrypt_file(full_path, encrypt_password)
                    if success_enc:
                        encrypted_paths.append(result)
                        try:
                            encrypted_size = Path(result).stat().st_size
                            total_encrypted_size += encrypted_size
                        except Exception as e:
                            logger.debug(f"获取加密文件大小失败: {e}")
                        logger.info(f"文件加密成功: {result}")
                    else:
                        error_messages.append(f"加密失败: {result}")
                        logger.error(f"文件加密失败: {file_path}, 错误: {result}")
                
            _notify_backup_status_sync(backup_id, "running", "备份加密处理完成", 90)
            
            if encrypted_paths:
                backup.file_path = ",".join(encrypted_paths)
                backup.file_size = total_encrypted_size
                backup.is_encrypted = True
        
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
        
        final_msg = "备份任务已成功完成" if backup.status == BackupStatus.SUCCESS.value else f"备份任务完成但有错误: {backup.error_message}"
        _notify_backup_status_sync(backup_id, backup.status, final_msg, 100)
        
    except Exception as e:
        logger.error(f"备份任务失败: {backup_id}, 错误: {e}", exc_info=True)
        try:
            # 重新获取对象以防 session 错乱
            backup = db.query(BackupRecord).filter(BackupRecord.id == backup_id).first()
            if backup:
                backup.status = BackupStatus.FAILED.value
                backup.error_message = f"备份异常: {str(e)}"
                backup.completed_at = get_beijing_time()
                db.commit()
                _notify_backup_status_sync(backup_id, "failed", f"备份异常: {str(e)}", 100)
        except Exception as commit_error:
            logger.error(f"更新备份状态失败: {commit_error}")
    finally:
        db.close()
        engine.dispose()

async def process_schedule_backups():
    """定期检查并执行备份计划"""
    now = get_beijing_time()
    # 忽略秒和微秒，避免因执行时间偏差导致重复触发（假设每分钟检查一次）
    # 但更安全的做法是比较时间戳，并更新 next_run
    
    logger.debug("开始检查备份调度任务...")
    
    async with async_session() as db:
        try:
            # 查询所有已启用且已经到达执行时间的计划
            result = await db.execute(
                select(BackupSchedule)
                .where(BackupSchedule.is_enabled == True)
                .where(BackupSchedule.next_run_at <= now)
            )
            schedules = result.scalars().all()
            
            for schedule in schedules:
                logger.info(f"触发自动备份计划: {schedule.name} (ID: {schedule.id})")
                
                # 1. 创建备份记录
                # 确定加密密码：自动备份使用系统 JWT_SECRET 作为默认密码
                # 只有当计划要求加密时才设置
                encrypt_password = None
                if schedule.is_encrypted:
                    settings = get_settings()
                    encrypt_password = settings.jwt_secret
                
                new_backup = BackupRecord(
                    backup_type=schedule.backup_type,
                    status=BackupStatus.PENDING.value,
                    description=f"自动调度: {schedule.name}",
                    is_encrypted=schedule.is_encrypted,
                    created_by=schedule.created_by # 这里可能为 None 或指向创建计划的管理员
                )
                db.add(new_backup)
                await db.flush() # 获取 ID
                await db.refresh(new_backup)
                
                # 2. 执行备份
                # 由于 execute_backup_task_sync 是阻塞的 IO 操作，使用线程池运行
                from fastapi.concurrency import run_in_threadpool
                # 注意：这里我们立即等待它完成，或者可以放飞它？
                # 如果放飞它，需要确保它不会出错。
                # 最好使用 run_in_threadpool 并在本任务中等待，或者创建 BackgroundTask。
                # 但这里是在调度循环中，如果等待时间过长会阻塞其他任务。
                # 考虑到这是 Asyncio，await run_in_threadpool 是非阻塞的。
                
                # 开始执行
                await run_in_threadpool(
                    execute_backup_task_sync, 
                    new_backup.id, 
                    schedule.backup_type, 
                    encrypt_password
                )
                
                # 3. 更新调度计划时间
                schedule.last_run_at = now
                schedule.last_status = 'success' # 简化处理，实际状态在 BackupRecord 中
                
                # 计算下一次时间
                schedule.next_run_at = calculate_next_run(
                    schedule.schedule_type,
                    schedule.schedule_time,
                    schedule.schedule_day
                )
                
                # 4. (可选) 清理过期备份
                if schedule.retention_days > 0:
                    # TODO: 实现自动清理逻辑
                    # 可以开启一个新的后台任务去清理
                    pass
                
                db.add(schedule)
                await db.commit()
                logger.info(f"计划 {schedule.name} 执行完毕，下次执行: {schedule.next_run_at}")
                
        except Exception as e:
            logger.error(f"检查备份计划失败: {e}", exc_info=True)
            await db.rollback()
