# JeJe WebOS

> 基于 FastAPI 的微内核（Micro-kernel）架构生态系统

[![Python](https://img.shields.io/badge/Python-3.10+-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104+-green.svg)](https://fastapi.tiangolo.com/)
[![License](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## 📑 目录

- [文档](#-文档)
- [系统特点](#-系统特点)
- [技术栈](#-技术栈)
- [项目结构](#-项目结构)
- [快速开始](#-快速开始)
- [模块开发](#-模块开发)
- [安全特性](#️-安全特性)
- [系统功能](#-系统功能)
- [API 规范](#-api-规范)
- [功能模块](#-功能模块)
- [Docker 部署](#-docker-部署)
- [性能优化](#-性能优化)
- [开发规范](#-开发规范)
- [常见问题](#-常见问题)
- [获取帮助](#-获取帮助)

## 📖 文档

- **[模块开发指南](./模块开发指南.md)** - 详细的模块开发文档和模板 📝
- **[开发规范](./开发规范.md)** - 详细的架构设计、命名规范、API规范等 📋

## 🎯 系统特点

JeJe WebOS 是一个基于**微内核架构**的可扩展平台，支持：

- ✅ **模块化设计**：核心系统 + 可插拔模块
- ✅ **热插拔**：模块可以独立开发、部署、卸载
- ✅ **规范统一**：所有模块遵循相同的开发规范
- ✅ **场景复用**：通过开发不同模块适配不同业务场景
- ✅ **快速开发**：提供完整的模块模板和 CLI 脚手架
- ✅ **生产级安全**：速率限制、请求日志、JWT 自动轮换
- ✅ **运维友好**：健康检查、数据库迁移、监控支持

## 🛠️ 技术栈

### 后端技术

- **框架**: FastAPI 0.104+ - 现代、快速的 Web 框架
- **数据库**: MySQL 8.0+ / SQLAlchemy 2.0+ - ORM 和数据库迁移
- **缓存**: Redis 5.0+ - 缓存和速率限制
- **认证**: JWT (python-jose) + BCrypt - 安全认证和密码加密
- **异步**: asyncio + aiomysql - 异步数据库操作
- **迁移**: Alembic - 数据库版本管理
- **其他**: Pydantic (数据验证)、WebSocket (实时通信)

### 前端技术

- **语言**: 原生 JavaScript (ES6+) - 无框架依赖
- **样式**: CSS3 - 模块化样式设计
- **通信**: Fetch API + WebSocket - 前后端通信

### 部署技术

- **容器化**: Docker + Docker Compose
- **反向代理**: Nginx (生产环境)
- **进程管理**: Uvicorn - ASGI 服务器

## 📁 项目结构

```
jeje_webos/
├── backend/                    # 后端代码
│   ├── core/                   # 内核层（基础设施）
│   │   ├── config.py          # 配置管理
│   │   ├── database.py        # 数据库连接
│   │   ├── security.py        # 统一鉴权
│   │   ├── events.py          # 事件总线
│   │   ├── loader.py          # 模块加载器
│   │   ├── cache.py           # Redis 缓存
│   │   ├── rate_limit.py      # 速率限制
│   │   ├── middleware.py      # 请求日志中间件
│   │   ├── health.py          # 健康检查
│   │   ├── pagination.py      # 统一分页
│   │   ├── errors.py          # 标准错误码
│   │   ├── versioning.py      # API 版本管理
│   │   └── deps.py            # 依赖注入
│   ├── alembic/               # 数据库迁移
│   │   ├── env.py
│   │   └── versions/
│   ├── scripts/               # 工具脚本
│   │   ├── create_module.py   # 模块脚手架
│   │   └── delete_module.py   # 模块删除工具
│   ├── models/                # 系统数据模型
│   ├── schemas/               # 数据验证
│   ├── routers/               # 系统路由
│   ├── modules/               # 可插拔模块
│   │   ├── _template/         # 模块模板
│   │   ├── blog/              # 博客模块
│   │   └── notes/             # 笔记模块
│   ├── storage/               # 存储目录
│   └── main.py                # 应用入口
├── frontend/                  # 前端代码（原生 JS）
│   ├── css/                   # 样式文件
│   ├── js/                    # JavaScript 文件
│   └── index.html             # 入口页面
├── docker/                    # Docker 配置
│   └── nginx/                 # Nginx 配置
├── docker-compose.yml         # Docker Compose 配置
└── README.md                  # 项目说明
```

## 🚀 快速开始

### 1. 环境准备

- **Python**: 3.10 或更高版本
- **MySQL**: 8.0 或更高版本
- **Redis**: 可选，用于缓存和速率限制（推荐）

### 2. 安装依赖

```bash
# 进入后端目录
cd backend

# 创建虚拟环境
python -m venv venv

# 激活虚拟环境
# Windows
venv\Scripts\activate
# Linux/Mac
source venv/bin/activate

# 安装依赖
pip install -r requirements.txt
```

### 3. 配置环境

在 `backend` 目录下创建 `.env` 文件（可参考 `backend/.env.example`），配置以下内容：

```env
# 数据库配置
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=jeje_webos

# Redis 配置（可选）
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT 配置（首次启动会自动生成，无需手动配置）
JWT_SECRET_KEY=
JWT_REFRESH_SECRET_KEY=

# 管理员账户（首次启动自动创建）
ADMIN_USERNAME=admin
ADMIN_PASSWORD=Admin@123
ADMIN_PHONE=13800138000

# 其他配置
ENVIRONMENT=development
DEBUG=True
```

### 4. 初始化数据库

```bash
# 数据库会自动创建（如果用户有权限）
# 或者手动创建数据库：
# CREATE DATABASE jeje_webos CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

### 5. 启动服务

```bash
# 在 backend 目录下
python main.py

# 或使用 uvicorn
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

### 6. 访问应用

- **前端界面**: http://localhost:8000
- **API 文档**: http://localhost:8000/api/docs
- **健康检查**: http://localhost:8000/health
- **系统初始化**: http://localhost:8000/api/v1/system/init

### 7. 默认账户

首次启动会自动创建默认管理员账户：
- **用户名**: `admin`（可在 .env 中配置 `ADMIN_USERNAME`）
- **密码**: `Admin@123`（可在 .env 中配置 `ADMIN_PASSWORD`）
- **手机号**: `13800138000`（可在 .env 中配置 `ADMIN_PHONE`）

> ⚠️ **安全提示**：首次登录后请立即修改默认密码！

## 🔌 模块开发

### 使用 CLI 脚手架（推荐）

```bash
cd backend
python scripts/create_module.py task_manager 任务管理
```

这会自动生成：
- `modules/task_manager/task_manager_manifest.py` - 模块清单
- `modules/task_manager/task_manager_models.py` - 数据模型
- `modules/task_manager/task_manager_schemas.py` - 数据验证
- `modules/task_manager/task_manager_router.py` - API 路由
- `modules/task_manager/task_manager_services.py` - 业务逻辑
- `frontend/js/pages/task_manager.js` - 前端页面
- `frontend/css/pages/task_manager.css` - 页面样式

### 模块生命周期钩子

```python
# 在 manifest.py 中定义

async def on_install():
    """首次安装时执行"""
    pass

async def on_upgrade():
    """版本升级时执行"""
    pass

manifest = ModuleManifest(
    id="my_module",
    name="我的模块",
    version="1.0.0",
    on_install=on_install,
    on_upgrade=on_upgrade,
    # ...
)
```

> 📖 详细的模块开发指南请参考 [模块开发指南.md](./模块开发指南.md)

## 🛡️ 安全特性

### 认证与授权

- **JWT Token 认证**：采用 JWT 进行身份认证
- **刷新令牌机制**：访问令牌 + 刷新令牌对，提升安全性
- **JWT 密钥自动轮换**：定期自动轮换（25-35天随机间隔），旧密钥过渡期后自动清理
- **角色权限管理**：基于角色的访问控制（RBAC）+ 细粒度权限

### 密码安全

- **密码加密**：BCrypt 哈希存储
- **密码复杂度**：至少 8 字符，包含大小写字母、数字和特殊字符
- **密码验证**：注册和修改密码时强制验证复杂度

### 速率限制

可通过 `RATE_LIMIT_ENABLED=false` 禁用（开发环境推荐）。

默认规则（可在 .env 中配置）：
- **全局**：200次/分钟（开发环境），100次/分钟（生产环境）
- **登录接口**：5次/分钟（防暴力破解）
- **注册接口**：3次/分钟
- **文件上传**：10次/分钟
- **本地 IP 白名单**：开发环境自动加入白名单
- **自动清理**：5分钟不活跃的客户端状态自动清理，最多存储 10000 个客户端

### CSRF 防护

- **CSRF Token**：可选的 CSRF Token 防护机制
- **自动生成**：系统初始化时自动生成 Token
- **自动携带**：前端自动在状态变更请求中携带 Token
- **配置开关**：可通过 `CSRF_ENABLED` 环境变量启用/禁用

### 文件上传安全

- **文件类型验证**：白名单机制，只允许指定类型
- **内容验证**：使用 `filetype` 库验证文件真实类型
- **大小限制**：默认 100MB（可配置）
- **路径安全**：防止路径遍历攻击

### 日志审计

- **操作日志**：自动记录用户操作行为
- **敏感数据脱敏**：密码、Token、手机号等自动掩码
- **登录审计**：记录登录成功/失败、账户状态等

## 📊 系统功能

### 健康检查

系统提供多个健康检查端点：

```bash
# 简单检查（用于负载均衡）
GET /health

# 就绪检查（用于 K8s readinessProbe）
GET /health/ready

# 存活检查（用于 K8s livenessProbe）
GET /health/live

# 详细检查（用于监控）
GET /health/detailed
```

### 数据库迁移

使用 Alembic 进行数据库版本管理：

```bash
cd backend

# 生成迁移脚本
alembic revision --autogenerate -m "add user avatar"

# 执行迁移
alembic upgrade head

# 回滚迁移
alembic downgrade -1

# 查看当前版本
alembic current

# 查看迁移历史
alembic history
```

> 💡 **提示**：首次启动时，如果数据库不存在，系统会自动创建数据库和表结构

## 📋 API 规范

- **RESTful 风格**：遵循 RESTful API 设计原则
- **统一响应格式**：`{ code, message, data }`
- **标准错误码体系**：详见 `core/errors.py`
- **认证方式**：Bearer Token (JWT)
- **路径前缀**：`/api/v1/`

### 错误码范围

| 范围 | 说明 |
|------|------|
| 0 | 成功 |
| 1xxx | 系统级错误 |
| 2xxx | 认证/授权错误 |
| 3xxx | 业务通用错误 |
| 4xxx | 模块级错误 |
| 5xxx | 第三方服务错误 |

## 🎯 功能模块

### 📝 博客模块 (Blog)

- ✅ 文章发布与管理
- ✅ 分类和标签系统
- ✅ 草稿/发布状态控制
- ✅ 文章置顶和浏览量统计
- ✅ Markdown 格式支持

### 📝 笔记模块 (Notes)

- ✅ 无限层级文件夹树结构
- ✅ 用户数据严格隔离
- ✅ 收藏和置顶功能
- ✅ 富文本编辑支持
- ✅ 快速搜索功能

### 💬 意见建议模块 (Feedback)

- ✅ 用户反馈提交
- ✅ 反馈状态跟踪
- ✅ 管理员回复和处理
- ✅ 反馈分类管理

### 👥 系统功能

- ✅ **用户管理**：注册、登录、审核、权限分配
- ✅ **角色权限**：RBAC + 细粒度权限控制
- ✅ **文件存储**：文件上传、管理、访问控制
- ✅ **数据备份**：数据库和文件备份恢复
- ✅ **系统监控**：CPU、内存、磁盘使用率
- ✅ **公告系统**：发布系统公告、优先级设置、仪表盘展示
- ✅ **通知系统**：WebSocket 实时消息推送
- ✅ **使用帮助**：完整的系统使用指南
- ✅ **系统日志**：操作审计日志、敏感数据脱敏
- ✅ **JWT 密钥管理**：自动轮换、过渡期保护、旧密钥自动清理

### 📊 智能仪表盘

**管理员视图：**
- ✅ 系统统计卡片（模块数、用户数、待审核用户、待处理反馈）
- ✅ 系统健康状态（数据库、Redis 连接状态实时监控）
- ✅ 最新公告列表（带预览和快捷链接）
- ✅ 已安装模块列表（状态和版本信息）

**普通用户视图：**
- ✅ 个人统计卡片（可用模块、笔记数、博客数、收藏数）
- ✅ 最近收藏列表（快速访问收藏的笔记）
- ✅ 最近笔记列表（快速访问最近编辑的内容）
- ✅ 最新公告（系统重要通知）

## 🐳 Docker 部署

项目支持 Docker 化部署，一键启动所有服务，适合开发和生产环境。

### 前置要求

- **Docker**: 20.10 或更高版本
- **Docker Compose**: 2.0 或更高版本（或 Docker Compose V2）
- **磁盘空间**: 至少 2GB 可用空间

### 快速开始

#### 方式一：使用便捷脚本（推荐）

```bash
# 启动服务（开发环境）
./docker-start.sh

# 启动服务（生产环境，包含 Nginx）
./docker-start.sh production

# 查看日志
./docker-logs.sh              # 查看所有服务日志
./docker-logs.sh backend      # 查看指定服务日志

# 停止服务
./docker-stop.sh
```

#### 方式二：使用 Docker Compose

```bash
# 启动所有服务（开发环境）
docker-compose up -d

# 启动所有服务（生产环境，包含 Nginx）
docker-compose --profile production up -d

# 查看日志
docker-compose logs -f              # 查看所有服务日志
docker-compose logs -f backend     # 查看指定服务日志

# 停止服务
docker-compose down

# 停止服务并删除数据卷（谨慎使用）
docker-compose down -v
```

### 环境配置

#### 1. 创建环境变量文件

在项目根目录创建 `.env` 文件（或从 `.env.docker` 复制）：

```env
# ==================== 应用配置 ====================
APP_NAME=JeJe WebOS
APP_VERSION=1.0.0
DEBUG=false
ENVIRONMENT=production

# ==================== 端口配置 ====================
BACKEND_PORT=8000
MYSQL_PORT=3306
REDIS_PORT=6379
HTTP_PORT=80
HTTPS_PORT=443

# ==================== 数据库配置 ====================
DB_USER=jeje
DB_PASSWORD=your_secure_password_here
DB_NAME=jeje_webos
MYSQL_ROOT_PASSWORD=your_root_password_here

# ==================== Redis 配置 ====================
REDIS_PASSWORD=your_redis_password_here

# ==================== JWT 配置 ====================
# 生产环境必须修改为强密钥
JWT_SECRET=your_jwt_secret_key_here_min_32_chars
JWT_EXPIRE_MINUTES=10080

# ==================== 管理员账户 ====================
ADMIN_USERNAME=admin
ADMIN_PASSWORD=Admin@123456
ADMIN_PHONE=13800138000
ADMIN_NICKNAME=系统管理员

# ==================== 文件上传 ====================
MAX_UPLOAD_SIZE=104857600  # 100MB

# ==================== 审计日志 ====================
AUDIT_ALL_OPERATIONS=true
```

> ⚠️ **安全提示**：生产环境部署前，请务必修改所有默认密码和密钥！

#### 2. SSL 证书配置（生产环境）

如果使用生产环境模式（包含 Nginx），需要配置 SSL 证书：

```bash
# 将证书文件放置到以下位置：
# - docker/nginx/ssl/cert.pem  (SSL 证书)
# - docker/nginx/ssl/key.pem   (SSL 私钥)

# 或生成测试证书（仅用于测试）
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout docker/nginx/ssl/key.pem \
  -out docker/nginx/ssl/cert.pem \
  -subj "/C=CN/ST=State/L=City/O=Organization/CN=localhost"
```

### Docker 服务说明

#### 核心服务

| 服务 | 容器名 | 端口 | 说明 |
|------|--------|------|------|
| **backend** | jeje-webos-backend | 8000 | FastAPI 后端服务 |
| **mysql** | jeje-webos-mysql | 3306 | MySQL 8.0 数据库 |
| **redis** | jeje-webos-redis | 6379 | Redis 7 缓存服务 |

#### 可选服务

| 服务 | 容器名 | 端口 | 说明 | 启用方式 |
|------|--------|------|------|----------|
| **nginx** | jeje-webos-nginx | 80/443 | Nginx 反向代理 | `--profile production` |

### 数据持久化

Docker Compose 使用数据卷持久化以下数据：

- **jeje-mysql-data**: MySQL 数据库文件
- **jeje-redis-data**: Redis 数据文件
- **jeje-uploads**: 用户上传的文件
- **jeje-backups**: 系统备份文件
- **jeje-logs**: 应用日志文件
- **jeje-nginx-logs**: Nginx 日志文件

#### 备份数据卷

```bash
# 备份 MySQL 数据
docker run --rm -v jeje_webos_jeje-mysql-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/mysql-backup.tar.gz /data

# 备份上传文件
docker run --rm -v jeje_webos_jeje-uploads:/data -v $(pwd):/backup \
  alpine tar czf /backup/uploads-backup.tar.gz /data
```

#### 恢复数据卷

```bash
# 恢复 MySQL 数据
docker run --rm -v jeje_webos_jeje-mysql-data:/data -v $(pwd):/backup \
  alpine tar xzf /backup/mysql-backup.tar.gz -C /

# 恢复上传文件
docker run --rm -v jeje_webos_jeje-uploads:/data -v $(pwd):/backup \
  alpine tar xzf /backup/uploads-backup.tar.gz -C /
```

### 访问服务

#### 开发环境

- **前端界面**: http://localhost:8000
- **API 文档**: http://localhost:8000/api/docs
- **健康检查**: http://localhost:8000/health
- **系统初始化**: http://localhost:8000/api/v1/system/init

#### 生产环境（使用 Nginx）

- **HTTP**: http://localhost（自动重定向到 HTTPS）
- **HTTPS**: https://localhost
- **API 文档**: https://localhost/api/docs
- **健康检查**: https://localhost/health

### 常用操作

#### 查看服务状态

```bash
# 查看所有服务状态
docker-compose ps

# 查看服务资源使用情况
docker stats
```

#### 重启服务

```bash
# 重启所有服务
docker-compose restart

# 重启指定服务
docker-compose restart backend
```

#### 进入容器

```bash
# 进入后端容器
docker-compose exec backend bash

# 进入 MySQL 容器
docker-compose exec mysql bash

# 进入 Redis 容器
docker-compose exec redis sh
```

#### 数据库操作

```bash
# 连接 MySQL
docker-compose exec mysql mysql -u jeje -p jeje_webos

# 执行数据库迁移
docker-compose exec backend alembic upgrade head

# 创建数据库备份
docker-compose exec backend python -m scripts.backup_db
```

#### 查看日志

```bash
# 查看所有服务日志
docker-compose logs -f

# 查看最近 100 行日志
docker-compose logs --tail=100

# 查看指定服务日志
docker-compose logs -f backend
docker-compose logs -f mysql
docker-compose logs -f redis
```

### 故障排查

#### 服务无法启动

1. **检查端口占用**：
```bash
# Windows
netstat -ano | findstr :8000
# Linux/Mac
lsof -i :8000
```

2. **查看详细错误日志**：
```bash
docker-compose logs backend
```

3. **检查环境变量**：
```bash
docker-compose config
```

#### 数据库连接失败

1. **检查 MySQL 服务状态**：
```bash
docker-compose ps mysql
docker-compose logs mysql
```

2. **验证数据库配置**：
```bash
docker-compose exec backend python -c "from core.config import settings; print(settings.DB_HOST)"
```

#### 性能问题

1. **查看资源使用**：
```bash
docker stats
```

2. **优化 MySQL 配置**：编辑 `docker-compose.yml` 中的 MySQL 参数

3. **启用 Redis 缓存**：确保 Redis 服务正常运行

### 生产环境建议

1. **安全配置**：
   - 修改所有默认密码和密钥
   - 配置强密码策略
   - 启用 HTTPS（SSL 证书）
   - 限制数据库和 Redis 的外部访问

2. **性能优化**：
   - 调整 MySQL 连接池大小
   - 配置 Redis 内存限制
   - 使用 Nginx 反向代理和静态文件缓存
   - 定期清理日志和备份文件

3. **监控和维护**：
   - 配置健康检查告警
   - 定期备份数据库和文件
   - 监控容器资源使用情况
   - 定期更新 Docker 镜像

4. **网络配置**：
   - 使用 Docker 网络隔离服务
   - 配置防火墙规则
   - 使用负载均衡（多实例部署）

## 📊 性能优化

### 已实现的优化

- **数据库连接池**：使用 SQLAlchemy 连接池
- **Redis 缓存**：支持 Redis 缓存（可选）
- **静态文件缓存**：前端静态文件缓存优化
- **Gzip 压缩**：响应内容自动压缩
- **查询优化**：减少不必要的数据库查询
- **中间件优化**：完善的异常处理，防止阻塞

### 性能建议

- 生产环境建议启用 Redis 缓存
- 使用 Nginx 反向代理和静态文件服务
- 配置数据库连接池大小
- 定期清理日志和备份文件

## 📜 开发规范

### 核心原则

1. **严禁模块间 import**：通用逻辑必须下沉到 core
2. **表名隔离**：模块表名必须带前缀，如 `blog_posts`
3. **前后端分离**：后端只返回 JSON，不使用模板渲染
4. **使用核心工具**：分页用 `core.pagination`，错误用 `core.errors`
5. **注释规范**：所有注释和提示文字必须使用中文
6. **离线资源**：所有资源必须本地化，不得使用 CDN 或在线资源

### 模块开发

- 使用 CLI 脚手架创建模块：`python scripts/create_module.py <module_id> <module_name>`
- 遵循模块开发规范，详见 [模块开发指南](./模块开发指南.md)
- 实现模块生命周期钩子（on_install, on_enable, on_disable 等）

### 代码规范

- **Python**: 遵循 PEP 8，使用类型提示，中文注释
- **JavaScript**: ES6+ 语法，2 空格缩进，驼峰命名
- **数据库**: 使用 Alembic 进行版本管理
- **API**: RESTful 风格，统一响应格式

> 📋 详细规范请参考 [开发规范.md](./开发规范.md)

## ⭐ 特性亮点

- 🏗️ **微内核架构** - 核心系统 + 可插拔模块
- 🔌 **热插拔** - 模块可以独立开发、部署、卸载
- 🔒 **生产级安全** - JWT 自动轮换与清理、CSRF 防护、可配置速率限制
- 🚀 **高性能** - 异步操作、连接池、Redis 缓存、中间件优化
- 📦 **模块化** - 统一的模块开发规范和模板
- 🐳 **Docker 化** - 一键部署，开箱即用
- 📊 **监控完善** - 系统监控、日志审计、健康检查
- 🔑 **密钥管理** - JWT 密钥自动轮换、过渡期保护、自动清理

## ❓ 常见问题

### Q1: 如何修改默认管理员密码？

首次启动后，使用默认账户登录系统，在"个人设置"或"用户管理"中修改密码。

### Q2: 模块开发时如何调试？

1. 使用 `uvicorn main:app --reload` 启动开发服务器（自动重载）
2. 查看后端日志输出
3. 使用 API 文档 (`/api/docs`) 测试接口
4. 检查浏览器控制台的前端错误

### Q3: 数据库迁移失败怎么办？

```bash
# 查看当前迁移状态
alembic current

# 查看迁移历史
alembic history

# 回滚到上一个版本
alembic downgrade -1

# 强制升级到最新版本（谨慎使用）
alembic upgrade head
```

### Q4: Redis 是必需的吗？

Redis 不是必需的，但强烈推荐使用，因为：
- 速率限制功能需要 Redis
- 缓存可以提升性能
- 某些模块可能依赖 Redis

如果不使用 Redis，系统仍可正常运行，但速率限制功能将不可用。

### Q5: 如何添加新的模块？

1. 使用 CLI 脚手架创建模块：
```bash
cd backend
python scripts/create_module.py <module_id> <module_name>
```

2. 按照生成的模板文件实现业务逻辑
3. 重启后端服务，模块会自动加载

详细步骤请参考 [模块开发指南](./模块开发指南.md)

### Q6: 生产环境部署需要注意什么？

1. **安全配置**：
   - 修改所有默认密码和密钥
   - 启用 HTTPS（配置 SSL 证书）
   - 限制数据库和 Redis 的外部访问
   - 配置防火墙规则

2. **性能优化**：
   - 启用 Redis 缓存
   - 使用 Nginx 反向代理
   - 配置数据库连接池
   - 定期清理日志和备份

3. **监控和维护**：
   - 配置健康检查告警
   - 定期备份数据库和文件
   - 监控系统资源使用情况

### Q7: 如何备份和恢复数据？

**备份**：
```bash
# 备份数据库
docker-compose exec backend python -m utils.backup backup_db

# 备份文件
docker-compose exec backend python -m utils.backup backup_files
```

**恢复**：
在系统管理界面使用"备份恢复"功能，或使用命令行工具。

### Q8: 模块间可以相互调用吗？

**不可以**。模块之间严禁直接 import，这违反了模块隔离原则。

如果需要共享功能：
1. 将通用功能下沉到 `core` 层
2. 使用事件总线（EventBus）进行模块间通信
3. 通过系统级服务（如用户服务）进行关联

## 📞 获取帮助

- 📖 查看 [模块开发指南](./模块开发指南.md) 学习如何开发模块
- 📋 查看 [开发规范](./开发规范.md) 了解详细的开发规范
- 🐛 提交 Issue 报告问题或建议功能

---

**JeJe WebOS** - 基于 FastAPI 的微内核架构生态系统

⭐ 如果这个项目对您有帮助，请给我们一个 Star！

## 📄 License

MIT License
