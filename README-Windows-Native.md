# Windows 原生部署指南（无需Docker）

## 🎯 环境要求

### 必须安装
1. **Node.js** (推荐LTS版本 18.x 或更高)
   - 下载地址: https://nodejs.org/
   - 安装时选择"Add to PATH"

2. **Git for Windows** (可选，用于版本控制)
   - 下载地址: https://git-scm.github.io/

3. **OpenSSL** (可选，用于生成SSL证书)
   - 下载地址: https://slproweb.com/products/Win32OpenSSL.html
   - 或使用Git Bash自带的OpenSSL

## 🚀 快速部署

### 1. 检查环境
```cmd
node --version
npm --version
```

### 2. 一键安装
```cmd
install-windows-native.bat
```

### 3. 配置企业微信
编辑 `.env` 文件：
```
WECHAT_CORP_ID=你的企业ID
WECHAT_AGENT_ID=你的应用ID
WECHAT_SECRET=你的应用密钥
```

### 4. 启动服务

#### HTTP模式（简单）
```cmd
start-native.bat
```
访问: http://localhost:3001

#### HTTPS模式（推荐）
```cmd
start-native-with-ssl.bat
```
访问: https://localhost:3001

## 📁 项目结构

```
mfa/
├── server/                 # 后端Node.js代码
│   ├── index.js           # 服务器入口（已修改支持HTTPS）
│   ├── config/            # 配置文件
│   ├── routes/            # API路由
│   └── middleware/        # 中间件
├── client/                # 前端React代码
│   ├── src/               # 源码
│   ├── build/             # 构建输出（npm run build后生成）
│   └── package.json
├── data/                  # 数据库文件（自动创建）
├── logs/                  # 日志文件（自动创建）
├── ssl/                   # SSL证书（可选）
├── .env                   # 环境配置
└── *.bat                  # Windows批处理脚本
```

## ⚙️ 详细步骤

### 手动安装步骤

1. **安装依赖**
   ```cmd
   # 安装后端依赖
   npm install
   
   # 安装前端依赖
   cd client
   npm install
   cd ..
   ```

2. **构建前端**
   ```cmd
   cd client
   npm run build
   cd ..
   ```

3. **创建配置文件**
   ```cmd
   copy .env.production .env
   notepad .env
   ```

4. **生成SSL证书（可选）**
   ```cmd
   ssl-setup-windows.bat
   ```

5. **启动服务**
   ```cmd
   node server/index.js
   ```

## 🔧 配置说明

### 环境变量 (.env)

```bash
# 基本配置
NODE_ENV=production
PORT=3001

# 数据库
DB_PATH=./data/mfa.db

# JWT配置
JWT_SECRET=your_jwt_secret_here
JWT_EXPIRES_IN=24h

# 企业微信配置
WECHAT_CORP_ID=你的企业ID
WECHAT_AGENT_ID=你的应用ID
WECHAT_SECRET=你的应用密钥
WECHAT_REDIRECT_URI=https://mfa.example.com/api/wechat/callback

# HTTPS配置（可选）
HTTPS=true
SSL_CERT_PATH=ssl/server.crt
SSL_KEY_PATH=ssl/server.key

# 管理员账号
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
```

## 🌐 网络配置

### 内网访问
- 直接访问服务器IP:3001
- 支持用户名密码登录

### 外网访问
- 需要配置域名解析
- 需要企业微信认证
- 建议使用HTTPS

### 端口配置
默认端口3001，如需修改：
1. 编辑 `.env` 文件的 `PORT=3001`
2. 重启服务

## 🔒 安全配置

### 1. 修改默认密码
编辑 `.env` 文件：
```
ADMIN_PASSWORD=你的安全密码
JWT_SECRET=随机生成的密钥
```

### 2. 启用HTTPS
```cmd
# 生成证书
ssl-setup-windows.bat

# 启用HTTPS
start-native-with-ssl.bat
```

### 3. 防火墙设置
Windows防火墙允许3001端口：
```cmd
# 管理员权限运行
netsh advfirewall firewall add rule name="MFA Platform" dir=in action=allow protocol=TCP localport=3001
```

## 🔧 开发模式

### 启动开发服务器
```cmd
npm run dev
```
- 后端: http://localhost:3001
- 前端: http://localhost:3000（带热重载）

### 单独启动
```cmd
# 只启动后端
npm run server:dev

# 只启动前端
cd client
npm start
```

## 📊 监控运维

### 查看运行状态
```cmd
# 查看端口占用
netstat -ano | findstr :3001

# 查看进程
tasklist | findstr node
```

### 日志文件
- 应用日志: `logs/` 目录
- 控制台输出: 直接显示在命令行

### 数据备份
```cmd
# 备份数据库
copy data\mfa.db backup\mfa_%date%.db

# 备份配置
copy .env backup\env_%date%.backup
```

## 🛠️ 故障排除

### 常见问题

1. **端口被占用**
   ```cmd
   # 查找占用进程
   netstat -ano | findstr :3001
   
   # 终止进程
   taskkill /PID <进程ID> /F
   ```

2. **Node.js版本问题**
   ```cmd
   # 检查版本
   node --version
   
   # 需要 Node.js 16.x 以上
   ```

3. **npm安装失败**
   ```cmd
   # 清理缓存
   npm cache clean --force
   
   # 重新安装
   npm install
   ```

4. **前端构建失败**
   ```cmd
   cd client
   npm cache clean --force
   npm install
   npm run build
   ```

### 重新部署
```cmd
# 停止服务 (Ctrl+C)
# 清理构建
rmdir /s client\build

# 重新构建
cd client
npm run build
cd ..

# 重启服务
start-native.bat
```

## 🚀 生产部署

### IIS集成（可选）
如果需要与IIS集成，可以：
1. 安装 iisnode
2. 配置反向代理
3. 设置开机自启

### 系统服务
使用 node-windows 创建Windows服务：
```cmd
npm install -g node-windows
npm link node-windows
```

## 📞 技术支持

如遇问题，请检查：
1. Node.js版本是否正确
2. 依赖是否完整安装
3. 配置文件是否正确
4. 端口是否被占用
5. 防火墙设置

---

**提示**: Windows原生部署比Docker更简单，性能也更好！ 