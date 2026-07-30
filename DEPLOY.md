# 油炸冰棍 — 网站部署指南

## 一、准备（一次性）

### 1. 买云服务器
推荐阿里云轻量应用服务器：**2 核 2G，¥68/月**
- 系统选 CentOS 7 或 Ubuntu 22.04
- 记下公网 IP（例如 `47.xx.xx.xx`）

### 2. 登录服务器
```bash
ssh root@你的服务器IP
```

### 3. 安装 Node.js
```bash
# Ubuntu
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 验证
node -v   # 应显示 v20.x
```

### 4. 配置防火墙
在阿里云控制台 → 安全组 → 添加规则：
- 端口 8080（应用）
- 端口 443（HTTPS，后续配）
- 端口 80（HTTP）

---

## 二、上传文件

在你的电脑上，把 `server` 文件夹和 `web/dist` 文件夹传到服务器：

```bash
# 在项目根目录执行
scp -r server root@你的IP:/opt/changwo/
scp -r web/dist root@你的IP:/opt/changwo/web/
```

---

## 三、服务器上操作

```bash
cd /opt/changwo/server
npm install --production
NODE_ENV=production node relay.js
```

访问 `http://你的IP:8080` 应该能看到「油炸冰棍」首页。

---

## 四、配域名 + HTTPS（推荐）

1. 在域名服务商把 `api-mosaic.m0m0n1.top` 的 A 记录指向服务器 IP
2. 用 Cloudflare 代理（免费）：
   - 添加站点 → DNS → A 记录 → 打开橙色云朵（代理）
   - SSL/TLS 选 Full
3. 访问 `https://api-mosaic.m0m0n1.top` 即可

---

## 五、保持运行（后台进程）

```bash
# 安装 pm2
npm install -g pm2

# 启动
cd /opt/changwo/server
NODE_ENV=production pm2 start relay.js --name changwo

# 开机自启
pm2 startup
pm2 save
```

---

## 六、目录结构（服务器上）

```
/opt/changwo/
├── server/
│   ├── relay.js
│   ├── start.sh
│   ├── capacity-guard.js
│   ├── shard-bucket.js
│   ├── record-keeper.js
│   ├── file-store.js
│   ├── stt-client.js
│   ├── ai-client.js
│   ├── node_modules/
│   └── uploads/          ← 上传的文件存这里
└── web/
    └── dist/             ← 前端静态网页
        ├── index.html
        └── assets/
```

## 七、更新部署

每次改完代码后：

```bash
# 在电脑上
cd web && npm run build          # 重新构建前端
scp -r web/dist root@IP:/opt/changwo/web/   # 上传
scp -r server/*.js root@IP:/opt/changwo/server/  # 上传服务端

# 在服务器上
cd /opt/changwo/server
pm2 restart changwo
```
