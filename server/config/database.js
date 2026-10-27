const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/mfa.db');

// 确保数据目录存在
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new sqlite3.Database(DB_PATH);

const initDatabase = async () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // 启用并发与稳定性相关 PRAGMA 设置
      try {
        db.run(`PRAGMA journal_mode = WAL`);
        db.run(`PRAGMA synchronous = NORMAL`);
        db.run(`PRAGMA busy_timeout = ${parseInt(process.env.SQLITE_BUSY_TIMEOUT || '5000', 10)}`);
        db.run(`PRAGMA wal_autocheckpoint = 1000`);
      } catch (e) {
        console.warn('Failed to set PRAGMA options:', e?.message || e);
      }

      // 用户表
      db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        email VARCHAR(255),
        phone VARCHAR(20),
        role VARCHAR(50) DEFAULT 'user',
        status VARCHAR(20) DEFAULT 'active',
        wechat_userid VARCHAR(255),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // MFA配置表
      db.run(`CREATE TABLE IF NOT EXISTS mfa_configs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        mfa_type VARCHAR(50) NOT NULL,
        secret_key VARCHAR(255),
        is_enabled BOOLEAN DEFAULT 0,
        backup_codes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      )`);

      // 认证方式表
      db.run(`CREATE TABLE IF NOT EXISTS auth_methods (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(100) NOT NULL,
        description TEXT,
        icon VARCHAR(255),
        config TEXT,
        is_enabled BOOLEAN DEFAULT 1,
        is_system BOOLEAN DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // 应用表
      db.run(`CREATE TABLE IF NOT EXISTS applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        internal_url VARCHAR(255),
        external_path VARCHAR(255),
        icon VARCHAR(255),
        category VARCHAR(100),
        is_enabled BOOLEAN DEFAULT 1,
        require_mfa BOOLEAN DEFAULT 0,
        auth_method_id INTEGER DEFAULT 1,
        allowed_users TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (auth_method_id) REFERENCES auth_methods (id)
      )`);

      // 访问日志表
      db.run(`CREATE TABLE IF NOT EXISTS access_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER,
        username VARCHAR(255),
        ip_address VARCHAR(45),
        user_agent TEXT,
        access_type VARCHAR(50),
        application_id INTEGER,
        status VARCHAR(20),
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (application_id) REFERENCES applications (id)
      )`);

      // 企业微信会话表
      db.run(`CREATE TABLE IF NOT EXISTS wechat_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_token VARCHAR(255) UNIQUE NOT NULL,
        user_id INTEGER,
        wechat_userid VARCHAR(255),
        expires_at DATETIME NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )`);

      // 确保applications表新增列（若不存在）
      const ensureApplicationColumns = () => {
        return new Promise((resolveColumns, rejectColumns) => {
          db.all(`PRAGMA table_info(applications)`, (err, rows) => {
            if (err) {
              return rejectColumns(err);
            }
            const colNames = rows.map(r => r.name);
            const tasks = [];
            if (!colNames.includes('allow_internal_direct')) {
              tasks.push(new Promise((res, rej) => {
                db.run(`ALTER TABLE applications ADD COLUMN allow_internal_direct BOOLEAN DEFAULT 1`, (e) => e ? rej(e) : res());
              }));
            }
            if (!colNames.includes('internal_ip_ranges')) {
              tasks.push(new Promise((res, rej) => {
                db.run(`ALTER TABLE applications ADD COLUMN internal_ip_ranges TEXT`, (e) => e ? rej(e) : res());
              }));
            }
            if (!colNames.includes('direct_excluded_ips')) {
              tasks.push(new Promise((res, rej) => {
                db.run(`ALTER TABLE applications ADD COLUMN direct_excluded_ips TEXT`, (e) => e ? rej(e) : res());
              }));
            }
            Promise.all(tasks).then(() => resolveColumns()).catch(rejectColumns);
          });
        });
      };

      // 创建帮助索引（若不存在）
      const ensureIndexes = () => {
        const run = (sql) => new Promise((res, rej) => db.run(sql, (e) => e ? rej(e) : res()));
        const tasks = [
          // users
          run(`CREATE UNIQUE INDEX IF NOT EXISTS uq_users_username ON users(username)`),
          run(`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`),
          run(`CREATE INDEX IF NOT EXISTS idx_users_status ON users(status)`),
          run(`CREATE INDEX IF NOT EXISTS idx_users_wechat_userid ON users(wechat_userid)`),
          // mfa_configs
          run(`CREATE INDEX IF NOT EXISTS idx_mfa_user_type ON mfa_configs(user_id, mfa_type)`),
          run(`CREATE INDEX IF NOT EXISTS idx_mfa_user_type_enabled ON mfa_configs(user_id, mfa_type, is_enabled)`),
          // auth_methods
          run(`CREATE INDEX IF NOT EXISTS idx_auth_methods_type ON auth_methods(type)`),
          // applications
          run(`CREATE UNIQUE INDEX IF NOT EXISTS uq_applications_external_path ON applications(external_path)`),
          run(`CREATE INDEX IF NOT EXISTS idx_applications_external_path ON applications(external_path)`),
          run(`CREATE INDEX IF NOT EXISTS idx_applications_is_enabled ON applications(is_enabled)`),
          run(`CREATE INDEX IF NOT EXISTS idx_applications_category ON applications(category)`),
          run(`CREATE INDEX IF NOT EXISTS idx_applications_auth_method_id ON applications(auth_method_id)`),
          // access_logs
          run(`CREATE INDEX IF NOT EXISTS idx_access_logs_created_at ON access_logs(created_at)`),
          run(`CREATE INDEX IF NOT EXISTS idx_access_logs_user_id ON access_logs(user_id)`),
          run(`CREATE INDEX IF NOT EXISTS idx_access_logs_ip ON access_logs(ip_address)`),
          run(`CREATE INDEX IF NOT EXISTS idx_access_logs_status ON access_logs(status)`),
          run(`CREATE INDEX IF NOT EXISTS idx_access_logs_access_type ON access_logs(access_type)`),
          // wechat_sessions
          run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_wechat_sessions_session_token ON wechat_sessions(session_token)`),
          run(`CREATE INDEX IF NOT EXISTS idx_wechat_sessions_expires_at ON wechat_sessions(expires_at)`),
          run(`CREATE INDEX IF NOT EXISTS idx_wechat_sessions_user_id ON wechat_sessions(user_id)`)
        ];
        return Promise.all(tasks).then(() => undefined);
      };

      // 创建默认认证方式
      const defaultAuthMethods = [
        {
          id: 1,
          name: '用户名密码',
          type: 'password',
          description: '传统的用户名密码认证',
          icon: 'LockOutlined',
          config: '{}',
          is_system: 1,
          sort_order: 1
        },
        {
          id: 2,
          name: 'TOTP双因子',
          type: 'totp',
          description: 'Google Authenticator等TOTP应用',
          icon: 'SafetyOutlined',
          config: '{"window":2,"digits":6,"period":30}',
          is_system: 1,
          sort_order: 2
        },
        {
          id: 3,
          name: '企业微信扫码',
          type: 'wechat_qr',
          description: '企业微信扫码授权登录',
          icon: 'QrcodeOutlined',
          config: '{}',
          is_system: 1,
          sort_order: 3
        }
      ];

      const seedAuthMethods = () => {
        return new Promise((resolveSeed, rejectSeed) => {
          const stmt = db.prepare(`INSERT OR IGNORE INTO auth_methods (id, name, type, description, icon, config, is_enabled, is_system, sort_order) VALUES (?, ?, ?, ?, ?, ?, 1, 1, ?)`);
          defaultAuthMethods.forEach(m => stmt.run([m.id, m.name, m.type, m.description, m.icon, m.config, m.sort_order]));
          stmt.finalize((err) => err ? rejectSeed(err) : resolveSeed());
        });
      };
      
      ensureApplicationColumns()
        .then(() => ensureIndexes())
        .then(() => seedAuthMethods())
        .then(() => resolve())
        .catch(reject);
    });
  });
};

const getDB = () => db;

// 关闭数据库（用于优雅关停）
const closeDatabase = () => {
  return new Promise((resolve, reject) => {
    try {
      db.close((err) => err ? reject(err) : resolve());
    } catch (e) {
      resolve();
    }
  });
};

module.exports = { getDB, initDatabase, closeDatabase }; 