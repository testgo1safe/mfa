console.log('🔐 内网应用SSL配置检查');
console.log('='.repeat(50));

// 检查数据库中的应用配置
const checkApplicationSSLConfig = () => {
  console.log('\n1️⃣ 检查内网应用SSL配置');
  console.log('-'.repeat(30));
  
  const { getDB } = require('./server/config/database');
  const db = getDB();
  
  return new Promise((resolve) => {
    db.all('SELECT * FROM applications WHERE is_enabled = 1', [], (err, rows) => {
      if (err) {
        console.log('❌ 数据库查询失败:', err.message);
        resolve([]);
        return;
      }
      
      console.log(`📋 找到 ${rows.length} 个启用的应用:`);
      console.log('');
      
      rows.forEach((app, index) => {
        const isHttps = app.internal_url.startsWith('https://');
        const sslIcon = isHttps ? '🔒' : '🌐';
        const sslStatus = isHttps ? 'HTTPS' : 'HTTP';
        
        console.log(`${index + 1}. ${app.name} (${app.external_path})`);
        console.log(`   ${sslIcon} 内网地址: ${app.internal_url} (${sslStatus})`);
        console.log(`   🎯 认证方式: ${app.auth_method_id}`);
        
        if (isHttps) {
          console.log('   ⚠️  使用HTTPS - 可能存在自签名证书问题');
          console.log('   💡 建议: 检查内网应用是否使用自签名证书');
        } else {
          console.log('   ✅ 使用HTTP - 无SSL证书问题');
        }
        console.log('');
      });
      
      resolve(rows);
    });
  });
};

// 提供解决方案
const provideSolutions = (applications) => {
  console.log('\n2️⃣ 自签名证书问题解决方案');
  console.log('-'.repeat(30));
  
  const httpsApps = applications.filter(app => app.internal_url.startsWith('https://'));
  
  if (httpsApps.length === 0) {
    console.log('✅ 所有应用都使用HTTP，无SSL证书问题');
    return;
  }
  
  console.log(`🔍 发现 ${httpsApps.length} 个HTTPS内网应用:`);
  httpsApps.forEach(app => {
    console.log(`   - ${app.name}: ${app.internal_url}`);
  });
  console.log('');
  
  console.log('🔧 解决方案选项:');
  console.log('');
  
  console.log('方案一: 修改内网应用为HTTP (推荐)');
  console.log('   ✅ 最简单、最可靠的解决方案');
  console.log('   ✅ 避免所有SSL证书问题');
  console.log('   ✅ 内网通信无需加密（已有外层NGINX SSL保护）');
  console.log('   🔧 修改方法: 将内网应用配置改为HTTP端口');
  console.log('');
  
  console.log('方案二: 更新数据库配置为HTTP');
  console.log('   🔧 如果内网应用同时支持HTTP和HTTPS');
  console.log('   📝 需要执行SQL更新:');
  httpsApps.forEach(app => {
    const httpUrl = app.internal_url.replace('https://', 'http://').replace(':443', ':80');
    console.log(`   UPDATE applications SET internal_url='${httpUrl}' WHERE id=${app.id};`);
  });
  console.log('');
  
  console.log('方案三: 内网应用使用有效SSL证书');
  console.log('   🔧 为内网应用配置受信任的SSL证书');
  console.log('   ⚠️  复杂度高，成本高');
  console.log('   📋 需要内网CA或购买内网域名证书');
  console.log('');
  
  console.log('方案四: 保持现状，依赖已实施的代理优化');
  console.log('   🔧 使用已添加的强化自签名证书支持');
  console.log('   ⚠️  可能仍有移动端兼容性问题');
  console.log('   📋 需要持续监控和调优');
};

// 生成具体的修复SQL
const generateFixSQL = (applications) => {
  console.log('\n3️⃣ 快速修复SQL脚本');
  console.log('-'.repeat(30));
  
  const httpsApps = applications.filter(app => app.internal_url.startsWith('https://'));
  
  if (httpsApps.length === 0) {
    console.log('✅ 无需执行SQL修复');
    return;
  }
  
  console.log('🔧 将HTTPS内网应用改为HTTP的SQL脚本:');
  console.log('');
  console.log('-- 备份当前配置');
  console.log('CREATE TABLE applications_backup AS SELECT * FROM applications;');
  console.log('');
  console.log('-- 更新HTTPS为HTTP');
  
  httpsApps.forEach(app => {
    let httpUrl = app.internal_url.replace('https://', 'http://');
    
    // 常见端口转换
    if (httpUrl.includes(':443')) {
      httpUrl = httpUrl.replace(':443', ':80');
    } else if (!httpUrl.match(/:\d+/)) {
      // 如果没有端口，HTTPS默认443，改为HTTP需要指定80或应用实际HTTP端口
      const url = new URL(httpUrl);
      httpUrl = `http://${url.hostname}:80${url.pathname}`;
    }
    
    console.log(`UPDATE applications SET internal_url='${httpUrl}' WHERE id=${app.id}; -- ${app.name}`);
  });
  
  console.log('');
  console.log('-- 验证更新结果');
  console.log('SELECT name, external_path, internal_url FROM applications WHERE is_enabled = 1;');
  console.log('');
  console.log('⚠️  执行前请确认:');
  console.log('   1. 内网应用确实支持HTTP访问');
  console.log('   2. HTTP端口配置正确');
  console.log('   3. 已备份数据库');
};

// 主函数
const main = async () => {
  console.log('🚀 开始内网应用SSL配置检查...\n');
  
  try {
    const applications = await checkApplicationSSLConfig();
    provideSolutions(applications);
    generateFixSQL(applications);
    
    console.log('\n' + '='.repeat(50));
    console.log('📊 检查结果总结');
    console.log('='.repeat(50));
    
    const httpsCount = applications.filter(app => app.internal_url.startsWith('https://')).length;
    const httpCount = applications.length - httpsCount;
    
    console.log(`📈 统计信息:`);
    console.log(`   HTTP应用: ${httpCount} 个 ✅`);
    console.log(`   HTTPS应用: ${httpsCount} 个 ${httpsCount > 0 ? '⚠️' : '✅'}`);
    console.log('');
    
    if (httpsCount > 0) {
      console.log('🎯 推荐行动:');
      console.log('   1. 优先尝试方案一：改为HTTP访问');
      console.log('   2. 如果不可行，执行提供的SQL脚本');
      console.log('   3. 重启MFA服务测试效果');
      console.log('');
      console.log('💡 原理解释:');
      console.log('   外网 → NGINX(SSL) → MFA服务 → 内网应用(HTTP)');
      console.log('   这样既保证外网安全，又避免内网SSL问题');
    } else {
      console.log('✅ 配置正常，所有内网应用都使用HTTP');
    }
    
  } catch (error) {
    console.error('❌ 检查过程出错:', error.message);
  }
};

// 运行检查
if (require.main === module) {
  main();
}

module.exports = { checkApplicationSSLConfig, provideSolutions }; 