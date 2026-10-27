@echo off
chcp 65001 >nul
echo ================================================
echo 🚀 MFA管控平台 - Windows启动脚本
echo ================================================

:: 检查管理员权限
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 错误：需要管理员权限运行80/443端口
    echo 请右键点击此脚本，选择"以管理员身份运行"
    pause
    exit /b 1
)

echo ✅ 管理员权限验证通过

:: 设置环境变量
set NODE_ENV=development
set HTTP_PORT=80
set HTTPS_PORT=443
set HTTPS=true
set DOMAIN=mfa.example.com
set JWT_SECRET=mfa-windows-jwt-secret-key-change-this-in-production
set JWT_EXPIRES_IN=24h
set ADMIN_USERNAME=admin
set ADMIN_PASSWORD=admin123
set ADMIN_EMAIL=admin@company.com
set DB_PATH=./data/mfa.db
set WECHAT_CORP_ID=your_corp_id_here
set WECHAT_AGENT_ID=your_agent_id_here
set WECHAT_SECRET=your_wechat_app_secret_here
set WECHAT_REDIRECT_URI=https://mfa.example.com/api/wechat/callback
set MFA_ISSUER=MFA管控平台
set MFA_SERVICE_NAME=mfa.example.com
set TOTP_WINDOW=2
set TOTP_DIGITS=6
set TOTP_PERIOD=30
set SESSION_SECRET=mfa-session-secret-change-this
set RATE_LIMIT_WINDOW=15
set RATE_LIMIT_MAX=100
set BCRYPT_ROUNDS=12
set LOG_LEVEL=info
set LOG_FILE_PATH=./logs/app.log
set ACCESS_LOG_PATH=./logs/access.log
set INTERNAL_IP_RANGES=192.168.0.0/16,10.0.0.0/8,172.16.0.0/12,127.0.0.1/32
set SSL_CERT_PATH=./ssl/server.crt
set SSL_KEY_PATH=./ssl/server.key
set SSL_PFX_PATH=./ssl/server.pfx
set DEBUG=false
set MOCK_WECHAT=false

echo 📁 检查目录结构...

:: 检查并创建必要目录
if not exist "data" mkdir data
if not exist "logs" mkdir logs
if not exist "ssl" mkdir ssl

echo 🔍 检查SSL证书...

:: 检查SSL证书
if not exist "ssl\server.pfx" (
    echo ❌ SSL证书不存在，正在生成...
    echo 🔐 请稍等，正在生成自签名SSL证书...
    
    :: 尝试运行PowerShell脚本生成证书
    powershell -ExecutionPolicy Bypass -File "generate-ssl-cert.ps1"
    
    if !errorlevel! neq 0 (
        echo ❌ SSL证书生成失败
        echo 请手动运行: powershell -ExecutionPolicy Bypass -File "generate-ssl-cert.ps1"
        pause
        exit /b 1
    )
    
    echo ✅ SSL证书生成成功
) else (
    echo ✅ SSL证书已存在
)

echo 📦 检查依赖包...

:: 检查Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js未安装，请先安装Node.js 16.x或更高版本
    pause
    exit /b 1
)

echo ✅ Node.js版本检查通过

:: 检查依赖包
if not exist "node_modules" (
    echo 📥 正在安装后端依赖包...
    npm install
    if !errorlevel! neq 0 (
        echo ❌ 后端依赖安装失败
        pause
        exit /b 1
    )
)

if not exist "client\build" (
    echo 📥 正在安装前端依赖包...
    cd client
    npm install
    if !errorlevel! neq 0 (
        echo ❌ 前端依赖安装失败
        pause
        exit /b 1
    )
    
    echo 🔨 正在构建前端...
    npm run build
    if !errorlevel! neq 0 (
        echo ❌ 前端构建失败
        pause
        exit /b 1
    )
    cd ..
)

echo 🚪 检查端口占用...

:: 检查端口占用
netstat -ano | findstr :80 >nul 2>&1
if %errorlevel% equ 0 (
    echo ⚠️  警告：80端口已被占用
    echo 正在尝试启动，如果失败请先关闭占用80端口的程序
)

netstat -ano | findstr :443 >nul 2>&1
if %errorlevel% equ 0 (
    echo ⚠️  警告：443端口已被占用
    echo 正在尝试启动，如果失败请先关闭占用443端口的程序
)

echo ================================================
echo 🚀 正在启动MFA管控平台...
echo ================================================
echo 📡 HTTP端口: %HTTP_PORT%
echo 🔒 HTTPS端口: %HTTPS_PORT%
echo 🌐 管理员账号: %ADMIN_USERNAME% / %ADMIN_PASSWORD%
echo ================================================

:: 启动服务器
node server/server-windows.js

:: 如果服务器意外停止
echo.
echo ⚠️  服务器已停止
pause 