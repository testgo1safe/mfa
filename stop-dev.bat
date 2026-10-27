@echo off
chcp 65001 >nul
title MFA管控平台 - 停止服务

echo.
echo ====================================================
echo           MFA管控平台 - 停止开发服务
echo ====================================================
echo.

echo [停止] 正在停止MFA管控平台相关服务...
echo.

:: 停止所有Node.js进程
echo [处理] 查找并停止Node.js进程...
tasklist | findstr "node.exe" >nul
if not errorlevel 1 (
    echo [发现] 检测到运行中的Node.js进程
    taskkill /f /im node.exe >nul 2>&1
    if not errorlevel 1 (
        echo [成功] Node.js进程已停止
    ) else (
        echo [警告] 部分Node.js进程可能无法停止
    )
) else (
    echo [信息] 未发现运行中的Node.js进程
)

:: 等待进程完全关闭
echo [等待] 等待进程完全关闭...
timeout /t 2 >nul

:: 检查端口状态
echo [检查] 验证端口释放状态...
netstat -an | findstr ":3000" >nul
if errorlevel 1 (
    echo [成功] 端口3000已释放
) else (
    echo [警告] 端口3000可能仍被占用
)

netstat -an | findstr ":3001" >nul
if errorlevel 1 (
    echo [成功] 端口3001已释放
) else (
    echo [警告] 端口3001可能仍被占用
)

echo.
echo ====================================================
echo                  停止完成！
echo ====================================================
echo.
echo [完成] MFA管控平台开发服务已停止
echo.
echo 📋 停止的服务:
echo    - 前端开发服务器 (端口3000)
echo    - 后端API服务器 (端口3001)
echo    - 相关Node.js进程
echo.
echo 💡 提示:
echo    - 如需重新启动，请运行: start-dev.bat
echo    - 所有服务窗口应该已自动关闭
echo    - 如果仍有窗口打开，可以手动关闭
echo.

pause 