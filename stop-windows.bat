@echo off
chcp 65001 >nul
echo ================================================
echo ⏹️  MFA管控平台 - 停止脚本
echo ================================================

echo 🔍 查找MFA服务进程...

:: 查找Node.js进程
for /f "tokens=2" %%i in ('tasklist /fi "imagename eq node.exe" /fo table /nh 2^>nul') do (
    if not "%%i"=="No" (
        echo 发现Node.js进程: %%i
        echo 正在停止进程 %%i...
        taskkill /PID %%i /F >nul 2>&1
        if !errorlevel! equ 0 (
            echo ✅ 进程 %%i 已停止
        ) else (
            echo ❌ 无法停止进程 %%i
        )
    )
)

:: 备用方法：按进程名停止
echo 🔄 执行备用停止方法...
taskkill /IM node.exe /F >nul 2>&1
if %errorlevel% equ 0 (
    echo ✅ 所有Node.js进程已停止
) else (
    echo ℹ️  没有发现运行中的Node.js进程
)

:: 检查端口占用
echo 🚪 检查端口状态...
netstat -ano | findstr :80 >nul 2>&1
if %errorlevel% equ 0 (
    echo ⚠️  端口80仍被占用
) else (
    echo ✅ 端口80已释放
)

netstat -ano | findstr :443 >nul 2>&1
if %errorlevel% equ 0 (
    echo ⚠️  端口443仍被占用
) else (
    echo ✅ 端口443已释放
)

echo.
echo ✅ MFA管控平台停止完成
echo 时间: %date% %time%
echo ================================================

timeout /t 3 /nobreak >nul 