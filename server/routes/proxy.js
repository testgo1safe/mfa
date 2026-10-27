const express = require('express');
const httpProxy = require('http-proxy-middleware');
const { getDB } = require('../config/database');
const { checkNetworkAccess, isInternalIP, requireWechatAuth } = require('../middleware/auth');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const zlib = require('zlib');
const querystring = require('querystring');

// JWT 验证辅助函数
const verifyToken = (token, callback) => {
  jwt.verify(token, process.env.JWT_SECRET, callback);
};

// IP工具：清理IPv6映射前缀
const cleanIPv4 = (ip) => (ip || '').replace(/^::ffff:/, '');

// 将IPv4字符串转为数字（无效返回null）
const ipToNumber = (ip) => {
  const parts = (ip || '').split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map(p => parseInt(p, 10));
  if (nums.some(n => Number.isNaN(n) || n < 0 || n > 255)) return null;
  return ((nums[0] << 24) | (nums[1] << 16) | (nums[2] << 8) | nums[3]) >>> 0;
};

// 判断IP是否匹配单个模式：支持精确IP或CIDR
const ipMatchesPattern = (ip, pattern) => {
  const targetIp = cleanIPv4(ip);
  const pat = (pattern || '').trim();
  if (!pat) return false;
  if (!pat.includes('/')) {
    return targetIp === cleanIPv4(pat);
  }
  try {
    const [rangeIP, maskStr] = pat.split('/');
    const mask = parseInt(maskStr, 10);
    if (!Number.isInteger(mask) || mask < 0 || mask > 32) return false;
    const ipNum = ipToNumber(targetIp);
    const rangeNum = ipToNumber(cleanIPv4(rangeIP));
    if (ipNum === null || rangeNum === null) return false;
    const maskNum = (mask === 0) ? 0 : (0xffffffff << (32 - mask)) >>> 0;
    return (ipNum & maskNum) === (rangeNum & maskNum);
  } catch (_) {
    return false;
  }
};

// 检查IP是否命中排除列表
const isIpInExcludeList = (ip, listString) => {
  if (!listString) return false;
  const items = listString.split(',').map(s => s.trim()).filter(Boolean);
  const v4 = cleanIPv4(ip);
  for (const pat of items) {
    if (ipMatchesPattern(v4, pat)) return true;
  }
  return false;
};

const router = express.Router();
const proxyCache = new Map();
const proxyTimeoutMs = parseInt(process.env.PROXY_TIMEOUT_MS || '120000', 10);
const MAX_REWRITE_BODY_BYTES = parseInt(process.env.MAX_REWRITE_BODY_BYTES || String(2 * 1024 * 1024), 10); // 2MB 默认阈值
const MAX_BUFFERED_CHUNKS = parseInt(process.env.MAX_BUFFERED_CHUNKS || '1024', 10);

// 应用所有路由的网络访问检查
router.use(checkNetworkAccess);

// 网络检测调试接口
router.get('/debug-network', (req, res) => {
  const userAgent = req.headers['user-agent'] || '';
  const isMobile = /Mobile|Android|iPhone|iPad|Safari/i.test(userAgent);
  const isSafari = userAgent.toLowerCase().includes('safari') && !userAgent.toLowerCase().includes('chrome');
  const isEdge = userAgent.toLowerCase().includes('edge') || userAgent.toLowerCase().includes('edg/');
  
  res.json({
    headers: {
      'x-forwarded-for': req.headers['x-forwarded-for'],
      'x-real-ip': req.headers['x-real-ip'],
      'user-agent': req.headers['user-agent']
    },
    connection: {
      remoteAddress: req.connection?.remoteAddress,
      localAddress: req.connection?.localAddress
    },
    networkInfo: req.networkInfo,
    browserDetection: {
      isMobile: isMobile,
      isSafari: isSafari,
      isEdge: isEdge,
      userAgent: userAgent
    },
    environment: {
      INTERNAL_IP_RANGES: process.env.INTERNAL_IP_RANGES,
      NODE_ENV: process.env.NODE_ENV,
      PROXY_TIMEOUT_MS: process.env.PROXY_TIMEOUT_MS
    },
    allHeaders: req.headers,
    timestamp: new Date().toISOString()
  });
});

// 增强移动端调试接口
router.get('/mobile-debug-enhanced', (req, res) => {
  const userAgent = req.headers['user-agent'] || '';
  const isMobile = /Mobile|Android|iPhone|iPad|Safari/i.test(userAgent);
  const isSafari = userAgent.toLowerCase().includes('safari') && !userAgent.toLowerCase().includes('chrome');
  
  console.log(`📱 移动端调试访问: ${req.ip}`);
  console.log(`🔍 User-Agent: ${userAgent}`);
  console.log(`📋 移动端: ${isMobile}, Safari: ${isSafari}`);
  
  const debugHTML = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>移动端深度调试</title>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; 
            margin: 0; padding: 20px; background: #f5f5f5; font-size: 14px;
        }
        .container { 
            background: white; padding: 20px; border-radius: 8px; 
            box-shadow: 0 2px 10px rgba(0,0,0,0.1); margin-bottom: 20px;
        }
        h1, h2 { color: #333; margin-top: 0; }
        button { 
            background: #007bff; color: white; border: none; 
            padding: 10px 15px; border-radius: 5px; margin: 5px; 
            cursor: pointer; font-size: 14px; width: 100%;
        }
        button:hover { background: #0056b3; }
    </style>
</head>
<body>
    <div class="container">
        <h1>📱 移动端深度调试工具</h1>
        <p>浏览器: ${isSafari ? 'Safari' : 'Other'}</p>
        <p>移动端: ${isMobile ? '是' : '否'}</p>
        <button onclick="window.open('/proxy/test2', '_blank')">打开测试应用</button>
        <button onclick="location.reload()">刷新页面</button>
    </div>
</body>
</html>`;

  res.send(debugHTML);
});

// 简化的代理中间件创建函数
const createSimpleProxyMiddleware = (application) => {
  const isInternalHttps = application.internal_url.startsWith('https://');
  
  return httpProxy.createProxyMiddleware({
    target: application.internal_url,
    changeOrigin: true,
    secure: false,
    timeout: proxyTimeoutMs,
    proxyTimeout: proxyTimeoutMs,
    xfwd: true,
    autoRewrite: true,
    hostRewrite: (req) => {
      try {
        return (req.get && req.get('host')) || undefined;
      } catch (e) { return undefined; }
    },
    protocolRewrite: 'https',
    selfHandleResponse: true,
    
    agent: isInternalHttps ? new (require('https')).Agent({
      rejectUnauthorized: false,
      keepAlive: true,
      timeout: proxyTimeoutMs
    }) : new (require('http')).Agent({
      keepAlive: true,
      timeout: proxyTimeoutMs
    }),
    
    pathRewrite: (path, req) => {
      const stored = application.external_path || '';
      const storedWithSlash = stored.startsWith('/') ? stored : `/${stored}`;
      const prefixA = `/proxy${storedWithSlash}`;
      if (path.startsWith(prefixA)) {
        let subPath = path.slice(prefixA.length) || '/';
        if (!subPath.startsWith('/')) subPath = `/${subPath}`;
        // OWA 兼容：将 /auth 与 /auth.owa 转发到上游的 /owa/... 路径
        if (subPath === '/auth.owa') {
          subPath = '/owa/auth.owa';
        } else if (subPath.startsWith('/auth/')) {
          subPath = `/owa${subPath}`; // /auth/... -> /owa/auth/...
        }
        // ECP 兼容：/ecp/DDIService.svc 缺少 /DDI/ 段时，规范为 /ecp/DDI/DDIService.svc
        try {
          if (/^\/ecp\/DDIService\.svc(\/|\?|$)/i.test(subPath)) {
            const before = subPath;
            subPath = subPath.replace(/^\/ecp\/DDIService\.svc/i, '/ecp/DDI/DDIService.svc');
            console.log('[pathRewrite] DDIService normalized:', before, '->', subPath);
          }
          // ECP 主页直达：将 /ecp/ 统一导向邮箱列表页面，避免空白或布局异常
                                                     try {
            if (false && /^\/ecp(?:\/)?(?:\?.*)?$/i.test(subPath)) {
              const before = subPath;
              subPath = '/ecp/UsersGroups/Mailboxes.slab?showhelp=false';
              console.log('[pathRewrite] ECP home redirected:', before, '->', subPath);
            }
          } catch (_) {}
           // ECP 兼容：版本目录下直接引用字体文件时，回落到 /ecp/fonts/{file}
          const fontVerMatch = subPath.match(/^\/ecp\/[0-9.]+\/([^\/]+\.(?:ttf|woff2?|woff|eot|svg))(\?.*)?$/i);
          if (fontVerMatch) {
            const before = subPath;
            subPath = `/ecp/fonts/${fontVerMatch[1]}` + (fontVerMatch[2] || '');
            console.log('[pathRewrite] ECP font version fallback:', before, '->', subPath);
          }
        } catch (_) {}
        return subPath;
      }
      // 兼容：当缺少应用段时，允许 /proxy/{reserved}/... 直达上游对应根目录
      try {
        if (path.startsWith('/proxy/')) {
          const parts = path.split('/'); // ['', 'proxy', seg, ...]
          const seg = (parts[2] || '').toLowerCase();
          const reserved = ['owa', 'ecp', 'ews', 'oab', 'autodiscover', 'mapi', 'microsoft-server-activesync', 'ddi', 'fonts'];
          if (reserved.includes(seg)) {
            let rewritten = '/' + parts.slice(2).join('/'); // -> '/{seg}/...'
            // 将 /proxy/DDI/* 与 /proxy/fonts/* 映射到上游 /ecp/DDI/* 与 /ecp/fonts/*
            if (seg === 'ddi' || seg === 'fonts') {
              rewritten = '/ecp' + rewritten;
            }
                         // 如果是 /proxy/ecp 或 /proxy/ecp/，直达邮箱列表页面
             try {
               if (false && /^\/ecp(?:\/)?(?:\?.*)?$/i.test(rewritten)) {
                 const before = rewritten;
                 rewritten = '/ecp/UsersGroups/Mailboxes.slab?showhelp=false';
                 console.log('[pathRewrite] ECP home redirected (reserved):', before, '->', rewritten);
               }
             } catch (_) {}
              return rewritten || '/';
          }
        }
      } catch (_) {}
      return path;
    },
    
    onProxyReq: (proxyReq, req, res) => {
      const userAgent = req.headers['user-agent'] || '';
      const isEdge = userAgent.toLowerCase().includes('edge') || userAgent.toLowerCase().includes('edg/');
      
      if (isEdge) {
        proxyReq.setHeader('X-Edge-Compatibility', 'enabled');
        proxyReq.setHeader('Connection', 'keep-alive');
        console.log('🔧 已应用Edge兼容性增强');
      }
      try {
        const urlForLog = req.url || '';
        if (/\/proxy\/.+\/(owa|ecp)(\/|\?|$)/i.test(urlForLog)) {
          const cookieLen = (req.headers && req.headers['cookie'] ? String(req.headers['cookie']).length : 0);
          console.log(`➡️  ${req.method} ${urlForLog} cookie-bytes=${cookieLen}`);
        }
      } catch (_) {}
      
      // 强制上游识别外部协议/主机/前缀
      try {
        const hostHeader = req.get('host') || '';
        const publicHost = hostHeader.split(':')[0];
        const stored = application.external_path || '';
        const storedWithSlash = stored.startsWith('/') ? stored : `/${stored}`;
        proxyReq.setHeader('X-Forwarded-Proto', 'https');
        proxyReq.setHeader('X-Forwarded-Host', publicHost);
        proxyReq.setHeader('X-Forwarded-Prefix', `/proxy${storedWithSlash}`);
        // 关闭上游压缩，便于进行内容重写
        proxyReq.setHeader('Accept-Encoding', 'identity');

        // 计算外部/内部基址
        const externalBase = `https://${publicHost}/proxy${storedWithSlash}`;
        const internal = new URL(application.internal_url);
        const internalOrigin = `${internal.protocol}//${internal.host}`;

        // 规范化用于判定的上游路径（移除 /proxy{stored}/ 或 /proxy/ 前缀）
        const originalPath = req.url || '';
        let upstreamLikePath = originalPath;
        try {
          const prefixA = `/proxy${storedWithSlash}`;
          if (upstreamLikePath.startsWith(prefixA)) {
            upstreamLikePath = upstreamLikePath.slice(prefixA.length);
            if (!upstreamLikePath.startsWith('/')) upstreamLikePath = `/${upstreamLikePath}`;
          } else if (upstreamLikePath.startsWith('/proxy/')) {
            // 兼容直达 /proxy/(owa|ecp|...)
            upstreamLikePath = upstreamLikePath.replace(/^\/proxy\//i, '/');
          }
        } catch (_) {}

        // 对 OWA 登录 POST 做字段与头部回写：/owa/auth.owa
        const isOwaAuthPost = /\/owa\/auth\.owa(\?|$)/i.test(upstreamLikePath) && (req.method || '').toUpperCase() === 'POST';
        if (isOwaAuthPost) {
          // 补齐 Referer/Origin 为内网，避免上游安全校验拦截
          try {
            const incomingRef = req.headers['referer'] || '';
            if (incomingRef) {
              // 将外部 /proxy 基址的 Referer 改回内网
              const fixedRef = incomingRef.replace(new RegExp(externalBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), `${internalOrigin}`);
              proxyReq.setHeader('Referer', fixedRef);
            } else {
              proxyReq.setHeader('Referer', `${internalOrigin}/owa/auth/logon.aspx`);
            }
            proxyReq.setHeader('Origin', internalOrigin);
          } catch (e) {}

          // 仅当是 x-www-form-urlencoded 才重写 body
          const contentType = (req.headers && req.headers['content-type']) || '';
          if (contentType.includes('application/x-www-form-urlencoded')) {
            try {
              const bodyObj = Object.assign({}, req.body || {});
              const fieldsToFix = ['destination', 'url'];
              for (const key of fieldsToFix) {
                if (typeof bodyObj[key] === 'string' && bodyObj[key]) {
                  // 1) 外部绝对地址 -> 内部 Origin
                  bodyObj[key] = bodyObj[key].replace(new RegExp(externalBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), `${internalOrigin}`);
                  // 2) 外部绝对 /proxy 路径中的 /owa/ -> 内部 /owa/
                  bodyObj[key] = bodyObj[key].replace(/\/proxy\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*\/owa\//gi, '/owa/');
                }
              }
              // 回写表单数据
              const bodyData = Buffer.from(querystring.stringify(bodyObj));
              proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
              proxyReq.write(bodyData);
              return; // 已写入自定义body，后续不再重复写
            } catch (e) {
              console.warn('OWA auth body rewrite failed:', e?.message || e);
            }
          }
        }

        // ECP/EWS 请求的 Referer/Origin 矫正，避免外部 /proxy 引起的同源/来源校验失败
        try {
          const urlPath = upstreamLikePath || '';
          let needsRefFix = /^\/(ecp|ews|oab|autodiscover|mapi|microsoft-server-activesync)\//i.test(urlPath);
          const isReservedEcp = /^\/(DDI|fonts)\//i.test(urlPath);
          if (isReservedEcp) {
            needsRefFix = true;
          }
          if (needsRefFix) {
            const incomingRef = req.headers['referer'] || '';
            if (incomingRef) {
              const fixedRef = incomingRef.replace(new RegExp(externalBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), `${internalOrigin}`);
              proxyReq.setHeader('Referer', fixedRef);
            } else {
              // 缺省指向对应虚拟目录
              let vdir = (urlPath.split('/')[1] || '').toLowerCase();
              if (isReservedEcp || vdir === 'ddi' || vdir === 'fonts') vdir = 'ecp';
              proxyReq.setHeader('Referer', `${internalOrigin}/${vdir}/`);
            }
            proxyReq.setHeader('Origin', internalOrigin);
          }
        } catch (e) {}
      } catch (e) {}
      
      if (req.user) {
        proxyReq.setHeader('X-User-ID', req.user.id);
        proxyReq.setHeader('X-Username', req.user.username);
      }

      // 解决 http-proxy-middleware 对于已被解析的 req.body 不自动转发的问题（表单/JSON）
      try {
        const contentType = req.headers['content-type'] || '';
        if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
          if (req.body && Object.keys(req.body).length > 0) {
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
        }
      } catch (e) {
        console.warn('Proxy restream body failed:', e?.message || e);
      }

      // 针对 ECP DDI 服务的 SOAP/JSON 请求进行兼容处理
      try {
        const urlPath = upstreamLikePath || '';
        if (/^\/ecp\/DDI\/DDIService\.svc\b/i.test(urlPath)) {
          // 确保保持原始 Content-Type 并允许 JSON/SOAP 透传
          const ct = req.headers['content-type'] || '';
          if (ct) proxyReq.setHeader('Content-Type', ct);
          proxyReq.setHeader('Accept-Encoding', 'identity');
          proxyReq.setHeader('X-ECP-DDI', '1');
        }
      } catch (_) {}
    },
    
    onProxyRes: (proxyRes, req, res) => {
      try {
        const reqUrl = req.url || '';
        const status = proxyRes.statusCode || 0;
        if (status === 404 && /^\/proxy\/.+\/ecp\/[0-9.]+\/([^\/]+\.(?:ttf|woff2?|woff|eot|svg))(\?.*)?$/i.test(reqUrl)) {
          const m = reqUrl.match(/^\/proxy\/(.+?)\/ecp\/[0-9.]+\/([^\/]+\.(?:ttf|woff2?|woff|eot|svg))(\?.*)?$/i);
          if (m) {
            const appPath = `/${m[1]}`;
            const fileName = m[2];
            const query = m[3] || '';
            const retryPath = `/proxy${appPath}/ecp/fonts/${fileName}${query}`;
            if (!req.headers['x-ecp-font-retry']) {
              console.log('[onProxyRes] 404 for versioned font, retrying as:', retryPath);
              try {
                res.setHeader('X-ECP-Font-Retried', '1');
              } catch (_) {}
              req.headers['x-ecp-font-retry'] = '1';
              req.url = retryPath;
              // 交给下一个中间件重新处理
              return router.handle(req, res);
            }
          }
        }
      } catch (_) {}
      // 组装上游响应体（加保护：大响应跳过重写，避免占用过多内存）
      const chunks = [];
      let bufferedBytes = 0;
      let skipRewrite = false;
      proxyRes.on('data', (chunk) => {
        if (skipRewrite) return;
        bufferedBytes += chunk.length;
        if (bufferedBytes > MAX_REWRITE_BODY_BYTES || chunks.length > MAX_BUFFERED_CHUNKS) {
          skipRewrite = true;
          return;
        }
        chunks.push(chunk);
      });
      proxyRes.on('end', () => {
        const statusCode = proxyRes.statusCode || 200;
        const headers = { ...proxyRes.headers };

        // 若上游返回 401，用于 EWS/Autodiscover/MAPI/OAB 的认证挑战中补充 Basic，触发浏览器账号密码弹窗
        try {
          const urlForAuth = (req.url || '').toLowerCase();
          const isExchangeAuthChallengePath = /^\/proxy\/[^\/]+\/(ews\b|autodiscover\b|mapi\b|oab\b|microsoft-server-activesync\b)/i.test(urlForAuth);
          if (statusCode === 401 && isExchangeAuthChallengePath) {
            const hName = 'www-authenticate';
            const existing = headers[hName];
            const hasBasic = Array.isArray(existing)
              ? existing.some(v => typeof v === 'string' && /\bbasic\b/i.test(v))
              : (typeof existing === 'string' && /\bbasic\b/i.test(existing));
            if (!hasBasic) {
              const basicChallenge = 'Basic realm="Exchange"';
              if (!existing) {
                headers[hName] = basicChallenge;
              } else if (Array.isArray(existing)) {
                headers[hName] = existing.concat([basicChallenge]);
              } else if (typeof existing === 'string') {
                headers[hName] = `${existing}, ${basicChallenge}`;
              }
            }
          }
        } catch (_) {}

        // 基础响应头设置
        headers['cache-control'] = 'no-store, no-cache, must-revalidate';
        headers['connection'] = 'keep-alive';

        const userAgent = req.headers['user-agent'] || '';
        const isSafari = userAgent.toLowerCase().includes('safari') && !userAgent.toLowerCase().includes('chrome');
        const isEdge = userAgent.toLowerCase().includes('edge') || userAgent.toLowerCase().includes('edg/');
        if (isEdge) headers['x-edge-compat'] = 'enabled';
        if (isSafari) headers['x-safari-compat'] = 'enabled';

        // 记录最近访问的代理应用路径
        try {
          const lastPath = encodeURIComponent(application.external_path || '');
          if (lastPath) {
            res.appendHeader ? res.appendHeader('Set-Cookie', `last_proxy_path=${lastPath}; Path=/; Max-Age=2592000; SameSite=Lax`) : res.setHeader('Set-Cookie', `last_proxy_path=${lastPath}; Path=/; Max-Age=2592000; SameSite=Lax`);
          }
        } catch (e) {
          console.warn('Set last_proxy_path cookie failed:', e?.message || e);
        }

        // 重写Set-Cookie Path/Domain
        try {
          const setCookieHeader = headers['set-cookie'];
          if (Array.isArray(setCookieHeader) && setCookieHeader.length > 0) {
            const stored = application.external_path || '';
            const storedWithSlash = stored.startsWith('/') ? stored : `/${stored}`;
            const hostHeader = req.get('host') || '';
            const publicHost = hostHeader.split(':')[0];
            const rewrittenCookies = [];
            const duplicated = [];
            setCookieHeader.forEach((c) => {
              let v = c
                .replace(/;\s*Path=\/auth\b/i, `; Path=/proxy${storedWithSlash}/auth`)
                .replace(/;\s*Path=\/owa\b/i, `; Path=/proxy${storedWithSlash}/owa`)
                .replace(/;\s*Path=\/ecp\b/i, `; Path=/proxy${storedWithSlash}/ecp`)
                .replace(/;\s*Path=\/ews\b/i, `; Path=/proxy${storedWithSlash}/ews`)
                .replace(/;\s*Path=\/oab\b/i, `; Path=/proxy${storedWithSlash}/oab`)
                .replace(/;\s*Path=\/autodiscover\b/i, `; Path=/proxy${storedWithSlash}/autodiscover`)
                .replace(/;\s*Path=\/mapi\b/i, `; Path=/proxy${storedWithSlash}/mapi`)
                .replace(/;\s*Path=\/Microsoft-Server-ActiveSync\b/i, `; Path=/proxy${storedWithSlash}/Microsoft-Server-ActiveSync`)
                .replace(/;\s*Path=\/(?!proxy\b)/i, `; Path=/proxy${storedWithSlash}/`);
              if (publicHost) {
                v = v.replace(/;\s*Domain=[^;]+/i, `; Domain=${publicHost}`);
              } else {
                v = v.replace(/;\s*Domain=[^;]+/i, '');
              }
              rewrittenCookies.push(v);
              // 如果是 OWA 路径的 Cookie，则复制一份给根与 ECP，避免 ECP 看不到登录态导致重定向循环
              const owaPathToken = `; Path=/proxy${storedWithSlash}/owa`;
              if (v.toLowerCase().includes(owaPathToken.toLowerCase())) {
                const dupRoot = v.replace(/;\s*Path=\/proxy[^;]*/i, `; Path=/proxy${storedWithSlash}/`);
                const dupEcp = v.replace(/;\s*Path=\/proxy[^;]*/i, `; Path=/proxy${storedWithSlash}/ecp`);
                duplicated.push(dupRoot, dupEcp);
              }
              // 如果是 ECP 路径的 Cookie，同样复制一份给根与 OWA，避免不同目录间状态不同步
              const ecpPathToken = `; Path=/proxy${storedWithSlash}/ecp`;
              if (v.toLowerCase().includes(ecpPathToken.toLowerCase())) {
                const dupRoot = v.replace(/;\s*Path=\/proxy[^;]*/i, `; Path=/proxy${storedWithSlash}/`);
                const dupOwa = v.replace(/;\s*Path=\/proxy[^;]*/i, `; Path=/proxy${storedWithSlash}/owa`);
                duplicated.push(dupRoot, dupOwa);
              }
            });
            headers['set-cookie'] = duplicated.length > 0 ? rewrittenCookies.concat(duplicated) : rewrittenCookies;
            if (duplicated.length > 0) {
              console.log('Duplicated OWA cookies for ECP and root paths under /proxy', { count: duplicated.length });
            }
          }
        } catch (e) {
          console.warn('Set-Cookie path/domain rewrite failed:', e?.message || e);
        }

        // 重写 CSP 头中的内部域与根路径，避免资源被策略阻止
        try {
          const cspHeader = headers['content-security-policy'] || headers['Content-Security-Policy'];
          if (cspHeader) {
            const internal = new URL(application.internal_url);
            const internalOrigin = `${internal.protocol}//${internal.host}`;
            const host = req.get('host');
            const stored = application.external_path || '';
            const storedWithSlash = stored.startsWith('/') ? stored : `/${stored}`;
            const externalBase = `https://${host}/proxy${storedWithSlash}`;
            let newCsp = cspHeader
              .replace(new RegExp(internalOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), externalBase)
              .replace(/\/owa\//gi, `/proxy${storedWithSlash}/owa/`)
              .replace(/\/ecp\//gi, `/proxy${storedWithSlash}/ecp/`);
            headers['content-security-policy'] = newCsp;
          }
        } catch (e) {
          console.warn('CSP rewrite failed:', e?.message || e);
        }

        // 3xx 重定向处理（重写Location）
        if (statusCode >= 300 && statusCode < 400) {
          const stored = application.external_path || '';
          const storedWithSlash = stored.startsWith('/') ? stored : `/${stored}`;
          const internalUrl = new URL(application.internal_url);
          const host = req.get('host');
          const proxyBase = `https://${host}/proxy${storedWithSlash}`;
          const loc = headers['location'];
          if (loc) {
            try {
              console.log('Redirect before rewrite:', loc);
              // 1) 先处理相对路径或 /auth* 的特殊情况
              if (loc.startsWith('/auth.owa')) {
                headers['location'] = `${proxyBase}/owa/auth.owa`;
              } else if (loc.startsWith('/auth/')) {
                headers['location'] = `${proxyBase}/owa${loc}`;
              } else {
                const locationUrl = new URL(loc, application.internal_url);
                const outIsReserved = /^(\/)(owa|ecp|ews|oab|autodiscover|mapi|microsoft-server-activesync)(\/|$)/i.test(locationUrl.pathname || '');
                // 2) 若目标是上述虚拟目录之一，则无论主机名如何，均重写到 /proxy/{app}
                if (outIsReserved) {
                  let outPath = locationUrl.pathname || '/';
                  if (outPath === '/auth.owa') outPath = '/owa/auth.owa';
                  else if (outPath.startsWith('/auth/')) outPath = `/owa${outPath}`;
                  headers['location'] = proxyBase + outPath + (locationUrl.search || '') + (locationUrl.hash || '');
                } else if (locationUrl.hostname === internalUrl.hostname) {
                  // 3) 否则保持原逻辑：仅当主机名为内网主机时进行重写
                  let outPath = locationUrl.pathname || '/';
                  if (outPath === '/auth.owa') outPath = '/owa/auth.owa';
                  else if (outPath.startsWith('/auth/')) outPath = `/owa${outPath}`;
                  headers['location'] = proxyBase + outPath + (locationUrl.search || '') + (locationUrl.hash || '');
                } else {
                  // 4) 兜底：若是绝对URL且包含上述虚拟目录，正则替换为 /proxy/{app}
                  try {
                    const replaced = loc.replace(/^(https?:)\/\/[^\/]+\/(owa|ecp|ews|oab|autodiscover|mapi|microsoft-server-activesync)\b/i, (_m, proto, vdir) => {
                      return `https://${host}/proxy${storedWithSlash}/${vdir}`;
                    });
                    headers['location'] = replaced;
                  } catch (_) {}
                }
              }
              // 补丁：如果Location中的 url= 参数被改写成外部 /proxy 路径，则恢复为内网主机
              try {
                const internalOrigin = `${internalUrl.protocol}//${internalUrl.host}`;
                const hostOnly = (host || '').split(':')[0].toLowerCase();
                const fixed = new URL(headers['location']);
                const rawParam = fixed.searchParams.get('url');
                if (rawParam) {
                  try {
                    const decoded = decodeURIComponent(rawParam);
                    const parsed = new URL(decoded, `https://${hostOnly}`);
                    const proxyPrefix = `/proxy${storedWithSlash}`;
                    if (parsed.hostname.toLowerCase() === hostOnly && parsed.pathname.toLowerCase().startsWith(proxyPrefix.toLowerCase() + '/')) {
                      const mapped = `${internalOrigin}${parsed.pathname.substring(proxyPrefix.length)}${parsed.search || ''}${parsed.hash || ''}`;
                      fixed.searchParams.set('url', encodeURIComponent(mapped));
                      headers['location'] = fixed.toString();
                    }
                  } catch (_) {}
                }
              } catch (_) {}
              console.log('Redirect after rewrite:', headers['location']);
            } catch (e) {
              console.warn('Redirect rewrite failed:', e.message);
            }
          }
          // 写回头部并结束
          res.statusCode = statusCode;
          Object.keys(headers).forEach(h => {
            if (h.toLowerCase() !== 'content-length') res.setHeader(h, headers[h]);
          });
          return res.end();
        }
        // 非重定向响应，针对 ECP/OWA 关键路径输出轻量日志
        try {
          const urlForLog = req.url || '';
          if (/\/proxy\/.+\/(owa|ecp)(\/|\?|$)/i.test(urlForLog)) {
            console.log(`⬅️  ${statusCode} ${urlForLog}`);
          }
        } catch (_) {}

        // 正文处理与内容重写
        let bodyBuffer;
        const contentType = (headers['content-type'] || '').toString();
        const shouldRewrite = !skipRewrite && /text\/html|application\/javascript|text\/javascript|text\/css|application\/json|application\/xml|text\/xml|application\/soap\+xml/i.test(contentType);

        if (shouldRewrite && chunks.length > 0) {
          bodyBuffer = Buffer.concat(chunks);
          // 确定内部与外部基址
          try {
            const internal = new URL(application.internal_url);
            const internalOrigin = `${internal.protocol}//${internal.host}`; // e.g. https://172.16.0.118
            const internalOriginRe = new RegExp(internalOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            const encodedInternalOrigin = encodeURIComponent(internalOrigin);
            const encodedInternalOriginRe = new RegExp(encodedInternalOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
            const host = req.get('host');
            const stored = application.external_path || '';
            const storedWithSlash = stored.startsWith('/') ? stored : `/${stored}`;
            const externalBase = `https://${host}/proxy${storedWithSlash}`;
            const encodedExternalBase = encodeURIComponent(externalBase);

            let text = bodyBuffer.toString('utf8');
            // 1) 替换绝对内网 Origin 为外部 /proxy 基址
            text = text.replace(internalOriginRe, externalBase);
            // 1.1) 替换协议相对的内网主机 //host/... 为外部 /proxy 基址
            try {
              const internalHost = internal.host; // e.g. 172.16.0.118
              const protoRelativeRe = new RegExp(`(?:https?:)?\/\/${internalHost.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\b`, 'gi');
              text = text.replace(protoRelativeRe, externalBase);
            } catch (_) {}
            // 2) 替换编码后的内网 Origin（如 ?url=https%3a%2f%2f172...）
            text = text.replace(encodedInternalOriginRe, encodedExternalBase);
            // 2.1) 替换 JSON 转义形式的内网 Origin（如 https:\/\/172.16.0.118）
            try {
              const internalOriginEscaped = (`${internalOrigin}`).replace(/\//g, '\\/');
              const escapedRe = new RegExp(internalOriginEscaped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
              const externalBaseEscaped = (`${externalBase}`).replace(/\//g, '\\/');
              text = text.replace(escapedRe, externalBaseEscaped);
            } catch (_) {}
            // 3) 重写绝对根路径 /owa/* 为 /proxy/{app}/owa/*
            text = text.replace(/(["'=])\/owa\//gi, `$1/proxy${storedWithSlash}/owa/`);
            // 4) 重写绝对根路径 /ecp/* 为 /proxy/{app}/ecp/*
            text = text.replace(/(["'=])\/ecp\//gi, `$1/proxy${storedWithSlash}/ecp/`);
            // 5) 重写绝对根路径 /ews/* 为 /proxy/{app}/ews/*
            text = text.replace(/(["'=])\/ews\//gi, `$1/proxy${storedWithSlash}/ews/`);
            // 5.1) 重写绝对根路径 /Microsoft-Server-ActiveSync/* 为 /proxy/{app}/Microsoft-Server-ActiveSync/*
            text = text.replace(/(["'=])\/Microsoft-Server-ActiveSync\//gi, `$1/proxy${storedWithSlash}/Microsoft-Server-ActiveSync/`);
            // 6) 重写其他常见 Exchange 目录
            text = text.replace(/(["'=])\/(oab|autodiscover|mapi|Microsoft-Server-ActiveSync)\//gi, `$1/proxy${storedWithSlash}/$2/`);
            // 7) 重写 ECP 依赖目录 /DDI/* 与字体目录 /fonts/* 到 /proxy/{app}/ecp/...
            text = text.replace(/(["'=])\/DDI\//gi, `$1/proxy${storedWithSlash}/ecp/DDI/`);
            text = text.replace(/(["']=)\/fonts\//gi, `$1/proxy${storedWithSlash}/ecp/fonts/`);
            // 8) 处理 CSS 内的 url() 绝对路径（可能不带引号）
            text = text.replace(/url\(\s*\/(owa|ecp|ews|oab|autodiscover|mapi|Microsoft-Server-ActiveSync)\//gi, `url(/proxy${storedWithSlash}/$1/`);
            text = text.replace(/url\(\s*\/(DDI|fonts)\//gi, `url(/proxy${storedWithSlash}/ecp/$1/`);
            // 8.0) 处理相对字体路径，标准化到 /proxy/{app}/ecp/fonts/
            text = text.replace(/url\(\s*['"]?\.\.\/fonts\//gi, `url(/proxy${storedWithSlash}/ecp/fonts/`);
            text = text.replace(/url\(\s*['"]?fonts\//gi, `url(/proxy${storedWithSlash}/ecp/fonts/`);
            // 8.1) 兜底：将已生成的 /proxy/{app}/DDI 与 /proxy/{app}/fonts 规范化为 /proxy/{app}/ecp/...
            try {
              const escapedStored = storedWithSlash.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
              text = text.replace(new RegExp(`/proxy${escapedStored}/DDI/`, 'g'), `/proxy${storedWithSlash}/ecp/DDI/`);
              text = text.replace(new RegExp(`/proxy${escapedStored}/fonts/`, 'g'), `/proxy${storedWithSlash}/ecp/fonts/`);
            } catch (_) {}
            // 9) 矫正 HTML 内的 url=/destination= 参数：如果被改写成外部 /proxy 路径，则恢复为内网主机 + 原虚拟目录
            try {
              const internalOrigin = `${internal.protocol}//${internal.host}`;
              const hostOnly = (host || '').split(':')[0].toLowerCase();
              const proxyPrefix = `/proxy${storedWithSlash}`;
              const patchParam = (input, paramName) => {
                const re = new RegExp(`([?&]${paramName}=)([^&#"']+)`, 'gi');
                return input.replace(re, (match, p1, p2) => {
                  try {
                    const decoded = decodeURIComponent(p2);
                    const parsed = new URL(decoded, `https://${hostOnly}`);
                    if (parsed.hostname.toLowerCase() === hostOnly && parsed.pathname.toLowerCase().startsWith(proxyPrefix.toLowerCase() + '/')) {
                      const mapped = `${internalOrigin}${parsed.pathname.substring(proxyPrefix.length)}${parsed.search || ''}${parsed.hash || ''}`;
                      return `${p1}${encodeURIComponent(mapped)}`;
                    }
                  } catch (_) {}
                  return match;
                });
              };
              text = patchParam(text, 'url');
              text = patchParam(text, 'destination');
            } catch (_) {}
 
            bodyBuffer = Buffer.from(text, 'utf8');
            // 删除压缩头，重设长度
            delete headers['content-encoding'];
            headers['content-length'] = Buffer.byteLength(bodyBuffer);
          } catch (e) {
            console.warn('Body rewrite failed:', e?.message || e);
          }
        } else {
          // 跳过重写，直接透传（未缓存chunks时将不设置content-length）
          try {
            if (!skipRewrite && chunks.length > 0) {
              bodyBuffer = Buffer.concat(chunks);
              headers['content-length'] = Buffer.byteLength(bodyBuffer);
            }
          } catch (e) {}
        }

        // 回写响应
        res.statusCode = statusCode;
        Object.keys(headers).forEach(h => {
          if (h.toLowerCase() !== 'content-length') res.setHeader(h, headers[h]);
        });
        if (headers['content-length'] !== undefined) {
          res.setHeader('content-length', headers['content-length']);
        }
        return bodyBuffer ? res.end(bodyBuffer) : proxyRes.pipe(res);
      });
    },
    
    onError: (err, req, res) => {
      console.error('代理请求失败:', err.message);
      console.error('错误代码:', err.code);
      
      const userAgent = req.headers['user-agent'] || '';
      const isMobile = /Mobile|Android|iPhone|iPad|Safari/i.test(userAgent);
      const isEdge = userAgent.toLowerCase().includes('edge') || userAgent.toLowerCase().includes('edg/');
      
      if (!res.headersSent) {
        if (isMobile || isEdge) {
          res.status(502).send(`
            <!DOCTYPE html>
            <html lang="zh-CN">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>连接问题</title>
              <style>
                body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; 
                       text-align: center; padding: 50px 20px; background: #f5f5f5; }
                .container { background: white; padding: 30px; border-radius: 10px; 
                            max-width: 400px; margin: 0 auto; }
                h1 { color: #e74c3c; margin-bottom: 20px; }
                button { background: #3498db; color: white; border: none; 
                        padding: 12px 24px; border-radius: 5px; 
                        cursor: pointer; width: 100%; margin: 5px 0; }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>📱 连接问题</h1>
                <p>网络连接中断，正在尝试恢复</p>
                <button onclick="location.reload()">重新连接</button>
                <button onclick="window.location.href='/proxy/test2'">返回应用</button>
                <p style="font-size: 12px; color: #999; margin-top: 20px;">
                  错误: ${err.message}<br>
                  浏览器: ${isEdge ? 'Edge' : isMobile ? 'Mobile' : 'Other'}
                </p>
              </div>
              <script>
                setTimeout(() => {
                  console.log('自动重试连接');
                  location.reload();
                }, 3000);
              </script>
            </body>
            </html>
          `);
        } else {
          res.status(502).json({
            message: '代理服务暂时不可用',
            error: err.message,
            code: err.code
          });
        }
      }
    }
  });
};

// 主代理路由处理
router.use('/*', (req, res, next) => {
  const originalUrl = req.originalUrl || req.url;
  const requestPath = req.path || '/';
  
  console.log('Original URL:', originalUrl);
  console.log('Request path:', requestPath);
  
  // 提取应用路径
  const match = originalUrl.match(/^\/proxy(\/[^\/]+)/);
  if (!match) {
    return res.status(404).json({ message: '无效的代理路径' });
  }
  
  let appPath = match[1];
  console.log('Extracted app path:', appPath);
  
  // 当访问 /proxy/{reserved}/...（如 /proxy/fonts 或 /proxy/DDI）时，使用最近的应用或默认应用作为上游
  try {
    const lower = (appPath || '').toLowerCase().replace(/^\//,'');
          const reserved = ['owa','ecp','ews','oab','autodiscover','mapi','microsoft-server-activesync','ddi','fonts'];
    if (reserved.includes(lower)) {
      const cookieHeader = req.headers.cookie || '';
      const cookies = Object.fromEntries((cookieHeader || '').split(';').map(c => c.trim().split('=')));
      let lastProxyPath = cookies['last_proxy_path'] ? decodeURIComponent(cookies['last_proxy_path']) : '';
      if (!lastProxyPath) {
        const def = process.env.DEFAULT_PROXY_APP_PATH || '';
        if (def) lastProxyPath = def.startsWith('/') ? def : `/${def}`;
      }
      if (lastProxyPath) {
        console.log('Reserved segment access. Using fallback application:', lastProxyPath, 'for segment:', appPath);
        // 如果是 /proxy/fonts 或 /proxy/DDI，直接 302 跳转到 /proxy/{app}/ecp/...，让浏览器携带对应应用路径下的 Cookie
        if (lower === 'fonts' || lower === 'ddi') {
          const normalizedLast = lastProxyPath.startsWith('/') ? lastProxyPath : `/${lastProxyPath}`;
          const rest = (originalUrl || '').replace(/^\/proxy\/[^\/]+/i, '');
          const redirectTo = `/proxy${normalizedLast}/ecp${rest}`;
          console.log('Reserved segment redirecting to app-scoped path:', redirectTo);
          return res.redirect(302, redirectTo);
        }
        appPath = lastProxyPath;
      } else {
        console.warn('Reserved segment access but no fallback app found.');
      }
    }
  } catch (e) {
    console.warn('Reserved segment fallback failed:', e?.message || e);
  }
  
  const db = getDB();
  const candidates = [appPath, appPath.substring(1)];
  console.log('Path candidates for lookup:', candidates);
  
  db.get(
    `SELECT * FROM applications WHERE external_path IN (${candidates.map(() => '?').join(',')}) LIMIT 1`,
    candidates,
    (err, application) => {
      if (err) {
        console.error('Database error:', err);
        return res.status(500).json({ message: '数据库查询失败' });
      }
      
      if (!application) {
        console.log('Application not found for path candidates:', candidates);
        return res.status(404).json({ 
          message: '未找到对应的应用配置',
          path: appPath
        });
      }
      
      console.log('Found application:', application.name);
      
      // 检查认证
      const userAgent = req.headers['user-agent'] || '';
      const xffHeader = req.headers['x-forwarded-for'];
      const xRealIp = req.headers['x-real-ip'];
      const observedClientIp = (req.networkInfo && req.networkInfo.ip) || req.ip;
      
      console.log('Client IP detection:', {
        headers: { 'x-forwarded-for': xffHeader, 'x-real-ip': xRealIp },
        connection: req.connection?.remoteAddress,
        detected_ip: observedClientIp,
        is_internal: req.networkInfo ? req.networkInfo.isInternal : undefined
      });
      
      // 🔧 统一依据中间件判定的内外网信息
      let requiresAuth = false;
      const isInternalClient = req.networkInfo && req.networkInfo.isInternal === true;
      const isExternalAccess = !isInternalClient;
      
      const directExcludedIps = application.direct_excluded_ips || '';
      let isIpExcluded = false;
      
      if (isExternalAccess) {
        requiresAuth = true; // 外网访问统一要求认证
        console.log('External access (by networkInfo), require auth');
      } else {
        const allowDirect = application.allow_internal_direct === 1 || application.allow_internal_direct === true;
        const requireMfa = application.require_mfa === 1 || application.require_mfa === true;
        isIpExcluded = isIpInExcludeList(observedClientIp, directExcludedIps);

        if (allowDirect && !requireMfa && !isIpExcluded) {
          requiresAuth = false; // 内网直连允许且不强制MFA，且来源IP未在排除列表
          console.log('Internal access with direct allowed, skip auth');
        } else {
          requiresAuth = true; // 内网但应用要求MFA/禁直连/命中排除列表
          console.log('Internal access but policy requires auth (MFA/direct disabled/excluded IP)');
        }
      }
       
      console.log('Network info:', {
        observedClientIp,
        xffHeader,
        publicFromXff: undefined,
        isFromExternalGateway: undefined,
        isExternalAccess,
        isInternalClient,
        requiresAuth,
        appRequireMfa: application.require_mfa,
        appAllowDirect: application.allow_internal_direct,
        directExcludedIps: application.direct_excluded_ips,
        isIpExcluded: (application.direct_excluded_ips ? isIpExcluded : false)
      });
      
      const applyProxy = () => {
        // 创建并应用代理中间件（带缓存，避免重复创建造成监听器警告）
        const cacheKey = application.id || application.external_path || application.internal_url;
        let proxyMiddleware = proxyCache.get(cacheKey);
        if (!proxyMiddleware) {
          proxyMiddleware = createSimpleProxyMiddleware(application);
          proxyCache.set(cacheKey, proxyMiddleware);
        }
        proxyMiddleware(req, res, next);
      };
      
      if (requiresAuth) {
         // 仅对顶级HTML导航进行跳转；对子资源/XHR返回401提示前端完成顶级MFA
         const acceptHeader = (req.headers['accept'] || '').toLowerCase();
         const secFetchMode = (req.headers['sec-fetch-mode'] || '').toLowerCase();
         const secFetchDest = (req.headers['sec-fetch-dest'] || '').toLowerCase();
         const xRequestedWith = (req.headers['x-requested-with'] || '').toLowerCase();
         const hasUpgradeHeader = typeof req.headers['upgrade-insecure-requests'] !== 'undefined';
                   // 顶级导航需同时满足 navigate + document，排除 iframe 等嵌入式导航；移除 Accept+UIR 回退以避免误判
          const isTopLevelHtmlNavigation = (
            (secFetchMode === 'navigate' && secFetchDest === 'document')
          ) && xRequestedWith !== 'xmlhttprequest';

          // 对 Exchange 关键端点（EWS/Autodiscover/MAPI/OAB）放行到上游，以便浏览器处理 WWW-Authenticate 弹窗
          try {
            const originalUrlForAuth = (req.originalUrl || req.url || '').toLowerCase();
            const isExchangeAuthEndpoint = /^\/proxy\/[^\/]+\/(ews\/exchange\.asmx|autodiscover\/autodiscover\.xml|mapi\/|oab\/|microsoft-server-activesync\b)/i.test(originalUrlForAuth);
            if (isExchangeAuthEndpoint) {
              console.log('Pass-through Exchange auth challenge endpoint:', originalUrlForAuth);
              return applyProxy();
            }
          } catch (_) {}

         // 检查token
         const authHeader = req.headers['authorization'];
         const headerToken = authHeader && authHeader.split(' ')[1];
         
         let cookieToken = null;
         if (req.headers.cookie) {
           const cookies = req.headers.cookie.split(';');
           const cookieNames = ['auth_token', 'wechat_auth', 'auth_backup', 'safari_compat_token'];
           for (let cookie of cookies) {
             const [name, value] = cookie.trim().split('=');
             if (cookieNames.includes(name) && value) {
               cookieToken = value;
               console.log(`🔍 使用Cookie: ${name}`);
               break;
             }
           }
         }
         
         const token = headerToken || cookieToken;
         console.log('Auth header:', authHeader ? 'present' : 'missing');
         console.log('Cookie token:', cookieToken ? 'present' : 'missing');
         console.log('Final token:', token ? 'present' : 'missing');
         
         if (!token) {
           // 无令牌：根据应用的认证方式进行重定向
           const methodId = application.auth_method_id;
           return getDB().get(
             'SELECT type FROM auth_methods WHERE id = ? LIMIT 1',
             [methodId],
             (methodErr, methodRow) => {
               if (methodErr) {
                 console.warn('读取认证方式失败，回退到登录:', methodErr.message);
                 const target = `/login?redirect=${encodeURIComponent(originalUrl)}`;
                 if (!isTopLevelHtmlNavigation) {
                   res.status(401);
                   res.setHeader('X-MFA-Required', '1');
                   res.setHeader('X-MFA-Redirect', target);
                   return res.send('MFA_REQUIRED');
                 }
                 return res.redirect(target);
               }
               const methodType = methodRow && methodRow.type;
               console.log('Auth redirect (no token):', { methodType, app: application.name, appId: application.id });
               if (methodType === 'wechat_push') {
                 const target = `/wechat-code?redirect=${encodeURIComponent(originalUrl)}&app=${encodeURIComponent(application.name || '')}`;
                 if (!isTopLevelHtmlNavigation) {
                   res.status(401);
                   res.setHeader('X-MFA-Required', '1');
                   res.setHeader('X-MFA-Redirect', target);
                   return res.send('MFA_REQUIRED');
                 }
                 return res.redirect(target);
               } else if (methodType === 'totp') {
                 const target = `/totp-code?redirect=${encodeURIComponent(originalUrl)}&app=${encodeURIComponent(application.name || '')}`;
                 if (!isTopLevelHtmlNavigation) {
                   res.status(401);
                   res.setHeader('X-MFA-Required', '1');
                   res.setHeader('X-MFA-Redirect', target);
                   return res.send('MFA_REQUIRED');
                 }
                 return res.redirect(target);
               } else if (methodType === 'wechat_qr') {
                 const target = `/api/wechat/auth?redirect=${encodeURIComponent(originalUrl)}`;
                 if (!isTopLevelHtmlNavigation) {
                   res.status(401);
                   res.setHeader('X-MFA-Required', '1');
                   res.setHeader('X-MFA-Redirect', target);
                   return res.send('MFA_REQUIRED');
                 }
                 return res.redirect(target);
               } else {
                 const target = `/login?redirect=${encodeURIComponent(originalUrl)}`;
                 if (!isTopLevelHtmlNavigation) {
                   res.status(401);
                   res.setHeader('X-MFA-Required', '1');
                   res.setHeader('X-MFA-Redirect', target);
                   return res.send('MFA_REQUIRED');
                 }
                 return res.redirect(target);
               }
             }
           );
         }
         
         // 验证 token
         verifyToken(token, (verifyErr, decoded) => {
           if (verifyErr || !decoded) {
             console.warn('Token 验证失败：', verifyErr && verifyErr.message);
             const target = `/login?redirect=${encodeURIComponent(originalUrl)}`;
             if (!isTopLevelHtmlNavigation) {
               res.status(401);
               res.setHeader('X-MFA-Required', '1');
               res.setHeader('X-MFA-Redirect', target);
               return res.send('MFA_REQUIRED');
             }
             return res.redirect(target);
           }

           // 注入用户信息
           req.user = {
             id: decoded.id,
             username: decoded.username,
             roles: decoded.roles || []
           };
           console.log('User verified, applying proxy for application:', application.name || application.id);
           return applyProxy();
         });
       } else {
         console.log('No auth required, applying proxy');
         return applyProxy();
       }
     }
   );
});

module.exports = router; 