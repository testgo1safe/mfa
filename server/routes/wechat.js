const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const { getDB } = require('../config/database');
const { checkNetworkAccess } = require('../middleware/auth');

const router = express.Router();
const isProd = process.env.NODE_ENV === 'production';

// 精确的企业微信环境识别函数
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
  
  if (!isProd) console.log('企业微信环境检查结果:', result);
  return result;
};

// 应用所有路由的网络访问检查
router.use(checkNetworkAccess);

// 直接重定向到企业微信授权（用于代理应用）
router.get('/auth', (req, res) => {
  const { redirect } = req.query;
  const state = crypto.randomBytes(16).toString('hex');
  
  // 将redirect信息编码到state中（简化版，无需session）
  const stateData = {
    timestamp: Date.now(),
    redirect: redirect || '/dashboard',
    random: state
  };
  const encodedState = Buffer.from(JSON.stringify(stateData)).toString('base64');

  // 获取企业微信配置
  const db = getDB();
  db.get(
    'SELECT config FROM auth_methods WHERE type = ? AND is_enabled = 1 LIMIT 1',
    ['wechat_qr'],
    (err, authMethod) => {
      if (err || !authMethod) {
        console.error('WeChat auth method not found:', err);
        return res.redirect(`/login?redirect=${encodeURIComponent(redirect || '/')}&error=wechat_not_configured`);
      }

      try {
        const raw = JSON.parse(authMethod.config || '{}');
        const corpId = raw.corp_id || process.env.WECHAT_CORP_ID;
        const agentId = raw.agent_id || process.env.WECHAT_AGENT_ID;
        let redirectUri = raw.redirect_uri || process.env.WECHAT_REDIRECT_URI;

        // 规范化 redirectUri，修复重复协议或缺失协议
        try {
          if (redirectUri && /^https?:\/\/https?:\/\//i.test(redirectUri)) {
            // 例如: https://https://domain/path -> https://domain/path
            redirectUri = redirectUri.replace(/^https?:\/\/https?:\/\//i, 'https://');
          }
          if (redirectUri && !/^https?:\/\//i.test(redirectUri)) {
            // 仅域名或路径 -> 补全协议
            redirectUri = `https://${redirectUri}`;
          }
          // 验证URL有效性
          new URL(redirectUri);
        } catch (e) {
          console.error('Invalid redirect_uri, fallback to env:', redirectUri, e?.message);
          if (process.env.WECHAT_REDIRECT_URI) {
            redirectUri = process.env.WECHAT_REDIRECT_URI;
          }
        }

        if (!corpId || !redirectUri) {
          console.error('WeChat QR config missing required fields:', { corpIdPresent: !!corpId, agentIdPresent: !!agentId, redirectUriPresent: !!redirectUri });
          return res.redirect(`/login?redirect=${encodeURIComponent(redirect || '/')}&error=wechat_config_missing`);
        }

        // 企业微信扫码登录URL（显示二维码）
        const authUrl = `https://open.work.weixin.qq.com/wwopen/sso/qrConnect?` +
          `appid=${corpId}&` +
          `agentid=${agentId || ''}&` +
          `redirect_uri=${encodeURIComponent(redirectUri)}&` +
          `state=${encodedState}`;

        if (!isProd) {
          console.log('Redirecting to WeChat Work QR auth URL:', {
            corpIdPresent: !!corpId,
            agentIdPresent: !!agentId,
            redirectHost: (() => { try { return new URL(redirectUri).host; } catch(e) { return 'invalid'; }})(),
            redirectUri
          });
        }

        res.redirect(authUrl);
      } catch (error) {
        console.error('Error parsing WeChat config:', error);
        res.redirect(`/login?redirect=${encodeURIComponent(redirect || '/')}&error=config_error`);
      }
    }
  );
});




// 生成企业微信推送验证码（供H5应用调用，仅企业微信环境）
router.get('/generate-code', (req, res) => {
  try {
    // 检查是否来自企业微信环境
    const wechatCheck = isWeChatWorkEnvironment(req);
    
    if (!wechatCheck.isWechatWork || wechatCheck.isRegularWechat) {
      return res.status(403).json({
        success: false,
        message: '此接口仅限企业微信环境访问，普通微信无法使用',
        code: 'WECHAT_WORK_REQUIRED',
        details: {
          isWechatWork: wechatCheck.isWechatWork,
          isRegularWechat: wechatCheck.isRegularWechat,
          userAgent: wechatCheck.userAgent.substring(0, 100) + '...'
        }
      });
    }
    
    // 获取设备指纹作为用户标识
    const deviceFingerprint = req.query.device || req.headers['x-device-fingerprint'] || 'device_' + Date.now();
    
    if (!isProd) console.log('设备指纹ID:', deviceFingerprint);
    
    // 获取企业微信配置
    const db = getDB();
    db.get(
      'SELECT config FROM auth_methods WHERE type = ? AND is_enabled = 1',
      ['wechat_push'],
      (err, authMethod) => {
        if (err || !authMethod) {
          console.error('WeChat push auth method not found:', err);
          return res.status(404).json({ 
            success: false, 
            message: '企业微信推送认证方式未配置' 
          });
        }

        try {
          const config = JSON.parse(authMethod.config);
          if (!isProd) console.log('企业微信推送认证配置:', config);
          
          // 使用更安全的默认密钥，兼容多种环境变量名
          const secret = config.app_secret || process.env.WECHAT_APP_SECRET || process.env.WECHAT_SECRET || 'mfa_default_secret_' + (process.env.JWT_SECRET || 'fallback');
          
          // 生成当前验证码（只基于时间窗口，不依赖设备指纹）
          const currentTime = Math.floor(Date.now() / 60000); // 60秒时间窗口，给用户更多操作时间
          const code = generateWechatCode(secret, currentTime);
          
          // 计算剩余有效时间
          const remainingTime = 60 - (Math.floor(Date.now() / 1000) % 60);
          
          if (!isProd) {
            console.log('=== 验证码生成详情 ===');
            console.log('设备指纹ID:', deviceFingerprint);
            console.log('当前时间戳:', Date.now());
            console.log('时间窗口:', currentTime);
            console.log('生成的验证码:', code);
            console.log('剩余时间:', remainingTime, '秒');
            console.log('密钥前缀(掩码):', String(secret).substring(0, 6) + '...');
            console.log('========================');
          }
          
          res.json({
            success: true,
            code: code,
            remainingTime: remainingTime,
            message: '验证码生成成功',
            deviceFingerprint: deviceFingerprint,
            debug: process.env.NODE_ENV !== 'production' ? {
              currentTime: currentTime,
              timestamp: Date.now(),
              secret_prefix: String(secret).substring(0, 10) + '...'
            } : undefined
          });
        } catch (error) {
          console.error('Error generating WeChat code:', error);
          res.status(500).json({ 
            success: false, 
            message: '验证码生成失败' 
          });
        }
      }
    );
  } catch (error) {
    console.error('Error in generate-code endpoint:', error);
    res.status(500).json({ 
      success: false, 
      message: '服务器错误' 
    });
  }
});

// 验证企业微信推送验证码并创建会话
router.post('/verify-push-code', checkNetworkAccess, (req, res) => {
  const { code, redirect_url } = req.body;
  
  if (!code) {
    return res.status(400).json({ 
      success: false, 
      message: '验证码不能为空' 
    });
  }

  try {
    // 获取企业微信推送配置
    const db = getDB();
    db.get(
      'SELECT config FROM auth_methods WHERE type = ? AND is_enabled = 1',
      ['wechat_push'],
      (err, authMethod) => {
        if (err || !authMethod) {
          console.error('WeChat push auth method not found:', err);
          return res.status(404).json({ 
            success: false, 
            message: '企业微信推送认证方式未配置' 
          });
        }

        try {
          const config = JSON.parse(authMethod.config);
          if (!isProd) console.log('验证码验证 - 企业微信推送认证配置:', config);
          
          // 使用更安全的默认密钥，兼容多种环境变量名
          const secret = config.app_secret || process.env.WECHAT_APP_SECRET || process.env.WECHAT_SECRET || 'mfa_default_secret_' + (process.env.JWT_SECRET || 'fallback');
          
          // 获取设备指纹用于验证
          const deviceFingerprint = req.body.deviceFingerprint || req.headers['x-device-fingerprint'] || 'device_unknown';
          
          // 验证企业微信推送验证码
          const serverTimestamp = Date.now();
          const serverTimeWindow = Math.floor(serverTimestamp / 60000);
          const clientTimestamp = req.body.timestamp;
          const clientTimeWindow = clientTimestamp ? Math.floor(clientTimestamp / 60000) : null;
          
          if (!isProd) {
            console.log('=== 验证码验证详情 ===');
            console.log('输入的验证码(掩码):', String(code).replace(/\d(?=\d{2})/g, '*'));
            console.log('请求来源:', req.body.testSource || 'unknown');
            console.log('服务器时间戳:', serverTimestamp);
            console.log('服务器时间窗口:', serverTimeWindow);
            console.log('客户端时间戳:', clientTimestamp);
            console.log('客户端时间窗口:', clientTimeWindow);
            console.log('密钥前缀(掩码):', String(secret).substring(0, 6) + '...');
            console.log('========================');
          }
          
          const verificationResult = verifyWechatPushCode(code, config);
          if (!isProd) console.log('验证结果:', verificationResult);
          
          if (!verificationResult.success) {
            if (!isProd) console.log('验证码验证失败:', verificationResult.message);
            return res.status(401).json({
              success: false,
              message: verificationResult.message || '验证码验证失败'
            });
          }
          
          if (!isProd) console.log('验证码验证成功!');

          // 验证成功，创建临时用户会话
          const jwt = require('jsonwebtoken');
          const tempUser = {
            id: 'wechat_temp_' + Date.now(),
            username: 'wechat_temp_user',
            role: 'user',
            wechat_verified: true,
            verify_time: new Date(),
            auth_method: 'wechat_push'
          };

          // 生成JWT token
          const token = jwt.sign(
            tempUser,
            process.env.JWT_SECRET || 'default-secret',
            { 
              expiresIn: process.env.JWT_EXPIRES_IN || '24h',
              issuer: process.env.MFA_ISSUER || 'MFA管控平台'
            }
          );

          if (!isProd) console.log('WeChat push verification successful, generated token');

          // 设置JWT token到Cookie（用于代理访问）
          // 🔧 Safari/Edge兼容性强化配置
          const userAgent = req.headers['user-agent'] || '';
          const isSafari = userAgent.toLowerCase().includes('safari') && !userAgent.toLowerCase().includes('chrome');
          const isEdge = userAgent.toLowerCase().includes('edge') || userAgent.toLowerCase().includes('edg/');
          const isMobile = /Mobile|Android|iPhone|iPad/i.test(userAgent);
          
          if (!isProd) console.log(`🍎 浏览器检测: Safari=${isSafari}, Edge=${isEdge}, Mobile=${isMobile}`);
          
          // 主Cookie配置 - 针对Safari/Edge优化
          const cookieOptions = {
            maxAge: 24 * 60 * 60 * 1000, // 24小时
            httpOnly: false, // 允许JavaScript访问
            secure: process.env.HTTPS === 'true',
            path: '/',
            domain: undefined
          };
          
          // Safari和Edge需要不同的SameSite策略
          if (isSafari || isEdge) {
            // Safari和Edge在移动端对SameSite=None极其严格
            cookieOptions.sameSite = 'lax'; // 使用更兼容的策略
            if (!isProd) console.log('🔧 为Safari/Edge使用SameSite=lax策略');
          } else {
            cookieOptions.sameSite = 'none'; // 其他浏览器使用标准策略
          }
          
          // 为非生产环境设置不同的Cookie策略
          if (process.env.NODE_ENV !== 'production') {
            cookieOptions.secure = false;
            cookieOptions.sameSite = 'lax';
          }
          
          res.cookie('auth_token', token, cookieOptions);
          if (!isProd) console.log(`🍪 设置主Cookie: ${JSON.stringify(cookieOptions)}`);

          // 🔧 多重备用Cookie策略 - 确保Safari/Edge兼容性
          const backupStrategies = [
            {
              name: 'wechat_auth',
              options: {
                maxAge: 24 * 60 * 60 * 1000,
                httpOnly: false,
                secure: process.env.HTTPS === 'true',
                sameSite: 'lax', // 最兼容的策略
                path: '/'
              }
            },
            {
              name: 'auth_backup',
              options: {
                maxAge: 24 * 60 * 60 * 1000,
                httpOnly: false,
                secure: false, // 不强制HTTPS以提高兼容性
                sameSite: 'lax',
                path: '/'
              }
            }
          ];
          
          // 为Safari/Edge设置额外的兼容性Cookie
          if (isSafari || isEdge) {
            backupStrategies.push({
              name: 'safari_compat_token',
              options: {
                maxAge: 24 * 60 * 60 * 1000,
                httpOnly: false,
                secure: false, // Safari移动端兼容性
                sameSite: 'strict', // 最严格但最兼容
                path: '/'
              }
            });
          }
          
          backupStrategies.forEach(strategy => {
            try {
              res.cookie(strategy.name, token, strategy.options);
              if (!isProd) console.log(`🔄 设置备用Cookie [${strategy.name}]: ${JSON.stringify(strategy.options)}`);
            } catch (e) {
              if (!isProd) console.warn(`❌ 设置备用Cookie [${strategy.name}] 失败:`, e?.message || e);
            }
          });

          return res.json({
            success: true,
            message: '企业微信推送验证码验证成功',
            token: token,
            user: {
              username: tempUser.username,
              role: tempUser.role,
              auth_method: tempUser.auth_method
            },
            redirect_url: redirect_url
          });
        } catch (error) {
          console.error('Error verifying WeChat push code:', error);
          res.status(500).json({ 
            success: false, 
            message: '验证码验证失败' 
          });
        }
      }
    );
  } catch (error) {
    console.error('Error in verify-push-code endpoint:', error);
    res.status(500).json({ 
      success: false, 
      message: '服务器错误' 
    });
  }
});

// 验证企业微信推送验证码的核心函数
const verifyWechatPushCode = (inputCode, config) => {
  try {
    const crypto = require('crypto');
    
    // 解析配置
    const parsedConfig = typeof config === 'string' ? JSON.parse(config) : config;
    // 使用与生成验证码时完全相同的密钥获取逻辑，兼容多种环境变量名
    const secret = parsedConfig.app_secret || process.env.WECHAT_APP_SECRET || process.env.WECHAT_SECRET || 'mfa_default_secret_' + (process.env.JWT_SECRET || 'fallback');
    
    // 基于当前时间生成验证码（60秒窗口）
    const currentTime = Math.floor(Date.now() / 60000); // 60秒时间窗口，与生成时保持一致
    
              // 检查多个时间窗口的验证码（增加容错性，扩大到10个时间窗口）
    // 不使用用户标识符，因为H5页面和电脑浏览器是不同设备
    const timeWindows = [];
    for (let i = -5; i <= 5; i++) {
      const windowTime = currentTime + i;
      const windowCode = generateWechatCode(secret, windowTime);
      timeWindows.push({
        offset: i,
        time: windowTime,
        code: windowCode
      });
    }
    
    if (!isProd) {
      console.log('=== 验证码验证参数详情 ===');
      console.log('输入验证码(掩码):', String(inputCode).replace(/\d(?=\d{2})/g, '*'));
      console.log('当前时间窗口:', currentTime);
      console.log('密钥前缀(掩码):', String(secret).substring(0, 6) + '...');
      console.log('==========================');
    }
    
    if (!isProd) {
      console.log('Verifying WeChat push code');
      console.log('检查的时间窗口偏移:', timeWindows.map(w => w.offset));
    }
    
    // 检查输入的验证码是否匹配任何时间窗口
    const matchedWindow = timeWindows.find(window => window.code === inputCode);
    
    if (matchedWindow) {
      if (!isProd) console.log('验证码匹配成功！匹配的时间窗口:', matchedWindow);
      return { 
        success: true,
        matchedWindow: matchedWindow
      };
    } else {
      if (!isProd) console.log('验证码不匹配任何时间窗口');
      return {
        success: false,
        message: '企业微信验证码无效或已过期',
        code: 'WECHAT_CODE_INVALID'
      };
    }
  } catch (error) {
    console.error('Error verifying WeChat push code:', error);
    return {
      success: false,
      message: '企业微信验证码验证失败',
      code: 'WECHAT_CODE_ERROR'
    };
  }
};

// 生成企业微信动态验证码（只基于时间窗口）
const generateWechatCode = (secret, timeStep) => {
  const crypto = require('crypto');
  
  // 使用HMAC-SHA1生成验证码，只基于时间窗口
  // 移除用户标识符依赖，因为H5页面和电脑浏览器是不同设备
  const hmac = crypto.createHmac('sha1', secret);
  hmac.update(timeStep.toString());
  const hash = hmac.digest('hex');
  
  // 取hash的后6位作为验证码
  const code = parseInt(hash.slice(-6), 16) % 1000000;
  
  // 确保是6位数字，不足前面补0
  return code.toString().padStart(6, '0');
};

// 获取企业微信授权URL（API接口）
router.get('/auth-url', (req, res) => {
  const { redirect } = req.query;
  const state = crypto.randomBytes(16).toString('hex');
  
  // 存储state用于验证
  req.session = req.session || {};
  req.session.wechat_state = state;
  req.session.redirect_url = redirect || '/';

  const authUrl = `https://open.weixin.qq.com/connect/oauth2/authorize?` +
    `appid=${process.env.WECHAT_CORP_ID}&` +
    `redirect_uri=${encodeURIComponent(process.env.WECHAT_REDIRECT_URI)}&` +
    `response_type=code&` +
    `scope=snsapi_base&` +
    `state=${state}#wechat_redirect`;

  res.json({ authUrl });
});

// 企业微信回调处理
router.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  
  if (!code) {
    return res.status(400).json({ message: 'Authorization code is required' });
  }

  try {
    // 简化版企业微信认证 - 无需IP白名单
    // 基础验证：检查必要参数
    if (!code || code.length < 10) {
      throw new Error('Invalid authorization code');
    }

    if (!state) {
      throw new Error('Missing state parameter');
    }

    // 解码state参数获取redirect信息
    let stateData;
    try {
      const decodedState = Buffer.from(state, 'base64').toString('utf8');
      stateData = JSON.parse(decodedState);
    } catch (error) {
      throw new Error('Invalid state parameter format');
    }

    // 验证state时效性（5分钟内有效）
    if (Date.now() - stateData.timestamp > 5 * 60 * 1000) {
      throw new Error('State parameter expired');
    }

    if (!isProd) {
      console.log('WeChat Work auth code received');
      console.log('State verified successfully, redirect to:', stateData.redirect);
    }

    // 创建通用的企业微信认证用户
    const user = await findOrCreateSimpleWechatUser(code, stateData.random);
    if (!user) {
      throw new Error('Failed to create authenticated user');
    }
    
    // 创建JWT token
    const jwt = require('jsonwebtoken');
    const jwtToken = jwt.sign(
      {
        id: user.id,
        username: user.username,
        role: user.role,
        email: user.email,
        auth_method: 'wechat_work',
        auth_time: new Date().toISOString()
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    
    // 设置JWT token到cookie并重定向
    const redirectUrl = stateData.redirect || '/dashboard';
    // 主Cookie（HttpOnly）
    res.cookie('auth_token', jwtToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000, // 24小时
      sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
      path: '/'
    });

    // 兼容性Cookie（非HttpOnly，供部分浏览器回退使用）
    const userAgent = req.headers['user-agent'] || '';
    const isSafari = userAgent.toLowerCase().includes('safari') && !userAgent.toLowerCase().includes('chrome');
    const isEdge = userAgent.toLowerCase().includes('edge') || userAgent.toLowerCase().includes('edg/');

    const backupStrategies = [
      {
        name: 'wechat_auth',
        options: {
          maxAge: 24 * 60 * 60 * 1000,
          httpOnly: false,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'lax' : 'lax',
          path: '/'
        }
      },
      {
        name: 'auth_backup',
        options: {
          maxAge: 24 * 60 * 60 * 1000,
          httpOnly: false,
          secure: false,
          sameSite: 'lax',
          path: '/'
        }
      }
    ];

    if (isSafari || isEdge) {
      backupStrategies.push({
        name: 'safari_compat_token',
        options: {
          maxAge: 24 * 60 * 60 * 1000,
          httpOnly: false,
          secure: false,
          sameSite: 'strict',
          path: '/'
        }
      });
    }

    backupStrategies.forEach(strategy => {
      try {
        res.cookie(strategy.name, jwtToken, strategy.options);
      } catch (e) {
        console.warn(`Set backup cookie [${strategy.name}] failed:`, e?.message || e);
      }
    });

    if (!isProd) console.log('WeChat Work auth successful (simplified), redirecting to:', redirectUrl);
    res.redirect(redirectUrl);

  } catch (error) {
    console.error('WeChat callback error:', error);
    res.status(500).json({ message: 'Authentication failed', error: error.message });
  }
});

// 获取企业微信配置
const getWechatConfig = () => {
  return new Promise((resolve, reject) => {
    const db = getDB();
    db.get(
      'SELECT config FROM auth_methods WHERE type = ? AND is_enabled = 1',
      ['wechat_qr'],
      (err, authMethod) => {
        if (err || !authMethod) {
          reject(new Error('WeChat auth method not found'));
        } else {
          try {
            const config = JSON.parse(authMethod.config);
            resolve(config);
          } catch (error) {
            reject(new Error('Invalid WeChat config'));
          }
        }
      }
    );
  });
};

// 简化版微信用户创建 - 无需API调用
const findOrCreateSimpleWechatUser = (code, state) => {
  return new Promise((resolve, reject) => {
    const db = getDB();
    
    // 基于code和时间戳创建唯一的用户标识
    const crypto = require('crypto');
    const userIdentifier = crypto.createHash('md5').update(code + state).digest('hex').substring(0, 12);
    const username = `wechat_${userIdentifier}`;
    
    // 首先查找是否已存在该用户
    db.get(
      'SELECT u.* FROM users u WHERE u.username = ?',
      [username],
      (err, user) => {
        if (err) {
          reject(err);
          return;
        }

        if (user) {
          // 用户已存在，更新最后登录时间
          db.run(
            'UPDATE users SET updated_at = datetime("now") WHERE id = ?',
            [user.id],
            (updateErr) => {
              if (updateErr) {
                console.error('Failed to update user login time:', updateErr);
              }
              resolve(user);
            }
          );
        } else {
          // 用户不存在，创建新用户
          const bcrypt = require('bcryptjs');
          const randomPassword = Math.random().toString(36).slice(-10);
          const hashedPassword = bcrypt.hashSync(randomPassword, 10);
          
          db.run(
            `INSERT INTO users (username, password, role, email, wechat_userid, created_at) 
             VALUES (?, ?, 'user', ?, ?, datetime('now'))`,
            [username, hashedPassword, `${username}@wechat.work`, userIdentifier],
            function(insertErr) {
              if (insertErr) {
                reject(insertErr);
                return;
              }

              // 返回新创建的用户
              db.get(
                'SELECT * FROM users WHERE id = ?',
                [this.lastID],
                (selectErr, newUser) => {
                  if (selectErr) {
                    reject(selectErr);
                  } else {
                    if (!isProd) console.log('Created new WeChat Work user:', newUser.username);
                    resolve(newUser);
                  }
                }
              );
            }
          );
        }
      }
    );
  });
};

// 查找或创建微信用户（备用方法，需要IP白名单）
const findOrCreateWechatUser = (wechatUserInfo) => {
  return new Promise((resolve, reject) => {
    const db = getDB();
    const { userid } = wechatUserInfo;
    
    // 首先查找是否已存在微信绑定的用户
    db.get(
      'SELECT u.* FROM users u WHERE u.wechat_userid = ?',
      [userid],
      (err, user) => {
        if (err) {
          reject(err);
          return;
        }

        if (user) {
          // 用户已存在，直接返回
          resolve(user);
        } else {
          // 用户不存在，创建新用户
          const bcrypt = require('bcryptjs');
          const randomPassword = Math.random().toString(36).slice(-10);
          const hashedPassword = bcrypt.hashSync(randomPassword, 10);
          
          db.run(
            `INSERT INTO users (username, password, role, email, wechat_userid, created_at) 
             VALUES (?, ?, 'user', ?, ?, datetime('now'))`,
            [userid, hashedPassword, `${userid}@wechat.local`, userid],
            function(insertErr) {
              if (insertErr) {
                reject(insertErr);
                return;
              }

              // 返回新创建的用户
              db.get(
                'SELECT * FROM users WHERE id = ?',
                [this.lastID],
                (selectErr, newUser) => {
                  if (selectErr) {
                    reject(selectErr);
                  } else {
                    resolve(newUser);
                  }
                }
              );
            }
          );
        }
      }
    );
  });
};

// 获取企业微信access_token
const getAccessToken = async () => {
  try {
    const config = await getWechatConfig();
    
    const response = await axios.get('https://qyapi.weixin.qq.com/cgi-bin/gettoken', {
      params: {
        corpid: config.corp_id,
        corpsecret: config.app_secret
      }
    });

    if (response.data.errcode === 0) {
      return {
        success: true,
        access_token: response.data.access_token,
        expires_in: response.data.expires_in
      };
    } else {
      if (!isProd) console.error('Get access token failed:', response.data);
      return { success: false, error: response.data };
    }
  } catch (error) {
    console.error('Get access token error:', error);
    return { success: false, error: error.message };
  }
};

// 通过code获取用户信息
const getUserInfoByCode = async (code, accessToken) => {
  try {
    const response = await axios.get('https://qyapi.weixin.qq.com/cgi-bin/user/getuserinfo', {
      params: {
        access_token: accessToken,
        code: code
      }
    });

    if (response.data.errcode === 0) {
      return {
        success: true,
        data: {
          userid: response.data.UserId,
          deviceid: response.data.DeviceId
        }
      };
    } else {
      if (!isProd) console.error('Get user info failed:', response.data);
      return { success: false, error: response.data };
    }
  } catch (error) {
    console.error('Get user info error:', error);
    return { success: false, error: error.message };
  }
};

// 企业微信扫码登录 - 获取用户信息
const getWechatWorkUserInfo = async (code) => {
  try {
    // 1. 先获取access_token
    const tokenResponse = await getAccessToken();
    if (!tokenResponse.success) {
      throw new Error('Failed to get access token');
    }

    // 2. 通过code获取用户信息
    const response = await axios.get('https://qyapi.weixin.qq.com/cgi-bin/user/getuserinfo', {
      params: {
        access_token: tokenResponse.access_token,
        code: code
      }
    });

    if (!isProd) console.log('WeChat Work user info response:', response.data);

    if (response.data.errcode === 0) {
      return {
        success: true,
        data: {
          userid: response.data.UserId || response.data.userid,
          deviceid: response.data.DeviceId
        }
      };
    } else {
      console.error('Get WeChat Work user info failed:', response.data);
      return { success: false, error: response.data };
    }
  } catch (error) {
    console.error('Get WeChat Work user info error:', error);
    return { success: false, error: error.message };
  }
};

// 获取用户详细信息
const getUserDetail = async (userid, accessToken) => {
  try {
    const response = await axios.get('https://qyapi.weixin.qq.com/cgi-bin/user/get', {
      params: {
        access_token: accessToken,
        userid: userid
      }
    });

    if (response.data.errcode === 0) {
      return {
        success: true,
        data: response.data
      };
    } else {
      return { success: false, error: response.data };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
};

// 创建微信会话
const createWechatSession = async (userInfo) => {
  return new Promise((resolve, reject) => {
    const db = getDB();
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24小时后过期

    // 查找或创建用户
    db.get(
      'SELECT * FROM users WHERE wechat_userid = ?',
      [userInfo.userid],
      (err, user) => {
        if (err) {
          return reject(err);
        }

        const userId = user ? user.id : null;

        // 创建会话记录
        db.run(
          `INSERT INTO wechat_sessions (session_token, user_id, wechat_userid, expires_at)
           VALUES (?, ?, ?, ?)`,
          [sessionToken, userId, userInfo.userid, expiresAt.toISOString()],
          function(err) {
            if (err) {
              return reject(err);
            }
            resolve(sessionToken);
          }
        );
      }
    );
  });
};

// 验证微信会话
router.get('/verify-session', (req, res) => {
  const { token } = req.query;
  
  if (!token) {
    return res.status(400).json({ message: 'Session token is required' });
  }

  const db = getDB();
  db.get(
    `SELECT ws.*, u.username, u.email, u.role 
     FROM wechat_sessions ws
     LEFT JOIN users u ON ws.user_id = u.id
     WHERE ws.session_token = ? AND ws.expires_at > datetime('now')`,
    [token],
    (err, session) => {
      if (err) {
        return res.status(500).json({ message: 'Database error' });
      }

      if (!session) {
        return res.status(401).json({ message: 'Invalid or expired session' });
      }

      res.json({
        valid: true,
        session: {
          wechat_userid: session.wechat_userid,
          user: session.user_id ? {
            id: session.user_id,
            username: session.username,
            email: session.email,
            role: session.role
          } : null
        }
      });
    }
  );
});

// 获取企业微信JS-SDK配置
router.get('/js-config', async (req, res) => {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({ message: 'URL is required' });
  }

  try {
    const tokenResponse = await getAccessToken();
    if (!tokenResponse.success) {
      throw new Error('Failed to get access token');
    }

    // 获取jsapi_ticket
    const ticketResponse = await axios.get('https://qyapi.weixin.qq.com/cgi-bin/get_jsapi_ticket', {
      params: {
        access_token: tokenResponse.access_token
      }
    });

    if (ticketResponse.data.errcode !== 0) {
      throw new Error('Failed to get jsapi ticket');
    }

    const ticket = ticketResponse.data.ticket;
    const timestamp = Math.floor(Date.now() / 1000);
    const nonceStr = crypto.randomBytes(16).toString('hex');
    
    // 生成签名
    const string1 = `jsapi_ticket=${ticket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${url}`;
    const signature = crypto.createHash('sha1').update(string1).digest('hex');

    res.json({
      appId: process.env.WECHAT_CORP_ID,
      timestamp: timestamp,
      nonceStr: nonceStr,
      signature: signature
    });

  } catch (error) {
    console.error('Get JS config error:', error);
    res.status(500).json({ message: 'Failed to get JS config', error: error.message });
  }
});

module.exports = router; 