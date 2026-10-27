const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const rateLimit = require('express-rate-limit');
const https = require('https');
const fs = require('fs');
require('dotenv').config();
let compression; try { compression = require('compression'); } catch (e) { console.warn('compression not installed; skipping HTTP compression'); }

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const mfaRoutes = require('./routes/mfa');
const wechatRoutes = require('./routes/wechat');
const logRoutes = require('./routes/logs');
const systemRoutes = require('./routes/system');
const applicationRoutes = require('./routes/applications');
const authMethodRoutes = require('./routes/auth-methods');
const proxyRoutes = require('./routes/proxy');
const { initDatabase, closeDatabase, getDB } = require('./config/database');
const { authenticateToken } = require('./middleware/auth');

const app = express();
// 信任反向代理（Nginx/ELB），以正确获取 X-Forwarded-* 头
app.set('trust proxy', parseInt(process.env.TRUST_PROXY_HOPS || '1', 10));

const isProd = process.env.NODE_ENV === 'production';

// 精确的企业微信环境识别函数（与wechat.js保持一致）
const isWeChatWorkEnvironment = (req) => {
  const userAgent = req.headers['user-agent'] || '';
  const referer = req.headers['referer'] || '';
  
  // 企业微信的特征标识
  const wechatWorkIdentifiers = [
    'wxwork',           // 企业微信专用标识
    'WeixinWork',       // 企业微信工作版标识
    'WeChat/',          // iOS企业微信标识
    'weixin_work'       // 另一种企业微信标识
  ];
  
  // 普通微信的排除标识（只有这些而没有企业微信标识的是普通微信）
  const regularWechatOnly = userAgent.includes('MicroMessenger') && 
                           !wechatWorkIdentifiers.some(id => userAgent.includes(id));
  
  // 检查是否包含企业微信标识
  const hasWechatWorkId = wechatWorkIdentifiers.some(id => userAgent.includes(id));
  
  // 额外的企业微信环境检查
  const isFromWechatWorkDomain = referer.includes('work.weixin.qq.com') || 
                                referer.includes('weixin.qq.com');
  
  const result = {
    isWechatWork: hasWechatWorkId || (userAgent.includes('MicroMessenger') && isFromWechatWorkDomain),
    isRegularWechat: regularWechatOnly,
    userAgent: userAgent,
    referer: referer,
    checks: {
      hasWechatWorkId: hasWechatWorkId,
      isFromWechatWorkDomain: isFromWechatWorkDomain,
      regularWechatOnly: regularWechatOnly
    }
  };
  
  console.log('企业微信环境检查结果:', result);
  return result;
};
const PORT = process.env.PORT || 3001;
const HTTPS_ENABLED = process.env.HTTPS === 'true';

// 安全中间件
app.use(helmet({
  contentSecurityPolicy: isProd ? {
    useDefaults: true,
    directives: {
      defaultSrc: ["'self'"],
      baseUri: ["'self'"],
      connectSrc: ["'self'"],
      imgSrc: ["'self'", 'data:'],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      fontSrc: ["'self'", 'data:'],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      upgradeInsecureRequests: null
    }
  } : false,
}));

// 速率限制
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || String(15 * 60 * 1000), 10);
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '100', 10);
const limiter = rateLimit({
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api', limiter);

// CORS配置
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://mfa.example.com', 'http://mfa.example.com', 'https://localhost:3001', 'http://localhost:3001']
    : ['http://localhost:3000', 'http://localhost:3001', 'https://localhost:3001'],
  credentials: true
}));

// 请求体限制（可配置）
const JSON_LIMIT = process.env.JSON_LIMIT || '1mb';
const URLENCODED_LIMIT = process.env.URLENCODED_LIMIT || '1mb';
app.use(express.json({ limit: JSON_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: URLENCODED_LIMIT }));

// 压缩（若模块存在）
if (compression) {
  const threshold = parseInt(process.env.COMPRESSION_THRESHOLD || '1024', 10);
  app.use(compression({ threshold }));
}

// 静态文件服务
app.use(express.static(path.join(__dirname, '../client/build')));

// 根路径兜底：若有最近访问的代理应用，回写到对应的/proxy路径
app.get(['/', '/owa', '/owa/'], (req, res, next) => {
  try {
    const cookieHeader = req.headers.cookie || '';
    const cookies = Object.fromEntries(cookieHeader.split(';').map(c => c.trim().split('=')));
    const lastProxyPath = cookies['last_proxy_path'];
    if (lastProxyPath && typeof lastProxyPath === 'string') {
      const target = `/proxy${lastProxyPath}`;
      console.log('Root fallback redirect to last proxy path:', target);
      return res.redirect(302, target);
    }
  } catch (e) {}
  return next();
});

// API路由
app.use('/api/auth', authRoutes);
app.use('/api/wechat', wechatRoutes);
app.use('/api/users', authenticateToken, userRoutes);
app.use('/api/mfa', authenticateToken, mfaRoutes);
app.use('/api/logs', authenticateToken, logRoutes);
app.use('/api/system', authenticateToken, systemRoutes);
app.use('/api/applications', authenticateToken, applicationRoutes);
app.use('/api/auth-methods', authenticateToken, authMethodRoutes);
app.use('/api/totp', require('./routes/totp-verify'));

// 代理路由（需要特殊处理，不使用通用的authenticateToken中间件）
app.use('/proxy', proxyRoutes);

// 健康检查
app.get('/api/health', async (req, res) => {
  const db = getDB();
  const result = {
    status: 'OK',
    timestamp: new Date().toISOString(),
    https: HTTPS_ENABLED,
    platform: process.platform,
    components: {
      database: { status: 'unknown' },
      applications: []
    }
  };

  // DB status
  try {
    await new Promise((resolve, reject) => {
      db.get('SELECT 1 as ok', (err, row) => err ? reject(err) : resolve(row));
    });
    result.components.database.status = 'healthy';
  } catch (e) {
    result.components.database.status = 'unhealthy';
  }

  // Optional: ping first N enabled applications
  const maxApps = parseInt(process.env.HEALTH_PING_APPS || '3', 10);
  const timeoutMs = parseInt(process.env.HEALTH_PING_TIMEOUT_MS || '3000', 10);
  try {
    const apps = await new Promise((resolve, reject) => {
      db.all('SELECT id, name, internal_url FROM applications WHERE is_enabled = 1 ORDER BY updated_at DESC LIMIT ?', [maxApps], (err, rows) => err ? reject(err) : resolve(rows || []));
    });
    const fetch = require('node-fetch');
    const checks = await Promise.all(apps.map(async (a) => {
      const controller = new (global.AbortController || (await import('abort-controller')).default)();
      const id = setTimeout(() => controller.abort(), timeoutMs);
      let status = 'unknown';
      try {
        const resp = await fetch(a.internal_url, { method: 'GET', signal: controller.signal });
        status = resp.ok ? 'reachable' : `http_${resp.status}`;
      } catch (e) {
        status = 'unreachable';
      } finally {
        clearTimeout(id);
      }
      return { id: a.id, name: a.name, url: a.internal_url, status };
    }));
    result.components.applications = checks;
  } catch (e) {
    // ignore
  }

  res.json(result);
});

// 静态文件服务 - 企业微信H5应用页面
app.use(express.static(path.join(__dirname, '../client/public')));

// 企业微信H5应用路由别名（仅企业微信环境可访问）
app.get('/auth/login', (req, res) => {
  // 检查是否来自企业微信环境
  const wechatCheck = isWeChatWorkEnvironment(req);
  
  // 防止被嵌入到任何iframe中
  try {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
  } catch (e) {}

  if (!wechatCheck.isWechatWork || wechatCheck.isRegularWechat) {
    // 非企业微信环境，返回访问限制页面
    return res.status(403).send(`
      <!DOCTYPE html>
      <html lang="zh-CN">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>访问受限</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
          .container { background: white; padding: 40px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 400px; margin: 0 auto; }
          .icon { font-size: 48px; margin-bottom: 20px; }
          h1 { color: #e74c3c; margin-bottom: 20px; }
          p { color: #666; line-height: 1.6; }
          .highlight { color: #e74c3c; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="icon">🔒</div>
          <h1>访问受限</h1>
          <p>此页面仅限在 <span class="highlight">企业微信</span> 中访问</p>
          <p>普通微信无法使用此功能</p>
          <p>请通过企业微信工作台打开相关应用</p>
          <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
          <div style="background: #f0f0f0; padding: 10px; border-radius: 5px; font-size: 11px; color: #666;">
            <strong>检测结果：</strong><br/>
            企业微信环境：${wechatCheck.isWechatWork ? '否' : '是'}<br/>
            普通微信环境：${wechatCheck.isRegularWechat ? '是' : '否'}<br/>
            请确保从企业微信工作台访问
          </div>
          <p style="font-size: 12px; color: #999; margin-top: 10px;">
            如有问题请联系系统管理员
          </p>
        </div>
      </body>
      </html>
    `);
  }
  
  // 企业微信环境，允许访问
  res.sendFile(path.join(__dirname, '../client/public/wechat-app.html'));
});

// 前端路由 - 所有非API请求都返回index.html
app.get('*', (req, res) => {
  try {
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'");
  } catch (e) {}
  res.sendFile(path.join(__dirname, '../client/build/index.html'));
});

// 错误处理中间件
app.use((error, req, res, next) => {
  console.error(error.stack);
  res.status(500).json({ 
    message: 'Internal server error', 
    error: process.env.NODE_ENV === 'development' ? error.message : {}
  });
});

// 启动服务器
const startServer = async () => {
  try {
    await initDatabase();
    console.log('Database initialized successfully');

    let server;
    if (HTTPS_ENABLED) {
      // HTTPS服务器（支持PFX或PEM+CA）
      const pfxPath = process.env.SSL_PFX_PATH;
      const pfxPassword = process.env.SSL_PFX_PASSPHRASE || process.env.SSL_PFX_PASSWORD;
      const pfxPasswordFile = process.env.SSL_PFX_PASSWORD_FILE;

      let sslOptions;
      try {
        if (pfxPath && fs.existsSync(pfxPath)) {
          const passphrase = pfxPassword || (pfxPasswordFile && fs.existsSync(pfxPasswordFile) ? fs.readFileSync(pfxPasswordFile, 'utf8').trim() : undefined);
          sslOptions = { pfx: fs.readFileSync(pfxPath), ...(passphrase ? { passphrase } : {}) };
        } else {
          const keyPath = process.env.SSL_KEY_PATH || 'ssl/server.key';
          const certPath = process.env.SSL_CERT_PATH || 'ssl/server.crt';
          const caPath = process.env.SSL_CA_PATH;
          const options = {
            key: fs.readFileSync(keyPath),
            cert: fs.readFileSync(certPath)
          };
          if (caPath && fs.existsSync(caPath)) {
            options.ca = fs.readFileSync(caPath);
          }
          sslOptions = options;
        }
      } catch (e) {
        console.error('Failed to read SSL certificates:', e.message);
        process.exit(1);
      }

      server = https.createServer(sslOptions, app).listen(PORT, () => {
        console.log(`HTTPS Server is running on port ${PORT}`);
        console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`访问地址: https://localhost:${PORT}`);
      });
    } else {
      // HTTP服务器
      server = app.listen(PORT, () => {
        console.log(`HTTP Server is running on port ${PORT}`);
        console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`访问地址: http://localhost:${PORT}`);
      });
    }

    // HTTP 超时参数，避免慢连接拖垮资源
    const HEADERS_TIMEOUT_MS = parseInt(process.env.HEADERS_TIMEOUT_MS || '65000', 10);
    const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '60000', 10);
    const KEEP_ALIVE_TIMEOUT_MS = parseInt(process.env.KEEP_ALIVE_TIMEOUT_MS || '60000', 10);
    server.headersTimeout = HEADERS_TIMEOUT_MS;
    server.requestTimeout = REQUEST_TIMEOUT_MS;
    server.keepAliveTimeout = KEEP_ALIVE_TIMEOUT_MS;

    // 优雅关停 & 异常处理
    const gracefulShutdown = (signal) => {
      console.log(`[${new Date().toISOString()}] Received ${signal}, shutting down gracefully...`);
      const timeout = setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
      }, parseInt(process.env.SHUTDOWN_TIMEOUT_MS || '10000', 10));
      try {
        server.close(() => {
          closeDatabase()
            .catch(() => {})
            .finally(() => { clearTimeout(timeout); process.exit(0); });
        });
      } catch (e) {
        closeDatabase()
          .catch(() => {})
          .finally(() => { clearTimeout(timeout); process.exit(0); });
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('unhandledRejection', (reason) => {
      console.error('Unhandled Rejection:', reason);
      gracefulShutdown('unhandledRejection');
    });
    process.on('uncaughtException', (err) => {
      console.error('Uncaught Exception:', err);
      gracefulShutdown('uncaughtException');
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

startServer();

module.exports = app; 