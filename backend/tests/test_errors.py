"""
错误处理模块测试
"""
import pytest
from fastapi import status
from fastapi.responses import JSONResponse
from core.errors import (
    ErrorCode,
    AppException,
    ValidationException,
    AuthException,
    NotFoundException,
    PermissionException,
    BusinessException,
    app_exception_handler,
    success_response,
    error_response,
    ERROR_MESSAGES
)

class TestErrors:
    """错误处理测试"""
    
    def test_error_codes(self):
        """测试错误码定义"""
        assert ErrorCode.SUCCESS == 0
        assert ErrorCode.INTERNAL_ERROR == 1000
        assert ErrorCode.UNAUTHORIZED == 2001
        
    def test_app_exception(self):
        """测试应用异常基类"""
        exc = AppException(code=ErrorCode.RESOURCE_NOT_FOUND)
        assert exc.code == ErrorCode.RESOURCE_NOT_FOUND
        assert exc.http_status == status.HTTP_404_NOT_FOUND
        assert exc.message == ERROR_MESSAGES[ErrorCode.RESOURCE_NOT_FOUND]
        
        # 测试 to_dict
        d = exc.to_dict()
        assert d["code"] == ErrorCode.RESOURCE_NOT_FOUND
        
        # 测试 to_response
        resp = exc.to_response()
        assert isinstance(resp, JSONResponse)
        assert resp.status_code == status.HTTP_404_NOT_FOUND

    def test_specific_exceptions(self):
        """测试具体异常类"""
        # 验证异常
        v_exc = ValidationException(errors=["e1"])
        assert v_exc.code == ErrorCode.VALIDATION_ERROR
        assert v_exc.data["errors"] == ["e1"]
        
        # 认证异常
        a_exc = AuthException()
        assert a_exc.code == ErrorCode.UNAUTHORIZED
        assert a_exc.http_status == status.HTTP_401_UNAUTHORIZED
        
        # 资源不存在异常
        n_exc = NotFoundException(resource="User", resource_id=123)
        assert n_exc.code == ErrorCode.RESOURCE_NOT_FOUND
        assert "ID: 123" in n_exc.message
        
        # 权限异常
        p_exc = PermissionException()
        assert p_exc.code == ErrorCode.PERMISSION_DENIED
        
        # 业务异常
        b_exc = BusinessException(message="Biz Error")
        assert b_exc.code == ErrorCode.OPERATION_FAILED
        assert b_exc.message == "Biz Error"

    @pytest.mark.asyncio
    async def test_handler(self):
        """测试异常处理器"""
        exc = AppException(code=ErrorCode.INTERNAL_ERROR)
        resp = await app_exception_handler(None, exc)
        assert resp.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
        
    def test_response_builders(self):
        """测试响应构建函数"""
        # 成功响应
        s = success_response(data="test")
        assert s["code"] == 0
        assert s["data"] == "test"
        
        # 错误响应
        e = error_response(code=ErrorCode.INTERNAL_ERROR)
        assert e["code"] == 1000
        assert e["message"] == ERROR_MESSAGES[1000]
