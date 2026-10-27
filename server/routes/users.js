const express = require('express');
const bcrypt = require('bcryptjs');
const { getDB } = require('../config/database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();
const isValidUsername = (u) => typeof u === 'string' && /^[A-Za-z0-9._-]{3,32}$/.test(u);

// 获取用户列表（仅管理员）
router.get('/', requireAdmin, (req, res) => {
  const { page = 1, limit = 10, search = '', role = '' } = req.query;
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE 1=1';
  let params = [];

  if (search) {
    whereClause += ' AND (username LIKE ? OR email LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  if (role) {
    whereClause += ' AND role = ?';
    params.push(role);
  }

  const db = getDB();

  // 获取总数
  db.get(
    `SELECT COUNT(*) as total FROM users ${whereClause}`,
    params,
    (err, countResult) => {
      if (err) {
        return res.status(500).json({ message: '数据库错误' });
      }

      // 获取用户列表
      db.all(
        `SELECT id, username, email, phone, role, status, wechat_userid, created_at, updated_at 
         FROM users ${whereClause} 
         ORDER BY created_at DESC 
         LIMIT ? OFFSET ?`,
        [...params, parseInt(limit), parseInt(offset)],
        (err, users) => {
          if (err) {
            return res.status(500).json({ message: '数据库错误' });
          }

          res.json({
            users,
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

// 创建用户（仅管理员）
router.post('/', requireAdmin, async (req, res) => {
  const { username, password, email, phone, role = 'user' } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: '用户名和密码不能为空' });
  }

  if (!isValidUsername(username)) {
    return res.status(400).json({ message: '用户名需为3-32位，允许字母/数字/._- 组合' });
  }

  if (password.length < 6) {
    return res.status(400).json({ message: '密码至少6位' });
  }

  const db = getDB();

  try {
    // 检查用户名是否已存在
    const existingUser = await new Promise((resolve, reject) => {
      db.get('SELECT id FROM users WHERE username = ?', [username], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (existingUser) {
      return res.status(400).json({ message: '用户名已存在' });
    }

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 10);

    // 创建用户
    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO users (username, password, email, phone, role) VALUES (?, ?, ?, ?, ?)',
        [username, hashedPassword, email || null, phone || null, role],
        function(err) {
          if (err) {
            if (/unique/i.test(String(err.message))) {
              return reject({ code: 'USERNAME_CONFLICT' });
            }
            return reject(err);
          }
          else resolve(this.lastID);
        }
      );
    });

    res.status(201).json({ message: '用户创建成功' });

  } catch (error) {
    console.error('Create user error:', error);
    if (error && error.code === 'USERNAME_CONFLICT') {
      return res.status(400).json({ message: '用户名已存在' });
    }
    res.status(500).json({ message: '创建用户失败' });
  }
});

// 获取单个用户信息（仅管理员）
router.get('/:id', requireAdmin, (req, res) => {
  const { id } = req.params;

  const db = getDB();
  db.get(
    'SELECT id, username, email, phone, role, status, wechat_userid, created_at, updated_at FROM users WHERE id = ?',
    [id],
    (err, user) => {
      if (err) {
        return res.status(500).json({ message: '数据库错误' });
      }

      if (!user) {
        return res.status(404).json({ message: '用户不存在' });
      }

      res.json({ user });
    }
  );
});

// 更新用户信息（仅管理员）
router.put('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { username, email, phone, role, status } = req.body;

  if (!username) {
    return res.status(400).json({ message: '用户名不能为空' });
  }

  if (!isValidUsername(username)) {
    return res.status(400).json({ message: '用户名需为3-32位，允许字母/数字/._- 组合' });
  }

  const db = getDB();

  try {
    // 检查用户是否存在
    const existingUser = await new Promise((resolve, reject) => {
      db.get('SELECT id FROM users WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!existingUser) {
      return res.status(404).json({ message: '用户不存在' });
    }

    // 检查用户名是否被其他用户使用
    const duplicateUser = await new Promise((resolve, reject) => {
      db.get('SELECT id FROM users WHERE username = ? AND id != ?', [username, id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (duplicateUser) {
      return res.status(400).json({ message: '用户名已被使用' });
    }

    // 更新用户信息
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE users SET username = ?, email = ?, phone = ?, role = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [username, email || null, phone || null, role, status, id],
        (err) => {
          if (err) {
            if (/unique/i.test(String(err.message))) return reject({ code: 'USERNAME_CONFLICT' });
            return reject(err);
          }
          else resolve();
        }
      );
    });

    res.json({ message: '用户信息更新成功' });

  } catch (error) {
    console.error('Update user error:', error);
    if (error && error.code === 'USERNAME_CONFLICT') {
      return res.status(400).json({ message: '用户名已被使用' });
    }
    res.status(500).json({ message: '更新用户失败' });
  }
});

// 重置用户密码（仅管理员）
router.post('/:id/reset-password', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ message: '新密码至少6位' });
  }

  const db = getDB();

  try {
    // 检查用户是否存在
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT id FROM users WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    // 加密新密码
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // 更新密码
    await new Promise((resolve, reject) => {
      db.run(
        'UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [hashedPassword, id],
        (err) => {
          if (err) reject(err);
          else resolve();
        }
      );
    });

    res.json({ message: '密码重置成功' });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ message: '重置密码失败' });
  }
});

// 删除用户（仅管理员）
router.delete('/:id', requireAdmin, async (req, res) => {
  const { id } = req.params;

  // 不能删除管理员自己
  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ message: '不能删除自己的账号' });
  }

  const db = getDB();

  try {
    // 检查用户是否存在
    const user = await new Promise((resolve, reject) => {
      db.get('SELECT id FROM users WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!user) {
      return res.status(404).json({ message: '用户不存在' });
    }

    // 删除用户
    await new Promise((resolve, reject) => {
      db.run('DELETE FROM users WHERE id = ?', [id], (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    res.json({ message: '用户删除成功' });

  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: '删除用户失败' });
  }
});

// 获取用户统计信息（仅管理员）
router.get('/stats/overview', requireAdmin, (req, res) => {
  const db = getDB();

  Promise.all([
    // 总用户数
    new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as total FROM users', (err, row) => {
        if (err) {
          console.error('Total users query error:', err);
          reject(err);
        } else {
          resolve(row ? row.total : 0);
        }
      });
    }),
    // 活跃用户数
    new Promise((resolve, reject) => {
      db.get('SELECT COUNT(id) as active FROM users WHERE status = ?', ['active'], (err, row) => {
        if (err) {
          console.error('Active users query error:', err);
          resolve(0); // 出错时返回0而不是reject
        } else {
          resolve(row ? row.active : 0);
        }
      });
    }),
    // 管理员数量
    new Promise((resolve, reject) => {
      db.get('SELECT COUNT(id) as admins FROM users WHERE role = ?', ['admin'], (err, row) => {
        if (err) {
          console.error('Admin users query error:', err);
          resolve(0); // 出错时返回0而不是reject
        } else {
          resolve(row ? row.admins : 0);
        }
      });
    }),
    // 绑定企业微信的用户数
    new Promise((resolve, reject) => {
      db.get('SELECT COUNT(id) as wechat_bound FROM users WHERE wechat_userid IS NOT NULL AND wechat_userid != ?', [''], (err, row) => {
        if (err) {
          console.error('WeChat bound users query error:', err);
          resolve(0); // 出错时返回0而不是reject
        } else {
          resolve(row ? row.wechat_bound : 0);
        }
      });
    })
  ]).then(([total, active, admins, wechatBound]) => {
    res.json({
      total: total || 0,
      active: active || 0,
      admins: admins || 0,
      wechatBound: wechatBound || 0,
      inactive: (total || 0) - (active || 0)
    });
  }).catch(error => {
    console.error('Get user stats error:', error);
    // 返回默认值而不是错误，避免前端崩溃
    res.json({
      total: 0,
      active: 0,
      admins: 0,
      wechatBound: 0,
      inactive: 0
    });
  });
});

module.exports = router; 