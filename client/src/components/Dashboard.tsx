import React, { useState, useEffect } from 'react';
import {
  Row,
  Col,
  Card,
  Statistic,
  Typography,
  Table,
  Tag,
  Space,
  Button,
  Alert,
  Spin
} from 'antd';
  import {
    UserOutlined,
    SafetyOutlined,
    EyeOutlined,
    ReloadOutlined
  } from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext.tsx';
import { useNetwork } from '../contexts/NetworkContext.tsx';
import { apiMethods } from '../utils/api.ts';
import dayjs from 'dayjs';

const { Title, Text } = Typography;

interface UserStats {
  total: number;
  active: number;
  admins: number;
  wechatBound: number;
  inactive: number;
}

interface MFAStats {
  totalUsers: number;
  mfaEnabled: number;
  mfaDisabled: number;
  enabledRate: string;
  typeStats: { [key: string]: number };
}

interface AccessLog {
  id: number;
  username: string;
  ip_address: string;
  access_type: string;
  status: string;
  created_at: string;
}

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const { networkInfo } = useNetwork();
  const [loading, setLoading] = useState(true);
  const [userStats, setUserStats] = useState<UserStats | null>(null);
  const [mfaStats, setMFAStats] = useState<MFAStats | null>(null);
  const [recentLogs, setRecentLogs] = useState<AccessLog[]>([]);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      const promises = [];
      
      if (user?.role === 'admin') {
        promises.push(apiMethods.users.getStats());
        promises.push(apiMethods.mfa.getStats());
      }
      
      const results = await Promise.allSettled(promises);
      
      if (user?.role === 'admin') {
        if (results[0].status === 'fulfilled') {
          setUserStats(results[0].value.data);
        }
        if (results[1].status === 'fulfilled') {
          setMFAStats(results[1].value.data);
        }
      }
      
    } catch (error) {
      console.error('Load dashboard data error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboardData();
  }, [user]);

  const accessLogColumns = [
    {
      title: '用户',
      dataIndex: 'username',
      key: 'username',
      render: (username: string) => username || '未知',
    },
    {
      title: 'IP地址',
      dataIndex: 'ip_address',
      key: 'ip_address',
    },
    {
      title: '访问类型',
      dataIndex: 'access_type',
      key: 'access_type',
      render: (type: string) => (
        <Tag color={type === 'internal' ? 'green' : 'orange'}>
          {type === 'internal' ? '内网' : '外网'}
        </Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'success' ? 'green' : 'red'}>
          {status === 'success' ? '成功' : '失败'}
        </Tag>
      ),
    },
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (time: string) => dayjs(time).format('MM-DD HH:mm'),
    },
  ];

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <Title level={3} style={{ margin: 0 }}>
              仪表板
            </Title>
            <Text type="secondary">
              欢迎回来，{user?.username}
            </Text>
          </div>
          <Button 
            icon={<ReloadOutlined />} 
            onClick={loadDashboardData}
            loading={loading}
          >
            刷新
          </Button>
        </div>
      </div>

      {/* 当前访问信息 */}
      {networkInfo && (
        <Alert
          message={
            <Space>
              <span>当前访问类型: </span>
              <Tag color={networkInfo.isInternal ? 'green' : 'orange'}>
                {networkInfo.isInternal ? '内网访问' : '外网访问'}
              </Tag>
              <span>IP: {networkInfo.ip}</span>
            </Space>
          }
          type={networkInfo.isInternal ? 'success' : 'warning'}
          showIcon
          style={{ marginBottom: 24 }}
        />
      )}

      {/* 管理员统计信息 */}
      {user?.role === 'admin' && (
        <>
          <Row gutter={[16, 16]} className="dashboard-stats">
            <Col xs={24} sm={12} lg={6}>
              <Card>
                <Statistic
                  title="总用户数"
                  value={userStats?.total || 0}
                  prefix={<UserOutlined />}
                  valueStyle={{ color: '#1890ff' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card>
                <Statistic
                  title="活跃用户"
                  value={userStats?.active || 0}
                  prefix={<UserOutlined />}
                  valueStyle={{ color: '#52c41a' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card>
                <Statistic
                  title="MFA启用率"
                  value={parseFloat(mfaStats?.enabledRate || '0')}
                  suffix="%"
                  prefix={<SafetyOutlined />}
                  valueStyle={{ color: '#fa8c16' }}
                />
              </Card>
            </Col>
            <Col xs={24} sm={12} lg={6}>
              <Card>
                <Statistic
                  title="企业微信绑定"
                  value={userStats?.wechatBound || 0}
                  prefix={<SafetyOutlined />}
                  valueStyle={{ color: '#722ed1' }}
                />
              </Card>
            </Col>
          </Row>

          <Row gutter={[16, 16]}>
            <Col xs={24} lg={12}>
              <Card title="用户统计" extra={<EyeOutlined />}>
                <Row gutter={16}>
                  <Col span={12}>
                    <Statistic
                      title="管理员"
                      value={userStats?.admins || 0}
                      valueStyle={{ color: '#ff4d4f' }}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title="非活跃用户"
                      value={userStats?.inactive || 0}
                      valueStyle={{ color: '#8c8c8c' }}
                    />
                  </Col>
                </Row>
              </Card>
            </Col>
            
            <Col xs={24} lg={12}>
              <Card title="MFA统计" extra={<SafetyOutlined />}>
                <Row gutter={16}>
                  <Col span={12}>
                    <Statistic
                      title="已启用MFA"
                      value={mfaStats?.mfaEnabled || 0}
                      valueStyle={{ color: '#52c41a' }}
                    />
                  </Col>
                  <Col span={12}>
                    <Statistic
                      title="未启用MFA"
                      value={mfaStats?.mfaDisabled || 0}
                      valueStyle={{ color: '#ff4d4f' }}
                    />
                  </Col>
                </Row>
              </Card>
            </Col>
          </Row>
        </>
      )}

      {/* 普通用户信息 */}
      {user?.role !== 'admin' && (
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card title="个人信息">
              <Space direction="vertical" style={{ width: '100%' }}>
                <div>
                  <Text strong>用户名: </Text>
                  <Text>{user?.username}</Text>
                </div>
                <div>
                  <Text strong>邮箱: </Text>
                  <Text>{user?.email || '未设置'}</Text>
                </div>
                <div>
                  <Text strong>角色: </Text>
                  <Tag color="blue">{user?.role === 'admin' ? '管理员' : '用户'}</Tag>
                </div>
                <div>
                  <Text strong>企业微信: </Text>
                  <Tag color={user?.wechat_userid ? 'green' : 'orange'}>
                    {user?.wechat_userid ? '已绑定' : '未绑定'}
                  </Tag>
                </div>
              </Space>
            </Card>
          </Col>
          
          <Col xs={24} lg={12}>
            <Card title="访问信息">
              <Space direction="vertical" style={{ width: '100%' }}>
                <div>
                  <Text strong>当前IP: </Text>
                  <Text code>{networkInfo?.ip || '未知'}</Text>
                </div>
                <div>
                  <Text strong>访问类型: </Text>
                  <Tag color={networkInfo?.isInternal ? 'green' : 'orange'}>
                    {networkInfo?.isInternal ? '内网访问' : '外网访问'}
                  </Tag>
                </div>
                <div>
                  <Text strong>认证状态: </Text>
                  <Tag color="green">已认证</Tag>
                </div>
              </Space>
            </Card>
          </Col>
        </Row>
      )}

      {/* 快捷操作 */}
      <Card title="快捷操作" style={{ marginTop: 24 }}>
        <Space wrap>
          <Button type="primary" onClick={() => window.location.href = '/settings'}>
            个人设置
          </Button>
          {user?.role === 'admin' && (
            <>
              <Button onClick={() => window.location.href = '/users'}>
                用户管理
              </Button>
              <Button onClick={() => window.location.href = '/mfa'}>
                MFA管理
              </Button>
              <Button onClick={() => window.location.href = '/logs'}>
                查看日志
              </Button>
            </>
          )}
        </Space>
      </Card>
    </div>
  );
};

export default Dashboard; 