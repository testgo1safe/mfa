const express = require('express');
const { getDB } = require('../config/database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// 获取认证方式列表
router.get('/', (req, res) => {
  const { enabled_only = false } = req.query;
  
  let whereClause = 'WHERE 1=1';
  let params = [];

  if (enabled_only === 'true') {
    whereClause += ' AND is_enabled = 1';
  }

  const db = getDB();
  db.all(
    `SELECT * FROM auth_methods ${whereClause} ORDER BY sort_order ASC, name ASC`,
    params,
    (err, authMethods) => {
      if (err) {
        return res.status(500).json({ message: '数据库错误' });
      }

      // 解析配置JSON
      const formattedMethods = authMethods.map(method => ({
        ...method,
        config: method.config ? JSON.parse(method.config) : {}
      }));

      res.json({ authMethods: formattedMethods });
    }
  );
});

// 获取单个认证方式详情
router.get('/:id', (req, res) => {
  const { id } = req.params;

  const db = getDB();
  db.get(
    'SELECT * FROM auth_methods WHERE id = ?',
    [id],
    (err, authMethod) => {
      if (err) {
        return res.status(500).json({ message: '数据库错误' });
      }

      if (!authMethod) {
        return res.status(404).json({ message: '认证方式不存在' });
      }

      // 解析配置JSON
      authMethod.config = authMethod.config ? JSON.parse(authMethod.config) : {};

      res.json({ authMethod });
    }
  );
});

// 创建自定义认证方式（仅管理员）
router.post('/', requireAdmin, (req, res) => {
  const { 
    name, 
    type, 
    description, 
    icon, 
    config = {}, 
    is_enabled = true,
    sort_order = 0 
  } = req.body;

  if (!name || !type) {
    return res.status(400).json({ message: '认证方式名称和类型不能为空' });
  }

  const db = getDB();

  // 检查类型是否已存在（系统类型不允许重复）
  db.get(
    'SELECT id FROM auth_methods WHERE type = ? AND is_system = 1',
    [type],
    (err, existing) => {
      if (err) {
        return res.status(500).json({ message: '数据库错误' });
      }

      if (existing) {
        return res.status(400).json({ message: '该认证方式类型已存在系统默认配置' });
      }

      // 创建认证方式
      db.run(
        `INSERT INTO auth_methods 
         (name, type, description, icon, config, is_enabled, is_system, sort_order) 
         VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
        [name, type, description, icon, JSON.stringify(config), is_enabled ? 1 : 0, sort_order],
        function(err) {
          if (err) {
            return res.status(500).json({ message: '创建认证方式失败' });
          }

          res.status(201).json({
            message: '认证方式创建成功',
            id: this.lastID
          });
        }
      );
    }
  );
});

// 更新认证方式（仅管理员）
router.put('/:id', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { 
    name, 
    description, 
    icon, 
    config, 
    is_enabled,
    sort_order 
  } = req.body;

  const db = getDB();

  // 首先检查是否为系统认证方式
  db.get(
    'SELECT is_system FROM auth_methods WHERE id = ?',
    [id],
    (err, authMethod) => {
      if (err) {
        return res.status(500).json({ message: '数据库错误' });
      }

      if (!authMethod) {
        return res.status(404).json({ message: '认证方式不存在' });
      }

      const fields = [];
      const values = [];

      // 系统认证方式只允许修改配置和启用状态
      if (authMethod.is_system) {
        if (config !== undefined) {
          fields.push('config = ?');
          values.push(JSON.stringify(config));
        }
        if (is_enabled !== undefined) {
          fields.push('is_enabled = ?');
          values.push(is_enabled ? 1 : 0);
        }
        if (sort_order !== undefined) {
          fields.push('sort_order = ?');
          values.push(sort_order);
        }
      } else {
        // 自定义认证方式允许修改所有字段
        if (name !== undefined) {
          fields.push('name = ?');
          values.push(name);
        }
        if (description !== undefined) {
          fields.push('description = ?');
          values.push(description);
        }
        if (icon !== undefined) {
          fields.push('icon = ?');
          values.push(icon);
        }
        if (config !== undefined) {
          fields.push('config = ?');
          values.push(JSON.stringify(config));
        }
        if (is_enabled !== undefined) {
          fields.push('is_enabled = ?');
          values.push(is_enabled ? 1 : 0);
        }
        if (sort_order !== undefined) {
          fields.push('sort_order = ?');
          values.push(sort_order);
        }
      }

      if (fields.length === 0) {
        return res.status(400).json({ message: '没有需要更新的字段' });
      }

      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(id);

      db.run(
        `UPDATE auth_methods SET ${fields.join(', ')} WHERE id = ?`,
        values,
        function(err) {
          if (err) {
            return res.status(500).json({ message: '更新认证方式失败' });
          }

          res.json({ message: '认证方式更新成功' });
        }
      );
    }
  );
});

// 删除自定义认证方式（仅管理员）
router.delete('/:id', requireAdmin, (req, res) => {
  const { id } = req.params;

  const db = getDB();

  // 检查是否为系统认证方式
  db.get(
    'SELECT is_system, name FROM auth_methods WHERE id = ?',
    [id],
    (err, authMethod) => {
      if (err) {
        return res.status(500).json({ message: '数据库错误' });
      }

      if (!authMethod) {
        return res.status(404).json({ message: '认证方式不存在' });
      }

      if (authMethod.is_system) {
        return res.status(400).json({ message: '系统内置认证方式不能删除' });
      }

      // 检查是否有应用在使用
      db.get(
        'SELECT COUNT(*) as count FROM applications WHERE auth_method_id = ?',
        [id],
        (err, result) => {
          if (err) {
            return res.status(500).json({ message: '数据库错误' });
          }

          if (result.count > 0) {
            return res.status(400).json({ 
              message: `无法删除，有 ${result.count} 个应用正在使用此认证方式` 
            });
          }

          // 删除认证方式
          db.run(
            'DELETE FROM auth_methods WHERE id = ?',
            [id],
            function(err) {
              if (err) {
                return res.status(500).json({ message: '删除认证方式失败' });
              }

              res.json({ message: '认证方式删除成功' });
            }
          );
        }
      );
    }
  );
});

// 测试认证方式配置
router.post('/:id/test', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { test_data } = req.body;

  const db = getDB();

  try {
    // 获取认证方式配置
    const authMethod = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM auth_methods WHERE id = ?', [id], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!authMethod) {
      return res.status(404).json({ message: '认证方式不存在' });
    }

    if (!authMethod.is_enabled) {
      return res.status(400).json({ message: '认证方式未启用' });
    }

    const config = authMethod.config ? JSON.parse(authMethod.config) : {};
    const testResult = await testAuthMethod(authMethod.type, config, test_data);

    res.json({
      success: true,
      result: testResult,
      message: '测试成功'
    });

  } catch (error) {
    console.error('Test auth method error:', error);
    res.status(500).json({
      success: false,
      message: error.message || '测试失败'
    });
  }
});

// 认证方式测试函数
async function testAuthMethod(type, config, testData) {
  switch (type) {
    case 'password':
      return {
        status: 'success',
        message: '用户名密码认证配置正常',
        details: {
          type: 'password',
          configured: true
        }
      };

    case 'totp':
      return {
        status: 'success',
        message: 'TOTP认证配置正常',
        details: {
          issuer: config.issuer || 'MFA管控平台',
          digits: config.digits || 6,
          period: config.period || 30,
          window: config.window || 2
        }
      };

    case 'sms':
      // 验证短信配置参数
      const requiredSmsFields = ['provider', 'access_key_id', 'access_key_secret', 'sign_name', 'template_code'];
      const missingSmsFields = requiredSmsFields.filter(field => !config[field]);
      
      if (missingSmsFields.length > 0) {
        throw new Error(`缺少必要配置: ${missingSmsFields.join(', ')}`);
      }

      return {
        status: 'success',
        message: '短信验证码配置正常',
        details: {
          provider: config.provider,
          sign_name: config.sign_name,
          template_code: config.template_code,
          timeout: config.timeout || 300
        }
      };

    case 'email':
      // 验证邮箱配置参数
      const requiredEmailFields = ['smtp_host', 'smtp_user', 'smtp_password', 'from_email'];
      const missingEmailFields = requiredEmailFields.filter(field => !config[field]);
      
      if (missingEmailFields.length > 0) {
        throw new Error(`缺少必要配置: ${missingEmailFields.join(', ')}`);
      }

      return {
        status: 'success',
        message: '邮箱验证码配置正常',
        details: {
          smtp_host: config.smtp_host,
          smtp_port: config.smtp_port || 587,
          from_email: config.from_email,
          timeout: config.timeout || 600
        }
      };

    case 'wechat_qr':
      // 验证企业微信扫码配置
      const requiredWechatQrFields = ['corp_id', 'agent_id', 'app_secret', 'redirect_uri'];
      const missingWechatQrFields = requiredWechatQrFields.filter(field => !config[field]);
      
      if (missingWechatQrFields.length > 0) {
        throw new Error(`缺少必要配置: ${missingWechatQrFields.join(', ')}`);
      }

      return {
        status: 'success',
        message: '企业微信扫码认证配置正常',
        details: {
          corp_id: config.corp_id,
          agent_id: config.agent_id,
          redirect_uri: config.redirect_uri,
          timeout: config.timeout || 300
        }
      };

    case 'wechat_push':
      // 验证企业微信推送配置
      const requiredWechatPushFields = ['corp_id', 'agent_id', 'app_secret', 'template_id'];
      const missingWechatPushFields = requiredWechatPushFields.filter(field => !config[field]);
      
      if (missingWechatPushFields.length > 0) {
        throw new Error(`缺少必要配置: ${missingWechatPushFields.join(', ')}`);
      }

      return {
        status: 'success',
        message: '企业微信推送认证配置正常',
        details: {
          corp_id: config.corp_id,
          agent_id: config.agent_id,
          template_id: config.template_id,
          timeout: config.timeout || 120
        }
      };

    case 'ldap':
      // 验证LDAP配置
      const requiredLdapFields = ['server_url', 'bind_dn', 'bind_password', 'search_base'];
      const missingLdapFields = requiredLdapFields.filter(field => !config[field]);
      
      if (missingLdapFields.length > 0) {
        throw new Error(`缺少必要配置: ${missingLdapFields.join(', ')}`);
      }

      return {
        status: 'success',
        message: 'LDAP认证配置正常',
        details: {
          server_url: config.server_url,
          search_base: config.search_base,
          user_filter: config.user_filter || '(uid={username})'
        }
      };

    case 'oauth':
      // 验证OAuth配置
      const requiredOauthFields = ['provider', 'client_id', 'client_secret'];
      const missingOauthFields = requiredOauthFields.filter(field => !config[field]);
      
      if (missingOauthFields.length > 0) {
        throw new Error(`缺少必要配置: ${missingOauthFields.join(', ')}`);
      }

      return {
        status: 'success',
        message: 'OAuth认证配置正常',
        details: {
          provider: config.provider,
          client_id: config.client_id,
          has_secret: !!config.client_secret
        }
      };

    default:
      return {
        status: 'success',
        message: '自定义认证方式配置已保存',
        details: {
          type: 'custom',
          configured: Object.keys(config).length > 0
        }
      };
  }
}

// 获取认证方式统计信息
router.get('/stats/overview', requireAdmin, (req, res) => {
  const db = getDB();

  Promise.all([
    new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as total FROM auth_methods', (err, row) => {
        if (err) reject(err);
        else resolve(row.total);
      });
    }),
    new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as enabled FROM auth_methods WHERE is_enabled = 1', (err, row) => {
        if (err) reject(err);
        else resolve(row.enabled);
      });
    }),
    new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as system FROM auth_methods WHERE is_system = 1', (err, row) => {
        if (err) reject(err);
        else resolve(row.system);
      });
    }),
    new Promise((resolve, reject) => {
      db.all(
        `SELECT am.name, am.type, COUNT(a.id) as app_count 
         FROM auth_methods am 
         LEFT JOIN applications a ON am.id = a.auth_method_id 
         GROUP BY am.id, am.name, am.type 
         ORDER BY app_count DESC`,
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    })
  ]).then(([total, enabled, system, usage]) => {
    res.json({
      total,
      enabled,
      disabled: total - enabled,
      system,
      custom: total - system,
      usage
    });
  }).catch(error => {
    console.error('Get auth methods stats error:', error);
    res.status(500).json({ message: '获取统计信息失败' });
  });
});

module.exports = router; 