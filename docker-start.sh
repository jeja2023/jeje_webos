#!/bin/bash
# JeJe WebOS Docker 快速启动脚本

set -e

echo "=========================================="
echo "  JeJe WebOS Docker 启动脚本"
echo "=========================================="

# 检查 Docker 和 Docker Compose
if ! command -v docker &> /dev/null; then
    echo "错误: 未安装 Docker，请先安装 Docker"
    exit 1
fi

if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "错误: 未安装 Docker Compose，请先安装 Docker Compose"
    exit 1
fi

# 检查环境变量文件
if [ ! -f .env ]; then
    echo "警告: 未找到 .env 文件，从 .env.docker 复制..."
    if [ -f .env.docker ]; then
        cp .env.docker .env
        echo "已创建 .env 文件，请编辑后重新运行此脚本"
        exit 1
    else
        echo "错误: 未找到 .env.docker 模板文件"
        exit 1
    fi
fi

# 检查 SSL 证书（生产环境）
if [ "$1" = "production" ]; then
    if [ ! -f docker/nginx/ssl/cert.pem ] || [ ! -f docker/nginx/ssl/key.pem ]; then
        echo "警告: 未找到 SSL 证书文件"
        echo "请将证书文件放置到 docker/nginx/ssl/ 目录："
        echo "  - docker/nginx/ssl/cert.pem"
        echo "  - docker/nginx/ssl/key.pem"
        echo ""
        echo "或生成测试证书："
        echo "  openssl req -x509 -nodes -days 365 -newkey rsa:2048 \\"
        echo "    -keyout docker/nginx/ssl/key.pem \\"
        echo "    -out docker/nginx/ssl/cert.pem \\"
        echo "    -subj \"/C=CN/ST=State/L=City/O=Organization/CN=localhost\""
        exit 1
    fi
fi

# 构建并启动服务
echo "构建 Docker 镜像..."
docker-compose build

echo "启动服务..."
if [ "$1" = "production" ]; then
    docker-compose --profile production up -d
else
    docker-compose up -d
fi

echo ""
echo "=========================================="
echo "  服务启动完成！"
echo "=========================================="
echo ""
echo "查看日志: docker-compose logs -f"
echo "停止服务: docker-compose down"
echo "重启服务: docker-compose restart"
echo ""
echo "访问地址:"
if [ "$1" = "production" ]; then
    echo "  - HTTP:  http://localhost (自动重定向到 HTTPS)"
    echo "  - HTTPS: https://localhost"
else
    echo "  - 后端 API: http://localhost:8000"
    echo "  - 前端页面: http://localhost (需要手动配置 Nginx 或直接访问前端文件)"
fi
echo ""

