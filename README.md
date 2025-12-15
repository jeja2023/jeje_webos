# JeJe WebOS

> 🖥️ **基于 FastAPI + 微内核架构的现代 Web 桌面操作系统 (Personal Cloud OS)**

[![Python 3.10+](https://img.shields.io/badge/Python-3.10%2B-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.104%2B-green.svg)](https://fastapi.tiangolo.com/)
[![Vue 3 like](https://img.shields.io/badge/JS-Vanilla%20%2B%20Web%20Component-yellow.svg)](https://developer.mozilla.org/zh-CN/docs/Web/JavaScript)
[![License](https://img.shields.io/badge/License-MIT-orange.svg)](LICENSE)
[![Version](https://img.shields.io/badge/Version-2.0.0-brightgreen.svg)](https://github.com/jeja2023/jeje_webos)

**JeJe WebOS** 是一个尝试打破传统 B/S 架构管理后台交互模式的实验性项目。它在浏览器中复刻了原生桌面操作系统（类 macOS）的操作体验，提供了 **窗口管理**、**多任务处理** 和 **模块热插拔** 能力，旨在为用户构建一个流畅、直观且高度可扩展的个人云端工作台。

---

## ✨ 核心特性

### 🖥️ 沉浸式桌面体验 (Desktop Environment)
- **桌面与窗口**：
    - 完整的窗口管理系统：支持 **最小化**、**最大化**、**拖拽移动**、**层级切换**。
    - 多任务并存：可以同时打开多个应用（如一边写博客，一边看笔记）。
- **Dock 栏**：
    - 精致的底部 Dock，支持应用固定、悬停放大动画（Magnification）。
    - 智能折叠：支持应用分组（层叠文件夹），保持 Dock 栏整洁。
- **Top Bar (顶部栏)**：
    - 集成全局系统时间、沉浸式通知中心、个人状态管理。
    - 动态显示的控制中心，实时反映系统状态。
- **Widgets (小部件)**：
    - 桌面支持放置动态时钟、日历、问候语等个性化小部件。

### 🧩 模块化生态系统 (Modular Ecosystem)
系统采用 **微内核 (Micro-Kernel)** 架构，所有业务功能均以 **App (模块)** 形式存在。
- **📝 随手记 (Notes)**：
    - 支持 Markdown 实时预览、代码高亮。
    - 无限层级文件夹树、标签管理、收藏置顶。
- **📰 博客中心 (Blog)**：
    - 完整的 CMS 内容管理，支持封面上传、分类管理、状态流转（草稿/发布）。
- **💬 反馈中心 (Feedback)**：
    - 连接用户与管理员的沟通桥梁，内置状态追踪工作流。
- **📢 公告系统**：
    - 支持全站公告推送、置顶显示、过期自动下架。
- **�️ 系统管理**：
    - **用户权限**：RBAC 角色控制（Admin/Manager/User/Guest）。
    - **系统监控**：CPU、内存、磁盘实时仪表盘。
    - **审计日志**：全量操作行为记录。
    - **数据安全**：一键备份/恢复数据库与文件。

---

## 🏗️ 架构设计

### 后端 (Python / FastAPI)
- **微内核设计**：核心层 (`core`) 仅负责启动、配置、数据库和事件总线，业务逻辑完全解耦在 `modules/` 目录中。
- **自动化运维**：
    - **JWT 自动轮换**：每 25-35 天自动更换签名密钥，旧密钥平滑过渡。
    - **速率限制**：基于 Redis 的滑动窗口限流，防暴力破解。
    - **健康检查**：提供 `/health/live` 和 `/health/ready` 探针接口。

### 前端 (Vanilla JS / CSS3)
- **无构建 (No-Build)**：采用原生  ES Modules 开发，无需 Webpack/Vite 编译，修改即生效。
- **组件化**：自研轻量级 Component 基类，实现状态响应式更新（State-Reactive）。
- **样式隔离**：核心样式与 App 样式分离，支持动态 CSS 变量换肤。

---

## 🚀 快速开始

### 方式一：Docker 一键部署（推荐）

适合快速体验或生产部署。

```bash
# 1. 启动服务（开发模式）
./docker-start.sh

# 2. 启动服务（生产模式，包含 Nginx）
./docker-start.sh production

# 3. 停止服务
./docker-stop.sh
```

### 方式二：本地开发运行

适合开发者进行模块开发。

**前置要求**：Python 3.10+, MySQL 8.0+, Redis

1. **克隆项目**
   ```bash
   git clone https://github.com/your-repo/jeje-webos.git
   cd jeje_webos/backend
   ```
 ## 📂 项目结构 (Project Structure)

JeJe WebOS 采用前后端分离的目录结构，后端负责核心逻辑与 API，前端负责桌面 UI 渲染。

```text
jeje_webos/
├── backend/                      # 🐍 后端核心 (Python/FastAPI)
│   ├── core/                     # --- 微内核基础设施 ---
│   │   ├── config.py             # 全局配置管理 (Env/Settings)
│   │   ├── database.py           # 数据库连接与会话管理 (Async SQLAlchemy)
│   │   ├── security.py           # 安全认证 (JWT, Password Hashing)
│   │   ├── loader.py             # 模块动态加载器 (Module Loader)
│   │   ├── middleware.py         # 全局中间件 (Audit, Logging)
│   │   └── events.py             # 事件总线 (Event Bus)
│   ├── modules/                  # --- 业务模块 (Pluggable Apps) ---
│   │   ├── _template/            # 模块生成模板
│   │   ├── notes/                # [示例] 随手记模块
│   │   ├── blog/                 # [示例] 博客模块
│   │   └── feedback/             # [示例] 反馈模块
│   ├── routers/                  # 系统级路由 (System API)
│   ├── models/                   # 系统级数据模型 (User, Role, SystemSettings)
│   ├── schemas/                  # Pydantic 数据验证模型
│   ├── scripts/                  # 运维与开发脚本 (Create Module, Backup)
│   ├── alembic/                  # 数据库迁移脚本
│   ├── main.py                   # 🚀 应用启动入口
│   └── requirements.txt          # Python 依赖清单
│
├── frontend/                     # 🎨 前端桌面环境 (Vanilla JS)
│   ├── css/                      # --- 样式层 ---
│   │   ├── core/                 # 基础样式 (Variables, Reset, Typography)
│   │   ├── components/           # 组件样式 (Window, Dock, Modal)
│   │   └── pages/                # 各应用页面独立样式
│   ├── js/                       # --- 逻辑层 ---
│   │   ├── core/                 # 核心库
│   │   │   ├── api.js            # Axios 封装与拦截器
│   │   │   ├── router.js         # 前端哈希路由
│   │   │   ├── store.js          # 响应式状态管理 (Reactive Store)
│   │   │   └── utils.js          # 工具函数
│   │   ├── components/           # UI 组件
│   │   │   ├── window.js         # 窗口管理器 (核心组件)
│   │   │   ├── dock.js           # 底部 Dock 栏
│   │   │   ├── topbar.js         # 顶部状态栏
│   │   │   └── ...
│   │   └── pages/                # 业务页面逻辑 (与 backend/modules 对应)
│   └── index.html                # 单页应用入口
│
├── docker/                       # 🐳 容器化配置
│   ├── docker-compose.yml        # 服务编排
│   ├── Dockerfile                # 后端镜像构建
│   └── env_docker                # 生产环境配置示例
└── storage/                      # 💾 数据持久化 (Uploads, Backups, DB Data)
```

### 核心目录说明

- **`backend/core/`**: 这是系统的"微内核"。它不包含具体的业务逻辑（如博客、笔记），只负责系统启动、模块加载、数据库连接、权限验证等底层服务。任何模块都依赖于 core 提供的基础设施。
- **`backend/modules/`**: 所有功能性应用（App）都存放在这里。每个模块都是独立的，拥有自己的 `{id}_manifest.py` (元数据), `{id}_router.py` (API), `{id}_models.py` (表结构)。删除某个模块文件夹即可完全卸载该功能。
- **`frontend/js/core/`**: 前端的"操作系统层"。`Store` 实现了类似 Vuex 的状态管理，`Router` 处理虚拟路由，`Component` 基类提供了类似 React/Vue 的组件化开发体验（setState 机制）。

访问：`http://localhost:8000`

---

2. **配置环境**
   ```bash
   python -m venv venv
   source venv/bin/activate  # Windows: venv\Scripts\activate
   pip install -r backend/requirements.txt
   ```

3. **配置数据库**
   复制 `.env.example` 为 `.env` 并修改数据库连接：
   ```ini
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your_password
   ```

4. **启动服务**
   ```bash
   # 开发模式（热重载）
   uvicorn main:app --reload
   ```

访问：`http://localhost:8000`

---

## 🔌 模块开发指南

JeJe WebOS 提供了强大的 CLI 脚手架，**3秒钟**即可生成一个全功能的 App。

```bash
# 进入后端目录
cd backend

# 命令格式：python scripts/create_module.py <英文ID> <中文名称>
python scripts/create_module.py todo_list 待办事项
```

**生成的代码包含：**
- 🐍 **后端**：Router, Service, Model (SQLAlchemy), Schema (Pydantic)
- 🎨 **前端**：JS Page Component, CSS 样式
- 📜 **配置**：Manifest 自动注册文件

重启服务后，你将在桌面的 **App Center（应用中心）** 看到新创建的 App。

---

## � 文档与规范

- **[开发规范](./开发规范.md)**：包含核心架构、代码规范、模块开发指南与前端开发手册。

## 🛡️ 安全策略

- **密码存储**：Bcrypt 强哈希加密。
- **API 安全**：全局异常拦截、标准响应封装、CSRF 防护（可选）。
- **敏感数据**：日志记录自动脱敏（手机号、Token 等）。

## ⚙️ 配置说明 (Configuration)

在 `backend/.env` 中配置核心参数。详细变量请参考 `backend/core/config.py`。

| 变量类 | 变量名 | 说明 | 默认值 |
| :--- | :--- | :--- | :--- |
| **基础** | `APP_NAME` | 系统名称 | JeJe WebOS |
| | `DEBUG` | 调试模式 (True/False) | False |
| **数据库** | `DB_HOST` | MySQL 主机地址 | localhost |
| | `DB_PORT` | MySQL 端口 | 3306 |
| | `DB_USER` / `DB_PASSWORD` | 数据库账号密码 | root / (空) |
| **Redis** | `REDIS_HOST` | Redis 主机地址 | localhost |
| | `REDIS_PORT` | Redis 端口 | 6379 |
| **安全** | `JWT_SECRET` | 令牌加密密钥 | (自动轮换) |
| | `RATE_LIMIT_ENABLED` | 是否启用限流 | True |
| | `CSRF_ENABLED` | 是否启用 CSRF 防护 | False |

---

## 🌏 浏览器支持

JeJe WebOS 采用了许多现代 Web 特性（如 Grid 布局、CSS 变量、WebSocket、ES Modules），建议使用以下浏览器的最新版本：

| <img src="https://raw.githubusercontent.com/alrra/browser-logos/master/src/chrome/chrome_48x48.png" alt="Chrome" width="24px" height="24px" /> Chrome | <img src="https://raw.githubusercontent.com/alrra/browser-logos/master/src/edge/edge_48x48.png" alt="Edge" width="24px" height="24px" /> Edge | <img src="https://raw.githubusercontent.com/alrra/browser-logos/master/src/firefox/firefox_48x48.png" alt="Firefox" width="24px" height="24px" /> Firefox | <img src="https://raw.githubusercontent.com/alrra/browser-logos/master/src/safari/safari_48x48.png" alt="Safari" width="24px" height="24px" /> Safari |
| :---: | :---: | :---: | :---: |
| ✅ 90+ | ✅ 90+ | ✅ 90+ | ✅ 15+ |

> ⚠️ **注意**：不支持 IE 浏览器。

---

## 🗺️ 未来规划 (Roadmap)

- [x] **多窗口并行**：真正支持多窗口同时操作，支持拖拽、缩放、层叠管理。
- [ ] **应用商店 (App Store)**：支持从云端一键安装第三方开发的 App 模块。
- [ ] **文件管理器**：基于 WebDAV 的全功能云端文件管理。
- [ ] **P2P 快传**：局域网内设备间高速文件传输。
- [ ] **主题编辑器**：可视化编辑桌面主题和配色。

---

## 📅 更新日志 (Changelog)

> 完整更新历史请查看 [更新日志.md](./更新日志.md)

### 最新版本 v2.0.0 (2025-12-15)
- ✨ **统一发布**：整合多窗口系统、Dock 优化、地址栏同步等核心特性，作为 2.0.0 稳定版发布。查看 [更新日志.md](./更新日志.md) 获取详情。

---

## 📄 License

MIT License. Copyright (c) 2025 JeJe WebOS Team.
