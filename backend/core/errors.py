"""
标准错误码体系
提供统一的错误码定义和异常处理
"""

from typing import Optional, Any, Dict
from enum import IntEnum
from fastapi import HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel


class ErrorCode(IntEnum):
    """
    标准错误码
    
    错误码规范：
    - 0: 成功
    - 1xxx: 系统级错误
    - 2xxx: 认证/授权错误
    - 3xxx: 业务通用错误
    - 4xxx: 模块级错误（各模块自定义）
    - 5xxx: 第三方服务错误
    """
    
    # ==================== 成功 ====================
    SUCCESS = 0
    
    # ==================== 系统级错误 (1xxx) ====================
    INTERNAL_ERROR = 1000           # 服务器内部错误
    DATABASE_ERROR = 1001           # 数据库错误
    CACHE_ERROR = 1002              # 缓存错误
    CONFIG_ERROR = 1003             # 配置错误
    SERVICE_UNAVAILABLE = 1004      # 服务不可用
    RATE_LIMIT_EXCEEDED = 1005      # 请求频率超限
    REQUEST_TIMEOUT = 1006          # 请求超时
    FILE_SYSTEM_ERROR = 1007        # 文件系统错误
    NETWORK_ERROR = 1008            # 网络错误
    
    # ==================== 认证/授权错误 (2xxx) ====================
    UNAUTHORIZED = 2001             # 未认证（未登录）
    TOKEN_EXPIRED = 2002            # 令牌过期
    TOKEN_INVALID = 2003            # 令牌无效
    PERMISSION_DENIED = 2004        # 权限不足
    ACCOUNT_DISABLED = 2005         # 账户已禁用
    ACCOUNT_LOCKED = 2006           # 账户已锁定
    LOGIN_FAILED = 2007             # 登录失败
    PASSWORD_INCORRECT = 2008       # 密码错误
    ACCOUNT_NOT_FOUND = 2009        # 账户不存在
    ACCOUNT_EXISTS = 2010           # 账户已存在
    SESSION_EXPIRED = 2011          # 会话过期
    REFRESH_TOKEN_INVALID = 2012    # 刷新令牌无效
    
    # ==================== 业务通用错误 (3xxx) ====================
    VALIDATION_ERROR = 3001         # 参数验证失败
    RESOURCE_NOT_FOUND = 3002       # 资源不存在
    RESOURCE_EXISTS = 3003          # 资源已存在
    RESOURCE_CONFLICT = 3004        # 资源冲突
    OPERATION_FAILED = 3005         # 操作失败
    INVALID_OPERATION = 3006        # 无效操作
    DATA_INTEGRITY_ERROR = 3007     # 数据完整性错误
    QUOTA_EXCEEDED = 3008           # 配额超限
    FILE_TOO_LARGE = 3009           # 文件过大
    FILE_TYPE_NOT_ALLOWED = 3010    # 文件类型不允许
    EXPORT_FAILED = 3011            # 导出失败
    IMPORT_FAILED = 3012            # 导入失败
    
    # ==================== 模块级错误 (4xxx) - 预留给各模块 ====================
    # 4000-4099: 博客模块
    BLOG_POST_NOT_FOUND = 4001
    BLOG_CATEGORY_NOT_FOUND = 4002
    BLOG_TAG_NOT_FOUND = 4003
    
    # 4100-4199: 笔记模块
    NOTES_FOLDER_NOT_FOUND = 4101
    NOTES_NOTE_NOT_FOUND = 4102
    NOTES_FOLDER_NOT_EMPTY = 4103
    
    # 4200-4299: 预留
    # 4300-4399: 预留
    # ...
    
    # ==================== 第三方服务错误 (5xxx) ====================
    EXTERNAL_API_ERROR = 5001       # 外部 API 错误
    SMS_SEND_FAILED = 5002          # 短信发送失败
    EMAIL_SEND_FAILED = 5003        # 邮件发送失败
    STORAGE_ERROR = 5004            # 存储服务错误
    PAYMENT_ERROR = 5005            # 支付服务错误


# 错误码对应的默认消息
ERROR_MESSAGES: Dict[int, str] = {
    ErrorCode.SUCCESS: "操作成功",
    
    # 系统级
    ErrorCode.INTERNAL_ERROR: "服务器内部错误，请稍后重试",
    ErrorCode.DATABASE_ERROR: "数据库操作失败",
    ErrorCode.CACHE_ERROR: "缓存服务异常",
    ErrorCode.CONFIG_ERROR: "系统配置错误",
    ErrorCode.SERVICE_UNAVAILABLE: "服务暂时不可用",
    ErrorCode.RATE_LIMIT_EXCEEDED: "请求过于频繁，请稍后重试",
    ErrorCode.REQUEST_TIMEOUT: "请求超时",
    ErrorCode.FILE_SYSTEM_ERROR: "文件系统错误",
    ErrorCode.NETWORK_ERROR: "网络连接错误",
    
    # 认证/授权
    ErrorCode.UNAUTHORIZED: "请先登录",
    ErrorCode.TOKEN_EXPIRED: "登录已过期，请重新登录",
    ErrorCode.TOKEN_INVALID: "无效的认证凭据",
    ErrorCode.PERMISSION_DENIED: "没有权限执行此操作",
    ErrorCode.ACCOUNT_DISABLED: "账户已被禁用",
    ErrorCode.ACCOUNT_LOCKED: "账户已被锁定",
    ErrorCode.LOGIN_FAILED: "登录失败",
    ErrorCode.PASSWORD_INCORRECT: "密码错误",
    ErrorCode.ACCOUNT_NOT_FOUND: "账户不存在",
    ErrorCode.ACCOUNT_EXISTS: "账户已存在",
    ErrorCode.SESSION_EXPIRED: "会话已过期",
    ErrorCode.REFRESH_TOKEN_INVALID: "刷新令牌无效",
    
    # 业务通用
    ErrorCode.VALIDATION_ERROR: "参数验证失败",
    ErrorCode.RESOURCE_NOT_FOUND: "请求的资源不存在",
    ErrorCode.RESOURCE_EXISTS: "资源已存在",
    ErrorCode.RESOURCE_CONFLICT: "资源冲突",
    ErrorCode.OPERATION_FAILED: "操作失败",
    ErrorCode.INVALID_OPERATION: "无效的操作",
    ErrorCode.DATA_INTEGRITY_ERROR: "数据完整性错误",
    ErrorCode.QUOTA_EXCEEDED: "已超出配额限制",
    ErrorCode.FILE_TOO_LARGE: "文件大小超出限制",
    ErrorCode.FILE_TYPE_NOT_ALLOWED: "不支持的文件类型",
    ErrorCode.EXPORT_FAILED: "导出失败",
    ErrorCode.IMPORT_FAILED: "导入失败",
    
    # 模块级
    ErrorCode.BLOG_POST_NOT_FOUND: "文章不存在",
    ErrorCode.BLOG_CATEGORY_NOT_FOUND: "分类不存在",
    ErrorCode.BLOG_TAG_NOT_FOUND: "标签不存在",
    ErrorCode.NOTES_FOLDER_NOT_FOUND: "文件夹不存在",
    ErrorCode.NOTES_NOTE_NOT_FOUND: "笔记不存在",
    ErrorCode.NOTES_FOLDER_NOT_EMPTY: "文件夹不为空",
    
    # 第三方服务
    ErrorCode.EXTERNAL_API_ERROR: "外部服务调用失败",
    ErrorCode.SMS_SEND_FAILED: "短信发送失败",
    ErrorCode.EMAIL_SEND_FAILED: "邮件发送失败",
    ErrorCode.STORAGE_ERROR: "存储服务异常",
    ErrorCode.PAYMENT_ERROR: "支付服务异常",
}

# 错误码对应的 HTTP 状态码
ERROR_HTTP_STATUS: Dict[int, int] = {
    ErrorCode.SUCCESS: status.HTTP_200_OK,
    
    # 系统级 -> 500
    ErrorCode.INTERNAL_ERROR: status.HTTP_500_INTERNAL_SERVER_ERROR,
    ErrorCode.DATABASE_ERROR: status.HTTP_500_INTERNAL_SERVER_ERROR,
    ErrorCode.CACHE_ERROR: status.HTTP_500_INTERNAL_SERVER_ERROR,
    ErrorCode.CONFIG_ERROR: status.HTTP_500_INTERNAL_SERVER_ERROR,
    ErrorCode.SERVICE_UNAVAILABLE: status.HTTP_503_SERVICE_UNAVAILABLE,
    ErrorCode.RATE_LIMIT_EXCEEDED: status.HTTP_429_TOO_MANY_REQUESTS,
    ErrorCode.REQUEST_TIMEOUT: status.HTTP_408_REQUEST_TIMEOUT,
    
    # 认证/授权 -> 401/403
    ErrorCode.UNAUTHORIZED: status.HTTP_401_UNAUTHORIZED,
    ErrorCode.TOKEN_EXPIRED: status.HTTP_401_UNAUTHORIZED,
    ErrorCode.TOKEN_INVALID: status.HTTP_401_UNAUTHORIZED,
    ErrorCode.PERMISSION_DENIED: status.HTTP_403_FORBIDDEN,
    ErrorCode.ACCOUNT_DISABLED: status.HTTP_403_FORBIDDEN,
    ErrorCode.ACCOUNT_LOCKED: status.HTTP_403_FORBIDDEN,
    ErrorCode.LOGIN_FAILED: status.HTTP_401_UNAUTHORIZED,
    ErrorCode.PASSWORD_INCORRECT: status.HTTP_401_UNAUTHORIZED,
    ErrorCode.ACCOUNT_NOT_FOUND: status.HTTP_404_NOT_FOUND,
    
    # 业务通用 -> 400/404/409
    ErrorCode.VALIDATION_ERROR: status.HTTP_400_BAD_REQUEST,
    ErrorCode.RESOURCE_NOT_FOUND: status.HTTP_404_NOT_FOUND,
    ErrorCode.RESOURCE_EXISTS: status.HTTP_409_CONFLICT,
    ErrorCode.RESOURCE_CONFLICT: status.HTTP_409_CONFLICT,
    ErrorCode.OPERATION_FAILED: status.HTTP_400_BAD_REQUEST,
    ErrorCode.INVALID_OPERATION: status.HTTP_400_BAD_REQUEST,
    ErrorCode.FILE_TOO_LARGE: status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
    
    # 第三方服务 -> 502
    ErrorCode.EXTERNAL_API_ERROR: status.HTTP_502_BAD_GATEWAY,
}


class AppException(Exception):
    """
    应用异常基类
    
    用于抛出业务异常，包含错误码和详细信息
    
    Usage:
        raise AppException(ErrorCode.RESOURCE_NOT_FOUND, "用户不存在")
        raise AppException(ErrorCode.VALIDATION_ERROR, data={"field": "email", "error": "格式不正确"})
    """
    
    def __init__(
        self,
        code: int = ErrorCode.INTERNAL_ERROR,
        message: Optional[str] = None,
        data: Any = None
    ):
        self.code = code
        self.message = message or ERROR_MESSAGES.get(code, "未知错误")
        self.data = data
        self.http_status = ERROR_HTTP_STATUS.get(code, status.HTTP_500_INTERNAL_SERVER_ERROR)
        super().__init__(self.message)
    
    def to_response(self) -> JSONResponse:
        """转换为 JSONResponse"""
        return JSONResponse(
            status_code=self.http_status,
            content={
                "code": self.code,
                "message": self.message,
                "data": self.data
            }
        )
    
    def to_dict(self) -> dict:
        """转换为字典"""
        return {
            "code": self.code,
            "message": self.message,
            "data": self.data
        }


class ValidationException(AppException):
    """参数验证异常"""
    
    def __init__(self, message: str = "参数验证失败", errors: Optional[list] = None):
        super().__init__(
            code=ErrorCode.VALIDATION_ERROR,
            message=message,
            data={"errors": errors} if errors else None
        )


class AuthException(AppException):
    """认证异常"""
    
    def __init__(
        self,
        code: int = ErrorCode.UNAUTHORIZED,
        message: Optional[str] = None
    ):
        super().__init__(code=code, message=message)


class NotFoundException(AppException):
    """资源不存在异常"""
    
    def __init__(self, resource: str = "资源", resource_id: Any = None):
        message = f"{resource}不存在"
        if resource_id:
            message = f"{resource} (ID: {resource_id}) 不存在"
        super().__init__(
            code=ErrorCode.RESOURCE_NOT_FOUND,
            message=message
        )


class PermissionException(AppException):
    """权限异常"""
    
    def __init__(self, message: str = "没有权限执行此操作"):
        super().__init__(
            code=ErrorCode.PERMISSION_DENIED,
            message=message
        )


class BusinessException(AppException):
    """业务异常"""
    
    def __init__(
        self,
        code: int = ErrorCode.OPERATION_FAILED,
        message: str = "操作失败",
        data: Any = None
    ):
        super().__init__(code=code, message=message, data=data)


# ==================== 异常处理器 ====================

async def app_exception_handler(request, exc: AppException):
    """AppException 异常处理器"""
    return exc.to_response()


def register_exception_handlers(app):
    """
    注册异常处理器
    
    在 main.py 中调用：
        from core.errors import register_exception_handlers
        register_exception_handlers(app)
    """
    from fastapi.exceptions import RequestValidationError
    from starlette.exceptions import HTTPException as StarletteHTTPException
    
    @app.exception_handler(AppException)
    async def handle_app_exception(request, exc: AppException):
        return exc.to_response()
    
    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request, exc: RequestValidationError):
        import logging
        logger = logging.getLogger(__name__)
        
        errors = []
        for error in exc.errors():
            errors.append({
                "field": ".".join(str(loc) for loc in error["loc"]),
                "message": error["msg"],
                "type": error["type"]
            })
        
        # 打印验证错误以便调试
        print(f"\n{'='*60}")
        print(f"🟡 请求验证失败: {request.url.path}")
        print(f"验证错误: {errors}")
        print(f"{'='*60}\n")
        logger.warning(f"请求验证失败: {request.url.path} - {errors}")
        
        return JSONResponse(
            status_code=status.HTTP_400_BAD_REQUEST,
            content={
                "code": ErrorCode.VALIDATION_ERROR,
                "message": "参数验证失败",
                "data": {"errors": errors}
            }
        )

    
    @app.exception_handler(StarletteHTTPException)
    async def handle_http_exception(request, exc: StarletteHTTPException):
        # 映射 HTTP 状态码到业务错误码
        code_mapping = {
            401: ErrorCode.UNAUTHORIZED,
            403: ErrorCode.PERMISSION_DENIED,
            404: ErrorCode.RESOURCE_NOT_FOUND,
            429: ErrorCode.RATE_LIMIT_EXCEEDED,
            500: ErrorCode.INTERNAL_ERROR,
        }
        
        code = code_mapping.get(exc.status_code, ErrorCode.INTERNAL_ERROR)
        
        # 处理 detail 为字典的情况（用于冲突等需要返回额外数据的场景）
        if isinstance(exc.detail, dict):
            detail_dict = exc.detail
            message = detail_dict.get("message", ERROR_MESSAGES.get(code, "请求失败"))
            # 将字典中的其它字段作为 data 返回，或者直接合并
            data = {k: v for k, v in detail_dict.items() if k != "message"}
        else:
            message = str(exc.detail) if exc.detail else ERROR_MESSAGES.get(code, "请求失败")
            data = None
        
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "code": code,
                "message": message,
                "data": data
            }
        )


# ==================== 响应构建器 ====================

def success_response(
    data: Any = None,
    message: str = "操作成功"
) -> dict:
    """构建成功响应"""
    return {
        "code": ErrorCode.SUCCESS,
        "message": message,
        "data": data
    }


def error_response(
    code: int = ErrorCode.INTERNAL_ERROR,
    message: Optional[str] = None,
    data: Any = None
) -> dict:
    """构建错误响应"""
    return {
        "code": code,
        "message": message or ERROR_MESSAGES.get(code, "操作失败"),
        "data": data
    }
