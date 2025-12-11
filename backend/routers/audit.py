"""
审计日志接口
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func, and_
from sqlalchemy.orm import aliased

from core.database import get_db
from core.security import require_permission, require_manager, TokenData
from schemas import paginate, success
from models import SystemLog, User

router = APIRouter(prefix="/api/v1/audit", tags=["审计"])


@router.get("")
async def list_logs(
    level: str = Query(None, description="INFO/WARNING/ERROR"),
    module: str = Query(None),
    action: str = Query(None),
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    user: TokenData = Depends(require_manager())
):
    """分页查询审计日志"""
    conditions = []
    if level and level != "undefined":
        conditions.append(SystemLog.level == level)
    if module and module != "undefined":
        conditions.append(SystemLog.module == module)
    if action and action != "undefined":
        conditions.append(SystemLog.action == action)

    where_clause = and_(*conditions) if conditions else None

    # 统计总数
    count_stmt = select(func.count()).select_from(SystemLog)
    if where_clause is not None:
        count_stmt = count_stmt.where(where_clause)
    total = (await db.execute(count_stmt)).scalar() or 0

    # 分页数据 - 使用 LEFT JOIN 关联用户表获取用户名
    data_stmt = (
        select(SystemLog, User.username)
        .outerjoin(User, SystemLog.user_id == User.id)
        .order_by(desc(SystemLog.created_at))
        .offset((page - 1) * size)
        .limit(size)
    )
    if where_clause is not None:
        data_stmt = data_stmt.where(where_clause)

    result = await db.execute(data_stmt)
    items = [
        {
            "id": row.SystemLog.id,
            "level": row.SystemLog.level,
            "module": row.SystemLog.module,
            "action": row.SystemLog.action,
            "message": row.SystemLog.message,
            "username": row.username or f"用户#{row.SystemLog.user_id}" if row.SystemLog.user_id else "系统",
            "ip_address": row.SystemLog.ip_address,
            "user_agent": getattr(row.SystemLog, 'user_agent', None),
            "request_method": getattr(row.SystemLog, 'request_method', None),
            "request_path": getattr(row.SystemLog, 'request_path', None),
            "created_at": row.SystemLog.created_at
        }
        for row in result.all()
    ]

    return paginate(items, total, page, size)


