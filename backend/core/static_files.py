"""
静态文件服务增强
- 添加 HTTP 缓存控制头
- 支持 Gzip 压缩
"""

import gzip
import os
from typing import Optional
from pathlib import Path

from starlette.staticfiles import StaticFiles
from starlette.responses import Response, FileResponse
from starlette.types import ASGIApp, Receive, Scope, Send


class CachedStaticFiles(StaticFiles):
    """
    增强版静态文件服务
    - 为静态资源添加缓存控制头
    - 根据文件类型设置不同的缓存策略
    """
    
    # 缓存时间配置（秒）
    CACHE_AGES = {
        # 字体文件 - 1年（很少变化）
        '.woff': 31536000,
        '.woff2': 31536000,
        '.ttf': 31536000,
        '.eot': 31536000,
        '.otf': 31536000,
        
        # 图片 - 1个月
        '.png': 2592000,
        '.jpg': 2592000,
        '.jpeg': 2592000,
        '.gif': 2592000,
        '.svg': 2592000,
        '.ico': 2592000,
        '.webp': 2592000,
        
        # CSS/JS - 静态资源缓存 7 天
        '.css': 604800,
        '.js': 604800,
        
        # HTML - 不缓存（动态内容）
        '.html': 0,
        '.htm': 0,
        
        # JSON - 短缓存
        '.json': 3600,
    }
    
    # 默认缓存时间（1天）
    DEFAULT_CACHE_AGE = 86400
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
    
    async def get_response(self, path: str, scope: Scope) -> Response:
        """覆盖父类方法，添加缓存控制头"""
        response = await super().get_response(path, scope)
        
        # 获取文件扩展名
        ext = Path(path).suffix.lower()
        
        # 设置缓存时间
        cache_age = self.CACHE_AGES.get(ext, self.DEFAULT_CACHE_AGE)
        
        if cache_age > 0:
            response.headers["Cache-Control"] = f"public, max-age={cache_age}"
            response.headers["Vary"] = "Accept-Encoding"
        else:
            response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        
        return response


class GzipMiddleware:
    """
    Gzip 压缩中间件
    - 压缩文本类型响应（HTML, CSS, JS, JSON, XML）
    - 支持最小压缩大小阈值
    """
    
    # 可压缩的 MIME 类型
    COMPRESSIBLE_TYPES = {
        'text/html',
        'text/css',
        'text/javascript',
        'application/javascript',
        'application/json',
        'text/xml',
        'application/xml',
        'text/plain',
        'image/svg+xml',
    }
    
    # 最小压缩大小（字节）
    MIN_SIZE = 500
    
    def __init__(self, app: ASGIApp, minimum_size: int = 500, compresslevel: int = 6):
        self.app = app
        self.minimum_size = minimum_size
        self.compresslevel = compresslevel
    
    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        
        # 检查客户端是否支持 gzip
        accept_encoding = ""
        for header_name, header_value in scope.get("headers", []):
            if header_name == b"accept-encoding":
                accept_encoding = header_value.decode("latin-1", errors="replace")
                break
        
        if "gzip" not in accept_encoding:
            await self.app(scope, receive, send)
            return
        
        initial_message = {}
        body_parts = []
        should_buffer = False
        passthrough = False
        
        async def send_wrapper(message):
            nonlocal initial_message, body_parts, should_buffer, passthrough
            
            if message["type"] == "http.response.start":
                initial_message = message
                
                content_type = ""
                content_encoding = ""
                headers = dict(message.get("headers", []))
                if b"content-type" in headers:
                    content_type = headers[b"content-type"].decode("latin-1", errors="replace").lower()
                if b"content-encoding" in headers:
                    content_encoding = headers[b"content-encoding"].decode("latin-1", errors="replace").lower()

                should_buffer = (
                    not content_encoding
                    and any(ct in content_type for ct in self.COMPRESSIBLE_TYPES)
                )
                passthrough = not should_buffer

                if passthrough:
                    await send(message)
                return
            
            if message["type"] == "http.response.body":
                if passthrough:
                    await send(message)
                    return
                
                body = message.get("body", b"")
                more_body = message.get("more_body", False)
                if more_body:
                    passthrough = True
                    await send(initial_message)
                    for part in body_parts:
                        await send({"type": "http.response.body", "body": part, "more_body": True})
                    await send(message)
                    body_parts.clear()
                    return

                body_parts.append(body)
                
                if not more_body:
                    full_body = b"".join(body_parts)
                    
                    if len(full_body) >= self.minimum_size:
                        compressed_body = gzip.compress(full_body, compresslevel=self.compresslevel)
                        
                        new_headers = []
                        has_vary = False
                        for name, value in initial_message.get("headers", []):
                            lower_name = name.lower()
                            if lower_name == b"content-length":
                                continue
                            if lower_name == b"vary":
                                has_vary = True
                                if b"accept-encoding" not in value.lower():
                                    value = value + b", Accept-Encoding"
                            new_headers.append((name, value))
                        
                        new_headers.append((b"content-encoding", b"gzip"))
                        new_headers.append((b"content-length", str(len(compressed_body)).encode()))
                        if not has_vary:
                            new_headers.append((b"vary", b"Accept-Encoding"))
                        
                        initial_message["headers"] = new_headers
                        full_body = compressed_body
                    
                    await send(initial_message)
                    await send({
                        "type": "http.response.body",
                        "body": full_body,
                        "more_body": False
                    })
        
        try:
            await self.app(scope, receive, send_wrapper)
        except Exception as e:
            # 记录异常到日志
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Gzip中间件捕获异常: {type(e).__name__}: {e}, 请求路径: {scope.get('path', 'unknown')}")
            raise
