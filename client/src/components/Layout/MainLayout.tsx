import React, { useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  Layout,
  Menu,
  Avatar,
  Dropdown,
  Space,
  Typography,
  Badge,
  Button
} from 'antd';
import {
  DashboardOutlined,
  UserOutlined,
  SafetyOutlined,
  FileTextOutlined,
  SettingOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  BellOutlined,
  GlobalOutlined
} from '@ant-design/icons';
import { useAuth } from '../../contexts/AuthContext.tsx';
import { useNetwork } from '../../contexts/NetworkContext.tsx';

const { Header, Sider, Content } = Layout;
const { Text } = Typography;

const MainLayout: React.FC = () => {
  const [collapsed, setCollapsed] = useState(false);
  const { user, logout } = useAuth();
  const { networkInfo } = useNetwork();
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    {
      key: '/dashboard',
      icon: <DashboardOutlined />,
      label: '仪表板',
    },
    ...(user?.role === 'admin' ? [
      {
        key: '/users',
        icon: <UserOutlined />,
        label: '用户管理',
      },
      {
        key: '/applications',
        icon: <GlobalOutlined />,
        label: '应用管理',
      },
      {
        key: '/auth-methods',
        icon: <SafetyOutlined />,
        label: '认证方式',
      },
      {
        key: '/logs',
        icon: <FileTextOutlined />,
        label: '访问日志',
      }
    ] : []),
    {
      key: '/settings',
      icon: <SettingOutlined />,
      label: '设置',
    },
  ];

  const userMenuItems = [
    {
      key: 'profile',
      icon: <UserOutlined />,
      label: '个人资料',
      onClick: () => navigate('/settings'),
    },
    {
      key: 'logout',
      icon: <LogoutOutlined />,
      label: '退出登录',
      onClick: logout,
    },
  ];

  const handleMenuClick = ({ key }: { key: string }) => {
    navigate(key);
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider 
        trigger={null} 
        collapsible 
        collapsed={collapsed}
        theme="light"
        style={{
          boxShadow: '2px 0 8px 0 rgba(29,35,41,.05)',
        }}
      >
        <div style={{ 
          height: 64, 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          borderBottom: '1px solid #f0f0f0'
        }}>
          <Text strong style={{ fontSize: collapsed ? 14 : 16 }}>
            {collapsed ? 'MFA' : 'MFA管控平台'}
          </Text>
        </div>
        
        <Menu
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          style={{ borderRight: 0 }}
          onClick={handleMenuClick}
        />
      </Sider>

      <Layout>
        <Header 
          style={{ 
            padding: '0 24px', 
            background: '#fff',
            borderBottom: '1px solid #f0f0f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <Button
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={() => setCollapsed(!collapsed)}
              style={{ marginRight: 16 }}
            />
            
            {networkInfo && (
              <div className={`network-info ${networkInfo.isInternal ? 'network-info-internal' : 'network-info-external'}`}>
                <span>{networkInfo.isInternal ? '内网访问' : '外网访问'}</span>
                <span>{networkInfo.ip}</span>
              </div>
            )}
          </div>

          <Space>
            <Badge count={0} size="small">
              <Button 
                type="text" 
                icon={<BellOutlined />} 
                shape="circle"
              />
            </Badge>
            
            <Dropdown
              menu={{ items: userMenuItems }}
              placement="bottomRight"
              trigger={['click']}
            >
              <Space style={{ cursor: 'pointer', padding: '0 8px' }}>
                <Avatar 
                  size="small" 
                  icon={<UserOutlined />} 
                  style={{ backgroundColor: '#1890ff' }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                  <Text strong style={{ fontSize: 14 }}>
                    {user?.username}
                  </Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {user?.role === 'admin' ? '管理员' : '用户'}
                  </Text>
                </div>
              </Space>
            </Dropdown>
          </Space>
        </Header>

        <Content
          style={{
            margin: '24px',
            minHeight: 'calc(100vh - 112px)',
          }}
        >
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
};

export default MainLayout; 