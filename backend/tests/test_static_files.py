"""
静态文件服务增强测试
"""

import pytest
import gzip
from core.static_files import CachedStaticFiles, GzipMiddleware

class TestCachedStaticFiles:
    """测试带缓存的静态文件服务"""
    
    @pytest.mark.asyncio
    async def test_cache_headers(self, tmp_path):
        """测试不同文件类型的缓存头"""
        # 创建临时文件
        css_file = tmp_path / "style.css"
        css_file.write_text("body {}", encoding="utf-8")
        
        img_file = tmp_path / "image.png"
        img_file.write_bytes(b"fake png")
        
        app = CachedStaticFiles(directory=str(tmp_path))
        
        # 模拟请求 CSS (Cache-Age=0)
        scope_css = {"type": "http", "method": "GET", "path": "/style.css", "headers": []}
        
        # 捕获响应
        headers = {}
        async def mock_send(message):
            if message["type"] == "http.response.start":
                for k, v in message["headers"]:
                    headers[k.decode().lower()] = v.decode()
        
        # StaticFiles 依赖 receive
        async def mock_receive():
            return {"type": "http.request"}
            
        await app(scope_css, mock_receive, mock_send)
        
        assert "no-cache" in headers.get("cache-control", "")
        
        # 模拟请求 PNG (Cache-Age>0)
        scope_img = {"type": "http", "method": "GET", "path": "/image.png", "headers": []}
        headers.clear()
        
        await app(scope_img, mock_receive, mock_send)
        
        assert "max-age=" in headers.get("cache-control", "")
        # png configured to 2592000
        assert "2592000" in headers.get("cache-control", "")


class TestGzipMiddleware:
    """测试 Gzip 压缩"""
    
    @pytest.mark.asyncio
    async def test_gzip_compression(self):
        """测试内容压缩"""
        # 模拟会返回长文本的 APP
        long_text = b"a" * 1000 # > 500 min size
        
        async def mock_app(scope, receive, send):
            await send({
                "type": "http.response.start", 
                "headers": [
                    (b"content-type", b"text/plain"),
                    (b"content-length", str(len(long_text)).encode())
                ]
            })
            await send({"type": "http.response.body", "body": long_text})
            
        middleware = GzipMiddleware(mock_app, minimum_size=100)
        
        # 带有 accept-encoding: gzip 的请求
        scope = {
            "type": "http", 
            "headers": [(b"accept-encoding", b"gzip")]
        }
        
        captured_body = b""
        captured_headers = {}
        
        async def mock_send(message):
            nonlocal captured_body
            if message["type"] == "http.response.start":
                for k, v in message["headers"]:
                    captured_headers[k.decode().lower()] = v.decode()
            elif message["type"] == "http.response.body":
                captured_body += message["body"]
                
        async def mock_receive(): 
            return {}
            
        await middleware(scope, mock_receive, mock_send)
        
        assert captured_headers.get("content-encoding") == "gzip"
        # 压缩后应该小于原始大小
        assert len(captured_body) < len(long_text)
        # 解压对比
        assert gzip.decompress(captured_body) == long_text

    @pytest.mark.asyncio
    async def test_no_gzip_header(self):
        """测试无 gzip 头不压缩"""
        long_text = b"a" * 1000
        
        async def mock_app(scope, receive, send):
            await send({
                "type": "http.response.start", 
                "headers": [(b"content-type", b"text/plain")]
            })
            await send({"type": "http.response.body", "body": long_text})
            
        middleware = GzipMiddleware(mock_app)
        
        # 无 header
        scope = {"type": "http", "headers": []}
        
        captured_headers = {}
        async def mock_send(message):
            if message["type"] == "http.response.start":
                for k, v in message["headers"]:
                    captured_headers[k.decode().lower()] = v.decode()
        
        await middleware(scope, lambda: {}, mock_send)
        
        assert "content-encoding" not in captured_headers
