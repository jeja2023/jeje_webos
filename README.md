# JeJe WebOS

> 🖥️ **基于 FastAPI + 微内核架构的现代 Web 桌面操作系统**

[![Python 3.12+](https://img.shields.io/badge/Python-3.12%2B-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104%2B-green.svg)](https://fastapi.tiangolo.com/)
[![License](https://img.shields.io/badge/License-MIT-orange.svg)](LICENSE)

**JeJe WebOS** 是一个在浏览器中复刻原生桌面操作系统体验的 Web 应用平台。它采用微内核架构，提供窗口管理、多任务处理和模块热插拔能力，旨在构建一个流畅、直观且高度可扩展的个人云端工作台。

---

## ✨ 核心特性

### 🖥️ 沉浸式桌面体验
- **窗口管理系统**：支持最小化、最大化、拖拽移动、层级切换
- **多任务处理**：可同时打开多个应用窗口
- **Dock 栏**：底部应用栏，支持应用固定、悬停放大动画、智能折叠
- **Top Bar**：顶部状态栏，集成系统时间、通知中心、个人状态管理
- **桌面小部件**：支持动态时钟、日历、问候语等个性化组件
- **全局搜索**：Spotlight 风格的快速搜索，支持快捷键唤起

### 🧩 模块化生态系统
系统采用微内核架构，所有业务功能以模块形式存在，支持热插拔：

#### 默认启用模块
| 模块 | 功能描述 |
|------|---------|
| **📝 博客 (Blog)** | 完整 CMS 内容管理、封面上传、分类管理、状态流转 |
| **📒 笔记 (Notes)** | Markdown 实时预览、无限层级文件夹、标签管理、收藏置顶 |
| **💬 反馈 (Feedback)** | 用户与管理员沟通桥梁、状态追踪工作流 |
| **📁 文件管理 (FileManager)** | 网格/列表视图、虚拟目录、无限层级、在线预览、拖拽上传 |
| **⚡ 快传 (Transfer)** | 局域网跨设备文件传输、传输码机制、WebSocket 实时进度 |
| **📄 PDF 工具 (PDF)** | 在线预览、格式转换 (Word/Excel/图像)、页面编辑 (合并/拆分/水印/加密) |
| **🔬 数据透镜 (DataLens)** | 万能数据视窗，支持 MySQL/PostgreSQL/SQL Server/Oracle/SQLite/CSV/Excel/API 等数据源 |

#### 按需启用模块（通过应用市场启用）
| 模块 | 功能描述 |
|------|---------|
| **🧠 AI 助手** | 集成多种大模型引擎，支持流式对话、上下文记忆、多角色预设 |
| **📊 数据分析 (Analysis)** | 基于 DuckDB 的 ETL 数据建模、BI 数据大屏、图表分析 |
| **📚 知识库 (Knowledge)** | AI 混合搜索、图片语义搜索、知识图谱可视化 |
| **💬 即时通讯 (IM)** | 端到端加密聊天、群组管理、文件传输、消息撤回 |
| **🔐 密码箱 (Vault)** | AES-256 加密存储、主密码保护、恢复码机制、安全自动清除 |
| **📅 日程管理 (Schedule)** | 日历视图、事件分类、提醒通知推送 |
| **📚 课程学习 (Course)** | 沉浸式学习体验、智能记忆续学、专注模式 |
| **📝 在线考试 (Exam)** | 题库管理、智能组卷、在线考试与自动阅卷 |
| **📷 相册 (Album)** | 个人相册管理，支持相册分类和照片上传预览 |
| **🎬 视频 (Video)** | 个人视频管理，支持视频集分类和视频上传播放 |
| **🗺️ 智能地图 (Map)** | 离线/在线双模式、GPS 轨迹回放、热力图分析 |
| **📷 图文识别 (OCR)** | 基于 RapidOCR 的离线图文识别，支持图片和 PDF |

### ⚙️ 系统管理
- **用户权限**：RBAC 角色控制（Admin/Manager/User/Guest）
- **系统监控**：CPU、内存、磁盘实时仪表盘
- **审计日志**：全量操作行为记录
- **数据备份**：数据库自动备份与恢复
- **主题系统**：2 套可选特色主题（日出印象、星夜霓虹）

---

## 🏗️ 技术架构

### 后端 (Python / FastAPI)
- **微内核设计**：核心层仅负责启动、配置、数据库和事件总线
- **模块化架构**：业务逻辑完全解耦在 `modules/` 目录中
- **性能优化**：
  - 文件上传流式写入，内存占用恒定
  - 系统设置 Redis 缓存，减少数据库查询
- **自动化运维**：
  - JWT 自动轮换（每 25-35 天）
  - 速率限制（基于 Redis 滑动窗口）
  - 健康检查（`/health/live` 和 `/health/ready`）

### 前端 (Vanilla JS / CSS3)
- **无构建工具**：采用原生 ES Modules，修改即生效
- **组件化**：自研轻量级 Component 基类，状态响应式更新
- **样式隔离**：核心样式与 App 样式分离，支持动态 CSS 变量换肤

---

## 🚀 快速开始

### 前置要求
- Python 3.12+
- MySQL 8.0+
- Redis 5.0+

### 方式一：Docker 部署（推荐）

本系统提供 **CPU版** Docker 镜像（约 800MB），适合在 NAS、轻量级云服务器或普通个人电脑上运行。镜像已集成 OCR、PDF 处理及本地 AI 推理的 CPU 模式。

```bash
# 1. 进入 docker 目录
cd docker

# 2. 复制配置模板
cp env_docker.example env_docker

# 3. 编辑配置（修改数据库密码、应用端口等）
# Windows: notepad env_docker
# Linux/Mac: vim env_docker

# 4. 启动服务（会自动从 Docker Hub 拉取或本地构建）
docker-compose up -d

# 5. 查看启动日志（包含数据库初始化进度）
docker-compose logs -f app
```

> **提示**：首次启动会自动运行 Alembic 数据库迁移。默认访问地址为 `http://localhost:8000`（或您在 `env_docker` 中配置的端口）。
>
> **💡 NAS 用户特别说明**：
> 如果您是在 **飞牛NAS (FnOS)**、群晖或威联通上通过 Docker 部署，请务必参考 [**NAS 部署详细指南 (含故障排查)**](./deployment/使用说明.md)。该文档详细说明了如何正确挂载大型模型文件。


### 方式二：本地开发运行

```bash
# 1. 克隆项目
git clone https://github.com/jeja2023/jeje_webos.git
cd jeje_webos/backend

# 2. 创建虚拟环境
python -m venv venv
# Windows
venv\Scripts\activate
# Linux/Mac
source venv/bin/activate

# 3. 安装依赖
pip install -r requirements.txt

# 4. 配置环境变量
# 复制 .env.example 为 .env 并修改配置
# 主要配置项：
# - DB_HOST, DB_USER, DB_PASSWORD, DB_NAME
# - REDIS_HOST, REDIS_PORT
# - JWT_SECRET（首次启动会自动生成）

# 5. 初始化数据库
# 确保 MySQL 和 Redis 已启动
# 系统首次启动会自动创建数据库表

# 6. 启动服务
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

访问地址：`http://localhost:8000`

**默认管理员账户**：
- 用户名：在 `.env` 中配置的 `ADMIN_USERNAME`（默认：admin）
- 密码：在 `.env` 中配置的 `ADMIN_PASSWORD`
- 首次启动时会自动创建，请尽快登录并修改密码

---

## 📂 项目结构

```
jeje_webos/
├── backend/                      # 后端核心 (Python/FastAPI)
│   ├── core/                     # 微内核基础设施
│   │   ├── config.py             # 配置管理
│   │   ├── database.py           # 数据库连接与会话
│   │   ├── security.py           # 安全认证 (JWT, 密码哈希)
│   │   ├── loader.py             # 模块动态加载器
│   │   ├── middleware.py         # 全局中间件
│   │   ├── events.py             # 事件总线
│   │   └── ...                   # 其他核心组件
│   │
│   ├── modules/                  # 业务模块 (可插拔)
│   │   ├── _template/            # 模块生成模板
│   │   ├── blog/                 # 博客模块
│   │   ├── notes/                # 笔记模块
│   │   ├── feedback/             # 反馈模块
│   │   ├── filemanager/          # 文件管理模块
│   │   ├── transfer/             # 快传模块
│   │   ├── datalens/             # 数据透镜模块
│   │   ├── ai/                   # AI 助手模块
│   │   ├── analysis/             # 数据分析模块
│   │   ├── knowledge/            # 知识库模块
│   │   ├── im/                   # 即时通讯模块
│   │   ├── vault/                # 密码箱模块
│   │   ├── schedule/             # 日程管理模块
│   │   ├── course/               # 课程学习模块
│   │   ├── exam/                 # 在线考试模块
│   │   ├── album/                # 相册模块
│   │   ├── video/                # 视频模块
│   │   ├── map/                  # 智能地图模块
│   │   └── ocr/                  # 图文识别模块
│   │
│   ├── routers/                  # 系统级路由
│   ├── models/                   # 系统级数据模型
│   ├── schemas/                  # Pydantic 验证模型
│   ├── scripts/                  # 开发脚本
│   ├── utils/                    # 工具函数库
│   ├── tests/                    # 单元测试
│   ├── alembic/                  # 数据库迁移
│   ├── state/                    # 模块状态存储
│   ├── main.py                   # 应用启动入口
│   └── requirements.txt          # Python 依赖
│
├── frontend/                     # 前端桌面环境
│   ├── css/                      # 样式层
│   │   ├── core/                 # 核心样式 (变量、重置、按钮等)
│   │   ├── components/           # UI 组件样式
│   │   └── pages/                # 业务页面样式
│   │
│   ├── js/                       # 逻辑层
│   │   ├── core/                 # 核心库 (Router, Store, Api, Component)
│   │   ├── components/           # UI 组件 (Modal, Toast, Dock, TopBar)
│   │   ├── utils/                # 工具函数 (图表、快捷键、帮助)
│   │   └── pages/                # 业务页面
│   │
│   ├── libs/                     # 第三方库
│   ├── images/                   # 图片资源
│   ├── index.html                # 单页应用入口
│   ├── manifest.json             # PWA 配置
│   └── sw.js                     # Service Worker
│
├── docker/                       # 容器化配置
│   ├── docker-compose.yml        # 服务编排
│   ├── Dockerfile                # 后端镜像构建
│   ├── docker-entrypoint.sh      # 启动脚本
│   └── env_docker.example        # 环境配置示例
│
├── storage/                      # 数据持久化
│   ├── public/                   # 公共文件
│   ├── users/                    # 用户私有文件
│   ├── modules/                  # 模块专属文件
│   └── system/                   # 系统文件（备份、日志）
│
├── 开发规范.md                    # 完整开发指南
└── 更新日志.md                    # 版本更新历史
```

---

## 🔌 模块开发

JeJe WebOS 提供了强大的 CLI 脚手架，3 秒钟即可生成一个全功能的模块：

```bash
cd backend
python scripts/create_module.py <模块ID> <模块名称>

# 示例
python scripts/create_module.py todo_list 待办事项
```

生成的代码包含：
- 🐍 **后端**：Router, Service, Model (SQLAlchemy), Schema (Pydantic)
- 🎨 **前端**：JS Page Component, CSS 样式
- 📜 **配置**：Manifest 自动注册文件

重启服务后，新模块将自动出现在应用中心。

详细开发指南请参考 [开发规范.md](./开发规范.md)

---

## ⚙️ 配置说明

在 `backend/.env` 或 `docker/env_docker` 中配置核心参数：

| 类别 | 变量名 | 说明 | 默认值 |
|:---|:---|:---|:---|
| **基础** | `APP_NAME` | 系统名称 | JeJe WebOS |
| | `APP_VERSION` | 系统版本 | 2.4.9 |
| | `DEBUG` | 调试模式 | False |
| **数据库** | `DB_HOST` | MySQL 主机 | localhost |
| | `DB_PORT` | MySQL 端口 | 3306 |
| | `DB_USER` | 数据库用户 | root |
| | `DB_PASSWORD` | 数据库密码 | (空) |
| | `DB_NAME` | 数据库名 | jeje_webos |
| **Redis** | `REDIS_HOST` | Redis 主机 | localhost |
| | `REDIS_PORT` | Redis 端口 | 6379 |
| | `REDIS_PASSWORD` | Redis 密码 | (空) |
| **安全** | `JWT_SECRET` | JWT 密钥 | (自动生成) |
| | `JWT_AUTO_ROTATE` | JWT 自动轮换 | True |
| | `RATE_LIMIT_ENABLED` | 启用速率限制 | True |
| | `CSRF_ENABLED` | 启用 CSRF 防护 | False |
| **管理员** | `ADMIN_USERNAME` | 管理员用户名 | admin |
| | `ADMIN_PASSWORD` | 管理员密码 | (必填) |
| | `ADMIN_PHONE` | 管理员手机号 | (必填) |

详细配置项请参考 `backend/core/config.py`

---

## 🛡️ 安全特性

- **密码存储**：Bcrypt 强哈希加密
- **API 安全**：全局异常拦截、标准响应封装、CSRF 防护（可选）
- **敏感数据脱敏**：日志记录自动脱敏（手机号、Token 等）
- **速率限制**：基于 Redis 的滑动窗口限流，防止暴力破解
- **JWT 自动轮换**：每 25-35 天自动更换签名密钥，旧密钥平滑过渡

---

## 🎨 主题系统

系统提供 2 套特色主题供手动选择：

| 主题 | 风格描述 |
|------|---------|
| **日出印象** | 温暖晨曦风格，珊瑚橙主色调，适合白天使用 |
| **星夜霓虹** | 赛博朋克风格，霓虹蓝主色调，酷炫夜间体验 |

---

## 🌏 浏览器支持

| Chrome | Edge | Firefox | Safari |
|:---:|:---:|:---:|:---:|
| ✅ 90+ | ✅ 90+ | ✅ 90+ | ✅ 15+ |

> ⚠️ 不支持 IE 浏览器

---

## 📖 文档

- **[开发规范](./开发规范.md)**：完整的开发指南，包含架构规范、代码标准、模块开发实战
- **[更新日志](./更新日志.md)**：详细的版本更新历史

---

## 📄 License

MIT License. Copyright (c) 2025 JeJe WebOS.

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

---

## 📧 联系方式

如有问题或建议，请通过以下方式联系：
- GitHub Issues: [提交问题](https://github.com/jeja2023/jeje_webos/issues)
- Email: jejajeja2023@gmail.com
