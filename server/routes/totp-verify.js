const express = require('express');
const jwt = require('jsonwebtoken');
const speakeasy = require('speakeasy');
const { getDB } = require('../config/database');
const { checkNetworkAccess, authenticateToken } = require('../middleware/auth');

const router = express.Router();

// 应用网络访问检查
router.use(checkNetworkAccess);

// TOTP验证码验证API（类似微信验证逻辑）
router.post('/verify', authenticateToken, async (req, res) => {
  const { code } = req.body;
  const userId = req.user?.id;
  const username = req.user?.username;

  console.log('=== TOTP验证API ===');
  console.log('用户ID:', userId);
  console.log('用户名:', username);
  console.log('验证码:', code ? '***' + code.slice(-2) : 'undefined');

  if (!userId || !username) {
    return res.status(401).json({
      success: false,
      message: '用户未认证'
    });
  }

  if (!code || !/^\d{6}$/.test(code)) {
    return res.status(400).json({
      success: false,
      message: '请输入6位数字验证码'
    });
  }

  const db = getDB();

  try {
    // 获取用户的TOTP配置
    const mfaConfig = await new Promise((resolve, reject) => {
      db.get(
        'SELECT secret_key FROM mfa_configs WHERE user_id = ? AND mfa_type = "totp" AND is_enabled = 1',
        [userId],
        (err, config) => {
          if (err) reject(err);
          else resolve(config);
        }
      );
    });

    if (!mfaConfig) {
      return res.status(400).json({
        success: false,
        message: '用户未配置TOTP双因子认证'
      });
    }

    // 验证TOTP码
    const verified = speakeasy.totp.verify({
      secret: mfaConfig.secret_key,
      encoding: 'base32',
      token: code,
      window: 2
    });

    if (!verified) {
      console.log('TOTP验证失败: 验证码无效');
      return res.status(400).json({
        success: false,
        message: 'TOTP验证码无效或已过期'
      });
    }

    console.log('TOTP验证成功，生成JWT token...');

    // 验证成功，生成包含TOTP验证信息的JWT token
    const token = jwt.sign(
      {
        id: userId,
        username: username,
        role: req.user.role,
        totp_verified: true,
        totp_verify_time: Date.now(),
        auth_method: 'totp'
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('JWT token生成成功，包含TOTP验证标记');

    // 设置Cookie，便于浏览器跳转到代理应用时自动携带令牌
    try {
      res.cookie('auth_token', token, {
        maxAge: 24 * 60 * 60 * 1000, // 24小时
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        path: '/'
      });
    } catch (e) {
      console.warn('设置TOTP认证Cookie失败:', e?.message || e);
    }

    res.json({
      success: true,
      message: 'TOTP验证成功',
      token: token
    });

  } catch (error) {
    console.error('TOTP验证API错误:', error);
    res.status(500).json({
      success: false,
      message: 'TOTP验证失败'
    });
  }
});

module.exports = router; 