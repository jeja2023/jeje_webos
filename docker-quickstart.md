# Docker 快速启动指南

## 🚀 三步启动

### 1. 配置环境变量

```bash
cp .env.docker .env
# 编辑 .env 文件，至少修改以下配置：
# - DB_PASSWORD
# - MYSQL_ROOT_PASSWORD  
# - JWT_SECRET
```

### 2. 启动服务

```bash
# 开发环境
docker-compose up -d

# 生产环境（需要 SSL 证书）
docker-compose --profile production up -d
```

### 3. 访问系统

- 开发: http://localhost:8000
- 生产: https://localhost

## 📝 常用命令

```bash
# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down

# 重启服务
docker-compose restart

# 查看状态
docker-compose ps

# 进入容器
docker exec -it jeje-webos-backend bash
```

## 🔧 故障排查

```bash
# 查看后端日志
docker-compose logs backend

# 查看数据库日志
docker-compose logs mysql

# 检查服务健康状态
docker-compose ps
```

## 📚 详细文档

查看 `DOCKER.md` 获取完整部署文档。

