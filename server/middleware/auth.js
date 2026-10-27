const jwt = require('jsonwebtoken');
const { getDB } = require('../config/database');

// JWT验证中间件
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];

  // 回退：从Cookie中获取auth_token
  if (!token && req.headers.cookie) {
    try {
      const cookies = req.headers.cookie.split(';');
      for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'auth_token' && value) {
          token = value;
          break;
        }
      }
    } catch (e) {
      // 忽略解析错误，继续按无token处理
    }
  }

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// 管理员权限验证中间件
const requireAdmin = (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
};

// IP地址验证中间件（用于判断内外网访问）
const checkNetworkAccess = (req, res, next) => {
  // 优先获取真实客户端IP
  let clientIP = req.headers['x-forwarded-for'] || 
                req.headers['x-real-ip'] || 
                req.connection.remoteAddress || 
                req.socket.remoteAddress ||
                req.ip;

  // 如果x-forwarded-for包含多个IP，取第一个
  if (clientIP && clientIP.includes(',')) {
    clientIP = clientIP.split(',')[0].trim();
  }

  const isInternal = isInternalIP(clientIP);

  // 识别来自外部网关的回源流量：如果remote是内网但x-forwarded-for首IP位于EXTERNAL_GATEWAY_IPS，则视为外网
  let treatedAsExternalByGateway = false;
  try {
    const xff = req.headers['x-forwarded-for'] || '';
    const firstForwarded = (xff || '').split(',')[0].trim();
    const gatewayCidrs = (process.env.EXTERNAL_GATEWAY_IPS || '').split(',').map(s => s.trim()).filter(Boolean);
    if (firstForwarded && gatewayCidrs.length > 0) {
      for (const gw of gatewayCidrs) {
        if (isIPInRange(firstForwarded.replace(/^::ffff:/, ''), gw)) {
          treatedAsExternalByGateway = true;
          break;
        }
      }
    }
  } catch (e) {}
  
  const finalIsInternal = isInternal && !treatedAsExternalByGateway;
  
  req.networkInfo = {
    ip: clientIP,
    isInternal: finalIsInternal,
    accessType: finalIsInternal ? 'internal' : 'external',
    viaExternalGateway: treatedAsExternalByGateway
  };

  console.log('Client IP detection:', {
    headers: {
      'x-forwarded-for': req.headers['x-forwarded-for'],
      'x-real-ip': req.headers['x-real-ip']
    },
    connection: req.connection?.remoteAddress,
    detected_ip: clientIP,
    is_internal: finalIsInternal,
    via_external_gateway: treatedAsExternalByGateway
  });

  // 记录访问日志
  logAccess(req);
  
  next();
};

// 判断是否为内网IP
const isInternalIP = (ip) => {
  if (!ip) return false;
  
  // 清理IPv6映射的IPv4地址
  const cleanIP = ip.replace(/^::ffff:/, '');
  
  // 内网IP段配置
  const internalRanges = (process.env.INTERNAL_IP_RANGES || '192.168.0.0/16,10.0.0.0/8,172.16.0.0/12').split(',');
  
  for (const range of internalRanges) {
    if (isIPInRange(cleanIP, range.trim())) {
      return true;
    }
  }
  
  // localhost
  if (cleanIP === '127.0.0.1' || cleanIP === '::1' || cleanIP === 'localhost') {
    return true;
  }
  
  return false;
};

// 检查IP是否在指定范围内
const isIPInRange = (ip, range) => {
  try {
    const [rangeIP, mask] = range.split('/');
    const ipNum = ipToNumber(ip);
    const rangeIPNum = ipToNumber(rangeIP);
    const maskNum = (0xffffffff << (32 - parseInt(mask))) >>> 0;
    
    return (ipNum & maskNum) === (rangeIPNum & maskNum);
  } catch (error) {
    console.error('Error checking IP range:', error);
    return false;
  }
};

// IP地址转换为数字
const ipToNumber = (ip) => {
  const parts = ip.split('.');
  return ((parseInt(parts[0]) << 24) | (parseInt(parts[1]) << 16) | (parseInt(parts[2]) << 8) | parseInt(parts[3])) >>> 0;
};

// 记录访问日志
const logAccess = (req) => {
  const db = getDB();
  const logData = {
    ip_address: req.networkInfo.ip,
    user_agent: req.headers['user-agent'] || '',
    access_type: req.networkInfo.accessType,
    created_at: new Date().toISOString()
  };

  if (req.user) {
    logData.user_id = req.user.id;
    logData.username = req.user.username;
  }

  const sql = `INSERT INTO access_logs (user_id, username, ip_address, user_agent, access_type, status, created_at)
               VALUES (?, ?, ?, ?, ?, 'success', ?)`;
  
  db.run(sql, [
    logData.user_id || null,
    logData.username || null,
    logData.ip_address,
    logData.user_agent,
    logData.access_type,
    logData.created_at
  ], (err) => {
    if (err) {
      console.error('Error logging access:', err);
    }
  });
};

// 企业微信外网访问验证中间件
const requireWechatAuth = (req, res, next) => {
  // 如果是内网访问，直接通过
  if (req.networkInfo && req.networkInfo.isInternal) {
    return next();
  }

  // 外网访问需要企业微信认证
  const wechatToken = req.headers['x-wechat-token'] || req.query.wechat_token;
  
  if (!wechatToken) {
    return res.status(401).json({ 
      message: 'WeChat authentication required for external access',
      redirectUrl: `/api/wechat/auth?redirect=${encodeURIComponent(req.originalUrl)}`
    });
  }

  // 验证企业微信token
  const db = getDB();
  db.get(
    `SELECT * FROM wechat_sessions WHERE session_token = ? AND expires_at > datetime('now')`,
    [wechatToken],
    (err, session) => {
      if (err || !session) {
        return res.status(401).json({ 
          message: 'Invalid or expired WeChat session',
          redirectUrl: `/api/wechat/auth?redirect=${encodeURIComponent(req.originalUrl)}`
        });
      }
      
      req.wechatSession = session;
      next();
    }
  );
};

module.exports = {
  authenticateToken,
  requireAdmin,
  checkNetworkAccess,
  requireWechatAuth,
  isInternalIP
}; 