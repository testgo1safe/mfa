@echo off
chcp 65001 >nul
echo =========================================
echo     MFA管控平台 Windows原生部署
echo =========================================
echo.

REM 检查Node.js是否安装
node --version >nul 2>&1
if errorlevel 1 (
    echo [错误] Node.js 未安装
    echo 请先安装 Node.js LTS 版本
    echo 下载地址: https://nodejs.org/
    pause
    exit /b 1
)

echo [信息] Node.js 版本:
node --version

REM 检查npm
npm --version >nul 2>&1
if errorlevel 1 (
    echo [错误] npm 未安装
    pause
    exit /b 1
)

echo [信息] npm 版本:
npm --version

REM 创建环境配置文件
if not exist ".env" (
    echo [信息] 创建环境配置文件...
    if exist ".env.production" (
        copy ".env.production" ".env"
        echo [重要] 请编辑 .env 文件配置企业微信信息
    ) else (
        echo [错误] 找不到 .env.production 模板
        exit /b 1
    )
)

REM 安装后端依赖
echo [信息] 安装后端依赖...
npm install
if errorlevel 1 (
    echo [错误] 后端依赖安装失败
    pause
    exit /b 1
)

REM 安装前端依赖
echo [信息] 安装前端依赖...
cd client
npm install
if errorlevel 1 (
    echo [错误] 前端依赖安装失败
    pause
    exit /b 1
)

REM 构建前端
echo [信息] 构建前端...
npm run build
if errorlevel 1 (
    echo [错误] 前端构建失败
    pause
    exit /b 1
)

cd ..

REM 创建必要目录
if not exist "data\" mkdir data
if not exist "logs\" mkdir logs

REM 生成自签名SSL证书
echo [信息] 生成SSL证书...
if not exist "ssl\" mkdir ssl

where openssl >nul 2>&1
if not errorlevel 1 (
    cd ssl
    if not exist "server.crt" (
        echo [信息] 生成自签名证书...
        openssl genrsa -out server.key 2048
        openssl req -new -key server.key -out server.csr -subj "/C=CN/ST=Beijing/L=Beijing/O=Company/OU=IT/CN=mfa.example.com"
        openssl x509 -req -in server.csr -signkey server.key -out server.crt -days 365
        del server.csr
        echo [信息] SSL证书生成完成
    )
    cd ..
) else (
    echo [警告] 未找到OpenSSL，跳过SSL证书生成
    echo 如需HTTPS，请手动创建证书文件或安装OpenSSL
)

echo.
echo =========================================
echo           安装完成!
echo =========================================
echo.
echo 后续步骤:
echo 1. 编辑 .env 文件配置企业微信信息
echo 2. 运行 start-native.bat 启动服务
echo 3. 访问 http://localhost:3001
echo.
pause 