const fs = require('fs');
const path = require('path');
const https = require('https');

console.log('🔐 SSL证书诊断工具');
console.log('='.repeat(50));

// 1. 检查SSL证书文件
const checkSSLFiles = () => {
  console.log('\n1️⃣ 检查SSL证书文件');
  console.log('-'.repeat(30));
  
  const sslPath = path.join(__dirname, 'ssl');
  const files = {
    'PFX证书': path.join(sslPath, 'server.pfx'),
    'CRT证书': path.join(sslPath, 'server.crt'), 
    '私钥文件': path.join(sslPath, 'server.key'),
    '密码文件': path.join(sslPath, 'cert-password.txt')
  };
  
  let allFilesExist = true;
  
  Object.entries(files).forEach(([name, filePath]) => {
    const exists = fs.existsSync(filePath);
    const size = exists ? fs.statSync(filePath).size : 0;
    
    console.log(`${exists ? '✅' : '❌'} ${name}: ${exists ? `存在 (${size} bytes)` : '不存在'}`);
    
    if (!exists) allFilesExist = false;
  });
  
  return allFilesExist;
};

// 2. 测试SSL证书加载
const testSSLCertificateLoading = () => {
  console.log('\n2️⃣ 测试SSL证书加载');
  console.log('-'.repeat(30));
  
  try {
    const sslPath = path.join(__dirname, 'ssl');
    const pfxPath = path.join(sslPath, 'server.pfx');
    const certPath = path.join(sslPath, 'server.crt');
    const keyPath = path.join(sslPath, 'server.key');
    const passwordPath = path.join(sslPath, 'cert-password.txt');
    
    // 测试PFX证书
    if (fs.existsSync(pfxPath) && fs.existsSync(passwordPath)) {
      try {
        const password = fs.readFileSync(passwordPath, 'utf8').trim();
        const pfxData = fs.readFileSync(pfxPath);
        
        console.log('✅ PFX证书读取成功');
        console.log(`   密码长度: ${password.length} 字符`);
        console.log(`   PFX文件大小: ${pfxData.length} bytes`);
        
        // 尝试创建SSL配置
        const sslOptions = {
          pfx: pfxData,
          passphrase: password
        };
        
        console.log('✅ PFX SSL配置创建成功');
        return { type: 'pfx', options: sslOptions };
        
      } catch (pfxError) {
        console.log('❌ PFX证书加载失败:', pfxError.message);
      }
    }
    
    // 测试分离的证书文件
    if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
      try {
        const cert = fs.readFileSync(certPath);
        const key = fs.readFileSync(keyPath);
        
        console.log('✅ CRT/KEY证书读取成功');
        console.log(`   证书文件大小: ${cert.length} bytes`);
        console.log(`   私钥文件大小: ${key.length} bytes`);
        
        const sslOptions = {
          cert: cert,
          key: key
        };
        
        console.log('✅ CRT/KEY SSL配置创建成功');
        return { type: 'crt-key', options: sslOptions };
        
      } catch (crtError) {
        console.log('❌ CRT/KEY证书加载失败:', crtError.message);
      }
    }
    
    console.log('❌ 无法加载任何SSL证书');
    return null;
    
  } catch (error) {
    console.log('❌ SSL证书测试失败:', error.message);
    return null;
  }
};

// 3. 测试HTTPS服务器创建
const testHTTPSServerCreation = (sslConfig) => {
  console.log('\n3️⃣ 测试HTTPS服务器创建');
  console.log('-'.repeat(30));
  
  if (!sslConfig) {
    console.log('❌ 无SSL配置，跳过服务器测试');
    return false;
  }
  
  try {
    // 创建简单的Express应用用于测试
    const express = require('express');
    const app = express();
    
    app.get('/test', (req, res) => {
      res.json({ status: 'SSL Test OK', timestamp: new Date().toISOString() });
    });
    
    // 尝试创建HTTPS服务器
    const server = https.createServer(sslConfig.options, app);
    
    console.log(`✅ HTTPS服务器创建成功 (${sslConfig.type})`);
    
    // 尝试监听端口（使用测试端口）
    const testPort = 8443;
    
    return new Promise((resolve) => {
      server.listen(testPort, (err) => {
        if (err) {
          console.log('❌ HTTPS服务器监听失败:', err.message);
          resolve(false);
        } else {
          console.log(`✅ HTTPS服务器监听成功 (端口 ${testPort})`);
          
          // 立即关闭测试服务器
          server.close(() => {
            console.log('✅ 测试服务器已关闭');
            resolve(true);
          });
        }
      });
      
      // 10秒超时
      setTimeout(() => {
        console.log('⏰ 测试超时');
        server.close();
        resolve(false);
      }, 10000);
    });
    
  } catch (error) {
    console.log('❌ HTTPS服务器创建失败:', error.message);
    return false;
  }
};

// 4. 分析Load failed错误原因
const analyzeLoadFailedError = () => {
  console.log('\n4️⃣ Load Failed 错误分析');
  console.log('-'.repeat(30));
  
  console.log('🔍 Load Failed 错误通常由以下原因引起:');
  console.log('');
  
  console.log('1. SSL/TLS握手失败:');
  console.log('   - 证书过期或无效');
  console.log('   - 证书与域名不匹配');
  console.log('   - 加密套件不兼容');
  console.log('');
  
  console.log('2. 移动端浏览器特殊限制:');
  console.log('   - Safari严格的SSL验证');
  console.log('   - Edge移动版连接策略');
  console.log('   - 自签名证书被拒绝');
  console.log('');
  
  console.log('3. 网络层面问题:');
  console.log('   - 防火墙阻止HTTPS连接');
  console.log('   - 代理服务器SSL配置错误');
  console.log('   - 内网SSL证书验证失败');
  console.log('');
  
  console.log('4. CORS和安全策略:');
  console.log('   - 混合内容阻止 (HTTP->HTTPS)');
  console.log('   - 严格传输安全 (HSTS)');
  console.log('   - 内容安全策略 (CSP)');
};

// 5. 提供解决方案
const provideSolutions = () => {
  console.log('\n5️⃣ 解决方案建议');
  console.log('-'.repeat(30));
  
  console.log('🔧 立即可以尝试的解决方案:');
  console.log('');
  
  console.log('1. 代理配置优化:');
  console.log('   - 在代理中间件中禁用SSL验证');
  console.log('   - 添加移动端特定的SSL配置');
  console.log('   - 增强错误处理和重试机制');
  console.log('');
  
  console.log('2. 证书配置修复:');
  console.log('   - 确保证书包含正确的域名 (*.example.com)');
  console.log('   - 检查证书链的完整性');
  console.log('   - 验证证书未过期');
  console.log('');
  
  console.log('3. 移动端兼容性:');
  console.log('   - 配置更宽松的SSL策略');
  console.log('   - 添加浏览器特定的SSL处理');
  console.log('   - 提供HTTP备用方案');
  console.log('');
  
  console.log('💡 推荐的修复步骤:');
  console.log('1. 先优化代理SSL处理 (最快)');
  console.log('2. 然后检查证书有效性');
  console.log('3. 最后考虑重新生成证书');
};

// 主函数
const runDiagnostics = async () => {
  console.log('🚀 开始SSL证书诊断...\n');
  
  const filesOK = checkSSLFiles();
  const sslConfig = testSSLCertificateLoading();
  const serverOK = sslConfig ? await testHTTPSServerCreation(sslConfig) : false;
  
  analyzeLoadFailedError();
  provideSolutions();
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 诊断结果总结');
  console.log('='.repeat(50));
  
  const results = {
    'SSL文件存在': filesOK ? '✅ 正常' : '❌ 缺失',
    '证书加载': sslConfig ? `✅ 成功 (${sslConfig.type})` : '❌ 失败',
    'HTTPS服务器': serverOK ? '✅ 正常' : '❌ 异常',
    'Load Failed原因': '可能是移动端SSL验证严格'
  };
  
  Object.entries(results).forEach(([test, result]) => {
    console.log(`${result} ${test}`);
  });
  
  console.log('\n🎯 下一步建议:');
  if (filesOK && sslConfig && serverOK) {
    console.log('证书配置基本正常，问题可能在于移动端浏览器的SSL验证严格性');
    console.log('建议优化代理配置以提升移动端兼容性');
  } else {
    console.log('SSL配置存在问题，需要修复证书配置');
  }
  
  return {
    filesOK,
    sslConfig: !!sslConfig,
    serverOK,
    recommendation: filesOK && sslConfig && serverOK ? 'proxy_optimization' : 'ssl_fix'
  };
};

// 运行诊断
if (require.main === module) {
  runDiagnostics().catch(console.error);
}

module.exports = { runDiagnostics }; 