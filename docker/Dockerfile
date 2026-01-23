# ============================================================
# JeJe WebOS CPU 瘦身版 Dockerfile (Multi-stage)
# ============================================================
# 
# 特点：
# 1. 剔除所有 NVIDIA GPU 依赖，体积减小 80%+
# 2. 多阶段构建，删除编译工具链，进一步减小体积
# 3. 完美支持 OCR、PDF 转换和 AI 知识库功能
#
# ============================================================

# 第一阶段：构建环境 (Builder)
FROM python:3.12-slim-bookworm AS builder

WORKDIR /build

# 设置编译环境变量
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

# 安装编译所需的系统依赖
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    make \
    cmake \
    python3-dev \
    pkg-config \
    libffi-dev \
    libssl-dev \
    unixodbc-dev \
    libcairo2-dev \
    && rm -rf /var/lib/apt/lists/*

# 复制依赖文件
COPY backend/requirements.txt .

# 先安装 CPU 版本的 PyTorch 和核心算子库
# 这能节省约 10GB 的空间
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# 关键修复：强制从源码编译 llama-cpp-python，并显式禁用所有高性能指令集 (AVX/AVX2/FMA/F16C/AVX512)
# 这将解决在旧 CPU (如 Celeron J 系列, Apollo Lake 等) 或部分 NAS 设备上的 Illegal instruction 错误
RUN CMAKE_ARGS="-DGGML_NATIVE=OFF -DGGML_AVX=OFF -DGGML_AVX2=OFF -DGGML_FMA=OFF -DGGML_F16C=OFF -DGGML_AVX512=OFF -DLLAMA_NATIVE=OFF -DLLAMA_AVX=OFF -DLLAMA_AVX2=OFF -DLLAMA_FMA=OFF -DLLAMA_F16C=OFF" \
    pip install --no-cache-dir --no-binary llama-cpp-python llama-cpp-python

# 安装其余依赖
RUN pip install --no-cache-dir -r requirements.txt

# ============================================================

# 第二阶段：运行环境 (Final)
FROM python:3.12-slim-bookworm

WORKDIR /app

# 设置运行时环境变量
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    FRONTEND_PATH=/frontend \
    STORAGE_PATH=/app/storage

# 安装运行所需的最小化系统动态库
RUN apt-get update && apt-get install -y --no-install-recommends \
    default-mysql-client \
    libgomp1 \
    libgl1 \
    libglib2.0-0 \
    libcairo2 \
    && rm -rf /var/lib/apt/lists/*

# 从构建阶段拷贝已安装的 Python 包
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# 复制后端代码
COPY backend/ .

# 复制前端代码
COPY frontend/ /frontend/

# 复制并配置启动脚本
COPY docker/docker-entrypoint.sh /docker-entrypoint.sh
# 关键：修复 Windows 环境下可能产生的 CRLF 换行符问题，并赋予执行权限
RUN sed -i 's/\r$//' /docker-entrypoint.sh && chmod +x /docker-entrypoint.sh

# 设置时区
ENV TZ=Asia/Shanghai
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# 创建非 root 用户并授权
RUN useradd -m -u 1000 appuser && \
    mkdir -p /app/storage/uploads /app/storage/backups /app/logs && \
    chown -R appuser:appuser /app /frontend /docker-entrypoint.sh

# 暴露端口
EXPOSE 8000

# 切换用户
USER appuser

# 健康检查
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health')" || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port 8000 --workers ${WEB_CONCURRENCY:-1}"]