// Safari浏览器兼容性增强脚本
(function() {
  'use strict';
  
  // 检测Safari浏览器
  const isSafari = () => {
    const ua = navigator.userAgent.toLowerCase();
    return ua.includes('safari') && !ua.includes('chrome') && !ua.includes('chromium');
  };
  
  // Safari兼容性增强
  if (isSafari()) {
    console.log('Safari环境检测：启用兼容性增强');
    
    // 1. Cookie兼容性增强
    const originalSetCookie = document.cookie;
    
    // 2. 存储兼容性增强
    const enhanceStorage = () => {
      try {
        // 测试localStorage可用性
        localStorage.setItem('_test', '1');
        localStorage.removeItem('_test');
      } catch (e) {
        console.warn('localStorage不可用，使用sessionStorage备用');
        // 如果localStorage不可用，创建一个fallback
        if (!window.localStorage) {
          window.localStorage = window.sessionStorage;
        }
      }
    };
    
    // 3. 跳转兼容性增强
    const enhanceNavigation = () => {
      // 重写window.location.replace以提高Safari兼容性
      const originalReplace = window.location.replace;
      window.location.replace = function(url) {
        try {
          return originalReplace.call(this, url);
        } catch (e) {
          console.warn('location.replace失败，使用href代替:', e);
          window.location.href = url;
        }
      };
    };
    
    // 4. 防止Safari的"Back Forward Cache"导致的问题
    const preventBFCache = () => {
      window.addEventListener('pageshow', function(event) {
        if (event.persisted) {
          console.log('Safari BFCache检测：页面从缓存恢复，强制刷新');
          window.location.reload();
        }
      });
      
      // 页面卸载时清理
      window.addEventListener('pagehide', function() {
        // Safari特殊处理
      });
    };
    
    // 5. Cookie设置增强
    const enhanceCookies = () => {
      // 为Safari优化Cookie设置
      const originalDocumentCookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie') || 
                                     Object.getOwnPropertyDescriptor(HTMLDocument.prototype, 'cookie');
      
      if (originalDocumentCookie) {
        Object.defineProperty(document, 'cookie', {
          get: originalDocumentCookie.get,
          set: function(value) {
            // Safari兼容性处理
            try {
              return originalDocumentCookie.set.call(document, value);
            } catch (e) {
              console.warn('Cookie设置失败:', e);
            }
          },
          enumerable: true,
          configurable: true
        });
      }
    };
    
    // 6. 网络请求增强
    const enhanceNetworking = () => {
      // Fetch API增强
      const originalFetch = window.fetch;
      window.fetch = function(input, init = {}) {
        const url = typeof input === 'string' ? input : input.url;
        
        // Safari特殊处理
        if (!init.credentials) {
          init.credentials = 'include'; // 确保包含cookies
        }
        
        // 添加Safari特定的headers
        if (!init.headers) {
          init.headers = {};
        }
        
        // 为代理请求添加认证token
        if (url.includes('/proxy/') && !init.headers['Authorization']) {
          const authToken = localStorage.getItem('access_token') || 
                          localStorage.getItem('wechat_token') || 
                          sessionStorage.getItem('access_token');
          
          if (authToken) {
            init.headers['Authorization'] = 'Bearer ' + authToken;
          }
        }
        
        if (typeof init.headers.append === 'function') {
          init.headers.append('X-Safari-Compat', 'true');
        } else {
          init.headers['X-Safari-Compat'] = 'true';
        }
        
        return originalFetch.call(this, input, init).catch(error => {
          console.warn('Safari网络请求失败，重试:', error);
          
          // 对于代理请求的401错误，尝试认证修复
          if (url.includes('/proxy/')) {
            const urlParams = new URLSearchParams(window.location.search);
            const wechatToken = urlParams.get('wechat_token');
            
            if (wechatToken) {
              console.log('Safari检测到URL中的微信token，正在修复认证...');
              
              // 设置认证信息
              localStorage.setItem('access_token', wechatToken);
              localStorage.setItem('wechat_token', wechatToken);
              sessionStorage.setItem('access_token', wechatToken);
              
              // 设置Cookie
              const cookieOptions = location.protocol === 'https:' 
                ? '; Secure; SameSite=None' 
                : '; SameSite=Lax';
              document.cookie = `auth_token=${wechatToken}; path=/; max-age=86400${cookieOptions}`;
              document.cookie = `wechat_auth=${wechatToken}; path=/; max-age=86400; SameSite=Lax`;
              
              // 重新添加认证头
              init.headers['Authorization'] = 'Bearer ' + wechatToken;
              
              // 重试请求
              return originalFetch.call(this, input, init);
            }
          }
          
          // 一般重试机制
          return originalFetch.call(this, input, init);
        });
      };
    };
    
    // 7. 代理页面加载检测
    const detectProxyPageLoading = () => {
      // 检查是否成功加载了代理页面
      const checkProxyContent = () => {
        const body = document.body;
        if (body && body.innerHTML.trim() === '') {
          console.warn('Safari检测：代理页面内容为空，可能加载失败');
          // 尝试刷新
          setTimeout(() => {
            if (body.innerHTML.trim() === '') {
              console.log('Safari：页面仍然为空，执行刷新');
              window.location.reload();
            }
          }, 2000);
        }
      };
      
      // 页面加载完成后检查
      if (document.readyState === 'complete') {
        setTimeout(checkProxyContent, 1000);
      } else {
        window.addEventListener('load', () => {
          setTimeout(checkProxyContent, 1000);
        });
      }
    };
    
    // 应用所有增强
    try {
      enhanceStorage();
      enhanceNavigation();
      preventBFCache();
      enhanceCookies();
      enhanceNetworking();
      detectProxyPageLoading();
      
      console.log('Safari兼容性增强已启用');
    } catch (e) {
      console.error('Safari兼容性增强失败:', e);
    }
  }
})(); 