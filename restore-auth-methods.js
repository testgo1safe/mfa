const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data/mfa.db');

const restoreAuthMethods = async () => {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH);
    
    db.serialize(() => {
      // 恢复企业微信推送认证方式的配置
      db.run(
        `UPDATE auth_methods SET 
         config = ?, 
         is_enabled = 1,
         updated_at = CURRENT_TIMESTAMP 
         WHERE type = 'wechat_push'`,
        [JSON.stringify({
          "timeout": 120,
          "retry": 3,
          "app_secret": "your_wechat_app_secret_here"
        })],
        function(err) {
          if (err) {
            console.error('恢复企业微信推送配置失败:', err);
          } else {
            console.log('✅ 企业微信推送验证码配置已恢复');
          }
        }
      );
      
      // 恢复企业微信扫码认证方式的配置  
      db.run(
        `UPDATE auth_methods SET 
         config = ?, 
         is_enabled = 1,
         updated_at = CURRENT_TIMESTAMP 
         WHERE type = 'wechat_qr'`,
        [JSON.stringify({
          "timeout": 300
        })],
        function(err) {
          if (err) {
            console.error('恢复企业微信扫码配置失败:', err);
          } else {
            console.log('✅ 企业微信扫码认证配置已恢复');
          }
        }
      );
      
      // 恢复测试应用配置
      db.run(
        `INSERT OR REPLACE INTO applications 
         (id, name, description, internal_url, external_path, auth_method_id, require_mfa, is_enabled) 
         VALUES 
         (1, '测试应用1', '企业微信扫码认证测试', 'http://httpbin.org/get', '/proxy/test1', 3, 0, 1),
         (2, '测试应用2', '企业微信推送验证码测试', 'http://httpbin.org/post', '/proxy/test2', 4, 0, 1)`,
        function(err) {
          if (err) {
            console.error('恢复测试应用配置失败:', err);
          } else {
            console.log('✅ 测试应用配置已恢复');
            console.log('  - test1: 企业微信扫码认证');
            console.log('  - test2: 企业微信推送验证码');
          }
          db.close();
          resolve();
        }
      );
    });
  });
};

console.log('正在恢复认证方式和应用配置...');
restoreAuthMethods()
  .then(() => {
    console.log('✅ 配置恢复完成！');
    console.log('');
    console.log('📋 可用的认证方式:');
    console.log('  1. 用户名密码');
    console.log('  2. TOTP双因子');
    console.log('  3. 企业微信扫码 ✅');
    console.log('  4. 企业微信推送 ✅');
    console.log('  5. 短信验证码');
    console.log('  6. 邮箱验证码');
    console.log('');
    console.log('🔗 测试应用:');
    console.log('  - https://mfa.example.com/proxy/test1 (微信扫码)');
    console.log('  - https://mfa.example.com/proxy/test2 (推送验证码)');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ 配置恢复失败:', err);
    process.exit(1);
  }); 