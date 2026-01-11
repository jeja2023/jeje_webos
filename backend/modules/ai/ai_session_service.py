"""
AI 会话管理服务
"""

import logging
from typing import List, Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload

from .ai_models import AIChatSession, AIChatMessage

logger = logging.getLogger(__name__)


class AISessionService:
    """AI会话服务"""
    
    @staticmethod
    async def list_sessions(db: AsyncSession, user_id: int, limit: int = 50) -> List[AIChatSession]:
        """获取用户的会话列表"""
        result = await db.execute(
            select(AIChatSession)
            .where(AIChatSession.user_id == user_id)
            .order_by(AIChatSession.updated_at.desc())
            .limit(limit)
        )
        return result.scalars().all()
    
    @staticmethod
    async def get_session(db: AsyncSession, session_id: int, user_id: int) -> Optional[AIChatSession]:
        """获取单个会话（包含消息）"""
        result = await db.execute(
            select(AIChatSession)
            .options(selectinload(AIChatSession.messages))
            .where(
                AIChatSession.id == session_id,
                AIChatSession.user_id == user_id
            )
        )
        return result.scalar_one_or_none()
    
    @staticmethod
    async def create_session(
        db: AsyncSession,
        user_id: int,
        title: str = "新对话",
        provider: str = "local",
        knowledge_base_id: Optional[int] = None,
        use_analysis: bool = False,
        config: Optional[Dict[str, Any]] = None
    ) -> AIChatSession:
        """创建新会话"""
        session = AIChatSession(
            user_id=user_id,
            title=title,
            provider=provider,
            knowledge_base_id=knowledge_base_id,
            use_analysis=use_analysis,
            config=config or {}
        )
        db.add(session)
        await db.commit()
        await db.refresh(session)
        return session
    
    @staticmethod
    async def update_session(
        db: AsyncSession,
        session_id: int,
        user_id: int,
        title: Optional[str] = None,
        provider: Optional[str] = None,
        knowledge_base_id: Optional[int] = None,
        use_analysis: Optional[bool] = None,
        config: Optional[Dict[str, Any]] = None
    ) -> Optional[AIChatSession]:
        """更新会话"""
        session = await AISessionService.get_session(db, session_id, user_id)
        if not session:
            return None
        
        if title is not None:
            session.title = title
        if provider is not None:
            session.provider = provider
        if knowledge_base_id is not None:
            session.knowledge_base_id = knowledge_base_id
        if use_analysis is not None:
            session.use_analysis = use_analysis
        if config is not None:
            session.config = {**(session.config or {}), **config}
        
        await db.commit()
        await db.refresh(session)
        return session
    
    @staticmethod
    async def delete_session(db: AsyncSession, session_id: int, user_id: int) -> bool:
        """删除会话"""
        session = await AISessionService.get_session(db, session_id, user_id)
        if not session:
            return False
        
        await db.delete(session)
        await db.commit()
        return True
    
    @staticmethod
    async def add_message(
        db: AsyncSession,
        session_id: int,
        user_id: int,
        role: str,
        content: str,
        is_error: bool = False
    ) -> Optional[AIChatMessage]:
        """添加消息到会话"""
        # 验证会话所有权
        session = await db.get(AIChatSession, session_id)
        if not session or session.user_id != user_id:
            return None
        
        message = AIChatMessage(
            session_id=session_id,
            role=role,
            content=content,
            is_error=is_error
        )
        db.add(message)
        await db.commit()
        await db.refresh(message)
        
        # 更新会话时间
        from utils.timezone import get_beijing_time
        session.updated_at = get_beijing_time()
        await db.commit()
        
        return message
    
    @staticmethod
    async def save_session_with_messages(
        db: AsyncSession,
        user_id: int,
        session_data: Dict[str, Any]
    ) -> AIChatSession:
        """保存会话及其消息（用于批量保存）"""
        session_id = session_data.get('id')
        messages = session_data.get('messages', [])
        
        if session_id:
            # 更新现有会话
            session = await AISessionService.get_session(db, session_id, user_id)
            if not session:
                # 如果会话不存在，创建新会话
                session = await AISessionService.create_session(
                    db, user_id,
                    title=session_data.get('title', '新对话'),
                    provider=session_data.get('provider', 'local'),
                    knowledge_base_id=session_data.get('knowledge_base_id'),
                    use_analysis=session_data.get('use_analysis', False),
                    config=session_data.get('config', {})
                )
        else:
            # 创建新会话
            session = await AISessionService.create_session(
                db, user_id,
                title=session_data.get('title', '新对话'),
                provider=session_data.get('provider', 'local'),
                knowledge_base_id=session_data.get('knowledge_base_id'),
                use_analysis=session_data.get('use_analysis', False),
                config=session_data.get('config', {})
            )
        
        # 删除旧消息
        await db.execute(delete(AIChatMessage).where(AIChatMessage.session_id == session.id))
        
        # 添加新消息
        for msg_data in messages:
            if msg_data.get('role') and msg_data.get('content'):
                message = AIChatMessage(
                    session_id=session.id,
                    role=msg_data['role'],
                    content=msg_data['content'],
                    is_error=msg_data.get('isError', False) or msg_data.get('is_error', False)
                )
                db.add(message)
        
        await db.commit()
        await db.refresh(session)
        return session




