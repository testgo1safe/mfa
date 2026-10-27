@echo off
chcp 65001 >nul
echo =========================================
echo     扩展现有配置 - 添加企业级功能
echo =========================================
echo.

echo [信息] 基于现有 .env 文件扩展配置...
echo.

REM 备份现有配置
copy .env .env.backup >nul
echo ✅ 已备份现有配置到 .env.backup

REM 添加缺失的配置项到现有文件
echo. >> .env
echo # 企业级功能扩展配置 >> .env
echo # ========================== >> .env
echo. >> .env
echo # HTTPS和域名配置 >> .env
echo HTTPS_PORT=443 >> .env
echo HTTP_PORT=80 >> .env
echo DOMAIN=mfa.example.com >> .env
echo ALLOWED_ORIGINS=https://mfa.example.com,http://localhost:3001,https://localhost:3001 >> .env
echo. >> .env
echo # HTTPS/SSL配置 >> .env
echo HTTPS=false >> .env
echo SSL_CERT_PATH=./ssl/server.crt >> .env
echo SSL_KEY_PATH=./ssl/server.key >> .env
echo. >> .env
echo # 企业微信扩展配置 >> .env
echo WECHAT_TRUSTED_DOMAIN=mfa.example.com >> .env
echo WECHAT_API_BASE=https://qyapi.weixin.qq.com >> .env
echo WECHAT_AUTH_BASE=https://open.weixin.qq.com/connect/oauth2/authorize >> .env
echo. >> .env
echo # MFA/TOTP配置 >> .env
echo MFA_ISSUER=MFA管控平台 >> .env
echo MFA_SERVICE_NAME=mfa.example.com >> .env
echo TOTP_WINDOW=2 >> .env
echo TOTP_DIGITS=6 >> .env
echo TOTP_PERIOD=30 >> .env
echo. >> .env
echo # 安全配置 >> .env
echo SESSION_SECRET=your-session-secret-change-this >> .env
echo RATE_LIMIT_WINDOW=15 >> .env
echo RATE_LIMIT_MAX=100 >> .env
echo BCRYPT_ROUNDS=12 >> .env
echo. >> .env
echo # 日志配置 >> .env
echo LOG_LEVEL=info >> .env
echo LOG_FILE_PATH=./logs/app.log >> .env
echo ACCESS_LOG_PATH=./logs/access.log >> .env
echo. >> .env
echo # 缓存配置 >> .env
echo CACHE_TTL=300 >> .env
echo SESSION_MAX_AGE=86400000 >> .env
echo ADMIN_EMAIL=admin@company.com >> .env

echo ✅ 已添加企业级功能配置参数
echo.
echo 📋 扩展的配置包括：
echo    - HTTPS和SSL支持
echo    - 80/443端口配置  
echo    - TOTP多因素认证
echo    - 增强安全配置
echo    - 日志和缓存配置
echo.
echo 🎉 配置扩展完成！现有企业微信配置已保留。
echo.
pause 