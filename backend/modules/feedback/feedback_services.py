"""
意见建议服务层
"""

from typing import List, Optional, Tuple
from datetime import datetime, timezone
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, and_, or_

from .feedback_models import Feedback, FeedbackStatus, FeedbackType, FeedbackPriority
from .feedback_schemas import (
    FeedbackCreate, FeedbackUpdate, FeedbackAdminUpdate, FeedbackReply
)


class FeedbackService:
    """意见建议服务"""
    
    def __init__(self, db: AsyncSession):
        self.db = db
    
    async def create_feedback(self, data: FeedbackCreate, user_id: int) -> Feedback:
        """创建意见建议"""
        feedback = Feedback(
            title=data.title,
            content=data.content,
            type=data.type,
            priority=data.priority,
            user_id=user_id,
            contact=data.contact,
            attachments=data.attachments,
            status=FeedbackStatus.PENDING
        )
        self.db.add(feedback)
        await self.db.commit()
        await self.db.refresh(feedback)
        return feedback
    
    async def get_feedback(self, feedback_id: int) -> Optional[Feedback]:
        """获取意见建议详情"""
        result = await self.db.execute(
            select(Feedback).where(Feedback.id == feedback_id)
        )
        return result.scalar_one_or_none()
    
    async def get_feedbacks(
        self,
        page: int = 1,
        size: int = 10,
        user_id: Optional[int] = None,
        status: Optional[FeedbackStatus] = None,
        type: Optional[FeedbackType] = None,
        priority: Optional[FeedbackPriority] = None,
        keyword: Optional[str] = None,
        handler_id: Optional[int] = None
    ) -> Tuple[List[Feedback], int]:
        """获取意见建议列表"""
        query = select(Feedback)
        conditions = []
        
        # 用户筛选（普通用户只能看自己的）
        if user_id:
            conditions.append(Feedback.user_id == user_id)
        
        # 状态筛选
        if status:
            conditions.append(Feedback.status == status)
        
        # 类型筛选
        if type:
            conditions.append(Feedback.type == type)
        
        # 优先级筛选
        if priority:
            conditions.append(Feedback.priority == priority)
        
        # 处理人筛选
        if handler_id:
            conditions.append(Feedback.handler_id == handler_id)
        
        # 关键词搜索
        if keyword:
            conditions.append(
                or_(
                    Feedback.title.contains(keyword),
                    Feedback.content.contains(keyword)
                )
            )
        
        if conditions:
            query = query.where(and_(*conditions))
        
        # 总数
        count_query = select(func.count()).select_from(Feedback)
        if conditions:
            count_query = count_query.where(and_(*conditions))
        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0
        
        # 排序和分页
        query = query.order_by(
            desc(Feedback.priority == FeedbackPriority.URGENT),
            desc(Feedback.priority == FeedbackPriority.HIGH),
            desc(Feedback.created_at)
        )
        query = query.offset((page - 1) * size).limit(size)
        
        result = await self.db.execute(query)
        items = result.scalars().all()
        
        return list(items), total
    
    async def update_feedback(
        self,
        feedback_id: int,
        data: FeedbackUpdate,
        user_id: int
    ) -> Optional[Feedback]:
        """更新意见建议（用户）"""
        result = await self.db.execute(
            select(Feedback).where(
                and_(
                    Feedback.id == feedback_id,
                    Feedback.user_id == user_id,
                    Feedback.status == FeedbackStatus.PENDING  # 只能修改待处理的
                )
            )
        )
        feedback = result.scalar_one_or_none()
        if not feedback:
            return None
        
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(feedback, key, value)
        
        await self.db.commit()
        await self.db.refresh(feedback)
        return feedback
    
    async def reply_feedback(
        self,
        feedback_id: int,
        data: FeedbackReply,
        handler_id: int
    ) -> Optional[Feedback]:
        """回复意见建议（管理员）"""
        result = await self.db.execute(
            select(Feedback).where(Feedback.id == feedback_id)
        )
        feedback = result.scalar_one_or_none()
        if not feedback:
            return None
        
        feedback.reply_content = data.reply_content
        feedback.reply_at = datetime.now(timezone.utc)
        feedback.handler_id = handler_id
        
        # 如果指定了状态，更新状态
        if data.status:
            feedback.status = data.status
            if data.status == FeedbackStatus.RESOLVED:
                feedback.resolved_at = datetime.now(timezone.utc)
        
        await self.db.commit()
        await self.db.refresh(feedback)
        return feedback
    
    async def admin_update_feedback(
        self,
        feedback_id: int,
        data: FeedbackAdminUpdate
    ) -> Optional[Feedback]:
        """管理员更新意见建议"""
        result = await self.db.execute(
            select(Feedback).where(Feedback.id == feedback_id)
        )
        feedback = result.scalar_one_or_none()
        if not feedback:
            return None
        
        update_data = data.model_dump(exclude_unset=True)
        for key, value in update_data.items():
            setattr(feedback, key, value)
        
        # 如果状态变为已解决，设置解决时间
        if data.status == FeedbackStatus.RESOLVED and not feedback.resolved_at:
            feedback.resolved_at = datetime.now(timezone.utc)
        
        await self.db.commit()
        await self.db.refresh(feedback)
        return feedback
    
    async def delete_feedback(self, feedback_id: int, user_id: Optional[int] = None) -> bool:
        """删除意见建议"""
        conditions = [Feedback.id == feedback_id]
        
        # 如果不是管理员，只能删除自己的
        if user_id:
            conditions.append(Feedback.user_id == user_id)
        
        result = await self.db.execute(
            select(Feedback).where(and_(*conditions))
        )
        feedback = result.scalar_one_or_none()
        if not feedback:
            return False
        
        await self.db.delete(feedback)
        await self.db.commit()
        return True
    
    async def get_statistics(self) -> dict:
        """获取统计信息（管理员）"""
        # 总数
        total_result = await self.db.execute(select(func.count(Feedback.id)))
        total = total_result.scalar() or 0
        
        # 按状态统计
        status_result = await self.db.execute(
            select(Feedback.status, func.count(Feedback.id))
            .group_by(Feedback.status)
        )
        status_stats = {row[0]: row[1] for row in status_result.all()}
        
        # 按类型统计
        type_result = await self.db.execute(
            select(Feedback.type, func.count(Feedback.id))
            .group_by(Feedback.type)
        )
        type_stats = {row[0]: row[1] for row in type_result.all()}
        
        # 待处理数量
        pending_count = status_stats.get(FeedbackStatus.PENDING, 0)
        
        return {
            "total": total,
            "pending": pending_count,
            "processing": status_stats.get(FeedbackStatus.PROCESSING, 0),
            "resolved": status_stats.get(FeedbackStatus.RESOLVED, 0),
            "closed": status_stats.get(FeedbackStatus.CLOSED, 0),
            "by_type": type_stats,
            "by_status": status_stats
        }

