import React, { useState, useEffect } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Modal,
  Form,
  Select,
  Tag,
  Typography,
  Row,
  Col,
  Statistic,
  Progress,
  message,
  Popconfirm,
  Tooltip,
  QRCode,
  Input,
  Divider,
  Alert,
  List
} from 'antd';
import {
  SafetyOutlined,
  UserOutlined,
  QrcodeOutlined,
  KeyOutlined,
  ReloadOutlined,
  CheckCircleOutlined,
  StopOutlined,
  WarningOutlined,
  CopyOutlined
} from '@ant-design/icons';
import { apiMethods } from '../utils/api.ts';
import dayjs from 'dayjs';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;

interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  status: string;
}

interface MFAConfig {
  id: number;
  user_id: number;
  username: string;
  mfa_type: string;
  is_enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface MFAStats {
  totalUsers: number;
  mfaEnabled: number;
  mfaDisabled: number;
  enabledRate: string;
  typeStats: { [key: string]: number };
}

interface TOTPData {
  secret: string;
  qr_code: string;
  backup_codes: string[];
}

const MFAManagement: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<MFAStats | null>(null);
  const [mfaConfigs, setMFAConfigs] = useState<MFAConfig[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  
  // Modal状态
  const [setupModalVisible, setSetupModalVisible] = useState(false);
  const [backupCodesModalVisible, setBackupCodesModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [totpData, setTotpData] = useState<TOTPData | null>(null);
  
  // 表单
  const [setupForm] = Form.useForm();
  const [verifyForm] = Form.useForm();

  // 加载统计数据
  const loadStats = async () => {
    try {
      const response = await apiMethods.mfa.getStats();
      setStats(response.data);
    } catch (error) {
      console.error('Load MFA stats error:', error);
      message.error('加载MFA统计失败');
    }
  };

  // 加载MFA配置列表
  const loadMFAConfigs = async () => {
    try {
      setLoading(true);
      const response = await apiMethods.mfa.getConfigs({});
      setMFAConfigs(response.data.configs || []);
    } catch (error) {
      console.error('Load MFA configs error:', error);
      message.error('加载MFA配置失败');
    } finally {
      setLoading(false);
    }
  };

  // 加载用户列表
  const loadUsers = async () => {
    try {
      const response = await apiMethods.users.getList({ limit: 1000 });
      setUsers(response.data.users || []);
    } catch (error) {
      console.error('Load users error:', error);
      message.error('加载用户列表失败');
    }
  };

  // 为用户生成TOTP
  const handleGenerateTOTP = async (userId: number) => {
    try {
      setLoading(true);
      const response = await apiMethods.mfa.generateTOTP({ user_id: userId });
      setTotpData(response.data);
      return true;
    } catch (error: any) {
      console.error('Generate TOTP error:', error);
      message.error(error.response?.data?.message || '生成TOTP失败');
      return false;
    } finally {
      setLoading(false);
    }
  };

  // 验证TOTP
  const handleVerifyTOTP = async (values: { token: string }) => {
    if (!selectedUser || !totpData) return;
    
    try {
      await apiMethods.mfa.verifyTOTP({
        user_id: selectedUser.id,
        token: values.token
      });
      
      message.success('MFA启用成功');
      setSetupModalVisible(false);
      setSelectedUser(null);
      setTotpData(null);
      verifyForm.resetFields();
      
      // 刷新数据
      loadStats();
      loadMFAConfigs();
    } catch (error: any) {
      console.error('Verify TOTP error:', error);
      message.error(error.response?.data?.message || 'TOTP验证失败');
    }
  };

  // 禁用MFA
  const handleDisableMFA = async (userId: number) => {
    try {
      await apiMethods.mfa.disable({ user_id: userId });
      message.success('MFA已禁用');
      loadStats();
      loadMFAConfigs();
    } catch (error: any) {
      console.error('Disable MFA error:', error);
      message.error(error.response?.data?.message || '禁用MFA失败');
    }
  };

  // 重新生成备用代码
  const handleRegenerateBackupCodes = async (userId: number) => {
    try {
      const response = await apiMethods.mfa.regenerateBackupCodes({ user_id: userId });
      setTotpData({ 
        secret: '', 
        qr_code: '', 
        backup_codes: response.data.backup_codes 
      });
      setBackupCodesModalVisible(true);
      message.success('备用代码已重新生成');
    } catch (error: any) {
      console.error('Regenerate backup codes error:', error);
      message.error(error.response?.data?.message || '生成备用代码失败');
    }
  };

  // 开始MFA设置
  const handleStartMFASetup = async (user: User) => {
    setSelectedUser(user);
    const success = await handleGenerateTOTP(user.id);
    if (success) {
      setSetupModalVisible(true);
    }
  };

  useEffect(() => {
    loadStats();
    loadMFAConfigs();
    loadUsers();
  }, []);

  // 表格列定义
  const columns = [
    {
      title: '用户',
      dataIndex: 'username',
      key: 'username',
      render: (username: string) => (
        <Space>
          <UserOutlined />
          <span>{username}</span>
        </Space>
      ),
    },
    {
      title: 'MFA类型',
      dataIndex: 'mfa_type',
      key: 'mfa_type',
      render: (type: string) => (
        <Tag color="blue">
          {type === 'totp' ? 'TOTP认证器' : type.toUpperCase()}
        </Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'is_enabled',
      key: 'is_enabled',
      render: (enabled: boolean) => (
        <Tag color={enabled ? 'green' : 'red'} icon={enabled ? <CheckCircleOutlined /> : <StopOutlined />}>
          {enabled ? '已启用' : '已禁用'}
        </Tag>
      ),
    },
    {
      title: '配置时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '最后更新',
      dataIndex: 'updated_at',
      key: 'updated_at',
      render: (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '操作',
      key: 'actions',
      render: (_, record: MFAConfig) => (
        <Space size="small">
          <Tooltip title="重新生成备用代码">
            <Button
              type="text"
              icon={<KeyOutlined />}
              onClick={() => handleRegenerateBackupCodes(record.user_id)}
            />
          </Tooltip>
          <Popconfirm
            title="确认禁用MFA？"
            description="禁用后用户将无法使用多因子认证"
            onConfirm={() => handleDisableMFA(record.user_id)}
            okText="确认"
            cancelText="取消"
          >
            <Tooltip title="禁用MFA">
              <Button
                type="text"
                danger
                icon={<StopOutlined />}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  // 获取未配置MFA的用户
  const usersWithoutMFA = users.filter(user => 
    !mfaConfigs.some(config => config.user_id === user.id)
  );

  return (
    <div>
      <Title level={3}>MFA管理</Title>
      
      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card>
            <Statistic
              title="总用户数"
              value={stats?.totalUsers || 0}
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="已启用MFA"
              value={stats?.mfaEnabled || 0}
              prefix={<SafetyOutlined />}
              valueStyle={{ color: '#3f8600' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <Statistic
              title="未启用MFA"
              value={stats?.mfaDisabled || 0}
              prefix={<WarningOutlined />}
              valueStyle={{ color: '#cf1322' }}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card>
            <div>
              <Text>MFA启用率</Text>
              <div style={{ marginTop: 8 }}>
                <Progress
                  percent={parseFloat(stats?.enabledRate || '0')}
                  strokeColor={{
                    '0%': '#ff4d4f',
                    '50%': '#faad14',
                    '100%': '#52c41a',
                  }}
                />
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* 未配置MFA的用户 */}
      {usersWithoutMFA.length > 0 && (
        <Card 
          title="未配置MFA的用户" 
          style={{ marginBottom: 16 }}
          extra={
            <Button icon={<ReloadOutlined />} onClick={() => {
              loadUsers();
              loadMFAConfigs();
            }}>
              刷新
            </Button>
          }
        >
          <Row gutter={16}>
            {usersWithoutMFA.slice(0, 8).map(user => (
              <Col span={6} key={user.id} style={{ marginBottom: 8 }}>
                <Card size="small">
                  <Space>
                    <UserOutlined />
                    <span>{user.username}</span>
                    <Button
                      type="link"
                      size="small"
                      onClick={() => handleStartMFASetup(user)}
                    >
                      配置MFA
                    </Button>
                  </Space>
                </Card>
              </Col>
            ))}
          </Row>
          {usersWithoutMFA.length > 8 && (
            <Text type="secondary">
              还有 {usersWithoutMFA.length - 8} 个用户未配置MFA...
            </Text>
          )}
        </Card>
      )}

      {/* MFA配置列表 */}
      <Card title="MFA配置列表">
        <Table
          columns={columns}
          dataSource={mfaConfigs}
          rowKey="id"
          loading={loading}
          pagination={{
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
          }}
        />
      </Card>

      {/* MFA设置Modal */}
      <Modal
        title={`为 ${selectedUser?.username} 设置MFA`}
        open={setupModalVisible}
        onCancel={() => {
          setSetupModalVisible(false);
          setSelectedUser(null);
          setTotpData(null);
          verifyForm.resetFields();
        }}
        footer={null}
        width={600}
      >
        {totpData && (
          <div>
            <Alert
              message="请按照以下步骤配置TOTP认证器"
              description="建议使用Google Authenticator、Microsoft Authenticator或类似的TOTP应用"
              type="info"
              style={{ marginBottom: 16 }}
            />
            
            <Row gutter={24}>
              <Col span={12}>
                <div style={{ textAlign: 'center' }}>
                  <Title level={5}>1. 扫描二维码</Title>
                  <QRCode value={totpData.qr_code} size={200} />
                </div>
              </Col>
              <Col span={12}>
                <Title level={5}>2. 手动输入密钥（可选）</Title>
                <Input.Group compact>
                  <Input
                    value={totpData.secret}
                    readOnly
                    style={{ width: 'calc(100% - 32px)' }}
                  />
                  <Tooltip title="复制">
                    <Button
                      icon={<CopyOutlined />}
                      onClick={() => {
                        navigator.clipboard.writeText(totpData.secret);
                        message.success('密钥已复制到剪贴板');
                      }}
                    />
                  </Tooltip>
                </Input.Group>
                
                <Title level={5} style={{ marginTop: 16 }}>3. 备用恢复代码</Title>
                <Alert
                  message="请妥善保存以下恢复代码"
                  description="当您无法使用认证器时，可以使用这些代码登录"
                  type="warning"
                  style={{ marginBottom: 8 }}
                />
                <List
                  size="small"
                  dataSource={totpData.backup_codes}
                  renderItem={code => (
                    <List.Item>
                      <Text code>{code}</Text>
                    </List.Item>
                  )}
                  style={{ 
                    maxHeight: 120, 
                    overflow: 'auto',
                    border: '1px solid #d9d9d9',
                    borderRadius: 4,
                    padding: 8
                  }}
                />
              </Col>
            </Row>
            
            <Divider />
            
            <Form
              form={verifyForm}
              layout="vertical"
              onFinish={handleVerifyTOTP}
            >
              <Title level={5}>4. 验证配置</Title>
              <Form.Item
                name="token"
                label="请输入认证器中显示的6位数字代码"
                rules={[
                  { required: true, message: '请输入验证码' },
                  { pattern: /^\d{6}$/, message: '请输入6位数字' }
                ]}
              >
                <Input
                  placeholder="000000"
                  maxLength={6}
                  style={{ fontSize: 18, textAlign: 'center' }}
                />
              </Form.Item>
              
              <Space style={{ float: 'right' }}>
                <Button onClick={() => {
                  setSetupModalVisible(false);
                  setSelectedUser(null);
                  setTotpData(null);
                  verifyForm.resetFields();
                }}>
                  取消
                </Button>
                <Button type="primary" htmlType="submit">
                  验证并启用
                </Button>
              </Space>
            </Form>
          </div>
        )}
      </Modal>

      {/* 备用代码Modal */}
      <Modal
        title="备用恢复代码"
        open={backupCodesModalVisible}
        onCancel={() => {
          setBackupCodesModalVisible(false);
          setTotpData(null);
        }}
        footer={[
          <Button key="close" onClick={() => {
            setBackupCodesModalVisible(false);
            setTotpData(null);
          }}>
            关闭
          </Button>
        ]}
        width={500}
      >
        {totpData && (
          <div>
            <Alert
              message="新的备用恢复代码"
              description="请妥善保存这些代码，它们只会显示一次"
              type="warning"
              style={{ marginBottom: 16 }}
            />
            <List
              dataSource={totpData.backup_codes}
              renderItem={code => (
                <List.Item>
                  <Text code copyable={{ text: code }}>{code}</Text>
                </List.Item>
              )}
              style={{ 
                border: '1px solid #d9d9d9',
                borderRadius: 4,
                padding: 8
              }}
            />
          </div>
        )}
      </Modal>
    </div>
  );
};

export default MFAManagement; 