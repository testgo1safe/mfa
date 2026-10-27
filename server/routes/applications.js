const express = require('express');
const { getDB } = require('../config/database');
const { requireAdmin } = require('../middleware/auth');
const axios = require('axios');

const router = express.Router();
const isValidExternalPath = (p) => typeof p === 'string' && /^\/[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+)*$/.test(p) && p.length <= 128;
const normalizeExternalPath = (p) => {
  if (!p) return p;
  // 确保以/开头，去除尾随/
  let v = p.trim();
  if (!v.startsWith('/')) v = '/' + v;
  if (v.length > 1 && v.endsWith('/')) v = v.replace(/\/+$/, '');
  return v;
};

// 获取应用列表
router.get('/', requireAdmin, (req, res) => {
  const { page = 1, limit = 10, search = '', category = '' } = req.query;
  const offset = (page - 1) * limit;

  let whereClause = 'WHERE 1=1';
  let params = [];

  if (search) {
    whereClause += ' AND (name LIKE ? OR description LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }

  if (category) {
    whereClause += ' AND category = ?';
    params.push(category);
  }

  const db = getDB();

  // 获取总数
  db.get(
    `SELECT COUNT(*) as total FROM applications ${whereClause}`,
    params,
    (err, countResult) => {
      if (err) {
        return res.status(500).json({ message: '数据库错误' });
      }

      // 获取应用列表
      db.all(
        `SELECT * FROM applications ${whereClause} 
         ORDER BY created_at DESC 
         LIMIT ? OFFSET ?`,
        [...params, parseInt(limit), parseInt(offset)],
        (err, applications) => {
          if (err) {
            return res.status(500).json({ message: '数据库错误' });
          }

          res.json({
            applications,
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

// 创建应用
router.post('/', requireAdmin, (req, res) => {
  const { 
    name, 
    description, 
    internal_url, 
    external_path, 
    icon, 
    category, 
    is_enabled = true, 
    require_mfa = false,
    auth_method_id = 1,
    allowed_users = '',
    allow_internal_direct = true,
    internal_ip_ranges = null,
    direct_excluded_ips = ''
  } = req.body;

  if (!name || !internal_url || !external_path) {
    return res.status(400).json({ message: '应用名称、内网地址和外部路径不能为空' });
  }

  // 验证URL格式
  try {
    new URL(internal_url);
  } catch (error) {
    return res.status(400).json({ message: '内网地址格式无效' });
  }

  // 规范并验证外部路径格式
  const normalizedPath = normalizeExternalPath(external_path);
  if (!isValidExternalPath(normalizedPath)) {
    return res.status(400).json({ message: '外部路径格式无效（仅字母/数字/._~-，可含多级）' });
  }

  const db = getDB();

  // 检查外部路径是否已存在
  db.get(
    'SELECT id FROM applications WHERE external_path = ?',
    [normalizedPath],
    (err, existing) => {
      if (err) {
        return res.status(500).json({ message: '数据库错误' });
      }

      if (existing) {
        return res.status(400).json({ message: '外部路径已被使用' });
      }

      // 创建应用
      db.run(
        `INSERT INTO applications 
         (name, description, internal_url, external_path, icon, category, is_enabled, require_mfa, auth_method_id, allowed_users, allow_internal_direct, internal_ip_ranges, direct_excluded_ips) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [name, description, internal_url, normalizedPath, icon, category, is_enabled ? 1 : 0, require_mfa ? 1 : 0, auth_method_id, allowed_users, allow_internal_direct ? 1 : 0, internal_ip_ranges, direct_excluded_ips],
        function(err) {
          if (err) {
            if (/unique/i.test(String(err.message))) {
              return res.status(400).json({ message: '外部路径已被使用' });
            }
            return res.status(500).json({ message: '创建应用失败' });
          }

          res.status(201).json({
            message: '应用创建成功',
            id: this.lastID
          });
        }
      );
    }
  );
});

// 获取单个应用详情
router.get('/:id', requireAdmin, (req, res) => {
  const { id } = req.params;

  const db = getDB();
  db.get(
    'SELECT * FROM applications WHERE id = ?',
    [id],
    (err, application) => {
      if (err) {
        return res.status(500).json({ message: '数据库错误' });
      }

      if (!application) {
        return res.status(404).json({ message: '应用不存在' });
      }

      res.json({ application });
    }
  );
});

// 更新应用
router.put('/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { 
    name, 
    description, 
    internal_url, 
    external_path, 
    icon, 
    category, 
    is_enabled, 
    require_mfa,
    auth_method_id,
    allowed_users,
    allow_internal_direct,
    internal_ip_ranges,
    direct_excluded_ips
  } = req.body;

  if (internal_url) {
    try {
      new URL(internal_url);
    } catch (error) {
      return res.status(400).json({ message: '内网地址格式无效' });
    }
  }

  let normalizedPath;
  if (external_path) {
    normalizedPath = normalizeExternalPath(external_path);
    if (!isValidExternalPath(normalizedPath)) {
      return res.status(400).json({ message: '外部路径格式无效（仅字母/数字/._~-，可含多级）' });
    }
  }

  const db = getDB();

  // 如果修改了外部路径，检查是否冲突
  if (external_path) {
    db.get(
      'SELECT id FROM applications WHERE external_path = ? AND id != ?',
      [normalizedPath, id],
      (err, existing) => {
        if (err) {
          return res.status(500).json({ message: '数据库错误' });
        }

        if (existing) {
          return res.status(400).json({ message: '外部路径已被使用' });
        }

        updateApplication();
      }
    );
  } else {
    updateApplication();
  }

  function updateApplication() {
    const fields = [];
    const values = [];

    if (name !== undefined) {
      fields.push('name = ?');
      values.push(name);
    }
    if (description !== undefined) {
      fields.push('description = ?');
      values.push(description);
    }
    if (internal_url !== undefined) {
      fields.push('internal_url = ?');
      values.push(internal_url);
    }
    if (external_path !== undefined) {
      fields.push('external_path = ?');
      values.push(normalizedPath);
    }
    if (icon !== undefined) {
      fields.push('icon = ?');
      values.push(icon);
    }
    if (category !== undefined) {
      fields.push('category = ?');
      values.push(category);
    }
    if (is_enabled !== undefined) {
      fields.push('is_enabled = ?');
      values.push(is_enabled ? 1 : 0);
    }
    if (require_mfa !== undefined) {
      fields.push('require_mfa = ?');
      values.push(require_mfa ? 1 : 0);
    }
    if (auth_method_id !== undefined) {
      fields.push('auth_method_id = ?');
      values.push(auth_method_id);
    }
    if (allowed_users !== undefined) {
      fields.push('allowed_users = ?');
      values.push(allowed_users);
    }
    if (allow_internal_direct !== undefined) {
      fields.push('allow_internal_direct = ?');
      values.push(allow_internal_direct ? 1 : 0);
    }
    if (internal_ip_ranges !== undefined) {
      fields.push('internal_ip_ranges = ?');
      values.push(internal_ip_ranges);
    }
    if (direct_excluded_ips !== undefined) {
      fields.push('direct_excluded_ips = ?');
      values.push(direct_excluded_ips);
    }

    if (fields.length === 0) {
      return res.json({ message: '无更新内容' });
    }

    const sql = `UPDATE applications SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    db.run(sql, [...values, id], (err) => {
      if (err) {
        if (/unique/i.test(String(err.message))) {
          return res.status(400).json({ message: '外部路径已被使用' });
        }
        return res.status(500).json({ message: '更新应用失败' });
      }
      res.json({ message: '应用更新成功' });
    });
  }
});

// 删除应用
router.delete('/:id', requireAdmin, (req, res) => {
  const { id } = req.params;

  const db = getDB();
  db.run(
    'DELETE FROM applications WHERE id = ?',
    [id],
    function(err) {
      if (err) {
        return res.status(500).json({ message: '删除应用失败' });
      }

      if (this.changes === 0) {
        return res.status(404).json({ message: '应用不存在' });
      }

      res.json({ message: '应用删除成功' });
    }
  );
});

// 测试应用连接
router.post('/:id/test', requireAdmin, async (req, res) => {
  const { id } = req.params;

  const db = getDB();
  db.get(
    'SELECT * FROM applications WHERE id = ?',
    [id],
    async (err, application) => {
      if (err) {
        return res.status(500).json({ message: '数据库错误' });
      }

      if (!application) {
        return res.status(404).json({ message: '应用不存在' });
      }

      try {
        const startTime = Date.now();
        const response = await axios.get(application.internal_url, {
          timeout: 10000,
          validateStatus: () => true // 接受所有状态码
        });
        const responseTime = Date.now() - startTime;

        res.json({
          success: true,
          status: response.status,
          responseTime,
          message: `连接成功，响应时间: ${responseTime}ms`
        });
      } catch (error) {
        res.json({
          success: false,
          error: error.message,
          message: '连接失败'
        });
      }
    }
  );
});

// 获取应用统计信息
router.get('/stats/overview', requireAdmin, (req, res) => {
  const db = getDB();

  // 并行查询多个统计数据
  Promise.all([
    new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as total FROM applications', (err, row) => {
        if (err) reject(err);
        else resolve(row.total);
      });
    }),
    new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as enabled FROM applications WHERE is_enabled = 1', (err, row) => {
        if (err) reject(err);
        else resolve(row.enabled);
      });
    }),
    new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as mfa_required FROM applications WHERE require_mfa = 1', (err, row) => {
        if (err) reject(err);
        else resolve(row.mfa_required);
      });
    }),
    new Promise((resolve, reject) => {
      db.all('SELECT category, COUNT(*) as count FROM applications GROUP BY category', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    })
  ]).then(([total, enabled, mfaRequired, categories]) => {
    res.json({
      total,
      enabled,
      disabled: total - enabled,
      mfaRequired,
      categories: categories.reduce((acc, row) => {
        acc[row.category] = row.count;
        return acc;
      }, {})
    });
  }).catch(error => {
    console.error('Get application stats error:', error);
    res.status(500).json({ message: '获取统计信息失败' });
  });
});

module.exports = router; 