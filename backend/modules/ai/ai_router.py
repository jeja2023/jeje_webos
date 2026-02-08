"""
AI助手模块路由
"""

import os
import json
import asyncio
import logging
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from typing import List, Dict, Optional, Any
from datetime import datetime
from utils.timezone import get_beijing_time
from pydantic import BaseModel

from core.security import get_current_user, TokenData, encrypt_data, decrypt_data
from core.database import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from .ai_service import AIService
from .ai_session_service import AISessionService
from schemas.response import success, error
from models.system_secrets import SystemSecret

logger = logging.getLogger(__name__)

router = APIRouter()

class ChatRequest(BaseModel):
    query: str
    history: List[Dict[str, str]] = []
    knowledge_base_id: Optional[int] = None
    use_analysis: bool = False
    provider: str = "local" # local: 本地模式 | online: 在线模式
    role_preset: str = "default"  # 角色预设: default/coder/writer/translator/analyst
    model_name: Optional[str] = None  # 本地模型名称，为None时使用默认模型
    api_config: Optional[Dict[str, str]] = None # 允许前端传入临时配置
    session_id: Optional[int] = None # 会话ID，如果提供则保存消息到此会话

    model_config = {"protected_namespaces": ()}

@router.get("/status")
async def get_status(
    user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """检查模型状态与可用模型"""
    try:
        models_dir = AIService.get_model_path("")
        available_models = []
        if os.path.exists(models_dir):
            available_models = [f for f in os.listdir(models_dir) if f.endswith(".gguf")]
        
        # 检查是否已配置在线 API Key
        has_online_config = False
        try:
            result = await db.execute(
                select(SystemSecret).where(
                    SystemSecret.user_id == user.user_id,
                    SystemSecret.key_name == "ai_api_key"
                )
            )
            if result.scalar_one_or_none():
                has_online_config = True
        except Exception:
            pass # 忽略数据库查询错误，视为未配置

        return success(data={
            "status": "ready",
            "available_models": available_models,
            "engine": "llama-cpp-python (Offline) / Online Hybrid",
            "has_online_config": has_online_config
        })
    except Exception as e:
        return error(message=str(e))

class AIConfigSetRequest(BaseModel):
    api_key: str
    base_url: Optional[str] = "https://api.deepseek.com/v1"
    model: Optional[str] = "deepseek-chat"

@router.post("/config")
async def save_ai_config(
    request: AIConfigSetRequest,
    user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """保存 AI 在线配置（加密存储）"""
    try:
        if not request.api_key:
            return error(message="API Key 不能为空")
            
        # 查询现有配置
        result = await db.execute(
            select(SystemSecret).where(
                SystemSecret.user_id == user.user_id,
                SystemSecret.key_name == "ai_api_key"
            )
        )
        existing_secret = result.scalar_one_or_none()
        
        encrypted_key = encrypt_data(request.api_key)
        additional_info = {
            "base_url": request.base_url,
            "model": request.model
        }
        
        if existing_secret:
            existing_secret.encrypted_value = encrypted_key
            existing_secret.additional_info = additional_info
            existing_secret.updated_at = get_beijing_time()
        else:
            new_secret = SystemSecret(
                user_id=user.user_id,
                category="ai",
                key_name="ai_api_key",
                encrypted_value=encrypted_key,
                additional_info=additional_info
            )
            db.add(new_secret)
            
        await db.commit()
        return success(message="AI 配置已安全保存")
    except Exception as e:
        await db.rollback()
        logger.error(f"保存配置失败: {e}")
        return error(message="保存配置失败")

@router.post("/chat")
async def chat(
    request: ChatRequest,
    user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    流式对话接口 (SSE)
    支持本地和在线混合模式
    自动保存消息到数据库
    """
    from datetime import datetime
    
    # 提前获取 API 配置（如果是在线模式且没有传入临时配置）
    db_api_config = None
    if request.provider == "online" and not request.api_config:
        try:
            result = await db.execute(
                select(SystemSecret).where(
                    SystemSecret.user_id == user.user_id,
                    SystemSecret.key_name == "ai_api_key"
                )
            )
            secret = result.scalar_one_or_none()
            if secret:
                api_key = decrypt_data(secret.encrypted_value)
                if api_key:
                    db_api_config = {
                        "apiKey": api_key,
                        "baseUrl": secret.additional_info.get("base_url", "https://api.deepseek.com/v1"),
                        "model": secret.additional_info.get("model", "deepseek-chat")
                    }
        except Exception as e:
            logger.warning(f"获取 AI 配置失败: {e}")

    # 保存用户消息到数据库
    session_id = request.session_id
    user_message_id = None
    
    if session_id:
        try:
            # 验证会话所有权
            session = await AISessionService.get_session(db, session_id, user.user_id)
            if session:
                # 保存用户消息
                user_message = await AISessionService.add_message(
                    db, session_id, user.user_id,
                    role='user',
                    content=request.query
                )
                if user_message:
                    user_message_id = user_message.id
        except Exception as e:
            logger.warning(f"保存用户消息失败: {e}")
    
    async def event_generator():
        ai_content = ""
        cancelled = False
        try:
            # 立即发送连接确认，确保响应头立即发送给各层中间件
            yield ": connection established\n\n"
            
            # 获取流式迭代器
            # 移回内部以确保 Response 对象能立即返回，避免中间件等待
            try:
                response_iter = await AIService.chat_with_context(
                    query=request.query,
                    history=request.history,
                    knowledge_base_id=request.knowledge_base_id,
                    use_analysis=request.use_analysis,
                    provider=request.provider,
                    role_preset=request.role_preset,
                    model_name=request.model_name,
                    api_config=db_api_config or request.api_config # 优先使用数据库配置
                )

                if asyncio.iscoroutine(response_iter):
                    response_iter = await response_iter
            except Exception as service_err:
                 # 如果初始化失败，在流中返回错误信息
                logger.error(f"AI 服务初始化失败: {service_err}")
                err_data = json.dumps({"error": str(service_err)}, ensure_ascii=False)
                try:
                    yield f"data: {err_data}\n\n"
                except (BrokenPipeError, ConnectionResetError, OSError):
                    # 客户端已断开，忽略
                    pass
                return

            async for chunk in response_iter:
                try:
                    if "choices" in chunk and len(chunk["choices"]) > 0:
                        delta = chunk["choices"][0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            ai_content += content
                            data = json.dumps({"content": content}, ensure_ascii=False)
                            try:
                                yield f"data: {data}\n\n"
                            except (BrokenPipeError, ConnectionResetError, OSError) as send_err:
                                # 客户端已断开连接，停止生成
                                logger.info(f"客户端断开连接: {send_err}")
                                cancelled = True
                                break
                    
                    await asyncio.sleep(0.01)
                except (asyncio.CancelledError, BrokenPipeError, ConnectionResetError, OSError) as conn_err:
                    # 在迭代过程中检测到连接断开或取消
                    logger.info(f"检测到连接断开或取消: {type(conn_err).__name__}")
                    cancelled = True
                    break

            # 流式响应完成后，保存AI消息到数据库
            if session_id and ai_content:
                try:
                    from core.database import async_session
                    async with async_session() as new_db:
                        await AISessionService.add_message(
                            new_db, session_id, user.user_id,
                            role='assistant',
                            content=ai_content + (" [已停止]" if cancelled else "")
                        )
                except Exception as e:
                    logger.warning(f"保存AI消息失败: {e}")

            # 发送完成标记，如果客户端已断开则忽略异常
            if not cancelled:
                try:
                    yield "data: [DONE]\n\n"
                except (BrokenPipeError, ConnectionResetError, OSError):
                    # 客户端已断开，忽略
                    pass

        except (asyncio.CancelledError, BrokenPipeError, ConnectionResetError, OSError) as disconnect_err:
            # 客户端断开连接或取消请求
            logger.info(f"AI生成被用户取消或连接断开: {type(disconnect_err).__name__}")
            cancelled = True
            # 如果已有部分内容，尝试保存已生成的部分
            if session_id and ai_content:
                try:
                    from core.database import async_session
                    async with async_session() as new_db:
                        await AISessionService.add_message(
                            new_db, session_id, user.user_id,
                            role='assistant',
                            content=ai_content + " [已停止]"
                        )
                except Exception as save_err:
                    logger.debug(f"保存已停止消息失败: {save_err}")
            # 尝试发送结束标记，确保生成器正常结束
            try:
                yield "data: [CANCELLED]\n\n"
            except (BrokenPipeError, ConnectionResetError, OSError, asyncio.CancelledError):
                # 客户端已断开或已取消，忽略
                pass
            
        except Exception as e:
            # 详细的错误分类和处理
            error_type = type(e).__name__
            error_message = str(e)
            
            # 错误分类和友好提示
            user_friendly_message = error_message
            suggestions = []
            
            if "未配置在线 API Key" in error_message or "api_key" in error_message.lower():
                user_friendly_message = "未配置在线 API Key，请先设置 API 配置"
                suggestions.append("点击右上角设置按钮配置 API Key")
            elif "Model file not found" in error_message or "模型文件不存在" in error_message:
                user_friendly_message = "本地模型文件不存在"
                suggestions.append("请确保模型文件已正确放置在 storage/modules/ai/models/ 目录下")
            elif "网络" in error_message or "network" in error_message.lower() or "timeout" in error_message.lower():
                user_friendly_message = "网络连接失败，请检查网络设置"
                suggestions.append("检查网络连接")
                suggestions.append("如果使用在线API，请检查API服务是否可用")
            elif "SQL" in error_type or "sql" in error_message.lower():
                user_friendly_message = f"SQL 查询错误: {error_message}"
                suggestions.append("请检查 SQL 语法是否正确")
                suggestions.append("确保表名和列名存在")
            elif "数据分析" in error_message or "analysis" in error_message.lower():
                user_friendly_message = f"数据分析错误: {error_message}"
                suggestions.append("请检查数据集是否存在")
                suggestions.append("确保已开启数据助手功能")
            else:
                user_friendly_message = f"发生错误: {error_message}"
            
            # 保存错误消息到数据库
            if session_id:
                try:
                    from core.database import async_session
                    async with async_session() as new_db:
                        await AISessionService.add_message(
                            new_db, session_id, user.user_id,
                            role='system',
                            content=f"❌ 错误: {user_friendly_message}",
                            is_error=True
                        )
                except Exception as save_err:
                    logger.warning(f"保存错误消息失败: {save_err}")
            
            err_data = json.dumps({
                "error": user_friendly_message,
                "error_type": error_type,
                "suggestions": suggestions,
                "original_error": error_message if error_message != user_friendly_message else None
            }, ensure_ascii=False)
            try:
                yield f"data: {err_data}\n\n"
            except (BrokenPipeError, ConnectionResetError, OSError):
                # 客户端已断开，忽略
                pass
        finally:
            # 确保生成器正常结束，即使发生异常
            pass

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ==================== 会话管理接口 ====================

@router.get("/sessions")
async def list_sessions(
    user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取用户的会话列表"""
    try:
        sessions = await AISessionService.list_sessions(db, user.user_id)
        return success(data=[{
            "id": s.id,
            "title": s.title,
            "provider": s.provider,
            "knowledge_base_id": s.knowledge_base_id,
            "use_analysis": s.use_analysis,
            "updated_at": s.updated_at.isoformat() if s.updated_at else None,
            "created_at": s.created_at.isoformat() if s.created_at else None
        } for s in sessions])
    except Exception as e:
        return error(message=str(e))


@router.get("/sessions/{session_id}")
async def get_session(
    session_id: int,
    user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """获取单个会话（包含消息）"""
    try:
        session = await AISessionService.get_session(db, session_id, user.user_id)
        if not session:
            return error(message="会话不存在")
        
        return success(data={
            "id": session.id,
            "title": session.title,
            "provider": session.provider,
            "knowledge_base_id": session.knowledge_base_id,
            "use_analysis": session.use_analysis,
            "config": session.config or {},
            "messages": [{
                "id": m.id,
                "role": m.role,
                "content": m.content,
                "isError": m.is_error,
                "created_at": m.created_at.isoformat() if m.created_at else None
            } for m in session.messages],
            "updated_at": session.updated_at.isoformat() if session.updated_at else None,
            "created_at": session.created_at.isoformat() if session.created_at else None
        })
    except Exception as e:
        return error(message=str(e))


class SessionCreateRequest(BaseModel):
    title: str = "新对话"
    provider: str = "local"
    knowledge_base_id: Optional[int] = None
    use_analysis: bool = False
    config: Optional[Dict[str, Any]] = None


@router.post("/sessions")
async def create_session(
    request: SessionCreateRequest,
    user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """创建新会话"""
    try:
        session = await AISessionService.create_session(
            db, user.user_id,
            title=request.title,
            provider=request.provider,
            knowledge_base_id=request.knowledge_base_id,
            use_analysis=request.use_analysis,
            config=request.config
        )
        return success(data={
            "id": session.id,
            "title": session.title,
            "provider": session.provider,
            "updated_at": session.updated_at.isoformat() if session.updated_at else None
        })
    except Exception as e:
        return error(message=str(e))


class SessionUpdateRequest(BaseModel):
    title: Optional[str] = None
    provider: Optional[str] = None
    knowledge_base_id: Optional[int] = None
    use_analysis: Optional[bool] = None
    config: Optional[Dict[str, Any]] = None


@router.put("/sessions/{session_id}")
async def update_session(
    session_id: int,
    request: SessionUpdateRequest,
    user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """更新会话"""
    try:
        session = await AISessionService.update_session(
            db, session_id, user.user_id,
            title=request.title,
            provider=request.provider,
            knowledge_base_id=request.knowledge_base_id,
            use_analysis=request.use_analysis,
            config=request.config
        )
        if not session:
            return error(message="会话不存在")
        
        return success(data={
            "id": session.id,
            "title": session.title,
            "provider": session.provider,
            "updated_at": session.updated_at.isoformat() if session.updated_at else None
        })
    except Exception as e:
        return error(message=str(e))


@router.delete("/sessions/{session_id}")
async def delete_session(
    session_id: int,
    user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """删除会话"""
    try:
        success_flag = await AISessionService.delete_session(db, session_id, user.user_id)
        if not success_flag:
            return error(message="会话不存在")
        return success(message="已删除")
    except Exception as e:
        return error(message=str(e))


class SessionSaveRequest(BaseModel):
    sessions: List[Dict[str, Any]]
    active_session_id: Optional[int] = None


@router.post("/sessions/save")
async def save_sessions(
    request: SessionSaveRequest,
    user: TokenData = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """批量保存会话（用于同步）"""
    try:
        saved_sessions = []
        for session_data in request.sessions:
            session = await AISessionService.save_session_with_messages(db, user.user_id, session_data)
            saved_sessions.append({
                "id": session.id,
                "title": session.title,
                "provider": session.provider,
                "updated_at": session.updated_at.isoformat() if session.updated_at else None
            })
        
        return success(data={
            "sessions": saved_sessions,
            "count": len(saved_sessions)
        })
    except Exception as e:
        return error(message=str(e))
