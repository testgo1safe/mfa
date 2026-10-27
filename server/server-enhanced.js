const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const rateLimit = require('express-rate-limit');
const https = require('https');
const http = require('http');
const fs = require('fs');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const mfaRoutes = require('./routes/mfa');
const wechatRoutes = require('./routes/wechat');
const { initDatabase } = require('./config/database');
const { authenticateToken } = require('./middleware/auth');

// 环境配置
const NODE_ENV = process.env.NODE_ENV || 'development';
const HTTP_PORT = process.env.HTTP_PORT || 80;
const HTTPS_PORT = process.env.HTTPS_PORT || 443;
const DEV_PORT = process.env.PORT || 3001;
const HTTPS_ENABLED = process.env.HTTPS === 'true';
const DOMAIN = process.env.DOMAIN || 'localhost';

// 主应用配置
const createApp = () => {
  const app = express();

  // 安全中间件
  app.use(helmet({
    contentSecurityPolicy: false,
    hsts: HTTPS_ENABLED ? {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true
    } : false
  }));

  // CORS配置
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean);
  if (allowedOrigins.length === 0) {
    allowedOrigins.push(`http://localhost:${DEV_PORT}`, `https://localhost:${DEV_PORT}`);
    if (DOMAIN !== 'localhost') {
      allowedOrigins.push(`https://${DOMAIN}`, `http://${DOMAIN}`);
    }
  }

  app.use(cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  }));

  // 速率限制
  const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) * 60 * 1000 || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
    message: 'Too many requests from this IP, please try again later.',
    standardHeaders: true,
    legacyHeaders: false
  });
  app.use('/api', limiter);

  // 中间件
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // 访问日志
  app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent') || 'Unknown';
    
    console.log(`[${timestamp}] ${req.method} ${req.url} - IP: ${ip} - UA: ${userAgent}`);
    next();
  });

  // API路由
  app.use('/api/auth', authRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/mfa', mfaRoutes);
  app.use('/api/wechat', wechatRoutes);

  // 健康检查
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      https: HTTPS_ENABLED,
      platform: process.platform,
      domain: DOMAIN,
      environment: NODE_ENV
    });
  });

  // 静态文件服务
  const buildPath = path.join(__dirname, '../client/build');
  app.use(express.static(buildPath));

  // SPA路由处理
  app.get('*', (req, res) => {
    if (!req.url.startsWith('/api')) {
      res.sendFile(path.join(buildPath, 'index.html'));
    } else {
      res.status(404).json({ message: 'API endpoint not found' });
    }
  });

  return app;
};

// HTTP重定向应用
const createRedirectApp = () => {
  const redirectApp = express();
  
  redirectApp.use((req, res) => {
    const redirectUrl = `https://${DOMAIN}${req.url}`;
    console.log(`Redirecting HTTP to HTTPS: ${req.url} -> ${redirectUrl}`);
    res.redirect(301, redirectUrl);
  });
  
  return redirectApp;
};

// SSL证书检查
const checkSSLCertificates = () => {
  const certPath = process.env.SSL_CERT_PATH || './ssl/server.crt';
  const keyPath = process.env.SSL_KEY_PATH || './ssl/server.key';
  
  if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
    console.warn('⚠️  SSL证书不存在，HTTPS功能将被禁用');
    console.warn(`   证书路径: ${certPath}`);
    console.warn(`   密钥路径: ${keyPath}`);
    console.warn('   请运行 ssl-setup-windows.bat 生成证书');
    return false;
  }
  
  return {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
  };
};

// 服务器启动
const startServer = async () => {
  try {
    await initDatabase();
    console.log('✅ Database initialized successfully');

    const app = createApp();

    if (HTTPS_ENABLED) {
      const sslOptions = checkSSLCertificates();
      
      if (sslOptions) {
        // 启动HTTPS服务器
        const httpsServer = https.createServer(sslOptions, app);
        httpsServer.listen(HTTPS_PORT, () => {
          console.log(`🔒 HTTPS Server running on port ${HTTPS_PORT}`);
          console.log(`🌐 访问地址: https://${DOMAIN}${HTTPS_PORT === 443 ? '' : ':' + HTTPS_PORT}`);
        });

        // 启动HTTP重定向服务器
        if (HTTPS_PORT === 443 && HTTP_PORT === 80) {
          const redirectApp = createRedirectApp();
          const httpServer = http.createServer(redirectApp);
          httpServer.listen(HTTP_PORT, () => {
            console.log(`↗️  HTTP Redirect Server running on port ${HTTP_PORT}`);
            console.log(`   自动重定向到 HTTPS`);
          });
        }
      } else {
        console.log('📄 SSL证书不可用，启动HTTP模式...');
        startHTTPServer(app);
      }
    } else {
      startHTTPServer(app);
    }

    // 错误处理
    process.on('uncaughtException', (err) => {
      console.error('❌ Uncaught Exception:', err);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });

  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
};

// HTTP服务器启动
const startHTTPServer = (app) => {
  const port = NODE_ENV === 'production' && HTTP_PORT === 80 ? HTTP_PORT : DEV_PORT;
  
  const httpServer = http.createServer(app);
  httpServer.listen(port, () => {
    console.log(`🌐 HTTP Server running on port ${port}`);
    console.log(`📱 Environment: ${NODE_ENV}`);
    console.log(`🔗 访问地址: http://${DOMAIN === 'localhost' ? 'localhost' : DOMAIN}${port === 80 ? '' : ':' + port}`);
    
    if (NODE_ENV === 'production') {
      console.log('⚠️  生产环境建议启用HTTPS');
      console.log('   设置 HTTPS=true 并配置SSL证书');
    }
  });
};

// 优雅关闭
const gracefulShutdown = () => {
  console.log('\n📤 Received shutdown signal, shutting down gracefully...');
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// 启动服务器
if (require.main === module) {
  console.log('🚀 Starting MFA Management Platform...');
  console.log(`📊 Configuration:`);
  console.log(`   Environment: ${NODE_ENV}`);
  console.log(`   Domain: ${DOMAIN}`);
  console.log(`   HTTPS: ${HTTPS_ENABLED ? 'Enabled' : 'Disabled'}`);
  console.log(`   HTTP Port: ${HTTP_PORT}`);
  console.log(`   HTTPS Port: ${HTTPS_PORT}`);
  console.log(`   Dev Port: ${DEV_PORT}`);
  console.log('');
  
  startServer();
}

module.exports = { createApp, startServer }; 