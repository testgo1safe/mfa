const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const crypto = require('crypto');
const { getDB } = require('../config/database');
const { checkNetworkAccess, requireWechatAuth, authenticateToken } = require('../middleware/auth');

const router = express.Router();

// 应用网络访问检查
router.use(checkNetworkAccess);

// 登录接口
router.post('/login', requireWechatAuth, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: '用户名和密码不能为空' });
  }

  const db = getDB();
  
  db.get(
    'SELECT * FROM users WHERE username = ? AND status = "active"',
    [username],
    async (err, user) => {
      if (err) {
        return res.status(500).json({ message: '数据库错误' });
      }

      if (!user) {
        return res.status(401).json({ message: '用户名或密码错误' });
      }

      // 验证密码
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return res.status(401).json({ message: '用户名或密码错误' });
      }

      // 生成JWT token
      const token = jwt.sign(
        { 
          id: user.id, 
          username: user.username, 
          role: user.role,
          email: user.email
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
      );

      // 更新最后登录时间
      db.run(
        'UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [user.id]
      );

      res.json({
        message: '登录成功',
        token,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          status: user.status
        }
      });
    }
  );
});

// 企业微信快速登录
router.post('/wechat-login', requireWechatAuth, (req, res) => {
  const { wechat_token } = req.body;
  
  if (!wechat_token) {
    return res.status(400).json({ message: '企业微信Token不能为空' });
  }

  const db = getDB();
  
  db.get(
    `SELECT ws.*, u.* FROM wechat_sessions ws
     LEFT JOIN users u ON ws.user_id = u.id
     WHERE ws.session_token = ? AND ws.expires_at > datetime('now')`,
    [wechat_token],
    (err, session) => {
      if (err) {
        return res.status(500).json({ message: '数据库错误' });
      }

      if (!session) {
        return res.status(401).json({ message: '无效的企业微信会话' });
      }

      // 如果用户还未绑定系统账号，返回绑定提示
      if (!session.user_id) {
        return res.json({
          needBind: true,
          wechat_userid: session.wechat_userid,
          message: '请绑定系统账号'
        });
      }

      // 生成JWT token
      const token = jwt.sign(
        { 
          id: session.user_id, 
          username: session.username, 
          role: session.role,
          email: session.email,
          wechat_userid: session.wechat_userid
        },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '24h' }
      );

      res.json({
        message: '登录成功',
        token,
        user: {
          id: session.user_id,
          username: session.username,
          email: session.email,
          role: session.role,
          wechat_userid: session.wechat_userid
        }
      });
    }
  );
});

// 绑定企业微信账号
router.post('/bind-wechat', requireWechatAuth, async (req, res) => {
  const { username, password, wechat_token } = req.body;

  if (!username || !password || !wechat_token) {
    return res.status(400).json({ message: '参数不完整' });
  }

  const db = getDB();

  try {
    // 验证用户账号
    const user = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM users WHERE username = ? AND status = "active"',
        [username],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!user) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: '用户名或密码错误' });
    }

    // 验证企业微信会话
    const session = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM wechat_sessions WHERE session_token = ? AND expires_at > datetime("now")',
        [wechat_token],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!session) {
      return res.status(401).json({ message: '无效的企业微信会话' });
    }

    // 更新用户的微信userid
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE users SET wechat_userid = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [session.wechat_userid, user.id],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    // 更新会话关联用户
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE wechat_sessions SET user_id = ? WHERE session_token = ?',
        [user.id, wechat_token],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    res.json({ message: '绑定成功' });

  } catch (error) {
    console.error('Bind WeChat error:', error);
    res.status(500).json({ message: '绑定失败' });
  }
});

// 修改密码
router.post('/change-password', requireWechatAuth, async (req, res) => {
  const { username, oldPassword, newPassword } = req.body;

  if (!username || !oldPassword || !newPassword) {
    return res.status(400).json({ message: '参数不完整' });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ message: '新密码至少6位' });
  }

  const db = getDB();

  try {
    // 验证用户身份
    const user = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM users WHERE username = ?',
        [username],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    const isValidPassword = await bcrypt.compare(oldPassword, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ message: '原密码错误' });
    }

    // 加密新密码
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // 更新密码
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [hashedNewPassword, user.id],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    res.json({ message: '密码修改成功' });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ message: '修改失败' });
  }
});

// 获取当前用户信息
router.get('/me', requireWechatAuth, (req, res) => {
  // 如果有JWT token，使用JWT信息
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
      if (!err) {
        return res.json({
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            wechat_userid: user.wechat_userid
          }
        });
      }
      
      // JWT验证失败，继续使用企业微信会话
      handleWechatSession();
    });
    return; // 确保不会继续执行
  }

  // 处理企业微信会话的函数
  function handleWechatSession() {
    if (req.wechatSession) {
      const db = getDB();
      db.get(
        'SELECT * FROM users WHERE id = ?',
        [req.wechatSession.user_id],
        (err, user) => {
          if (err || !user) {
            return res.status(401).json({ message: '用户信息获取失败' });
          }

          res.json({
            user: {
              id: user.id,
              username: user.username,
              email: user.email,
              role: user.role,
              wechat_userid: user.wechat_userid
            }
          });
        }
      );
    } else {
      res.status(401).json({ message: '未认证' });
    }
  }

  // 没有JWT token时直接处理企业微信会话
  handleWechatSession();
});

// 注销
router.post('/logout', (req, res) => {
  // 清除企业微信会话（如果有）
  const wechatToken = req.headers['x-wechat-token'] || req.query.wechat_token;
  
  if (wechatToken) {
    const db = getDB();
    db.run(
      'DELETE FROM wechat_sessions WHERE session_token = ?',
      [wechatToken],
      (err) => {
        if (err) {
          console.error('Error deleting WeChat session:', err);
        }
      }
    );
  }

  res.json({ message: '注销成功' });
});

// 用户级别的TOTP管理接口
// =============================================

// 获取当前用户的MFA状态
router.get('/mfa/status', authenticateToken, (req, res) => {
  const userId = req.user?.id;
  
  if (!userId) {
    return res.status(401).json({ message: '未认证' });
  }

  const db = getDB();
  
  db.get(
    'SELECT * FROM mfa_configs WHERE user_id = ? AND mfa_type = "totp"',
    [userId],
    (err, config) => {
      if (err) {
        console.error('Get MFA status error:', err);
        return res.status(500).json({ message: '获取MFA状态失败' });
      }

      res.json({
        hasMFA: !!config,
        isEnabled: config ? config.is_enabled === 1 : false,
        mfaType: config ? config.mfa_type : null,
        setupDate: config ? config.created_at : null
      });
    }
  );
});

// 用户设置TOTP（第一步：生成密钥和二维码）
router.post('/mfa/totp/setup', authenticateToken, async (req, res) => {
  const userId = req.user?.id;
  const username = req.user?.username;
  
  if (!userId || !username) {
    return res.status(401).json({ message: '未认证' });
  }

  const db = getDB();

  try {
    // 检查是否已启用MFA
    const existingConfig = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM mfa_configs WHERE user_id = ? AND mfa_type = "totp" AND is_enabled = 1',
        [userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (existingConfig) {
      return res.status(400).json({ message: 'TOTP已启用，如需重新设置请先禁用' });
    }

    // 生成TOTP密钥
    const secret = speakeasy.generateSecret({
      name: `${process.env.MFA_SERVICE_NAME}:${username}`,
      issuer: process.env.MFA_ISSUER || 'MFA管控平台',
      length: 32
    });

    // 检查是否有未启用的配置
    const unenabledConfig = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM mfa_configs WHERE user_id = ? AND mfa_type = "totp" AND is_enabled = 0',
        [userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (unenabledConfig) {
      // 更新现有未启用配置
      await new Promise((resolve, reject) => {
        db.run(
          'UPDATE mfa_configs SET secret_key = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [secret.base32, unenabledConfig.id],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    } else {
      // 创建新配置
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO mfa_configs (user_id, mfa_type, secret_key, is_enabled) VALUES (?, ?, ?, 0)',
          [userId, 'totp', secret.base32],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }

    res.json({
      message: 'TOTP设置已准备就绪',
      qrcode: secret.otpauth_url,
      manualEntryKey: secret.base32,
      instructions: {
        step1: '在您的手机上下载认证应用（如Google Authenticator、Microsoft Authenticator）',
        step2: '扫描二维码或手动输入密钥',
        step3: '输入认证应用显示的6位验证码完成设置'
      }
    });

  } catch (error) {
    console.error('Setup TOTP error:', error);
    res.status(500).json({ message: '设置TOTP失败' });
  }
});

// 用户完成TOTP设置（第二步：验证并启用）
router.post('/mfa/totp/enable', authenticateToken, async (req, res) => {
  const { token } = req.body;
  const userId = req.user?.id;
  
  if (!userId || !token) {
    return res.status(400).json({ message: '参数不完整' });
  }

  const db = getDB();

  try {
    // 获取用户的TOTP配置
    const config = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM mfa_configs WHERE user_id = ? AND mfa_type = "totp" AND is_enabled = 0',
        [userId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!config || !config.secret_key) {
      return res.status(404).json({ message: '请先设置TOTP' });
    }

    // 验证TOTP令牌
    const verified = speakeasy.totp.verify({
      secret: config.secret_key,
      encoding: 'base32',
      token: token,
      window: parseInt(process.env.TOTP_WINDOW) || 2
    });

    if (!verified) {
      return res.status(400).json({ message: '验证码错误，请重试' });
    }

    // 生成备用代码
    const backupCodes = [];
    for (let i = 0; i < 10; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      backupCodes.push(code);
    }

    // 启用TOTP
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE mfa_configs SET is_enabled = 1, backup_codes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [JSON.stringify(backupCodes), config.id],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    res.json({
      message: 'TOTP已成功启用',
      backupCodes: backupCodes,
      notice: '请将备用代码保存在安全的地方，当无法使用认证应用时可使用备用代码登录'
    });

  } catch (error) {
    console.error('Enable TOTP error:', error);
    res.status(500).json({ message: 'TOTP启用失败' });
  }
});

// 用户禁用TOTP
router.post('/mfa/totp/disable', authenticateToken, async (req, res) => {
  const { password, token } = req.body;
  const userId = req.user?.id;
  
  if (!userId || !password) {
    return res.status(400).json({ message: '参数不完整' });
  }

  const db = getDB();

  try {
    // 验证用户密码
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      return res.status(400).json({ message: '密码错误' });
    }

    // 如果提供了TOTP令牌，验证它
    if (token) {
      const config = await new Promise((resolve, reject) => {
        db.get(
          'SELECT * FROM mfa_configs WHERE user_id = ? AND mfa_type = "totp" AND is_enabled = 1',
          [userId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (config) {
        const verified = speakeasy.totp.verify({
          secret: config.secret_key,
          encoding: 'base32',
          token: token,
          window: parseInt(process.env.TOTP_WINDOW) || 2
        });

        if (!verified) {
          return res.status(400).json({ message: 'TOTP验证码错误' });
        }
      }
    }

    // 禁用TOTP
    await new Promise((resolve, reject) => {
      db.run(
        'DELETE FROM mfa_configs WHERE user_id = ? AND mfa_type = "totp"',
        [userId],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    res.json({
      message: 'TOTP已成功禁用'
    });

  } catch (error) {
    console.error('Disable TOTP error:', error);
    res.status(500).json({ message: 'TOTP禁用失败' });
  }
});

// 用户生成新的备用代码
router.post('/mfa/backup-codes/regenerate', requireWechatAuth, async (req, res) => {
  const { password, token } = req.body;
  const userId = req.user?.id;
  
  if (!userId || !password) {
    return res.status(400).json({ message: '参数不完整' });
  }

  const db = getDB();

  try {
    // 验证用户密码
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE id = ?', [userId], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      return res.status(400).json({ message: '密码错误' });
    }

    // 验证TOTP
    if (token) {
      const config = await new Promise((resolve, reject) => {
        db.get(
          'SELECT * FROM mfa_configs WHERE user_id = ? AND mfa_type = "totp" AND is_enabled = 1',
          [userId],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (!config) {
        return res.status(404).json({ message: 'TOTP未启用' });
      }

      const verified = speakeasy.totp.verify({
        secret: config.secret_key,
        encoding: 'base32',
        token: token,
        window: parseInt(process.env.TOTP_WINDOW) || 2
      });

      if (!verified) {
        return res.status(400).json({ message: 'TOTP验证码错误' });
      }

      // 生成新的备用代码
      const backupCodes = [];
      for (let i = 0; i < 10; i++) {
        const code = crypto.randomBytes(4).toString('hex').toUpperCase();
        backupCodes.push(code);
      }

      // 更新备用代码
      await new Promise((resolve, reject) => {
        db.run(
          'UPDATE mfa_configs SET backup_codes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [JSON.stringify(backupCodes), config.id],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      res.json({
        message: '备用代码已重新生成',
        backupCodes: backupCodes,
        notice: '旧的备用代码已失效，请保存新的备用代码'
      });
    } else {
      return res.status(400).json({ message: '需要TOTP验证码' });
    }

  } catch (error) {
    console.error('Regenerate backup codes error:', error);
    res.status(500).json({ message: '生成备用代码失败' });
  }
});

module.exports = router; 