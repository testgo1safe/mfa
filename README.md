# MFA 多因素认证应用管控平台

## 项目简介

这是一个基于企业微信认证的多因素认证应用管控平台，支持内网直连和外网企业微信认证的双重访问模式。

### 主要功能

- **双重访问控制**: 内网用户可直接访问，外网用户需要企业微信认证
- **多因素认证管理**: 支持TOTP、短信验证等多种MFA方式
- **用户权限管理**: 完整的用户和权限管理体系
- **访问日志审计**: 详细的访问记录和安全审计
- **企业微信集成**: 深度集成企业微信认证和用户管理

### 技术栈

- **后端**: Node.js + Express + SQLite
- **前端**: React + TypeScript + Ant Design
- **反向代理**: Nginx
- **容器化**: Docker + Docker Compose
- **认证**: 企业微信网页授权 + JWT

## 系统架构

```
外网用户 → Nginx (SSL/443) → 企业微信认证 → 前端界面 → 后端API
内网用户 → Nginx (80/443) → 直接访问 → 前端界面 → 后端API
```

## 部署指南

### 环境要求

- Linux服务器 (推荐 Ubuntu 20.04+)
- Docker & Docker Compose
- 域名解析到服务器IP
- 企业微信应用配置

### 1. 克隆项目

```bash
git clone <repository-url>
cd mfa
```

### 2. 企业微信配置

在企业微信管理后台进行以下配置：

1. **创建企业应用**
   - 登录企业微信管理后台
   - 进入"应用管理" → "自建" → "创建应用"
   - 记录 `AgentId`

2. **配置可信域名**
   - 在应用详情页面设置可信域名: `mfa.example.com`

3. **获取配置信息**
   - `CorpID`: 企业ID
   - `AgentID`: 应用ID
   - `Secret`: 应用密钥

### 3. 环境配置

复制并修改环境配置文件：

```bash
cp .env.production .env
```

编辑 `.env` 文件，填入正确的配置：

```bash
# 企业微信配置
WECHAT_CORP_ID=你的企业ID
WECHAT_AGENT_ID=你的应用ID
WECHAT_SECRET=你的应用密钥

# JWT密钥 (请修改为随机字符串)
JWT_SECRET=your_secure_random_string_here

# 管理员账号 (首次部署后请修改)
ADMIN_USERNAME=admin
ADMIN_PASSWORD=your_secure_password
```

### 4. SSL证书配置

#### 方式一：自动化脚本 (推荐)

```bash
chmod +x ssl-setup.sh
./ssl-setup.sh
```

脚本支持三种方式：
1. 生成自签名证书 (开发测试)
2. 申请Let's Encrypt证书 (生产环境推荐)
3. 导入现有证书

#### 方式二：手动配置

如果你已有SSL证书，将证书文件放置到 `ssl/` 目录：

```bash
mkdir -p ssl
cp your-certificate.crt ssl/server.crt
cp your-private-key.key ssl/server.key
chmod 644 ssl/server.crt
chmod 600 ssl/server.key
```

### 5. 启动服务

```bash
# 构建并启动所有服务
docker-compose up -d

# 查看服务状态
docker-compose ps

# 查看日志
docker-compose logs -f
```

### 6. 验证部署

1. **健康检查**
   ```bash
   curl -k https://mfa.example.com/health
   ```

2. **访问管理界面**
   - 内网访问: `https://mfa.example.com`
   - 外网访问: 会自动跳转到企业微信认证

3. **管理员登录**
   - 用户名: `admin` (或配置的管理员用户名)
   - 密码: 配置文件中设置的密码

## 开发指南

### 本地开发环境

#### 1. 安装依赖

```bash
# 安装后端依赖
npm install

# 安装前端依赖
cd client
npm install
cd ..
```

#### 2. 启动开发服务

```bash
# 启动开发环境 (前后端同时启动)
npm run dev

# 或分别启动
npm run server:dev  # 后端服务 (端口3001)
npm run client:dev  # 前端服务 (端口3000)
```

#### 3. 开发环境配置

创建 `.env` 文件用于本地开发：

```bash
NODE_ENV=development
PORT=3001
DB_PATH=./data/mfa.db
JWT_SECRET=dev_secret_key
WECHAT_CORP_ID=your_corp_id
WECHAT_AGENT_ID=your_agent_id
WECHAT_SECRET=your_secret
WECHAT_REDIRECT_URI=http://localhost:3000/auth/callback
```

### 项目结构

```
mfa/
├── server/                 # 后端代码
│   ├── index.js           # 服务器入口
│   ├── config/            # 配置文件
│   ├── middleware/        # 中间件
│   ├── routes/            # API路由
│   └── utils/             # 工具函数
├── client/                # 前端代码
│   ├── src/
│   │   ├── components/    # React组件
│   │   ├── contexts/      # React上下文
│   │   ├── utils/         # 工具函数
│   │   └── App.tsx        # 应用入口
│   ├── package.json
│   └── tsconfig.json
├── data/                  # 数据库文件
├── logs/                  # 日志文件
├── ssl/                   # SSL证书
├── nginx.conf             # Nginx配置
├── docker-compose.yml     # Docker编排
├── Dockerfile             # Docker镜像
└── README.md
```

## 使用说明

### 管理员功能

1. **用户管理**
   - 创建、编辑、删除用户
   - 重置用户密码
   - 管理用户状态和权限

2. **MFA管理**
   - 为用户生成TOTP密钥
   - 管理备用恢复代码
   - 启用/禁用用户MFA

3. **访问日志**
   - 查看系统访问记录
   - 监控安全事件
   - 导出审计报告

4. **系统设置**
   - 修改系统配置
   - 管理企业微信集成
   - 安全策略配置

### 普通用户功能

1. **个人设置**
   - 修改个人信息
   - 更改登录密码
   - 绑定企业微信账号

2. **MFA设置**
   - 查看MFA状态
   - 下载备用代码

## 安全配置

### 网络安全

1. **防火墙设置**
   ```bash
   # 只开放必要端口
   ufw allow 22      # SSH
   ufw allow 80      # HTTP
   ufw allow 443     # HTTPS
   ufw enable
   ```

2. **IP访问控制**
   - 内网IP段在 `INTERNAL_IP_RANGES` 中配置
   - 外网访问强制企业微信认证

### 应用安全

1. **强制HTTPS**
   - 所有HTTP请求自动重定向到HTTPS
   - 启用HSTS安全头

2. **安全头配置**
   - X-Frame-Options: DENY
   - X-Content-Type-Options: nosniff
   - X-XSS-Protection: 1; mode=block

3. **速率限制**
   - API请求频率限制
   - 防止暴力破解攻击

## 监控运维

### 日志管理

```bash
# 查看应用日志
docker-compose logs mfa-app

# 查看Nginx日志
docker-compose logs nginx

# 查看实时日志
docker-compose logs -f
```

### 数据备份

```bash
# 备份数据库
cp data/mfa.db backup/mfa_$(date +%Y%m%d_%H%M%S).db

# 备份配置文件
tar -czf backup/config_$(date +%Y%m%d).tar.gz .env ssl/ nginx.conf
```

### 服务管理

```bash
# 重启服务
docker-compose restart

# 更新应用
git pull
docker-compose build
docker-compose up -d

# 查看服务状态
docker-compose ps
```

## 故障排除

### 常见问题

1. **企业微信认证失败**
   - 检查域名配置是否正确
   - 验证企业微信应用配置
   - 确认回调URL设置

2. **SSL证书问题**
   - 检查证书文件权限
   - 验证证书有效期
   - 确认域名匹配

3. **数据库连接失败**
   - 检查数据目录权限
   - 确认SQLite文件完整性
   - 查看应用日志

### 调试命令

```bash
# 检查容器状态
docker-compose ps

# 进入应用容器
docker-compose exec mfa-app sh

# 检查网络连接
docker-compose exec mfa-app netstat -tlnp

# 测试API接口
curl -k https://mfa.example.com/api/health
```

## 贡献指南

1. Fork 项目
2. 创建功能分支
3. 提交代码变更
4. 推送到分支
5. 创建 Pull Request

## 许可证

MIT License

## 支持

如有问题，请：

1. 查看日志文件
2. 检查配置是否正确
3. 提交Issue描述问题
4. 联系技术支持

---

**注意**: 请确保在生产环境中修改默认密码和密钥，并定期更新SSL证书。 