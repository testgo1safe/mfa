@echo off
chcp 65001 >nul
echo ================================================
echo 🚀 MFA管控平台 - 快速测试启动
echo ================================================

:: 检查管理员权限
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ 需要管理员权限运行80/443端口
    echo 正在尝试以管理员身份重新运行...
    powershell -Command "Start-Process '%~f0' -Verb RunAs"
    exit /b 0
)

echo ✅ 管理员权限验证通过

:: 设置基本环境变量
set NODE_ENV=development
set HTTP_PORT=80
set HTTPS_PORT=443
set HTTPS=true
set JWT_SECRET=test-jwt-secret-key
set ADMIN_USERNAME=admin
set ADMIN_PASSWORD=admin123

echo 📁 创建必要目录...
if not exist "data" mkdir data
if not exist "logs" mkdir logs
if not exist "ssl" mkdir ssl

echo 🔐 检查SSL证书...
if not exist "ssl\server.pfx" (
    echo 正在生成SSL证书...
    powershell -ExecutionPolicy Bypass -File "generate-ssl-cert.ps1"
    if !errorlevel! neq 0 (
        echo ❌ SSL证书生成失败
        pause
        exit /b 1
    )
)

echo ✅ SSL证书准备完成

echo 📦 检查前端构建...
if not exist "client\build" (
    echo 前端未构建，正在构建...
    cd client
    if not exist "node_modules" (
        echo 安装前端依赖...
        npm install
    )
    npm run build
    cd ..
)

echo 🚪 释放端口...
:: 尝试停止可能占用端口的进程
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :80') do (
    taskkill /pid %%a /f >nul 2>&1
)
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :443') do (
    taskkill /pid %%a /f >nul 2>&1
)

echo ================================================
echo 🚀 启动MFA管控平台...
echo ================================================
echo 📡 HTTP: http://localhost:80
echo 🔒 HTTPS: https://localhost:443  
echo 🌐 域名: https://mfa.example.com:443
echo 👤 管理员: admin / admin123
echo ================================================
echo.
echo 🔥 服务器启动中，请等待...
echo.

:: 启动服务器
npm run start:windows

pause 