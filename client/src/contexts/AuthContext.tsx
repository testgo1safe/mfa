import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { message } from 'antd';
import { apiMethods } from '../utils/api.ts';

interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  wechat_userid?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  wechatLogin: (wechatToken: string) => Promise<{ success: boolean; needBind?: boolean; wechat_userid?: string }>;
  bindWechat: (username: string, password: string, wechatToken: string) => Promise<boolean>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // 检查用户登录状态
  const checkAuthStatus = async () => {
    try {
      const token = localStorage.getItem('access_token');
      const wechatToken = localStorage.getItem('wechat_token');

      if (!token && !wechatToken) {
        setLoading(false);
        return;
      }

      const response = await apiMethods.auth.getMe();
      setUser(response.data.user);
    } catch (error: any) {
      console.error('Check auth status error:', error);
      // 清除无效的token
      localStorage.removeItem('access_token');
      if (error.response?.status === 401) {
        localStorage.removeItem('wechat_token');
      }
    } finally {
      setLoading(false);
    }
  };

  // 用户名密码登录
  const login = async (username: string, password: string): Promise<boolean> => {
    try {
      setLoading(true);
      const response = await apiMethods.auth.login({ username, password });
      
      const { token, user: userData } = response.data;
      localStorage.setItem('access_token', token);
      setUser(userData);
      
      message.success('登录成功');
      return true;
    } catch (error: any) {
      console.error('Login error:', error);
      message.error(error.response?.data?.message || '登录失败');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // 企业微信登录
  const wechatLogin = async (wechatToken: string): Promise<{ success: boolean; needBind?: boolean; wechat_userid?: string }> => {
    try {
      setLoading(true);
      const response = await apiMethods.auth.wechatLogin({ wechat_token: wechatToken });
      
      if (response.data.needBind) {
        return {
          success: false,
          needBind: true,
          wechat_userid: response.data.wechat_userid
        };
      }

      const { token, user: userData } = response.data;
      localStorage.setItem('access_token', token);
      setUser(userData);
      
      message.success('企业微信登录成功');
      return { success: true };
    } catch (error: any) {
      console.error('WeChat login error:', error);
      message.error(error.response?.data?.message || '企业微信登录失败');
      return { success: false };
    } finally {
      setLoading(false);
    }
  };

  // 绑定企业微信账号
  const bindWechat = async (username: string, password: string, wechatToken: string): Promise<boolean> => {
    try {
      setLoading(true);
      await apiMethods.auth.bindWechat({ username, password, wechat_token: wechatToken });
      
      message.success('绑定成功，请重新登录');
      return true;
    } catch (error: any) {
      console.error('Bind WeChat error:', error);
      message.error(error.response?.data?.message || '绑定失败');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // 注销
  const logout = async () => {
    try {
      await apiMethods.auth.logout();
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      localStorage.removeItem('access_token');
      localStorage.removeItem('wechat_token');
      setUser(null);
      message.success('已成功注销');
    }
  };

  // 刷新用户信息
  const refreshUser = async () => {
    try {
      const response = await apiMethods.auth.getMe();
      setUser(response.data.user);
    } catch (error) {
      console.error('Refresh user error:', error);
    }
  };

  useEffect(() => {
    checkAuthStatus();
  }, []);

  const value: AuthContextType = {
    user,
    loading,
    login,
    wechatLogin,
    bindWechat,
    logout,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}; 