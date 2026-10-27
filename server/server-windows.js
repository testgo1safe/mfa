const express = require('express');
const httpProxy = require('http-proxy-middleware');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const rateLimit = require('express-rate-limit');
const https = require('https');
const http = require('http');
const fs = require('fs');
const querystring = require('querystring');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/users');
const mfaRoutes = require('./routes/mfa');
const wechatRoutes = require('./routes/wechat');
const logRoutes = require('./routes/logs');
const systemRoutes = require('./routes/system');
const applicationRoutes = require('./routes/applications');
const authMethodRoutes = require('./routes/auth-methods');
const proxyRoutes = require('./routes/proxy');
const { initDatabase, getDB } = require('./config/database');
const { authenticateToken } = require('./middleware/auth');

const app = express();
const HTTP_PORT = process.env.HTTP_PORT || 80;
const HTTPS_PORT = process.env.HTTPS_PORT || 443;
const HTTPS_ENABLED = process.env.HTTPS !== 'false';
const FORCE_HTTPS_ALL = process.env.FORCE_HTTPS_ALL === 'true';
const owaProxyCache = new Map();
const proxyTimeoutMs = parseInt(process.env.PROXY_TIMEOUT_MS || '120000', 10);

// 动态信任代理：本地网段 + 外部网关（通过 EXTERNAL_GATEWAY_IPS 配置，逗号分隔，支持CIDR）
const defaultTrustedProxies = ['127.0.0.1', '::1', '172.17.0.0/16'];
const externalGatewayIpsEnv = (process.env.EXTERNAL_GATEWAY_IPS || '')
  .split(',')
  .map(v => v.trim())
  .filter(Boolean);
const trustedProxies = Array.from(new Set([...defaultTrustedProxies, ...externalGatewayIpsEnv]));

// 创建/复用根域 /owa 直连代理（保持/owa路径，避免Cookie Path不匹配）
const createRootOwaProxy = (application) => {
  const isInternalHttps = application.internal_url.startsWith('https://');
  return httpProxy.createProxyMiddleware({
    target: application.internal_url,
    changeOrigin: true,
    secure: false,
    xfwd: true,
    timeout: proxyTimeoutMs,
    proxyTimeout: proxyTimeoutMs,
    agent: isInternalHttps ? new (require('https')).Agent({
      rejectUnauthorized: false,
      keepAlive: true
    }) : new (require('http')).Agent({ keepAlive: true }),
    onProxyReq: (proxyReq, req, res) => {
      try {
        const hostHeader = req.get('host') || '';
        const publicHost = hostHeader.split(':')[0];
        proxyReq.setHeader('X-Forwarded-Proto', 'https');
        proxyReq.setHeader('X-Forwarded-Host', publicHost);
      } catch (e) {}

      // Restream parsed body for POST/PUT/PATCH to upstream (fix empty body issue)
      try {
        const method = (req.method || '').toUpperCase();
        const contentType = (req.headers && req.headers['content-type']) || '';
        if ((method === 'POST' || method === 'PUT' || method === 'PATCH') && req.body && Object.keys(req.body).length > 0) {
          let bodyData;
          if (contentType.includes('application/json')) {
            bodyData = Buffer.from(JSON.stringify(req.body));
          } else if (contentType.includes('application/x-www-form-urlencoded')) {
            bodyData = Buffer.from(querystring.stringify(req.body));
          }
          if (bodyData) {
            proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
            proxyReq.write(bodyData);
          }
        }
      } catch (e) {
        console.warn('Root /owa proxy restream body failed:', e?.message || e);
      }
    },
    onProxyRes: (proxyRes, req, res) => {
      try {
        const setCookieHeader = proxyRes.headers['set-cookie'];
        if (Array.isArray(setCookieHeader) && setCookieHeader.length > 0) {
          const hostHeader = req.get('host') || '';
          const publicHost = hostHeader.split(':')[0];
          const cookieHeader = req.headers.cookie || '';
          const cookies = Object.fromEntries((cookieHeader || '').split(';').map(c => c.trim().split('=')));
          let lastProxyPath = cookies['last_proxy_path'] ? decodeURIComponent(cookies['last_proxy_path']) : '';
          if (!lastProxyPath) {
            const def = process.env.DEFAULT_PROXY_APP_PATH || '';
            if (def) lastProxyPath = def.startsWith('/') ? def : `/${def}`;
          }

          const duplicated = [];
          proxyRes.headers['set-cookie'] = setCookieHeader.map((c) => {
            let v = c;
            // 仅重写Domain，保留Path=/owa 等
            if (publicHost) {
              v = v.replace(/;\s*Domain=[^;]+/i, `; Domain=${publicHost}`);
            } else {
              v = v.replace(/;\s*Domain=[^;]+/i, '');
            }

            // 复制一份用于 /proxy 前缀，确保 /proxy 下也能带到Cookie
            if (lastProxyPath) {
              let dup = v
                .replace(/;\s*Path=\/owa\b/i, `; Path=/proxy${lastProxyPath}/owa`)
                .replace(/;\s*Path=\/(?!proxy\b)/i, `; Path=/proxy${lastProxyPath}/`);
              duplicated.push(dup);
            }
            return v;
          });

          if (duplicated.length > 0) {
            proxyRes.headers['set-cookie'] = proxyRes.headers['set-cookie'].concat(duplicated);
            console.log('Root /owa proxy duplicated Set-Cookie for /proxy prefix');
          } else {
            console.log('Root /owa proxy rewrote Set-Cookie Domain');
          }
        }
      } catch (e) {
        console.warn('Root /owa Set-Cookie rewrite failed:', e?.message || e);
      }
    },
    onError: (err, req, res) => {
      console.error('Root /owa proxy request failed:', err.message, {
        target: application && application.internal_url,
        url: req && req.originalUrl
      });
      if (!res.headersSent) {
        res.status(502).send('ROOT_OWA_PROXY_ERROR');
      }
    }
  });
};

// 信任代理（本地 + 外部网关）
app.set('trust proxy', trustedProxies);

// 安全中间件
app.use(helmet({
  contentSecurityPolicy: false, // 暂时禁用CSP以便开发
}));

// 速率限制（调整为更宽松的限制）
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15分钟
  max: 500, // 限制每个IP每15分钟最多500个请求
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api', limiter);

// CORS配置
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://mfa.example.com', 'http://mfa.example.com', 'https://localhost:443', 'http://localhost:80', 'https://127.0.0.1:443', 'http://127.0.0.1:80']
    : ['http://localhost:3000', 'http://localhost:80', 'https://localhost:443', 'http://127.0.0.1:80', 'https://127.0.0.1:443'],
  credentials: true
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 静态文件服务
app.use(express.static(path.join(__dirname, '../client/build')));

// HTTP到HTTPS重定向中间件
const redirectToHTTPS = (req, res, next) => {
  if (!req.secure && req.get('x-forwarded-proto') !== 'https') {
    const host = req.get('host').split(':')[0];
    return res.redirect(301, `https://${host}:${HTTPS_PORT}${req.url}`);
  }
  next();
};

// HTTPS 重定向：当 FORCE_HTTPS_ALL=true 时对所有路由强制HTTPS；否则仅对非 /api 与 /health 路由
app.use((req, res, next) => {
  if (FORCE_HTTPS_ALL) {
    return redirectToHTTPS(req, res, next);
  }
  if (!req.url.startsWith('/api') && !req.url.startsWith('/health')) {
    return redirectToHTTPS(req, res, next);
  }
  next();
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
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    https: HTTPS_ENABLED,
    platform: process.platform,
    ports: {
      http: HTTP_PORT,
      https: HTTPS_ENABLED ? HTTPS_PORT : null
    }
  });
});

// 静态文件服务 - 企业微信H5应用页面
app.use(express.static(path.join(__dirname, '../client/public')));

// 精确的企业微信环境识别函数（与其他服务器文件保持一致）
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
            企业微信环境：${wechatCheck.isWechatWork ? '是' : '否'}<br/>
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

// 根域 /owa 与 /auth 直接代理到最近应用，避免重定向导致Cookie Path不匹配
app.all(['/owa', '/owa/*', '/auth', '/auth/*', '/auth.owa', '/ecp', '/ecp/*', '/ews', '/ews/*', '/oab', '/oab/*', '/autodiscover', '/autodiscover/*', '/mapi', '/mapi/*'], (req, res, next) => {
  try {
    const cookieHeader = req.headers.cookie || '';
    const cookies = Object.fromEntries(cookieHeader.split(';').map(c => c.trim().split('=')));
    let lastProxyPath = cookies['last_proxy_path'] ? decodeURIComponent(cookies['last_proxy_path']) : '';

    // 默认应用回退
    if (!lastProxyPath) {
      const def = process.env.DEFAULT_PROXY_APP_PATH || '';
      if (def) {
        lastProxyPath = def.startsWith('/') ? def : `/${def}`;
        try {
          res.cookie('last_proxy_path', encodeURIComponent(lastProxyPath), {
            path: '/', maxAge: 30 * 24 * 60 * 60 * 1000, sameSite: 'lax'
          });
        } catch (e) {}
      }
    }

    if (!lastProxyPath) return next();

    // 对根域下的关键虚拟目录（ECP/EWS/OAB/Autodiscover/MAPI）统一重定向到 /proxy/{app}/...，以使用完整的重写与Cookie逻辑
    if (/^\/(ecp|ews|oab|autodiscover|mapi)(\/|$)/i.test(req.originalUrl || '')) {
      const redirectTo = `/proxy${lastProxyPath}${req.originalUrl}`;
      console.log('Root reserved vdir request redirected to app-scoped path:', redirectTo);
      return res.redirect(302, redirectTo);
    }

    const db = getDB();
    const candidates = [lastProxyPath, lastProxyPath.replace(/^\//,'')];
    db.get(
      `SELECT * FROM applications WHERE external_path IN (${candidates.map(() => '?').join(',')}) LIMIT 1`,
      candidates,
      (err, application) => {
        if (err || !application) {
          console.warn('Root /owa proxy: application not found for', candidates);
          return next();
        }
        const cacheKey = `owa:${application.id || application.external_path}`;
        let middleware = owaProxyCache.get(cacheKey);
        if (!middleware) {
          middleware = createRootOwaProxy(application);
          owaProxyCache.set(cacheKey, middleware);
        }
        if (req.originalUrl.startsWith('/auth')) {
          req.url = '/owa' + req.originalUrl; // /auth/... -> /owa/auth/...
        } else if (req.originalUrl === '/auth.owa') {
          req.url = '/owa/auth.owa';
        }
        return middleware(req, res, next);
      }
    );
  } catch (e) {
    console.warn('Root /owa proxy failed:', e?.message || e);
    next();
  }
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

// 获取SSL证书配置
const getSSLOptions = () => {
  try {
    const sslPath = path.join(__dirname, '../ssl');
    const pfxPath = path.join(sslPath, 'server.pfx');
    const certPath = path.join(sslPath, 'server.crt');
    const keyPath = path.join(sslPath, 'server.key');
    const passwordPath = path.join(sslPath, 'cert-password.txt');

    // 优先使用PFX格式证书
    if (fs.existsSync(pfxPath) && fs.existsSync(passwordPath)) {
      const password = fs.readFileSync(passwordPath, 'utf8').trim();
      return {
        pfx: fs.readFileSync(pfxPath),
        passphrase: password
      };
    }
    
    // 使用分离的证书和私钥文件
    if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
      return {
        cert: fs.readFileSync(certPath),
        key: fs.readFileSync(keyPath)
      };
    }

    throw new Error('No SSL certificates found');
  } catch (error) {
    console.error('SSL configuration error:', error.message);
    console.log('请运行 generate-ssl-cert.ps1 生成SSL证书');
    return null;
  }
};

// 启动服务器
const startServer = async () => {
  try {
    await initDatabase();
    console.log('Database initialized successfully');

    // 启动HTTP服务器
    const httpServer = http.createServer(app);
    httpServer.on('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        console.warn(`HTTP port ${HTTP_PORT} is in use, skipping HTTP server startup.`);
      } else {
        console.error('HTTP server error:', err);
      }
    });
    httpServer.listen(HTTP_PORT, '0.0.0.0', () => {
      console.log(`HTTP Server is running on port ${HTTP_PORT}`);
      console.log(`HTTP访问地址: http://localhost:${HTTP_PORT}`);
    });

    // 启动HTTPS服务器
    if (HTTPS_ENABLED) {
      const sslOptions = getSSLOptions();
      if (sslOptions) {
        const httpsServer = https.createServer(sslOptions, app);
        httpsServer.on('error', (err) => {
          if (err && err.code === 'EADDRINUSE') {
            console.warn(`HTTPS port ${HTTPS_PORT} is in use, skipping HTTPS server startup.`);
          } else {
            console.error('HTTPS server error:', err);
          }
        });
        httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
          console.log(`HTTPS Server is running on port ${HTTPS_PORT}`);
          console.log(`HTTPS访问地址: https://localhost:${HTTPS_PORT}`);
          console.log(`域名访问: https://mfa.example.com:${HTTPS_PORT}`);
        });
      } else {
        console.warn('HTTPS is enabled but SSL certificates not found, running HTTP only');
      }
    }

    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log('='.repeat(60));
    console.log('🚀 MFA管控平台启动成功！');
    console.log('📱 管理员账号: admin / ' + (process.env.ADMIN_PASSWORD || 'admin123'));
    console.log('🔒 请及时修改默认密码');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n正在优雅关闭服务器...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n正在关闭服务器...');
  process.exit(0);
});

startServer(); 