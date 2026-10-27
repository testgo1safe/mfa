const express = require('express');
const { getDB } = require('../config/database');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

// 获取访问日志列表（仅管理员）
router.get('/access', requireAdmin, (req, res) => {
  const { 
    page = 1, 
    limit = 20, 
    username, 
    ip_address, 
    access_type, 
    status, 
    start_date, 
    end_date 
  } = req.query;
  
  const offset = (page - 1) * limit;
  
  let whereClause = 'WHERE 1=1';
  let params = [];
  
  if (username) {
    whereClause += ' AND username LIKE ?';
    params.push(`%${username}%`);
  }
  
  if (ip_address) {
    whereClause += ' AND ip_address LIKE ?';
    params.push(`%${ip_address}%`);
  }
  
  if (access_type) {
    whereClause += ' AND access_type = ?';
    params.push(access_type);
  }
  
  if (status) {
    whereClause += ' AND status = ?';
    params.push(status);
  }
  
  if (start_date) {
    whereClause += ' AND DATE(created_at) >= ?';
    params.push(start_date);
  }
  
  if (end_date) {
    whereClause += ' AND DATE(created_at) <= ?';
    params.push(end_date);
  }
  
  const db = getDB();
  
  // 获取总数
  db.get(
    `SELECT COUNT(*) as total FROM access_logs ${whereClause}`,
    params,
    (err, countResult) => {
      if (err) {
        console.error('Count access logs error:', err);
        return res.status(500).json({ message: '数据库错误' });
      }
      
      // 获取日志列表
      db.all(
        `SELECT * FROM access_logs ${whereClause} 
         ORDER BY created_at DESC 
         LIMIT ? OFFSET ?`,
        [...params, parseInt(limit), parseInt(offset)],
        (err, logs) => {
          if (err) {
            console.error('Get access logs error:', err);
            return res.status(500).json({ message: '数据库错误' });
          }
          
          res.json({
            logs,
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

// 获取访问日志统计（仅管理员）
router.get('/stats', requireAdmin, (req, res) => {
  const db = getDB();
  
  // 使用Promise.all来并行执行多个查询
  const queries = [
    // 总访问量
    new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as total FROM access_logs', (err, result) => {
        if (err) reject(err);
        else resolve(result.total);
      });
    }),
    
    // 今日访问量
    new Promise((resolve, reject) => {
      db.get(
        'SELECT COUNT(id) as today FROM access_logs WHERE DATE(created_at) = DATE("now")',
        (err, result) => {
          if (err) {
            console.error('Today logs query error:', err);
            resolve(0);
          } else {
            resolve(result ? result.today : 0);
          }
        }
      );
    }),
    
    // 成功访问量
    new Promise((resolve, reject) => {
      db.get(
        'SELECT COUNT(id) as success FROM access_logs WHERE status = ?',
        ['success'],
        (err, result) => {
          if (err) {
            console.error('Success logs query error:', err);
            resolve(0);
          } else {
            resolve(result ? result.success : 0);
          }
        }
      );
    }),
    
    // 失败访问量
    new Promise((resolve, reject) => {
      db.get(
        'SELECT COUNT(id) as failed FROM access_logs WHERE status = ? OR status = ?',
        ['failed', 'blocked'],
        (err, result) => {
          if (err) {
            console.error('Failed logs query error:', err);
            resolve(0);
          } else {
            resolve(result ? result.failed : 0);
          }
        }
      );
    }),
    
    // 独立用户数
    new Promise((resolve, reject) => {
      db.get(
        'SELECT COUNT(DISTINCT user_id) as users FROM access_logs WHERE user_id IS NOT NULL',
        (err, result) => {
          if (err) {
            console.error('Unique users query error:', err);
            resolve(0);
          } else {
            resolve(result ? result.users : 0);
          }
        }
      );
    }),
    
    // 独立IP数
    new Promise((resolve, reject) => {
      db.get(
        'SELECT COUNT(DISTINCT ip_address) as ips FROM access_logs',
        (err, result) => {
          if (err) {
            console.error('Unique IPs query error:', err);
            resolve(0);
          } else {
            resolve(result ? result.ips : 0);
          }
        }
      );
    }),
    
    // 热门用户
    new Promise((resolve, reject) => {
      db.all(
        `SELECT username, COUNT(*) as count 
         FROM access_logs 
         WHERE username IS NOT NULL 
         GROUP BY username 
         ORDER BY count DESC 
         LIMIT 5`,
        (err, results) => {
          if (err) reject(err);
          else resolve(results);
        }
      );
    }),
    
    // 热门IP
    new Promise((resolve, reject) => {
      db.all(
        `SELECT ip_address as ip, COUNT(*) as count 
         FROM access_logs 
         GROUP BY ip_address 
         ORDER BY count DESC 
         LIMIT 5`,
        (err, results) => {
          if (err) reject(err);
          else resolve(results);
        }
      );
    }),
    
    // 按小时统计（最近24小时）
    new Promise((resolve, reject) => {
      db.all(
        `SELECT 
           strftime('%H', created_at) as hour,
           COUNT(*) as count
         FROM access_logs 
         WHERE created_at >= datetime('now', '-24 hours')
         GROUP BY strftime('%H', created_at)
         ORDER BY hour`,
        (err, results) => {
          if (err) reject(err);
          else resolve(results);
        }
      );
    })
  ];
  
  Promise.all(queries)
    .then(([
      totalLogs,
      todayLogs,
      successLogs,
      failedLogs,
      uniqueUsers,
      uniqueIPs,
      topUsers,
      topIPs,
      hourlyStats
    ]) => {
      res.json({
        totalLogs,
        todayLogs,
        successLogs,
        failedLogs,
        uniqueUsers,
        uniqueIPs,
        topUsers,
        topIPs,
        hourlyStats
      });
    })
    .catch(err => {
      console.error('Get log stats error:', err);
      res.status(500).json({ message: '获取统计数据失败' });
    });
});

// 导出访问日志（仅管理员） - 流式/分页避免一次性读全表
router.get('/export', requireAdmin, async (req, res) => {
  const { format = 'csv', page_size, ...filters } = req.query;
  const pageSize = Math.min(parseInt(page_size || '5000', 10), 20000);

  try {
    let whereClause = 'WHERE 1=1';
    let params = [];

    if (filters.username) {
      whereClause += ' AND username LIKE ?';
      params.push(`%${filters.username}%`);
    }
    if (filters.ip_address) {
      whereClause += ' AND ip_address LIKE ?';
      params.push(`%${filters.ip_address}%`);
    }
    if (filters.access_type) {
      whereClause += ' AND access_type = ?';
      params.push(filters.access_type);
    }
    if (filters.status) {
      whereClause += ' AND status = ?';
      params.push(filters.status);
    }
    if (filters.start_date) {
      whereClause += ' AND DATE(created_at) >= ?';
      params.push(filters.start_date);
    }
    if (filters.end_date) {
      whereClause += ' AND DATE(created_at) <= ?';
      params.push(filters.end_date);
    }

    const db = getDB();

    if (String(format).toLowerCase() === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename=access_logs_${Date.now()}.csv`);
      res.write('\ufeff'); // BOM
      // header
      res.write('ID,用户ID,用户名,IP地址,用户代理,访问类型,应用ID,状态,错误信息,创建时间\n');

      let offset = 0;
      const fetchPage = () => new Promise((resolve, reject) => {
        db.all(
          `SELECT * FROM access_logs ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
          [...params, pageSize, offset],
          (err, rows) => err ? reject(err) : resolve(rows)
        );
      });

      while (true) {
        // eslint-disable-next-line no-await-in-loop
        const rows = await fetchPage();
        if (!rows || rows.length === 0) break;
        for (const log of rows) {
          const line = [
            log.id,
            log.user_id || '',
            (log.username || ''),
            (log.ip_address || ''),
            '"' + String(log.user_agent || '').replace(/"/g, '""') + '"',
            (log.access_type || ''),
            (log.application_id || ''),
            (log.status || ''),
            '"' + String(log.error_message || '').replace(/"/g, '""') + '"',
            log.created_at
          ].join(',') + '\n';
          if (!res.write(line)) {
            // backpressure
            await new Promise(r => res.once('drain', r));
          }
        }
        offset += rows.length;
        if (rows.length < pageSize) break;
      }
      return res.end();
    }

    // NDJSON（逐行 JSON）
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Content-Disposition', `attachment; filename=access_logs_${Date.now()}.ndjson`);

    let offset = 0;
    const fetchPage = () => new Promise((resolve, reject) => {
      db.all(
        `SELECT * FROM access_logs ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
        [...params, pageSize, offset],
        (err, rows) => err ? reject(err) : resolve(rows)
      );
    });

    while (true) {
      // eslint-disable-next-line no-await-in-loop
      const rows = await fetchPage();
      if (!rows || rows.length === 0) break;
      for (const log of rows) {
        const line = JSON.stringify(log) + '\n';
        if (!res.write(line)) {
          await new Promise(r => res.once('drain', r));
        }
      }
      offset += rows.length;
      if (rows.length < pageSize) break;
    }
    return res.end();
  } catch (error) {
    console.error('Export logs error:', error);
    // 避免部分内容已写出导致再次写头失败
    try {
      if (!res.headersSent) {
        res.status(500).json({ message: '导出失败' });
      } else {
        res.end();
      }
    } catch (e) {
      try { res.end(); } catch (e2) {}
    }
  }
});

// 清理旧日志（仅管理员）
router.delete('/cleanup', requireAdmin, (req, res) => {
  const { days = 90 } = req.body;
  
  if (!days || days < 30) {
    return res.status(400).json({ message: '保留天数不能少于30天' });
  }
  
  const db = getDB();
  
  db.run(
    'DELETE FROM access_logs WHERE created_at < datetime("now", "-" || ? || " days")',
    [days],
    function(err) {
      if (err) {
        console.error('Cleanup logs error:', err);
        return res.status(500).json({ message: '清理失败' });
      }
      
      res.json({ 
        message: '日志清理完成',
        deletedCount: this.changes
      });
    }
  );
});

module.exports = router; 