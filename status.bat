@echo off
chcp 65001 >nul
title MFA管控平台 - 状态检查

echo.
echo ====================================================
echo           MFA管控平台 - 状态检查
echo ====================================================
echo.

:: 检查Node.js进程
echo [进程] 检查Node.js运行状态...
tasklist | findstr "node.exe" >nul
if not errorlevel 1 (
    echo [运行] 检测到Node.js进程:
    tasklist | findstr "node.exe"
    echo.
) else (
    echo [停止] 未检测到Node.js进程
    echo.
)

:: 检查端口状态
echo [端口] 检查服务端口状态...

:: 检查3000端口 (前端开发服务器)
netstat -an | findstr ":3000" >nul
if not errorlevel 1 (
    echo [运行] 端口3000 (前端开发服务器) - 活跃
) else (
    echo [停止] 端口3000 (前端开发服务器) - 未使用
)

:: 检查3001端口 (后端API服务器)
netstat -an | findstr ":3001" >nul
if not errorlevel 1 (
    echo [运行] 端口3001 (后端API服务器) - 活跃
) else (
    echo [停止] 端口3001 (后端API服务器) - 未使用
)

echo.

:: 测试API连接
echo [连接] 测试API服务连接...
curl -s -m 5 http://localhost:3001/api/health >nul 2>&1
if not errorlevel 1 (
    echo [成功] 后端API服务器响应正常
    
    :: 获取详细健康信息
    for /f "delims=" %%i in ('curl -s http://localhost:3001/api/health') do set HEALTH_INFO=%%i
    echo [详情] %HEALTH_INFO%
) else (
    echo [失败] 后端API服务器无响应
)

echo.

:: 测试前端连接
echo [连接] 测试前端服务连接...
curl -s -m 5 http://localhost:3000 >nul 2>&1
if not errorlevel 1 (
    echo [成功] 前端服务器响应正常
) else (
    echo [失败] 前端服务器无响应
)

echo.

:: 检查数据库文件
echo [数据] 检查数据库状态...
if exist "data\mfa.db" (
    for %%I in ("data\mfa.db") do (
        echo [存在] 数据库文件: %%~zI 字节
        echo [位置] data\mfa.db
    )
) else (
    echo [缺失] 数据库文件不存在
)

:: 检查日志目录
if exist "logs" (
    echo [存在] 日志目录: logs\
) else (
    echo [缺失] 日志目录不存在
)

echo.
echo ====================================================
echo                  服务状态总结
echo ====================================================
echo.

:: 判断整体状态
curl -s -m 5 http://localhost:3001/api/health >nul 2>&1
set BACKEND_OK=%errorlevel%

curl -s -m 5 http://localhost:3000 >nul 2>&1
set FRONTEND_OK=%errorlevel%

if %BACKEND_OK% equ 0 (
    if %FRONTEND_OK% equ 0 (
        echo [状态] 🟢 开发环境 - 前后端服务均正常运行
        echo [访问] 推荐地址: http://localhost:3000
        echo [管理] 后端API: http://localhost:3001
    ) else (
        echo [状态] 🟡 生产环境 - 仅后端服务运行
        echo [访问] 访问地址: http://localhost:3001
        echo [说明] 这是正常的生产环境状态
    )
) else (
    if %FRONTEND_OK% equ 0 (
        echo [状态] 🟠 前端正常，后端异常
        echo [问题] 后端服务未启动或出错
        echo [建议] 检查后端服务器窗口的错误信息
    ) else (
        echo [状态] 🔴 所有服务均未运行
        echo [建议] 运行 start-dev.bat 启动开发环境
        echo [建议] 或运行 start-prod.bat 启动生产环境
    )
)

echo.
echo 📋 可用操作:
echo    start-dev.bat  - 启动开发环境 (前端 + 后端)
echo    start-prod.bat - 启动生产环境 (仅后端)
echo    stop-dev.bat   - 停止所有服务
echo    status.bat     - 查看当前状态 (本脚本)
echo.

echo 按任意键退出...
pause >nul 