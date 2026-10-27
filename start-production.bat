@echo off
chcp 65001 >nul
echo ================================================
echo MFA Platform - Production Environment Startup
echo ================================================

:: Check administrator privileges
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Administrator privileges required for ports 80/443
    echo Please right-click this script and select "Run as administrator"
    pause
    exit /b 1
)

echo PASS: Administrator privileges verified

:: Set production environment variables
set NODE_ENV=production
set HTTP_PORT=80
set HTTPS_PORT=443
set HTTPS=true
set DOMAIN=mfa.example.com
set JWT_SECRET=mfa-production-jwt-secret-change-this-in-production-please
set JWT_EXPIRES_IN=24h
set ADMIN_USERNAME=admin
set ADMIN_PASSWORD=ChangeMe!
set ADMIN_EMAIL=admin@example.com
set DB_PATH=./data/mfa.db
set WECHAT_CORP_ID=your_corp_id_here
set WECHAT_AGENT_ID=your_agent_id_here
set WECHAT_SECRET=your_wechat_app_secret_here
set WECHAT_REDIRECT_URI=https://mfa.example.com/api/wechat/callback
set MFA_ISSUER=MFA Management Platform
set MFA_SERVICE_NAME=mfa.example.com
set TOTP_WINDOW=2
set TOTP_DIGITS=6
set TOTP_PERIOD=30
set SESSION_SECRET=mfa-production-session-secret-change-this
set RATE_LIMIT_WINDOW=15
set RATE_LIMIT_MAX=50
set BCRYPT_ROUNDS=14
set LOG_LEVEL=warn
set LOG_FILE_PATH=./logs/app.log
set ACCESS_LOG_PATH=./logs/access.log
set INTERNAL_IP_RANGES=192.168.0.0/16,10.0.0.0/8,172.16.0.0/12,127.0.0.1/32
set EXTERNAL_GATEWAY_IPS=10.0.0.0/24
set SSL_CERT_PATH=./ssl/server.crt
set SSL_KEY_PATH=./ssl/server.key
set SSL_PFX_PATH=./ssl/server.pfx
set DEBUG=false
set MOCK_WECHAT=false
:: 外部网关IP/网段（例如外部Nginx到后端的私网IP），用于将回源流量识别为外网
echo NOTE: Configure EXTERNAL_GATEWAY_IPS to your reverse proxy private IPs/CIDRs if needed.
if "%EXTERNAL_GATEWAY_IPS%"=="" (
  set EXTERNAL_GATEWAY_IPS=10.0.0.0/24
)
:: 代理超时（毫秒），上游慢响应可适当调大，避免504
if "%PROXY_TIMEOUT_MS%"=="" (
  set PROXY_TIMEOUT_MS=300000
)

echo Checking directory structure...

:: Check and create necessary directories
if not exist "data" mkdir data
if not exist "logs" mkdir logs
if not exist "ssl" mkdir ssl

echo Checking SSL certificates...

:: Unified SSL certificate check (PFX preferred, fallback to CRT/KEY)
if exist "ssl\server.pfx" (
    if exist "ssl\cert-password.txt" (
        echo PASS: Using PFX certificate format
        echo Certificate: ssl\server.pfx
        echo Password file: ssl\cert-password.txt
    ) else (
        echo ERROR: PFX certificate found but password file missing
        echo Please ensure ssl\cert-password.txt exists
        pause
        exit /b 1
    )
) else if exist "ssl\server.crt" (
    if exist "ssl\server.key" (
        echo PASS: Using separate certificate and key files
        echo Certificate: ssl\server.crt
        echo Private key: ssl\server.key
    ) else (
        echo ERROR: No SSL private key file found
        echo Please generate SSL certificate first or extract private key from PFX
        echo Command: openssl pkcs12 -in ssl\server.pfx -nocerts -out ssl\server.key -nodes
        pause
        exit /b 1
    )
) else (
    echo ERROR: No SSL certificate found
    echo Please generate SSL certificate first:
    echo    Option 1: .\generate-production-ssl.ps1 -Method letsencrypt
    echo    Option 2: .\generate-production-ssl.ps1 -Method manual
    pause
    exit /b 1
)

echo PASS: SSL certificate check completed

:: Checking dependencies...

:: Check Node.js
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo ERROR: Node.js not installed, please install Node.js 16.x or higher
    pause
    exit /b 1
)

echo PASS: Node.js version check completed

:: Check dependencies
if not exist "node_modules" (
    echo Installing backend dependencies...
    npm install --production
    if !errorlevel! neq 0 (
        echo ERROR: Backend dependency installation failed
        pause
        exit /b 1
    )
)

if not exist "client\build" (
    echo Installing frontend dependencies...
    cd client
    npm install
    if !errorlevel! neq 0 (
        echo ERROR: Frontend dependency installation failed
        pause
        exit /b 1
    )
    
    echo Building frontend...
    npm run build
    if !errorlevel! neq 0 (
        echo ERROR: Frontend build failed
        pause
        exit /b 1
    )
    cd ..
)

echo Checking port usage...

:: Check port usage
netstat -ano | findstr :80 >nul 2>&1
if %errorlevel% equ 0 (
    echo WARNING: Port 80 is already in use
    echo Please close the program using port 80 first
    pause
)

netstat -ano | findstr :443 >nul 2>&1
if %errorlevel% equ 0 (
    echo WARNING: Port 443 is already in use
    echo Please close the program using port 443 first
    pause
)

echo Verifying SSL certificate validity...

:: Verify certificate (if OpenSSL is installed)
where openssl >nul 2>&1
if %errorlevel% equ 0 (
    echo Checking certificate details...
    openssl x509 -in ssl\server.crt -text -noout | findstr "Not After"
    echo.
)

echo ================================================
echo Starting MFA Platform (Production Environment)...
echo ================================================
echo HTTP Port: %HTTP_PORT%
echo HTTPS Port: %HTTPS_PORT%
echo Domain: %DOMAIN%
echo Admin Account: %ADMIN_USERNAME%
echo Environment: Production
echo Debug Mode: Disabled
echo EXTERNAL_GATEWAY_IPS: %EXTERNAL_GATEWAY_IPS%
echo PROXY_TIMEOUT_MS: %PROXY_TIMEOUT_MS%
echo ================================================

:: Start server
echo Start time: %date% %time%
node server/server-windows.js

:: If server stops unexpectedly
echo.
echo WARNING: Server has stopped
echo Time: %date% %time%
pause 