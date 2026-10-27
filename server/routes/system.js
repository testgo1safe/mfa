const express = require('express');
const { getDB } = require('../config/database');
const { requireAdmin } = require('../middleware/auth');
const axios = require('axios');

const router = express.Router();

// 获取系统配置（仅管理员）
router.get('/config', requireAdmin, (req, res) => {
  // 返回系统配置（敏感信息需要脱敏）
  const config = {
    wechat_corp_id: process.env.WECHAT_CORP_ID || '',
    wechat_agent_id: process.env.WECHAT_AGENT_ID || '',
    wechat_secret: process.env.WECHAT_SECRET ? '***' : '', // 脱敏
    wechat_redirect_uri: process.env.WECHAT_REDIRECT_URI || '',
    jwt_expires_in: process.env.JWT_EXPIRES_IN || '24h',
    session_timeout: parseInt(process.env.SESSION_TIMEOUT || '30'),
    max_login_attempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5'),
    lockout_duration: parseInt(process.env.LOCKOUT_DURATION || '15'),
    password_min_length: parseInt(process.env.PASSWORD_MIN_LENGTH || '6'),
    password_require_special: process.env.PASSWORD_REQUIRE_SPECIAL === 'true',
    mfa_required_for_admin: process.env.MFA_REQUIRED_FOR_ADMIN === 'true',
    internal_ip_ranges: process.env.INTERNAL_IP_RANGES || '192.168.0.0/16,10.0.0.0/8,172.16.0.0/12',
    external_access_enabled: process.env.EXTERNAL_ACCESS_ENABLED !== 'false',
    audit_log_retention: parseInt(process.env.AUDIT_LOG_RETENTION || '90'),
  };
  
  res.json(config);
});

// 更新企业微信配置（仅管理员）
router.put('/wechat-config', requireAdmin, (req, res) => {
  const { wechat_corp_id, wechat_agent_id, wechat_secret, wechat_redirect_uri } = req.body;
  
  if (!wechat_corp_id || !wechat_agent_id || !wechat_secret) {
    return res.status(400).json({ message: '企业微信配置信息不完整' });
  }
  
  // 注意：在实际生产环境中，这些配置应该写入配置文件或数据库
  // 这里只是演示，实际上环境变量在运行时不能直接修改
  
  // TODO: 实现配置持久化逻辑
  // 可以考虑将配置存储到数据库的system_config表中
  
  res.json({ 
    message: '企业微信配置更新成功',
    note: '配置将在下次重启后生效'
  });
});

// 测试企业微信连接（仅管理员）
router.post('/test-wechat', requireAdmin, async (req, res) => {
  const { wechat_corp_id, wechat_secret } = req.body;
  
  if (!wechat_corp_id || !wechat_secret) {
    return res.status(400).json({ message: '企业微信配置信息不完整' });
  }
  
  try {
    // 测试获取企业微信access_token
    const response = await axios.get('https://qyapi.weixin.qq.com/cgi-bin/gettoken', {
      params: {
        corpid: wechat_corp_id,
        corpsecret: wechat_secret
      },
      timeout: 10000
    });
    
    if (response.data.errcode === 0) {
      res.json({ 
        success: true,
        message: '企业微信连接测试成功',
        access_token: response.data.access_token ? '***' : null
      });
    } else {
      res.status(400).json({ 
        success: false,
        message: `企业微信连接失败: ${response.data.errmsg}`,
        errcode: response.data.errcode
      });
    }
  } catch (error) {
    console.error('Test WeChat connection error:', error);
    res.status(500).json({ 
      success: false,
      message: '网络连接失败，请检查网络环境'
    });
  }
});

// 更新安全策略（仅管理员）
router.put('/security-policy', requireAdmin, (req, res) => {
  const {
    password_min_length,
    password_require_special,
    max_login_attempts,
    lockout_duration,
    session_timeout,
    mfa_required_for_admin,
    internal_ip_ranges,
    external_access_enabled
  } = req.body;
  
  // 验证参数
  if (password_min_length < 6 || password_min_length > 20) {
    return res.status(400).json({ message: '密码长度必须在6-20位之间' });
  }
  
  if (max_login_attempts < 3 || max_login_attempts > 10) {
    return res.status(400).json({ message: '最大登录尝试次数必须在3-10次之间' });
  }
  
  if (lockout_duration < 5 || lockout_duration > 60) {
    return res.status(400).json({ message: '锁定时长必须在5-60分钟之间' });
  }
  
  if (session_timeout < 15 || session_timeout > 480) {
    return res.status(400).json({ message: '会话超时时间必须在15-480分钟之间' });
  }
  
  // TODO: 实现配置持久化逻辑
  // 将安全策略保存到数据库或配置文件
  
  res.json({ 
    message: '安全策略更新成功',
    note: '部分配置将在下次重启后生效'
  });
});

// 更新系统参数（仅管理员）
router.put('/params', requireAdmin, (req, res) => {
  const {
    jwt_expires_in,
    audit_log_retention
  } = req.body;
  
  // 验证参数
  const validJwtExpires = ['1h', '8h', '24h', '7d', '30d'];
  if (!validJwtExpires.includes(jwt_expires_in)) {
    return res.status(400).json({ message: '无效的JWT有效期设置' });
  }
  
  if (audit_log_retention < 30 || audit_log_retention > 365) {
    return res.status(400).json({ message: '日志保留天数必须在30-365天之间' });
  }
  
  // TODO: 实现配置持久化逻辑
  
  res.json({ 
    message: '系统参数更新成功',
    note: '配置将在下次重启后生效'
  });
});

// 获取系统状态（仅管理员）
router.get('/status', requireAdmin, (req, res) => {
  const db = getDB();
  
  // 获取系统运行状态信息
  const queries = [
    // 数据库状态
    new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as userCount FROM users', (err, result) => {
        if (err) reject(err);
        else resolve({ type: 'database', status: 'healthy', userCount: result.userCount });
      });
    }),
    
    // 系统信息
    new Promise((resolve) => {
      resolve({
        type: 'system',
        status: 'healthy',
        nodeVersion: process.version,
        platform: process.platform,
        uptime: process.uptime(),
        memory: process.memoryUsage()
      });
    })
  ];
  
  Promise.all(queries)
    .then(([dbStatus, systemStatus]) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        components: [dbStatus, systemStatus]
      });
    })
    .catch(err => {
      console.error('Get system status error:', err);
      res.status(500).json({ 
        status: 'unhealthy',
        message: '系统状态检查失败',
        timestamp: new Date().toISOString()
      });
    });
});

// 系统维护操作（仅管理员）
router.post('/maintenance', requireAdmin, (req, res) => {
  const { action } = req.body;
  
  switch (action) {
    case 'clear_cache':
      // 清理缓存逻辑
      res.json({ message: '缓存清理完成' });
      break;
      
    case 'optimize_db':
      // 数据库优化逻辑
      const db = getDB();
      db.run('VACUUM', (err) => {
        if (err) {
          console.error('Database optimization error:', err);
          return res.status(500).json({ message: '数据库优化失败' });
        }
        res.json({ message: '数据库优化完成' });
      });
      break;
      
    case 'restart_required':
      res.json({ 
        message: '重启标记已设置',
        note: '请通过系统管理工具重启应用'
      });
      break;
      
    default:
      res.status(400).json({ message: '不支持的维护操作' });
  }
});

module.exports = router; 