"""
中间件模块
提供请求日志、性能监控等中间件
"""

import time
import uuid
import logging
from typing import Callable, Optional

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp
from utils.request import get_client_ip
from utils.timezone import get_beijing_time

logger = logging.getLogger(__name__)


# ==================== 敏感数据脱敏工具 ====================
def mask_sensitive_data(data, _depth: int = 0) -> object:
    """
    递归脱敏敏感数据
    支持 dict, list, str 类型
    增加深度限制防止恶意嵌套导致栈溢出
    """
    if _depth > 20:
        return "[嵌套过深，已截断]"
    if isinstance(data, dict):
        new_data = {}
        for k, v in data.items():
            if isinstance(k, str) and any(s in k.lower() for s in ["password", "token", "secret", "credential", "auth"]):
                new_data[k] = "******"
            else:
                new_data[k] = mask_sensitive_data(v, _depth + 1)
        return new_data
    elif isinstance(data, list):
        return [mask_sensitive_data(item, _depth + 1) for item in data]
    else:
        return data


def _handle_no_response_error(request: Request, middleware_name: str = "") -> Response:
    """
    统一处理 'No response returned' 错误（客户端断开连接）
    提取为公共方法，消除多个中间件中的重复代码
    """
    path = request.url.path
    suffix = f" ({middleware_name})" if middleware_name else ""
    if path.startswith("/api/v1/ai/chat"):
        logger.debug(f"[客户端断开] {request.method} {path}{suffix}")
    else:
        logger.info(f"[客户端断开] {request.method} {path}{suffix}")
    return Response(status_code=499)

# 流式响应路径列表 - 这些路径使用 SSE/StreamingResponse，与 BaseHTTPMiddleware 不兼容
# 需要在所有中间件中跳过，避免客户端断开时触发 "No response returned" 错误
STREAMING_PATHS = [
    "/api/v1/ai/chat",           # AI 聊天流式响应
    "/api/v1/video/videos/",      # 视频流文件
    "/api/v1/album/photos/",      # 相册媒体文件
    "/api/v1/storage/download/",  # 通用存储下载
]


class StreamingPathMiddleware:
    """
    纯 ASGI 中间件：处理流式响应路径
    
    这个中间件必须在所有 BaseHTTPMiddleware 之后添加（即最先执行），
    用于捕获流式响应路径的请求，直接传递给应用而不经过其他中间件处理。
    
    这样可以避免 BaseHTTPMiddleware 与 StreamingResponse 的兼容性问题：
    当客户端取消流式请求时，BaseHTTPMiddleware 会抛出 "No response returned" 错误。
    """
    
    def __init__(self, app: ASGIApp):
        self.app = app
    
    async def __call__(self, scope, receive, send):
        if scope["type"] == "http":
            path = scope.get("path", "")
            # 检查是否是流式响应路径
            if any(path.startswith(sp) for sp in STREAMING_PATHS):
                # 直接传递给下一层，不做任何包装处理
                # 这样可以避免 BaseHTTPMiddleware 的问题
                try:
                    await self.app(scope, receive, send)
                except Exception as e:
                    # 捕获所有异常，避免在流式响应取消时产生错误日志
                    error_str = str(e)
                    if "No response returned" in error_str or "CancelledError" in type(e).__name__:
                        logger.debug(f"[流式响应取消] {scope.get('method', 'UNKNOWN')} {path}")
                    else:
                        logger.error(f"[流式响应异常] {scope.get('method', 'UNKNOWN')} {path}: {e}")
                return
        
        # 非流式路径，正常传递
        await self.app(scope, receive, send)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """
    请求日志中间件
    记录所有API请求的详细信息
    """
    
    def __init__(
        self,
        app: ASGIApp,
        skip_paths = None,  # 支持 list 或 set
        log_request_body: bool = False,
        log_response_body: bool = False,
        slow_request_threshold: float = 1.0
    ):
        super().__init__(app)
        default_skip = [
            "/static/",
            "/health",
            "/api/docs",
            "/api/redoc",
            "/api/openapi.json",
            "/favicon.ico"
        ]
        # 确保转换为 list
        self.skip_paths = list(skip_paths) if skip_paths else default_skip
        self.log_request_body = log_request_body
        self.log_response_body = log_response_body
        self.slow_request_threshold = slow_request_threshold
    
    def _should_skip(self, path: str) -> bool:
        """检查是否跳过日志记录"""
        return any(path.startswith(p) for p in self.skip_paths)
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path
        
        # 跳过指定路径
        if self._should_skip(path):
            return await call_next(request)
        
        # 跳过流式响应路径，避免与 StreamingResponse 的兼容性问题
        if any(path.startswith(sp) for sp in STREAMING_PATHS):
            return await call_next(request)
        
        # 复用 RequestContextMiddleware 生成的请求ID，避免重复生成
        request_id = getattr(request.state, 'request_id', None) or uuid.uuid4().hex[:16]
        
        # 记录请求开始时间
        start_time = time.time()
        
        # 获取请求信息
        client_ip = get_client_ip(request)
        method = request.method
        path = request.url.path
        
        # 处理请求
        try:
            response = await call_next(request)
            
            # 计算耗时
            duration = time.time() - start_time
            duration_ms = round(duration * 1000, 2)
            
            # 判断是否慢请求
            is_slow = duration > self.slow_request_threshold
            
            # 只记录慢请求或错误请求
            if is_slow:
                logger.warning(
                    f"[慢请求] {method} {path} | {response.status_code} | {duration_ms}ms"
                )
            elif response.status_code >= 400:
                logger.warning(
                    f"[请求错误] {method} {path} | {response.status_code} | {duration_ms}ms"
                )
            
            # 添加请求ID到响应头
            response.headers["X-Request-ID"] = request_id
            response.headers["X-Response-Time"] = f"{duration_ms}ms"
            
            return response
            
        except RuntimeError as e:
            if "No response returned" in str(e):
                return _handle_no_response_error(request, "RequestLogging")
            logger.error(f"[运行时错误] {method} {path} | {str(e)}")
            raise
            
        except Exception as e:
            # 记录异常
            duration = time.time() - start_time
            duration_ms = round(duration * 1000, 2)
            
            logger.error(
                f"[请求异常] {method} {path} | {duration_ms}ms | {str(e)}"
            )
            raise


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    安全响应头中间件
    添加常见的安全响应头和缓存控制
    """
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path
        
        # 跳过流式响应路径，避免与 StreamingResponse 的兼容性问题
        if any(path.startswith(sp) for sp in STREAMING_PATHS):
            return await call_next(request)
        
        try:
            response = await call_next(request)
        except RuntimeError as e:
            if "No response returned" in str(e):
                return _handle_no_response_error(request, "SecurityHeaders")
            logger.error(f"安全头中间件捕获运行时错误: {e}")
            raise
        except Exception as e:
            logger.error(f"安全头中间件捕获异常: {e}")
            raise
        
        # 添加安全响应头
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "0"  # 已弃用，依赖 CSP 防护
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        # Content-Security-Policy：按实际脚本/样式来源收紧；允许同源与常见内联（SPA 常用）
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' unpkg.com *.unpkg.com; "
            "style-src 'self' 'unsafe-inline' unpkg.com *.unpkg.com; "
            "img-src 'self' data: blob: https:; "
            "font-src 'self' data:; "
            "connect-src 'self' ws: wss: "
            "*.autonavi.com *.amap.com *.openstreetmap.org *.stadiamaps.com *.tianditu.gov.cn *.arcgisonline.com unpkg.com *.unpkg.com; "
            "frame-ancestors 'none'; "
            "base-uri 'self'"
        )
        
        # API 路径禁用缓存，防止浏览器缓存导致数据不更新
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        
        # 移除敏感信息头
        if "Server" in response.headers:
            del response.headers["Server"]
        
        return response


class RequestContextMiddleware(BaseHTTPMiddleware):
    """
    请求上下文中间件
    在请求中注入上下文信息
    """
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # 跳过流式响应路径，避免与 StreamingResponse 的兼容性问题
        if any(request.url.path.startswith(sp) for sp in STREAMING_PATHS):
            return await call_next(request)
        
        # 生成请求ID（始终使用服务端生成，防止客户端伪造和日志注入）
        request_id = uuid.uuid4().hex[:16]
        
        # 存储到 request.state
        request.state.request_id = request_id
        request.state.start_time = time.time()
        request.state.client_ip = get_client_ip(request)
        
        try:
            response = await call_next(request)
        except RuntimeError as e:
            if "No response returned" in str(e):
                return _handle_no_response_error(request, "RequestContext")
            logger.error(f"请求上下文中间件捕获运行时错误: {e}")
            raise
        except Exception as e:
            logger.error(f"请求上下文中间件捕获异常: {e}")
            raise
        
        # 确保响应头包含请求ID
        response.headers["X-Request-ID"] = request_id
        
        return response


# ==================== 请求统计 ====================

class RequestStats:
    """请求统计类（带内存保护）"""
    
    # 最大追踪的路径数量，防止内存无限增长
    MAX_PATH_ENTRIES = 500
    
    def __init__(self):
        self.total_requests = 0
        self.success_requests = 0
        self.error_requests = 0
        self.total_duration = 0.0
        self.path_stats: dict = {}
        self.status_stats: dict = {}
        self.start_time = get_beijing_time()
    
    def record(
        self,
        path: str,
        method: str,
        status_code: int,
        duration: float
    ):
        """记录请求"""
        self.total_requests += 1
        self.total_duration += duration
        
        if 200 <= status_code < 400:
            self.success_requests += 1
        else:
            self.error_requests += 1
        
        # 路径统计（限制最大条目数）
        path_key = f"{method} {path}"
        if path_key not in self.path_stats:
            # 超过上限时，移除访问次数最少的条目
            if len(self.path_stats) >= self.MAX_PATH_ENTRIES:
                min_key = min(self.path_stats, key=lambda k: self.path_stats[k]["count"])
                del self.path_stats[min_key]
            self.path_stats[path_key] = {
                "count": 0,
                "total_duration": 0.0,
                "errors": 0
            }
        self.path_stats[path_key]["count"] += 1
        self.path_stats[path_key]["total_duration"] += duration
        if status_code >= 400:
            self.path_stats[path_key]["errors"] += 1
        
        # 状态码统计
        status_key = str(status_code)
        self.status_stats[status_key] = self.status_stats.get(status_key, 0) + 1
    
    def get_summary(self) -> dict:
        """获取统计摘要"""
        uptime = (get_beijing_time() - self.start_time).total_seconds()
        avg_duration = (
            self.total_duration / self.total_requests 
            if self.total_requests > 0 else 0
        )
        
        # 获取最慢的路径
        slowest_paths = sorted(
            [
                {
                    "path": k,
                    "avg_duration": v["total_duration"] / v["count"] if v["count"] > 0 else 0,
                    "count": v["count"]
                }
                for k, v in self.path_stats.items()
            ],
            key=lambda x: x["avg_duration"],
            reverse=True
        )[:10]
        
        return {
            "uptime_seconds": round(uptime, 2),
            "total_requests": self.total_requests,
            "success_requests": self.success_requests,
            "error_requests": self.error_requests,
            "success_rate": round(
                self.success_requests / self.total_requests * 100, 2
            ) if self.total_requests > 0 else 100,
            "avg_response_time_ms": round(avg_duration * 1000, 2),
            "requests_per_second": round(
                self.total_requests / uptime, 2
            ) if uptime > 0 else 0,
            "status_distribution": self.status_stats,
            "slowest_endpoints": slowest_paths
        }
    
    def reset(self):
        """重置统计"""
        self.total_requests = 0
        self.success_requests = 0
        self.error_requests = 0
        self.total_duration = 0.0
        self.path_stats = {}
        self.status_stats = {}
        self.start_time = get_beijing_time()


# 全局统计实例
request_stats = RequestStats()


class StatsMiddleware(BaseHTTPMiddleware):
    """
    统计中间件
    收集请求统计信息
    """
    
    def __init__(self, app: ASGIApp, skip_paths: Optional[list] = None):
        super().__init__(app)
        self.skip_paths = skip_paths or ["/static/", "/health"]
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        path = request.url.path
        
        # 跳过指定路径
        if any(path.startswith(p) for p in self.skip_paths):
            return await call_next(request)
        
        # 跳过流式响应路径，避免与 StreamingResponse 的兼容性问题
        if any(path.startswith(sp) for sp in STREAMING_PATHS):
            return await call_next(request)
        
        start_time = time.time()
        status_code = 500  # 默认错误状态码
        
        try:
            response = await call_next(request)
            status_code = response.status_code
        except RuntimeError as e:
            if "No response returned" in str(e):
                status_code = 499
                return _handle_no_response_error(request, "Stats")
            logger.error(f"统计中间件捕获运行时错误: {e}")
            raise
        except Exception as e:
            logger.error(f"统计中间件捕获异常: {e}")
            raise
        finally:
            duration = time.time() - start_time
            # 记录统计
            request_stats.record(
                path=request.url.path,
                method=request.method,
                status_code=status_code,
                duration=duration
            )
        
        return response


def get_request_stats() -> RequestStats:
    """获取请求统计实例"""
    return request_stats


# ==================== 审计日志中间件 ====================

class AuditMiddleware(BaseHTTPMiddleware):
    """
    审计日志中间件
    自动记录用户操作
    
    配置选项：
    - audit_all_methods: 是否记录所有请求（包括 GET），默认 False 只记录写操作
    - audit_read_operations: 是否记录读取操作，默认 False
    """
    
    # 写操作方法
    WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
    
    # 所有需要审计的方法（当 audit_all_methods=True 时使用）
    ALL_METHODS = {"GET", "POST", "PUT", "PATCH", "DELETE"}
    
    # 跳过审计的路径前缀（这些路径永远不记录）
    SKIP_PATHS = [
        "/static/",
        "/health",
        "/api/docs",
        "/api/redoc",
        "/api/openapi.json",
        "/favicon.ico",
        "/ws",  # WebSocket
        "/api/v1/ws",  # System WebSocket

        "/api/v1/system/init",  # 初始化接口（频繁调用）
    ]
    
    # 敏感路径（记录时隐藏详情）
    SENSITIVE_PATHS = [
        "/api/v1/auth/login",
        "/api/v1/auth/register",
        "/api/v1/auth/password",
    ]
    
    # 路径到模块和操作的映射
    PATH_MAPPING = {
        # 认证模块
        "/api/v1/auth/login": ("auth", "login", "用户登录"),
        "/api/v1/auth/logout": ("auth", "logout", "用户登出"),
        "/api/v1/auth/register": ("auth", "register", "用户注册"),
        "/api/v1/auth/password": ("auth", "password_change", "修改密码"),
        
        # 用户管理
        "/api/v1/users": ("user", "manage", "用户管理"),
        
        # 系统管理
        "/api/v1/system/settings": ("system", "settings", "系统设置"),
        "/api/v1/system/modules": ("system", "module", "模块管理"),
        
        # 文件管理
        "/api/v1/storage": ("storage", "file", "文件操作"),
        
        # 备份管理
        "/api/v1/backup": ("backup", "manage", "备份管理"),
        
        # 角色管理
        "/api/v1/roles": ("role", "manage", "角色管理"),
        
        # 公告管理
        "/api/v1/announcements": ("announcement", "manage", "公告管理"),
    }
    
    def __init__(self, app: ASGIApp, audit_all_methods: bool = False):
        """
        初始化审计中间件
        
        Args:
            app: ASGI 应用
            audit_all_methods: 是否记录所有请求（包括 GET），
                              True = 记录所有操作，
                              False = 只记录写操作（POST/PUT/PATCH/DELETE）
        """
        super().__init__(app)
        self.audit_all_methods = audit_all_methods
    
    def _should_skip(self, path: str, method: str) -> bool:
        """检查是否跳过审计"""
        # 跳过指定路径
        if any(path.startswith(p) for p in self.SKIP_PATHS):
            return True
        
        # 根据配置决定是否记录 GET 请求
        if self.audit_all_methods:
            return method not in self.ALL_METHODS
        else:
            return method not in self.WRITE_METHODS
    
    def _parse_path(self, path: str, method: str) -> tuple:
        """
        解析路径，返回 (模块, 操作, 描述)
        """
        # 首先检查精确匹配
        if path in self.PATH_MAPPING:
            return self.PATH_MAPPING[path]
        
        # 检查前缀匹配
        for prefix, (module, action, desc) in self.PATH_MAPPING.items():
            if path.startswith(prefix):
                return (module, action, desc)
        
        # 默认：从路径提取模块名
        parts = path.split("/")
        if len(parts) >= 4:
            module = parts[3]  # /api/v1/{module}
        else:
            module = "unknown"
        
        # 根据 HTTP 方法确定操作类型
        method_action_map = {
            "POST": "create",
            "PUT": "update",
            "PATCH": "update",
            "DELETE": "delete"
        }
        action = method_action_map.get(method, "operation")
        
        return (module, action, f"{module} {action}")
    
    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        method = request.method
        
        # 检查是否跳过
        if self._should_skip(path, method):
            return await call_next(request)
        
        # 跳过流式响应路径，避免与 StreamingResponse 的兼容性问题
        if any(path.startswith(sp) for sp in STREAMING_PATHS):
            return await call_next(request)
        
        # 获取请求信息
        client_ip = get_client_ip(request)
        module, action, description = self._parse_path(path, method)
        
        # 尝试获取用户 ID（支持 Authorization Header 和 HttpOnly Cookie）
        user_id = None
        try:
            from core.security import decode_token, COOKIE_ACCESS_TOKEN
            token = None
            # 优先从 Cookie 获取（HttpOnly 模式）
            cookie_token = request.cookies.get(COOKIE_ACCESS_TOKEN)
            if cookie_token:
                token = cookie_token
            else:
                # 回退到 Authorization Header
                auth_header = request.headers.get("Authorization", "")
                if auth_header.startswith("Bearer "):
                    token = auth_header[7:]
            
            if token:
                token_data = decode_token(token)
                if token_data:
                    user_id = token_data.user_id
        except Exception:
            pass
        
        # 执行请求（添加异常处理防止 "No response returned" 错误）
        try:
            response = await call_next(request)
        except RuntimeError as e:
            if "No response returned" in str(e):
                return _handle_no_response_error(request, "Audit")
            logger.error(f"审计中间件捕获运行时错误: {e}")
            raise
        except Exception as e:
            logger.error(f"审计中间件捕获异常: {e}")
            raise
        
        # 只记录成功的操作（状态码 < 400）
        if response.status_code < 400:
            # 异步记录审计日志
            try:
                from core.audit_utils import log_audit
                import asyncio
                
                # 构建日志消息
                message = f"{description} - {method} {path}"
                if response.status_code >= 200 and response.status_code < 300:
                    level = "INFO"
                else:
                    level = "WARNING"
                
                # 脱敏敏感路径
                if any(path.startswith(p) for p in self.SENSITIVE_PATHS):
                     # 如果是敏感路径，简单记录
                     message = f"{description} - {method} {path}"
                
                # 创建后台任务记录日志（使用 try-except 包裹防止任务失败影响响应）
                try:
                    asyncio.create_task(
                        log_audit(
                            module=module,
                            action=action,
                            message=message,
                            user_id=user_id,
                            ip_address=client_ip,
                            level=level
                        )
                    )
                except Exception as task_err:
                    logger.error(f"创建审计日志任务失败: {task_err}")
            except Exception as e:
                logger.error(f"审计日志记录失败: {e}")
        
        return response
