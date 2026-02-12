"""
反馈API路由
RESTful风格
"""

from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from core.database import get_db
from core.security import get_current_user, TokenData, require_permission, require_admin
from core.errors import NotFoundException, PermissionException
from core.events import event_bus, Events
from schemas import success, paginate

from .feedback_schemas import (
    FeedbackCreate, FeedbackUpdate, FeedbackReply, FeedbackAdminUpdate,
    FeedbackInfo, FeedbackListItem
)
from .feedback_models import FeedbackStatus, FeedbackType, FeedbackPriority
from .feedback_services import FeedbackService

router = APIRouter()


# ============ 用户接口 ============

@router.get("")
async def list_feedbacks(
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
    status: Optional[FeedbackStatus] = None,
    type: Optional[FeedbackType] = None,
    priority: Optional[FeedbackPriority] = None,
    keyword: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("feedback.read"))
):
    """
    获取反馈列表
    普通用户只能查看自己的，管理员可以查看所有
    """
    service = FeedbackService(db)
    
    # 判断是否为管理员
    is_admin = current_user.role == "admin" or current_user.role == "super_admin"
    user_id = None if is_admin else current_user.user_id
    
    items, total = await service.get_feedbacks(
        page=page,
        size=size,
        user_id=user_id,
        status=status,
        type=type,
        priority=priority,
        keyword=keyword
    )
    
    items_data = [_enrich_feedback(item, FeedbackListItem) for item in items]
    return paginate(items_data, total, page, size)


def _enrich_feedback(item, schema):
    """填充反馈的关联数据（用户名等）"""
    data = schema.model_validate(item).model_dump()
    if hasattr(item, "user") and item.user:
        data["user_name"] = item.user.nickname or item.user.username
    if hasattr(item, "handler") and item.handler:
        data["handler_name"] = item.handler.nickname or item.handler.username
    return data


@router.get("/my")
async def list_my_feedbacks(
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
    status: Optional[FeedbackStatus] = None,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("feedback.read"))
):
    """获取我的反馈列表"""
    service = FeedbackService(db)
    items, total = await service.get_feedbacks(
        page=page,
        size=size,
        user_id=current_user.user_id,
        status=status
    )
    
    items_data = [_enrich_feedback(item, FeedbackListItem) for item in items]
    return paginate(items_data, total, page, size)


@router.get("/{feedback_id}")
async def get_feedback(
    feedback_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("feedback.read"))
):
    """获取反馈详情"""
    service = FeedbackService(db)
    feedback = await service.get_feedback(feedback_id)
    
    if not feedback:
        raise NotFoundException("反馈")
    
    # 权限检查：普通用户只能查看自己的
    is_admin = current_user.role == "admin" or current_user.role == "super_admin"
    if not is_admin and feedback.user_id != current_user.user_id:
        raise PermissionException("无权查看此反馈")
    
    return success(_enrich_feedback(feedback, FeedbackInfo))


@router.post("")
async def create_feedback(
    data: FeedbackCreate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("feedback.create"))
):
    """提交反馈"""
    service = FeedbackService(db)
    feedback = await service.create_feedback(data, current_user.user_id)
    
    # 发布事件
    event_bus.emit(
        Events.CONTENT_CREATED,
        "feedback",
        {"type": "feedback", "id": feedback.id, "user_id": current_user.user_id}
    )
    
    return success(_enrich_feedback(feedback, FeedbackInfo), "提交成功")


@router.put("/{feedback_id}")
async def update_feedback(
    feedback_id: int,
    data: FeedbackUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("feedback.update"))
):
    """更新反馈（只能更新自己的待处理反馈）"""
    service = FeedbackService(db)
    feedback = await service.update_feedback(feedback_id, data, current_user.user_id)
    
    if not feedback:
        raise NotFoundException("反馈")
    
    return success(_enrich_feedback(feedback, FeedbackInfo), "更新成功")


@router.delete("/{feedback_id}")
async def delete_feedback(
    feedback_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("feedback.delete"))
):
    """删除反馈（只能删除自己的）"""
    service = FeedbackService(db)
    
    # 管理员可以删除任何反馈
    is_admin = current_user.role == "admin" or current_user.role == "super_admin"
    user_id = None if is_admin else current_user.user_id
    
    success_flag = await service.delete_feedback(feedback_id, user_id)
    
    if not success_flag:
        raise NotFoundException("反馈")
    
    return success(None, "删除成功")


# ============ 管理员接口 ============

@router.get("/admin/all")
async def list_all_feedbacks(
    page: int = Query(1, ge=1),
    size: int = Query(10, ge=1, le=100),
    status: Optional[FeedbackStatus] = None,
    type: Optional[FeedbackType] = None,
    priority: Optional[FeedbackPriority] = None,
    keyword: Optional[str] = None,
    handler_id: Optional[int] = None,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("feedback.admin"))
):
    """获取所有反馈列表（管理员）"""
    service = FeedbackService(db)
    items, total = await service.get_feedbacks(
        page=page,
        size=size,
        status=status,
        type=type,
        priority=priority,
        keyword=keyword,
        handler_id=handler_id
    )
    
    items_data = [_enrich_feedback(item, FeedbackListItem) for item in items]
    return paginate(items_data, total, page, size)


@router.post("/{feedback_id}/reply")
async def reply_feedback(
    feedback_id: int,
    data: FeedbackReply,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("feedback.update"))
):
    """回复反馈（管理员）"""
    service = FeedbackService(db)
    feedback = await service.reply_feedback(feedback_id, data, current_user.user_id)
    
    if not feedback:
        raise NotFoundException("反馈")
    
    # 发布事件
    event_bus.emit(
        Events.CONTENT_UPDATED,
        "feedback",
        {"type": "feedback", "id": feedback_id, "handler_id": current_user.user_id}
    )
    
    return success(_enrich_feedback(feedback, FeedbackInfo), "回复成功")


@router.put("/{feedback_id}/admin")
async def admin_update_feedback(
    feedback_id: int,
    data: FeedbackAdminUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("feedback.admin"))
):
    """管理员更新反馈"""
    service = FeedbackService(db)
    feedback = await service.admin_update_feedback(feedback_id, data)
    
    if not feedback:
        raise NotFoundException("反馈")
    
    return success(_enrich_feedback(feedback, FeedbackInfo), "更新成功")


@router.get("/admin/statistics")
async def get_statistics(
    db: AsyncSession = Depends(get_db),
    current_user: TokenData = Depends(require_permission("feedback.admin"))
):
    """获取统计信息（管理员）"""
    service = FeedbackService(db)
    stats = await service.get_statistics()
    return success(stats)

