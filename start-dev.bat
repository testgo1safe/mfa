@echo off
chcp 65001 >nul
title MFA管控平台 - 开发环境启动

echo.
echo ====================================================
echo           MFA管控平台 - 开发环境启动
echo ====================================================
echo.

:: 检查是否在正确的目录
if not exist "server\index.js" (
    echo [错误] 请在MFA项目根目录下运行此脚本！
    echo 当前目录: %CD%
    pause
    exit /b 1
)

:: 检查Node.js是否安装
echo [检查] 验证Node.js环境...
node --version >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到Node.js！请先安装Node.js 16.0+
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

:: 显示Node.js版本
for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo [成功] Node.js版本: %NODE_VERSION%

:: 检查npm依赖
echo [检查] 验证项目依赖...
if not exist "node_modules" (
    echo [安装] 正在安装后端依赖...
    call npm install
    if errorlevel 1 (
        echo [错误] 后端依赖安装失败！
        pause
        exit /b 1
    )
)

if not exist "client\node_modules" (
    echo [安装] 正在安装前端依赖...
    cd client
    call npm install
    if errorlevel 1 (
        echo [错误] 前端依赖安装失败！
        pause
        exit /b 1
    )
    cd ..
)

:: 设置环境变量
echo [配置] 设置开发环境变量...
set JWT_SECRET=mfa_development_secret_key_2024_for_testing_only
set NODE_ENV=development
set ADMIN_USERNAME=admin
set ADMIN_PASSWORD=admin123
set PORT=3001
set DB_PATH=./data/mfa.db

echo [配置] JWT_SECRET: ***已设置***
echo [配置] 管理员账号: %ADMIN_USERNAME%
echo [配置] 管理员密码: %ADMIN_PASSWORD%
echo [配置] 后端端口: %PORT%

:: 检查端口是否被占用
echo [检查] 验证端口可用性...
netstat -an | findstr ":3001" >nul
if not errorlevel 1 (
    echo [警告] 端口3001已被占用，正在尝试关闭...
    taskkill /f /im node.exe >nul 2>&1
    timeout /t 2 >nul
)

netstat -an | findstr ":3000" >nul
if not errorlevel 1 (
    echo [警告] 端口3000已被占用，正在尝试关闭...
    taskkill /f /im node.exe >nul 2>&1
    timeout /t 2 >nul
)

:: 创建日志目录
if not exist "logs" mkdir logs

echo.
echo ====================================================
echo                  启动服务
echo ====================================================
echo.

:: 启动后端服务器
echo [启动] 正在启动后端服务器 (端口: 3001)...
cd server
start "MFA-Backend" cmd /k "node index.js"
cd ..

:: 等待后端启动
echo [等待] 等待后端服务器启动...
timeout /t 5 >nul

:: 检查后端是否启动成功
echo [检查] 验证后端服务器状态...
curl -s http://localhost:3001/api/health >nul 2>&1
if errorlevel 1 (
    echo [警告] 后端服务器可能还在启动中...
    timeout /t 3 >nul
)

:: 启动前端开发服务器
echo [启动] 正在启动前端开发服务器 (端口: 3000)...
cd client
start "MFA-Frontend" cmd /k "set PORT=3000 && npm start"
cd ..

echo.
echo ====================================================
echo                  启动完成！
echo ====================================================
echo.
echo [成功] MFA管控平台开发环境启动完成！
echo.
echo 🌐 前端开发服务器: http://localhost:3000
echo ⚙️  后端API服务器:  http://localhost:3001
echo 📊 API健康检查:    http://localhost:3001/api/health
echo.
echo 🔐 默认管理员账号:
echo    用户名: admin
echo    密码:   admin123
echo.
echo 💡 使用说明:
echo    - 推荐使用前端地址 (3000端口) 进行开发
echo    - 前端支持热重载，修改代码会自动刷新
echo    - 后端API文档: /api/health 查看服务状态
echo    - 按 Ctrl+C 可停止对应的服务
echo.
echo 📝 日志文件:
echo    - 后端日志: 查看后端服务器窗口
echo    - 前端日志: 查看前端开发服务器窗口
echo.
echo ⚠️  注意事项:
echo    - 请不要关闭此窗口，否则服务可能停止
echo    - 如需停止服务，请运行 stop-dev.bat
echo    - 如遇问题，请检查对应服务窗口的错误信息
echo.

:: 等待用户确认
echo 按任意键打开浏览器访问系统，或直接关闭此窗口...
pause >nul

:: 打开浏览器
echo [打开] 正在打开浏览器...
start http://localhost:3000

echo.
echo 🎉 MFA管控平台已在浏览器中打开！
echo.
echo 如需停止服务，请运行: stop-dev.bat
echo 或关闭对应的服务器窗口
echo.

pause 