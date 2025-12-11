# SSL 证书目录

## 生产环境配置

在生产环境中，请将您的 SSL 证书文件放置在此目录：

- `cert.pem` - SSL 证书文件
- `key.pem` - SSL 私钥文件

## 开发环境测试证书

如果需要生成自签名证书用于测试，可以使用以下命令：

```bash
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout key.pem \
  -out cert.pem \
  -subj "/C=CN/ST=State/L=City/O=Organization/CN=localhost"
```

**注意**：自签名证书仅用于开发测试，浏览器会显示安全警告。生产环境必须使用由受信任的 CA 签发的证书。

