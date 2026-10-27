# Windows 平台部署指南

## 环境要求

### 必须安装
1. **Docker Desktop for Windows**
   - 下载地址: https://www.docker.com/products/docker-desktop
   - 确保启用 WSL2 后端（推荐）

2. **OpenSSL** (用于生成SSL证书)
   - 方式一: 下载安装 https://slproweb.com/products/Win32OpenSSL.html
   - 方式二: 使用 Chocolatey `choco install openssl`
   - 方式三: 使用 Git Bash (自带OpenSSL)

## 快速部署

### 方法一：批处理脚本（最简单）

1. **准备配置文件**
   ```cmd
   copy .env.production .env
   ```
   编辑 `.env` 文件，配置企业微信信息

2. **一键启动**
   ```cmd
   start-windows.bat
   ```

### 方法二：手动部署

1. **配置环境变量**
   ```cmd
   copy .env.production .env
   notepad .env
   ```
   
2. **生成SSL证书**
   ```cmd
   ssl-setup-windows.bat
   ```
   
3. **启动服务**
   ```cmd
   docker-compose up -d
   ```

### 方法三：WSL2环境（推荐开发者）

如果你安装了WSL2，可以在WSL环境中使用Linux脚本：

```bash
# 进入WSL环境
wsl

# 使用Linux脚本
./start.sh
```

## 企业微信配置

### 1. 创建企业应用
1. 登录企业微信管理后台
2. 进入"应用管理" → "自建" → "创建应用"
3. 记录 `AgentId`

### 2. 配置可信域名
- 设置可信域名: `mfa.example.com`
- 如果本地测试，也可以设置: `localhost`

### 3. 获取配置信息
在 `.env` 文件中配置：
```
WECHAT_CORP_ID=你的企业ID
WECHAT_AGENT_ID=你的应用ID  
WECHAT_SECRET=你的应用密钥
```

## 本地开发

### 启动开发环境

1. **安装依赖**
   ```cmd
   npm install
   cd client
   npm install
   cd ..
   ```

2. **启动开发服务器**
   ```cmd
   npm run dev
   ```
   - 后端服务: http://localhost:3001
   - 前端服务: http://localhost:3000

## 常见问题

### 1. Docker Desktop 启动失败
- 确保已安装 WSL2
- 检查 Hyper-V 是否启用
- 重启电脑后再试

### 2. SSL证书问题
- 使用自签名证书时，浏览器会显示安全警告，点击"高级"→"继续访问"
- 生产环境建议使用正式SSL证书

### 3. 端口冲突
如果80或443端口被占用：
```cmd
# 查看端口占用
netstat -ano | findstr :80
netstat -ano | findstr :443

# 修改 docker-compose.yml 中的端口映射
```

### 4. 企业微信回调失败
- 检查域名是否正确解析
- 确认可信域名配置
- 检查防火墙设置

## 访问测试

### 内网测试
- 直接访问: https://localhost
- 使用默认管理员账号登录

### 外网测试
- 需要配置正确的域名和企业微信
- 外网访问会自动跳转企业微信认证

## 生产部署建议

### 1. 域名配置
- 购买正式域名
- 配置DNS解析到服务器IP
- 申请正式SSL证书

### 2. 安全配置
- 修改默认管理员密码
- 更换JWT密钥
- 配置防火墙规则

### 3. 监控运维
```cmd
# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 重启服务
docker-compose restart

# 停止服务
docker-compose stop
```

## 故障排除

### 查看详细日志
```cmd
# 应用日志
docker-compose logs mfa-app

# Nginx日志  
docker-compose logs nginx

# 实时日志
docker-compose logs -f
```

### 重新构建
```cmd
# 重新构建并启动
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### 清理重置
```cmd
# 停止并删除所有容器
docker-compose down

# 删除数据（慎用）
rmdir /s data logs

# 重新开始
start-windows.bat
```

---

**提示**: Windows环境下建议使用WSL2配合Docker Desktop获得最佳体验。 