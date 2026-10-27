import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Layout, Spin, message } from 'antd';
import Login from './components/Login.tsx';
import Dashboard from './components/Dashboard.tsx';
import UserManagement from './components/UserManagement.tsx';
import AccessLogs from './components/AccessLogs.tsx';
import Settings from './components/Settings.tsx';
import ApplicationManagement from './components/ApplicationManagement.tsx';
import AuthMethodManagement from './components/AuthMethodManagement.tsx';
import WechatCodeInput from './components/WechatCodeInput.tsx';
import TotpCodeInput from './components/TotpCodeInput.tsx';
import MainLayout from './components/Layout/MainLayout.tsx';
import { AuthProvider, useAuth } from './contexts/AuthContext.tsx';
import { NetworkProvider } from './contexts/NetworkContext.tsx';
import api from './utils/api.ts';

const { Content } = Layout;

// 受保护的路由组件
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh' 
      }}>
        <Spin size="large" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

// 管理员路由组件
const AdminRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();

  if (!user || user.role !== 'admin') {
    message.error('您没有访问权限');
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
};

// 主应用路由
const AppRoutes: React.FC = () => {
  const { user } = useAuth();

  return (
    <Routes>
      <Route 
        path="/login" 
        element={user ? <Navigate to="/dashboard" replace /> : <Login />} 
      />
      <Route 
        path="/wechat-code" 
        element={<WechatCodeInput />} 
      />
      <Route 
        path="/totp-code" 
        element={<TotpCodeInput />} 
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route 
          path="users" 
          element={
            <AdminRoute>
              <UserManagement />
            </AdminRoute>
          } 
        />
        <Route 
          path="logs" 
          element={
            <AdminRoute>
              <AccessLogs />
            </AdminRoute>
          } 
        />
        <Route 
          path="applications" 
          element={
            <AdminRoute>
              <ApplicationManagement />
            </AdminRoute>
          } 
        />
        <Route 
          path="auth-methods" 
          element={
            <AdminRoute>
              <AuthMethodManagement />
            </AdminRoute>
          } 
        />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
};

// 主应用组件
const App: React.FC = () => {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 检查企业微信认证状态
    const checkWechatAuth = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const wechatToken = urlParams.get('wechat_token');
        
        if (wechatToken) {
          // 存储企业微信token
          localStorage.setItem('wechat_token', wechatToken);
          // 清除URL中的token参数
          window.history.replaceState({}, document.title, window.location.pathname);
        }

        // 检查网络状态
        await api.get('/api/health');
      } catch (error) {
        console.error('App initialization error:', error);
      } finally {
        setLoading(false);
      }
    };

    checkWechatAuth();
  }, []);

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh' 
      }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <Router>
      <NetworkProvider>
        <AuthProvider>
          <AppRoutes />
        </AuthProvider>
      </NetworkProvider>
    </Router>
  );
};

export default App; 