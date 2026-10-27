const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data/mfa.db');

const resetAdminPassword = async (newPassword) => {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH);
    
    // 生成密码哈希
    const hashedPassword = bcrypt.hashSync(newPassword, 10);
    
    // 更新管理员密码
    db.run(
      `UPDATE users SET password = ?, updated_at = CURRENT_TIMESTAMP WHERE username = 'admin'`,
      [hashedPassword],
      function(err) {
        if (err) {
          console.error('密码重置失败:', err);
          reject(err);
        } else if (this.changes === 0) {
          console.error('未找到admin用户');
          reject(new Error('Admin user not found'));
        } else {
          console.log('✅ 管理员密码重置成功!');
          console.log('新密码:', newPassword);
          resolve();
        }
        db.close();
      }
    );
  });
};

// 命令行参数
const newPassword = process.argv[2];

if (!newPassword) {
  console.log('用法: node reset-admin-password.js <新密码>');
  console.log('示例: node reset-admin-password.js MyNewPassword123!');
  process.exit(1);
}

if (newPassword.length < 8) {
  console.log('❌ 密码长度至少8位');
  process.exit(1);
}

console.log('正在重置管理员密码...');
resetAdminPassword(newPassword)
  .then(() => {
    console.log('✅ 密码重置完成，请重启服务');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ 密码重置失败:', err.message);
    process.exit(1);
  }); 