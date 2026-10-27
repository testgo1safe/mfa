@echo off
chcp 65001 >nul
title MFA管控平台 - 生产环境启动

echo.
echo ====================================================
echo           MFA管控平台 - 生产环境启动
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

:: 检查前端构建文件
echo [检查] 验证前端构建文件...
if not exist "client\build\index.html" (
    echo [构建] 前端未构建，正在构建生产版本...
    echo [信息] 这可能需要几分钟时间...
    cd client
    call npm run build
    if errorlevel 1 (
        echo [错误] 前端构建失败！
        pause
        exit /b 1
    )
    cd ..
    echo [成功] 前端构建完成！
) else (
    echo [成功] 前端构建文件已存在
)

:: 检查npm依赖
echo [检查] 验证后端依赖...
if not exist "node_modules" (
    echo [安装] 正在安装后端依赖...
    call npm install --production
    if errorlevel 1 (
        echo [错误] 后端依赖安装失败！
        pause
        exit /b 1
    )
)

:: 设置生产环境变量
echo [配置] 设置生产环境变量...
set JWT_SECRET=mfa_production_secret_key_change_this_in_real_production
set NODE_ENV=production
set ADMIN_USERNAME=admin
set ADMIN_PASSWORD=admin123
set PORT=3001
set DB_PATH=./data/mfa.db
set HTTPS=false

echo [配置] 环境: %NODE_ENV%
echo [配置] 管理员账号: %ADMIN_USERNAME%
echo [配置] 服务端口: %PORT%

:: 检查端口是否被占用
echo [检查] 验证端口可用性...
netstat -an | findstr ":3001" >nul
if not errorlevel 1 (
    echo [警告] 端口3001已被占用，正在尝试关闭...
    taskkill /f /im node.exe >nul 2>&1
    timeout /t 2 >nul
)

:: 创建必要目录
if not exist "logs" mkdir logs
if not exist "data" mkdir data

echo.
echo ====================================================
echo                启动生产服务
echo ====================================================
echo.

:: 启动生产服务器
echo [启动] 正在启动生产服务器...
cd server
start "MFA-Production" cmd /k "node index.js"
cd ..

:: 等待服务器启动
echo [等待] 等待服务器启动...
timeout /t 8 >nul

:: 检查服务器是否启动成功
echo [检查] 验证服务器状态...
for /l %%i in (1,1,5) do (
    curl -s http://localhost:3001/api/health >nul 2>&1
    if not errorlevel 1 (
        echo [成功] 服务器启动成功！
        goto :server_ready
    )
    echo [等待] 第%%i次检查，服务器还在启动中...
    timeout /t 2 >nul
)

:server_ready
echo.
echo ====================================================
echo                 部署完成！
echo ====================================================
echo.
echo [成功] MFA管控平台生产环境部署完成！
echo.
echo 🌐 访问地址: http://localhost:3001
echo 📊 健康检查: http://localhost:3001/api/health
echo 📱 移动端访问: http://your-server-ip:3001
echo.
echo 🔐 默认管理员账号:
echo    用户名: admin
echo    密码:   admin123
echo.
echo 💡 生产环境特性:
echo    - 单一服务器提供完整功能
echo    - 前端已优化打包，加载更快
echo    - 静态文件直接由后端服务
echo    - 适合部署到服务器
echo.
echo 📝 管理命令:
echo    - 停止服务: stop-dev.bat
echo    - 查看状态: status.bat
echo    - 查看日志: 检查服务器窗口输出
echo.
echo ⚠️  安全提醒:
echo    - 生产环境请修改默认密码！
echo    - 建议启用HTTPS (配置SSL证书)
echo    - 配置防火墙规则
echo    - 定期备份数据库文件
echo.

:: 等待用户确认
echo 按任意键打开浏览器访问系统...
pause >nul

:: 打开浏览器
echo [打开] 正在打开浏览器...
start http://localhost:3001

echo.
echo 🎉 MFA管控平台已在浏览器中打开！
echo.
echo 服务器将持续运行，请不要关闭服务器窗口
echo 如需停止服务，请运行: stop-dev.bat
echo.

pause 