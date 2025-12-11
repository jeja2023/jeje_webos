#!/bin/bash
# JeJe WebOS Docker 启动脚本

set -e

echo "=========================================="
echo "  JeJe WebOS 容器启动中..."
echo "=========================================="

# 等待数据库就绪
echo "等待 MySQL 就绪..."
until python -c "import pymysql; pymysql.connect(host='${DB_HOST:-mysql}', port=${DB_PORT:-3306}, user='${DB_USER:-jeje}', password='${DB_PASSWORD}')" 2>/dev/null; do
    echo "MySQL 未就绪，等待 2 秒..."
    sleep 2
done
echo "MySQL 已就绪！"

# 等待 Redis 就绪
echo "等待 Redis 就绪..."
REDIS_PASS="${REDIS_PASSWORD:-}"
if [ -z "$REDIS_PASS" ]; then
    until python -c "import redis; r = redis.Redis(host='${REDIS_HOST:-redis}', port=${REDIS_PORT:-6379}, decode_responses=True); r.ping()" 2>/dev/null; do
        echo "Redis 未就绪，等待 2 秒..."
        sleep 2
    done
else
    until python -c "import redis; r = redis.Redis(host='${REDIS_HOST:-redis}', port=${REDIS_PORT:-6379}, password='$REDIS_PASS', decode_responses=True); r.ping()" 2>/dev/null; do
        echo "Redis 未就绪，等待 2 秒..."
        sleep 2
    done
fi
echo "Redis 已就绪！"

# 运行数据库迁移
echo "运行数据库迁移..."
cd /app
alembic upgrade head || echo "迁移失败或无需迁移"

# 启动应用
echo "启动应用..."
exec "$@"

