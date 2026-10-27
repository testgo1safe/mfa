import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { message } from 'antd';

// 创建axios实例
const api: AxiosInstance = axios.create({
  baseURL: process.env.NODE_ENV === 'production' ? '' : 'http://localhost:3001',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 请求拦截器
api.interceptors.request.use(
  (config: AxiosRequestConfig): any => {
    // 添加JWT token
    const token = localStorage.getItem('access_token');
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }

    // 添加企业微信token
    const wechatToken = localStorage.getItem('wechat_token');
    if (wechatToken && config.headers) {
      config.headers['X-WeChat-Token'] = wechatToken;
    }

    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// 响应拦截器
api.interceptors.response.use(
  (response: AxiosResponse) => {
    return response;
  },
  (error) => {
    console.error('API Error:', error);

    if (error.response) {
      const { status, data } = error.response;

      switch (status) {
        case 401:
          // 未认证，需要重新登录
          if (data.redirectUrl) {
            // 需要企业微信认证
            message.warning('需要企业微信认证，正在跳转...');
            setTimeout(() => {
              window.location.href = data.redirectUrl;
            }, 1000);
          } else {
            message.error('认证已过期，请重新登录');
            localStorage.removeItem('access_token');
            localStorage.removeItem('wechat_token');
            setTimeout(() => {
              window.location.href = '/login';
            }, 1000);
          }
          break;

        case 403:
          message.error(data.message || '您没有访问权限');
          break;

        case 404:
          message.error(data.message || '请求的资源不存在');
          break;

        case 429:
          message.error('请求过于频繁，请稍后再试');
          break;

        case 500:
          message.error(data.message || '服务器内部错误');
          break;

        default:
          message.error(data.message || '请求失败');
      }
    } else if (error.request) {
      // 网络错误
      message.error('网络连接失败，请检查网络状态');
    } else {
      message.error('请求配置错误');
    }

    return Promise.reject(error);
  }
);

// API方法封装
export const apiMethods = {
  // 用户认证相关
  auth: {
    login: (data: { username: string; password: string }) =>
      api.post('/api/auth/login', data),
    
    wechatLogin: (data: { wechat_token: string }) =>
      api.post('/api/auth/wechat-login', data),
    
    bindWechat: (data: { username: string; password: string; wechat_token: string }) =>
      api.post('/api/auth/bind-wechat', data),
    
    changePassword: (data: { username: string; oldPassword: string; newPassword: string }) =>
      api.post('/api/auth/change-password', data),
    
    getMe: () => api.get('/api/auth/me'),
    
    logout: () => api.post('/api/auth/logout'),

    // MFA相关
    getMFAStatus: () => api.get('/api/auth/mfa/status'),
    
    setupTOTP: () => api.post('/api/auth/mfa/totp/setup'),
    
    enableTOTP: (data: { token: string }) => 
      api.post('/api/auth/mfa/totp/enable', data),
    
    disableTOTP: (data: { password: string; totp_token?: string }) => 
      api.post('/api/auth/mfa/totp/disable', data),
  },

  // 企业微信相关
  wechat: {
    getAuthUrl: (redirect?: string) =>
      api.get('/api/wechat/auth-url', { params: { redirect } }),
    
    verifySession: (token: string) =>
      api.get('/api/wechat/verify-session', { params: { token } }),
    
    getJSConfig: (url: string) =>
      api.get('/api/wechat/js-config', { params: { url } }),
    
    generateCode: () =>
      api.get('/api/wechat/generate-code'),
    
    verifyPushCode: (data: { code: string; redirect_url?: string }) =>
      api.post('/api/wechat/verify-push-code', data),
  },

  // 用户管理相关
  users: {
    getList: (params: any) => api.get('/api/users', { params }),
    
    create: (data: any) => api.post('/api/users', data),
    
    getById: (id: number) => api.get(`/api/users/${id}`),
    
    update: (id: number, data: any) => api.put(`/api/users/${id}`, data),
    
    resetPassword: (id: number, data: { newPassword: string }) =>
      api.post(`/api/users/${id}/reset-password`, data),
    
    delete: (id: number) => api.delete(`/api/users/${id}`),
    
    getStats: () => api.get('/api/users/stats/overview'),
  },

  // MFA管理相关
  mfa: {
    getConfigs: (params: any) => api.get('/api/mfa/configs', { params }),
    
    generateTOTP: (data: { user_id: number }) =>
      api.post('/api/mfa/totp/generate', data),
    
    verifyTOTP: (data: { user_id: number; token: string }) =>
      api.post('/api/mfa/totp/verify', data),
    
    regenerateBackupCodes: (data: { user_id: number }) =>
      api.post('/api/mfa/backup-codes/regenerate', data),
    
    disable: (data: { user_id: number }) =>
      api.post('/api/mfa/disable', data),
    
    getStats: () => api.get('/api/mfa/stats'),
  },

  // 访问日志相关
  logs: {
    getAccessLogs: (params: any) => api.get('/api/logs/access', { params }),
    
    getStats: () => api.get('/api/logs/stats'),
    
    export: (params: any) => api.get('/api/logs/export', { params }),
    
    cleanup: (data: { days: number }) => api.delete('/api/logs/cleanup', { data }),
  },

  // 系统管理相关
  system: {
    getConfig: () => api.get('/api/system/config'),
    
    updateWechatConfig: (data: any) => api.put('/api/system/wechat-config', data),
    
    testWechatConnection: (data: any) => api.post('/api/system/test-wechat', data),
    
    updateSecurityPolicy: (data: any) => api.put('/api/system/security-policy', data),
    
    updateParams: (data: any) => api.put('/api/system/params', data),
    
    getStatus: () => api.get('/api/system/status'),
    
    maintenance: (data: { action: string }) => api.post('/api/system/maintenance', data),
  },

  // 应用管理相关
  applications: {
    getList: (params?: any) => api.get('/api/applications', { params }),
    
    create: (data: any) => api.post('/api/applications', data),
    
    getById: (id: number) => api.get(`/api/applications/${id}`),
    
    update: (id: number, data: any) => api.put(`/api/applications/${id}`, data),
    
    delete: (id: number) => api.delete(`/api/applications/${id}`),
    
    getStats: () => api.get('/api/applications/stats/overview'),
    
    testConnection: (id: number) => api.post(`/api/applications/${id}/test`),
  },

  // 认证方式管理相关
  authMethods: {
    getList: (params?: any) => api.get('/api/auth-methods', { params }),
    
    create: (data: any) => api.post('/api/auth-methods', data),
    
    getById: (id: number) => api.get(`/api/auth-methods/${id}`),
    
    update: (id: number, data: any) => api.put(`/api/auth-methods/${id}`, data),
    
    delete: (id: number) => api.delete(`/api/auth-methods/${id}`),
    
    getStats: () => api.get('/api/auth-methods/stats/overview'),
    
    test: (id: number, testData?: any) => api.post(`/api/auth-methods/${id}/test`, { test_data: testData }),
  },

  // 系统健康检查
  health: () => api.get('/api/health'),
};

export default api; 