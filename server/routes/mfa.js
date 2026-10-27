const express = require('express');
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const { getDB } = require('../config/database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// 获取用户MFA配置列表（仅管理员）
router.get('/configs', requireAdmin, (req, res) => {
  const { page = 1, limit = 10, user_id, mfa_type } = req.query;
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE 1=1';
  let params = [];

  if (user_id) {
    whereClause += ' AND mc.user_id = ?';
    params.push(user_id);
  }

  if (mfa_type) {
    whereClause += ' AND mc.mfa_type = ?';
    params.push(mfa_type);
  }

  const db = getDB();

  // 获取总数
  db.get(
    `SELECT COUNT(*) as total 
     FROM mfa_configs mc 
     JOIN users u ON mc.user_id = u.id 
     ${whereClause}`,
    params,
    (err, countResult) => {
      if (err) {
        return res.status(500).json({ message: '数据库错误' });
      }

      // 获取MFA配置列表
      db.all(
        `SELECT mc.*, u.username, u.email 
         FROM mfa_configs mc 
         JOIN users u ON mc.user_id = u.id 
         ${whereClause} 
         ORDER BY mc.created_at DESC 
         LIMIT ? OFFSET ?`,
        [...params, parseInt(limit), parseInt(offset)],
        (err, configs) => {
          if (err) {
            return res.status(500).json({ message: '数据库错误' });
          }

          // 隐藏敏感信息
          const safeConfigs = configs.map(config => ({
            ...config,
            secret_key: config.secret_key ? '***' : null,
            backup_codes: config.backup_codes ? '***' : null
          }));

          res.json({
            configs: safeConfigs,
            pagination: {
              page: parseInt(page),
              limit: parseInt(limit),
              total: countResult.total,
              pages: Math.ceil(countResult.total / limit)
            }
          });
        }
      );
    }
  );
});

// 为用户生成TOTP密钥（仅管理员）
router.post('/totp/generate', requireAdmin, async (req, res) => {
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ message: '用户ID不能为空' });
  }

  const db = getDB();

  try {
    // 检查用户是否存在
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM users WHERE id = ?', [user_id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    // 生成TOTP密钥
    const secret = speakeasy.generateSecret({
      name: `MFA-Platform:${user.username}`,
      issuer: 'MFA Management Platform',
      length: 32
    });

    // 检查是否已有TOTP配置
    const existingConfig = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM mfa_configs WHERE user_id = ? AND mfa_type = "totp"',
        [user_id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (existingConfig) {
      // 更新现有配置
      await new Promise((resolve, reject) => {
        db.run(
          'UPDATE mfa_configs SET secret_key = ?, is_enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
          [secret.base32, existingConfig.id],
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
          [user_id, 'totp', secret.base32],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });
    }

    // 生成二维码
    const qrCodeDataURL = await QRCode.toDataURL(secret.otpauth_url);

    res.json({
      message: 'TOTP密钥生成成功',
      secret: secret.base32,
      qrcode: qrCodeDataURL,
      manualEntryKey: secret.base32
    });

  } catch (error) {
    console.error('Generate TOTP error:', error);
    res.status(500).json({ message: '生成TOTP密钥失败' });
  }
});

// 验证并启用TOTP（仅管理员）
router.post('/totp/verify', requireAdmin, async (req, res) => {
  const { user_id, token } = req.body;

  if (!user_id || !token) {
    return res.status(400).json({ message: '参数不完整' });
  }

  const db = getDB();

  try {
    // 获取用户的TOTP配置
    const config = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM mfa_configs WHERE user_id = ? AND mfa_type = "totp"',
        [user_id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!config || !config.secret_key) {
      return res.status(404).json({ message: 'TOTP配置不存在' });
    }

    // 验证TOTP令牌
    const verified = speakeasy.totp.verify({
      secret: config.secret_key,
      encoding: 'base32',
      token: token,
      window: 2 // 允许时间偏差
    });

    if (!verified) {
      return res.status(400).json({ message: 'TOTP令牌验证失败' });
    }

    // 生成备用代码
    const backupCodes = generateBackupCodes();

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
      message: 'TOTP验证成功并已启用',
      backupCodes: backupCodes
    });

  } catch (error) {
    console.error('Verify TOTP error:', error);
    res.status(500).json({ message: 'TOTP验证失败' });
  }
});

// 生成备用代码
const generateBackupCodes = (count = 10) => {
  const codes = [];
  for (let i = 0; i < count; i++) {
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(code);
  }
  return codes;
};

// 重新生成备用代码（仅管理员）
router.post('/backup-codes/regenerate', requireAdmin, async (req, res) => {
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ message: '用户ID不能为空' });
  }

  const db = getDB();

  try {
    // 检查用户的MFA配置
    const config = await new Promise((resolve, reject) => {
      db.get(
        'SELECT * FROM mfa_configs WHERE user_id = ? AND is_enabled = 1',
        [user_id],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!config) {
      return res.status(404).json({ message: '用户未启用MFA' });
    }

    // 生成新的备用代码
    const backupCodes = generateBackupCodes();

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
      message: '备用代码重新生成成功',
      backupCodes: backupCodes
    });

  } catch (error) {
    console.error('Regenerate backup codes error:', error);
    res.status(500).json({ message: '重新生成备用代码失败' });
  }
});

// 禁用用户MFA（仅管理员）
router.post('/disable', requireAdmin, async (req, res) => {
  const { user_id } = req.body;

  if (!user_id) {
    return res.status(400).json({ message: '用户ID不能为空' });
  }

  const db = getDB();

  try {
    // 禁用用户的所有MFA配置
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE mfa_configs SET is_enabled = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
        [user_id],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    res.json({ message: 'MFA已禁用' });

  } catch (error) {
    console.error('Disable MFA error:', error);
    res.status(500).json({ message: '禁用MFA失败' });
  }
});

// 获取MFA统计信息（仅管理员）
router.get('/stats', requireAdmin, (req, res) => {
  const db = getDB();

  Promise.all([
    // 启用MFA的用户数
    new Promise((resolve, reject) => {
      db.get(
        'SELECT COUNT(DISTINCT user_id) as enabled FROM mfa_configs WHERE is_enabled = 1',
        (err, row) => {
          if (err) {
            console.error('MFA enabled users query error:', err);
            resolve(0); // 返回默认值而不是reject
          } else {
            resolve(row ? row.enabled : 0);
          }
        }
      );
    }),
    // 各种MFA类型的统计
    new Promise((resolve, reject) => {
      db.all(
        'SELECT mfa_type, COUNT(*) as count FROM mfa_configs WHERE is_enabled = 1 GROUP BY mfa_type',
        (err, rows) => {
          if (err) {
            console.error('MFA type stats query error:', err);
            resolve([]); // 返回空数组而不是reject
          } else {
            resolve(rows || []);
          }
        }
      );
    }),
    // 总用户数
    new Promise((resolve, reject) => {
      db.get('SELECT COUNT(id) as total FROM users WHERE status = ?', ['active'], (err, row) => {
        if (err) {
          console.error('Active users for MFA stats query error:', err);
          resolve(0); // 返回默认值而不是reject
        } else {
          resolve(row ? row.total : 0);
        }
      });
    })
  ]).then(([enabled, typeStats, totalUsers]) => {
    const typeStatsObj = (typeStats || []).reduce((acc, stat) => {
      acc[stat.mfa_type] = stat.count;
      return acc;
    }, {});

    const enabledCount = enabled || 0;
    const totalCount = totalUsers || 0;

    res.json({
      totalUsers: totalCount,
      mfaEnabled: enabledCount,
      mfaDisabled: totalCount - enabledCount,
      enabledRate: totalCount > 0 ? ((enabledCount / totalCount) * 100).toFixed(2) : '0',
      typeStats: typeStatsObj
    });
  }).catch(error => {
    console.error('Get MFA stats error:', error);
    // 返回默认值而不是错误
    res.json({
      totalUsers: 0,
      mfaEnabled: 0,
      mfaDisabled: 0,
      enabledRate: '0',
      typeStats: {}
    });
  });
});

module.exports = router; 