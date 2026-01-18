#!/bin/bash
# JeJe WebOS Docker 启动脚本

set -e

# 最大等待次数（60次 x 2秒 = 2分钟）
MAX_RETRIES=60

echo "=========================================="
echo "  JeJe WebOS 容器启动中..."
echo "=========================================="

# 等待 MySQL 就绪
echo "等待 MySQL 就绪..."
RETRY_COUNT=0
until python -c "import pymysql, os; pymysql.connect(host='${DB_HOST:-mysql}', port=${DB_PORT:-3306}, user='${DB_USER:-jeje}', password=os.environ.get('DB_PASSWORD'))" 2>/dev/null; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        echo "错误: MySQL 连接超时（等待了 $((MAX_RETRIES * 2)) 秒）！"
        echo "请检查 MySQL 容器是否正常运行。"
        exit 1
    fi
    echo "MySQL 未就绪，等待 2 秒... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 2
done
echo " MySQL 已就绪！"

# 等待 Redis 就绪
echo "等待 Redis 就绪..."
RETRY_COUNT=0
REDIS_PASS="${REDIS_PASSWORD:-}"

if [ -z "$REDIS_PASS" ]; then
    REDIS_CMD="import redis; r = redis.Redis(host='${REDIS_HOST:-redis}', port=${REDIS_PORT:-6379}, decode_responses=True); r.ping()"
else
    REDIS_CMD="import redis; r = redis.Redis(host='${REDIS_HOST:-redis}', port=${REDIS_PORT:-6379}, password='$REDIS_PASS', decode_responses=True); r.ping()"
fi

until python -c "$REDIS_CMD" 2>/dev/null; do
    RETRY_COUNT=$((RETRY_COUNT + 1))
    if [ $RETRY_COUNT -ge $MAX_RETRIES ]; then
        echo "错误: Redis 连接超时（等待了 $((MAX_RETRIES * 2)) 秒）！"
        echo "请检查 Redis 容器是否正常运行。"
        exit 1
    fi
    echo "Redis 未就绪，等待 2 秒... ($RETRY_COUNT/$MAX_RETRIES)"
    sleep 2
done
echo " Redis 已就绪！"

# 运行数据库迁移
echo "运行数据库迁移..."
cd /app
if alembic upgrade head; then
    echo " 数据库迁移完成！"
else
    echo " 迁移失败或无需迁移"
fi

# 启动应用
echo "=========================================="
echo "  启动应用..."
echo "=========================================="
exec "$@"