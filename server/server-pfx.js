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

// 环境配置
const NODE_ENV = process.env.NODE_ENV || 'development';
const HTTP_PORT = process.env.HTTP_PORT || 80;
const HTTPS_PORT = process.env.HTTPS_PORT || 443;
const DEV_PORT = process.env.PORT || 3001;
const HTTPS_ENABLED = process.env.HTTPS === 'true';
const DOMAIN = process.env.DOMAIN || 'localhost';

// 创建应用
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
    message: 'Too many requests from this IP, please try again later.'
  });
  app.use('/api', limiter);

  // 中间件
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // 访问日志
  app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    const ip = req.ip || req.connection.remoteAddress;
    console.log(`[${timestamp}] ${req.method} ${req.url} - IP: ${ip}`);
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
      try {
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
      } catch (e) {}
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

// SSL证书检查（支持PFX格式）
const checkSSLCertificates = () => {
  const pfxPath = './ssl/server.pfx';
  const certPath = process.env.SSL_CERT_PATH || './ssl/server.crt';
  const keyPath = process.env.SSL_KEY_PATH || './ssl/server.key';
  
  // 优先使用PFX文件
  if (fs.existsSync(pfxPath)) {
    console.log('✅ 使用PFX证书文件');
    return {
      pfx: fs.readFileSync(pfxPath),
      passphrase: 'mfa123' // PFX密码
    };
  }
  
  // 回退到分离的证书和密钥文件
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    console.log('✅ 使用分离的证书和密钥文件');
    return {
      key: fs.readFileSync(keyPath),
      cert: fs.readFileSync(certPath)
    };
  }
  
  console.warn('⚠️  SSL证书不存在');
  console.warn(`   PFX路径: ${pfxPath}`);
  console.warn(`   证书路径: ${certPath}`);
  console.warn(`   密钥路径: ${keyPath}`);
  return false;
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
        
        const httpsPort = NODE_ENV === 'production' ? HTTPS_PORT : DEV_PORT;
        httpsServer.listen(httpsPort, () => {
          console.log(`🔒 HTTPS Server running on port ${httpsPort}`);
          console.log(`🌐 访问地址: https://${DOMAIN}${httpsPort === 443 ? '' : ':' + httpsPort}`);
          
          if (NODE_ENV === 'production') {
            console.log('🔐 生产环境HTTPS模式已启用');
          } else {
            console.log('⚠️  开发环境HTTPS模式 (自签名证书)');
            console.log('   请在浏览器中接受自签名证书警告');
          }
        });

        // 在生产环境下启动HTTP重定向服务器
        if (NODE_ENV === 'production' && httpsPort === 443) {
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

  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
};

// HTTP服务器启动
const startHTTPServer = (app) => {
  const port = NODE_ENV === 'production' ? HTTP_PORT : DEV_PORT;
  
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

// 启动服务器
if (require.main === module) {
  console.log('🚀 Starting MFA Management Platform (PFX Version)...');
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