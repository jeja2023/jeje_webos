# JeJe WebOS Ubuntu 服务器部署详细指南

本文档提供在 Ubuntu Linux 服务器（如 AWS EC2, 阿里云 ECS, 或本地服务器）上部署 JeJe WebOS 的全流程指南。

---

## 📋 1. 准备工作

### 1.1 服务器要求
- **OS**: Ubuntu 20.04 LTS 或 22.04 LTS (推荐)
- **CPU**: 2核+
- **内存**: 4GB+ (若启用 AI 模型建议 8GB+)
- **磁盘**: 20GB+
- **网络**: 能够访问 GitHub 和 Docker Hub

### 1.2 安装 Docker 和 Docker Compose
在服务器终端执行以下命令安装 Docker 环境：

```bash
# 更新源
sudo apt-get update
sudo apt-get upgrade -y

# 安装必要工具
sudo apt-get install -y apt-transport-https ca-certificates curl software-properties-common git

# 安装 Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# 启动 Docker 并设置开机自启
sudo systemctl enable docker
sudo systemctl start docker

# (可选) 将当前用户加入 docker 组，避免每次都 sudo
sudo usermod -aG docker $USER
# 注意：执行完上一行后，需退出 SSH session 重新登录才能生效
```

---

## 📥 2. 获取代码与配置

### 2.1 克隆项目
将项目代码克隆到服务器上（假设放在 `/opt/jeje_webos` 或用户主目录）：

```bash
cd ~
git clone https://github.com/jeja2023/jeje_webos.git
cd jeje_webos
```

> **注意**: 如果您的代码还在本地，可以使用 SCP 等工具将整个项目文件夹上传到服务器。

### 2.2 准备环境变量
进入 `docker` 目录并复制配置模板：

```bash
cd docker
cp env_docker.example env_docker
```

### 2.3 修改配置
使用 `nano` 或 `vim` 编辑配置文件：

```bash
nano env_docker
```

**关键修改项**:
1.  **`DB_PASSWORD` & `MYSQL_ROOT_PASSWORD`**: 必须修改为强密码！
2.  **`JWT_SECRET`**: 必须修改为随机长字符串（生产环境安全核心）。
3.  **`APP_PORT`**: 默认 9000，如果服务器该端口未被占用可保持默认。如果您希望直接通过 IP 访问（不加端口），后续需配置 Nginx，这里先保持 9000 即可。
4.  **`IM_ENCRYPTION_KEY`**: 聊天加密密钥，也建议修改。

保存并退出（Nano: `Ctrl+O` -> `Enter` -> `Ctrl+X`）。

---

## 🚀 3. 构建与启动

在 `docker` 目录下执行：

```bash
# 自动构建镜像并启动 (第一次运行需要较长时间构建)
docker-compose up -d --build
```

**命令解释**:
- `-d`: 后台运行
- `--build`: 强制根据 Dockerfile 重新构建镜像（确保代码是新的）

### 查看运行状态
```bash
docker-compose ps
```
确保 `jeje-webos-app`, `jeje-webos-mysql`, `jeje-webos-redis` 状态均为 `Up` (或 `healthy`)。

### 查看日志
如果遇到问题，查看服务日志：
```bash
docker-compose logs -f app
```

---

## 🌐 4. 访问系统

### 4.1 放行防火墙端口
如果是云服务器（如阿里云、腾讯云、AWS），需在控制台安全组中放行 **TCP 9000** 端口。
如果是 Ubuntu 本地防火墙 (ufw)：

```bash
sudo ufw allow 9000/tcp
```

### 4.2 浏览器访问
打开浏览器访问：
`http://<您的服务器IP>:9000`

默认管理员：
- 用户名: `admin` (或您在 env_docker 中配置的)
- 密码: `Admin@123` (或您在 env_docker 中配置的)

---

## 🔧 5. 进阶配置：使用 Nginx 反向代理 (推荐)

为了使用标准 HTTP (80) 或 HTTPS (443) 端口，建议在宿主机配置 Nginx。
注意：不要在 docker 容器内配置 Nginx，而是直接在 Ubuntu 宿主机上安装。

1. **安装 Nginx**
   ```bash
   sudo apt-get install -y nginx
   ```

2. **创建配置文件**
   ```bash
   sudo nano /etc/nginx/sites-available/jeje_webos
   ```
   
   写入以下内容：
   ```nginx
   server {
       listen 80;
       server_name your_domain.com;  # 如果没有域名，填 IP

       client_max_body_size 500M;    # 允许大文件上传

       location / {
           proxy_pass http://localhost:9000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           
           # 支持 WebSocket (IM 和 实时通知需要)
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
       }
   }
   ```

3. **启用配置并重启 Nginx**
   ```bash
   sudo ln -s /etc/nginx/sites-available/jeje_webos /etc/nginx/sites-enabled/
   sudo nginx -t
   sudo systemctl restart nginx
   ```

现在您可以通过 `http://<您的IP或域名>` 直接访问，无需加端口号。

### 5.2 启用 HTTPS 与 HTTP/2 (强烈推荐)

HTTP/2 协议能显著提升应用加载速度（尤其是多文件请求时），但它依赖于 HTTPS。
以下步骤介绍如何配置 SSL 证书并开启 HTTP/2。

1. **安装 Certbot (SSL 证书工具)**
   ```bash
   sudo apt-get install -y certbot python3-certbot-nginx
   ```

2. **获取免费证书 (Let's Encrypt)**
   ```bash
   sudo certbot --nginx -d your_domain.com
   ```
   按照提示输入邮箱并同意协议，Certbot 会自动修改 Nginx 配置。

3. **手动开启 HTTP/2**
   Certbot 自动生成的配置可能未默认开启 HTTP/2。
   编辑配置文件：
   ```bash
   sudo nano /etc/nginx/sites-available/jeje_webos
   ```

   找到 `listen 443 ssl;` 行，将其修改为：
   ```nginx
   listen 443 ssl http2;
   ```

   完整配置示例（参考）：
   ```nginx
   server {
       listen 80;
       server_name your_domain.com;
       # 强制跳转 HTTPS
       return 301 https://$host$request_uri;
   }

   server {
       # 启用 SSL 和 HTTP/2
       listen 443 ssl http2;
       server_name your_domain.com;

       ssl_certificate /etc/letsencrypt/live/your_domain.com/fullchain.pem;
       ssl_certificate_key /etc/letsencrypt/live/your_domain.com/privkey.pem;
       include /etc/letsencrypt/options-ssl-nginx.conf;
       ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

       client_max_body_size 500M;

       location / {
           proxy_pass http://localhost:9000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
           
           # WebSocket 支持
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection "upgrade";
       }
   }
   ```

4. **重启 Nginx**
   ```bash
   sudo systemctl restart nginx
   ```

---

## 🔄 6. 后续维护

### 更新代码
```bash
cd ~/jeje_webos
git pull origin main

cd docker
docker-compose up -d --build  # 重新构建并重启
```

### 数据备份
主要数据都在 `docker/jeje-storage` (如果使用了卷标可能是 `/var/lib/docker/volumes/...`)。
建议定期备份 `jeje_webos/storage` 目录（如果挂载了本地目录）以及导出 MySQL 数据。

手动备份数据库：
```bash
docker exec jeje-webos-mysql /usr/bin/mysqldump -u jeje --password=jeje_123456 jeje_webos > backup.sql
```
