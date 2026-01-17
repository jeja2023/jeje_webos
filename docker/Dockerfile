# ============================================================
# JeJe WebOS 全栈 Dockerfile
# ============================================================
#
# 此 Dockerfile 将前端和后端打包到同一个镜像中
# FastAPI 同时托管：
#   - 前端静态文件 (/static/*)
#   - 后端 API (/api/*)
#   - SPA 路由回退 (其他路径返回 index.html)
#
# 构建（从项目根目录执行）:
#   docker-compose -f docker/docker-compose.yml build
#
# 运行:
#   docker-compose -f docker/docker-compose.yml up -d
#
# 版本: v2.4.0
# 更新时间: 2026-01-17
# ============================================================

FROM python:3.12-slim

# 设置工作目录
WORKDIR /app

# 设置环境变量
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# 安装系统依赖
# 增加 libgomp1, libgl1-mesa-glx, libglib2.0-0 以支持 OCR 和模型推理
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libffi-dev \
    default-mysql-client \
    libgomp1 \
    libgl1-mesa-glx \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# 复制并安装 Python 依赖（利用 Docker 缓存层）
# 注意：构建上下文是项目根目录（..）
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 复制后端代码到 /app
COPY backend/ .

# 复制前端代码到 /frontend
COPY frontend/ /frontend/

# 复制启动脚本（从 docker 目录复制）
COPY docker/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# 创建非 root 用户（安全最佳实践）
RUN useradd -m -u 1000 appuser && \
    chown -R appuser:appuser /app && \
    chown -R appuser:appuser /frontend && \
    chown root:root /docker-entrypoint.sh

# 创建存储目录
RUN mkdir -p /app/storage/uploads /app/storage/backups /app/logs && \
    chown -R appuser:appuser /app/storage /app/logs

# 切换到非 root 用户
USER appuser

# 暴露应用端口
EXPOSE 8000

# 设置时区
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

# 启动应用
# 使用 WEB_CONCURRENCY 环境变量控制进程数，默认为 1
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port 8000 --workers ${WEB_CONCURRENCY:-1}"]
