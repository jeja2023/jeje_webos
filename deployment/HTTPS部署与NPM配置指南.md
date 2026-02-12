# JeJe WebOS 生产环境部署配置指南 (HTTPS + 反向代理)

本指南针对使用 **Docker** 部署，并配合 **Nginx Proxy Manager (NPM)** 进行域名访问及 SSL 证书配置的场景。

---

## 1. Nginx Proxy Manager (NPM) 配置

在 NPM 管理后台，为您的域名添加或编辑 `Proxy Host`：

### 基础设置 (Details)
- **Forward Hostname / IP**: 填写容器名（如 `jeje-webos-app`）或宿主机内网 IP。
- **Forward Port**: `8000` (后端服务真实端口)。
- **Websockets Support**: **必须开启**（用于即时通讯和系统通知）。

### 安全设置 (SSL)
- **SSL Certificate**: 选择您的证书（如 Let's Encrypt）。
- **Force SSL**: 建议开启。
- **HTTP/2 Support**: 建议开启。
- **HSTS Enabled**: 建议开启。

### 关键高级配置 (Advanced)
为了确保后端能够识别 HTTPS 协议并正确下发安全 Cookie，请在 **Custom Nginx Configuration** 框中粘贴以下内容：

```nginx
# 告知后端真实的协议和客户端信息
proxy_set_header X-Forwarded-Proto $scheme;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;

# 支持流式响应（如 AI 聊天）
proxy_buffering off;
proxy_cache off;
```

---

## 2. WebOS 环境变量配置 (`env_docker`)

在 Docker 部署目录下修改 `env_docker` 文件，配置以下关键安全项：

```bash
# ==================== 安全与域名配置 ====================

# 1. 跨域允许源：必须精确匹配包含协议的完整域名
# 注意：严禁使用 ["*"]，否则安全 Cookie 将无法写入
ALLOW_ORIGINS=["https://os.yourdomain.com"]

# 2. 安全 Cookie 开关
# 开启后 Token 将存放于 HttpOnly Cookie 中，有效防止 XSS 攻击
AUTH_USE_HTTPONLY_COOKIE=true

# 3. 运行模式
# 生产环境务必设为 false，这会同步开启 Cookie 的 Secure 属性
DEBUG=false
```

---

## 3. 配置原理解析

### 为什么 `ALLOW_ORIGINS` 不能写 `*`？
当开启 `AUTH_USE_HTTPONLY_COOKIE` 时，浏览器出于安全策略，要求后端必须明确指定允许的来源域名。如果设置为 `*`，浏览器会由于安全性不足而拒绝存储凭证，导致用户登录后刷新页面就会掉线。

### 为什么需要 `X-Forwarded-Proto`？
由于 Docker 容器内部通常运行在 `http` 协议下，如果不配置此 Header，后端程序会认为当前处于非安全环境，从而拒绝下发带有 `Secure` 标记的安全 Cookie。NPM 的配置解决了这种“内外协议不一致”的问题。

---

## 4. 常见问题排除

1. **登录后立即提示“未登录”或刷新掉线**：
   - 检查 `ALLOW_ORIGINS` 是否与浏览器地址栏中的域名字符串完全匹配（注意 http/https 区别）。
   - 检查浏览器 Cookie 中是否存在 `access_token`，且其 `Secure` 属性是否已生效。

2. **AI 聊天响应缓慢或无输出**：
   - 确认 NPM 的 Advanced 配置中已添加 `proxy_buffering off;`。

3. **实时通知收不到**：
   - 确认 NPM 中已开启 **Websockets Support**。
