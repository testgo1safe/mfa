import React, { useState, useEffect } from 'react';
import {
  Card,
  Tabs,
  Form,
  Input,
  Button,
  Switch,
  Select,
  InputNumber,
  Space,
  Typography,
  Divider,
  Row,
  Col,
  message,
  Alert,
  Modal,
  Upload,
  Badge,
  Tooltip,
  QRCode,
  Steps
} from 'antd';
import {
  UserOutlined,
  LockOutlined,
  SafetyOutlined,
  SettingOutlined,
  WechatOutlined,
  KeyOutlined,
  UploadOutlined,
  InfoCircleOutlined,
  CheckCircleOutlined,
  WarningOutlined,
  GoogleOutlined,
  CopyOutlined
} from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext.tsx';
import { apiMethods } from '../utils/api.ts';

const { Title, Text, Paragraph } = Typography;
const { Option } = Select;
const { TabPane } = Tabs;
const { TextArea } = Input;

interface SystemConfig {
  wechat_corp_id: string;
  wechat_agent_id: string;
  wechat_secret: string;
  wechat_redirect_uri: string;
  jwt_expires_in: string;
  session_timeout: number;
  max_login_attempts: number;
  lockout_duration: number;
  password_min_length: number;
  password_require_special: boolean;
  mfa_required_for_admin: boolean;
  internal_ip_ranges: string;
  external_access_enabled: boolean;
  audit_log_retention: number;
}

const Settings: React.FC = () => {
  const { user, refreshUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('personal');
  const [systemConfig, setSystemConfig] = useState<Partial<SystemConfig>>({});
  
  // 表单实例
  const [personalForm] = Form.useForm();
  const [passwordForm] = Form.useForm();
  const [wechatForm] = Form.useForm();
  const [securityForm] = Form.useForm();
  const [systemForm] = Form.useForm();

  // TOTP相关状态
  const [totpEnabled, setTotpEnabled] = useState(false);
  const [totpSetupData, setTotpSetupData] = useState<any>(null);
  const [setupModalVisible, setSetupModalVisible] = useState(false);
  const [disableModalVisible, setDisableModalVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [verificationCode, setVerificationCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [disablePassword, setDisablePassword] = useState('');

    // 加载系统配置
  const loadSystemConfig = async () => {
    try {
      if (user?.role === 'admin') {
        const response = await apiMethods.system.getConfig();
        setSystemConfig(response.data);
        
        // 设置表单初始值
        wechatForm.setFieldsValue(response.data);
        securityForm.setFieldsValue(response.data);
        systemForm.setFieldsValue(response.data);
      }
    } catch (error) {
      console.error('Load system config error:', error);
      message.error('加载系统配置失败');
      
      // 如果API调用失败，使用默认值
      const defaultConfig: Partial<SystemConfig> = {
        wechat_corp_id: '',
        wechat_agent_id: '',
        jwt_expires_in: '24h',
        session_timeout: 30,
        max_login_attempts: 5,
        lockout_duration: 15,
        password_min_length: 6,
        password_require_special: false,
        mfa_required_for_admin: true,
        internal_ip_ranges: '192.168.0.0/16,10.0.0.0/8,172.16.0.0/12',
        external_access_enabled: true,
        audit_log_retention: 90,
      };
      setSystemConfig(defaultConfig);
      
      // 设置表单初始值
      wechatForm.setFieldsValue(defaultConfig);
      securityForm.setFieldsValue(defaultConfig);
      systemForm.setFieldsValue(defaultConfig);
    }
  };

  // 更新个人信息
  const handleUpdatePersonal = async (values: any) => {
    try {
      setLoading(true);
      // await apiMethods.users.updateProfile(values);
      message.success('个人信息更新成功');
      refreshUser();
    } catch (error: any) {
      console.error('Update personal info error:', error);
      message.error(error.response?.data?.message || '更新失败');
    } finally {
      setLoading(false);
    }
  };

  // 修改密码
  const handleChangePassword = async (values: any) => {
    try {
      setLoading(true);
      await apiMethods.auth.changePassword({
        username: user?.username || '',
        oldPassword: values.oldPassword,
        newPassword: values.newPassword
      });
      message.success('密码修改成功');
      passwordForm.resetFields();
    } catch (error: any) {
      console.error('Change password error:', error);
      message.error(error.response?.data?.message || '修改密码失败');
    } finally {
      setLoading(false);
    }
  };

  // 更新企业微信配置
  const handleUpdateWechatConfig = async (values: any) => {
    try {
      setLoading(true);
      await apiMethods.system.updateWechatConfig(values);
      message.success('企业微信配置更新成功');
      setSystemConfig(prev => ({ ...prev, ...values }));
    } catch (error: any) {
      console.error('Update WeChat config error:', error);
      message.error(error.response?.data?.message || '更新失败');
    } finally {
      setLoading(false);
    }
  };

  // 更新安全策略
  const handleUpdateSecurityPolicy = async (values: any) => {
    try {
      setLoading(true);
      await apiMethods.system.updateSecurityPolicy(values);
      message.success('安全策略更新成功');
      setSystemConfig(prev => ({ ...prev, ...values }));
    } catch (error: any) {
      console.error('Update security policy error:', error);
      message.error(error.response?.data?.message || '更新失败');
    } finally {
      setLoading(false);
    }
  };

  // 更新系统参数
  const handleUpdateSystemParams = async (values: any) => {
    try {
      setLoading(true);
      await apiMethods.system.updateParams(values);
      message.success('系统参数更新成功');
      setSystemConfig(prev => ({ ...prev, ...values }));
    } catch (error: any) {
      console.error('Update system params error:', error);
      message.error(error.response?.data?.message || '更新失败');
    } finally {
      setLoading(false);
    }
  };

  // 测试企业微信连接
  const handleTestWechatConnection = async () => {
    try {
      setLoading(true);
      const values = wechatForm.getFieldsValue();
      await apiMethods.system.testWechatConnection(values);
      message.success('企业微信连接测试成功');
    } catch (error: any) {
      console.error('Test WeChat connection error:', error);
      message.error(error.response?.data?.message || '连接测试失败');
    } finally {
      setLoading(false);
    }
  };

  // 获取TOTP状态
  const fetchTOTPStatus = async () => {
    try {
      const response = await apiMethods.auth.getMFAStatus();
      setTotpEnabled(response.data.isEnabled || false);
    } catch (error) {
      console.error('获取TOTP状态失败:', error);
    }
  };

  // 开始设置TOTP
  const handleSetupTOTP = async () => {
    try {
      setLoading(true);
      const response = await apiMethods.auth.setupTOTP();
      setTotpSetupData(response.data);
      setSetupModalVisible(true);
      setCurrentStep(0);
    } catch (error: any) {
      message.error(error.response?.data?.message || 'TOTP设置失败');
    } finally {
      setLoading(false);
    }
  };

  // 启用TOTP
  const handleEnableTOTP = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      message.error('请输入6位验证码');
      return;
    }

    try {
      setLoading(true);
      const response = await apiMethods.auth.enableTOTP({ token: verificationCode });
      setBackupCodes(response.data.backupCodes || []);
      setCurrentStep(2);
      message.success('TOTP已成功启用');
      await fetchTOTPStatus();
    } catch (error: any) {
      message.error(error.response?.data?.message || 'TOTP启用失败');
    } finally {
      setLoading(false);
    }
  };

  // 禁用TOTP
  const handleDisableTOTP = async () => {
    if (!disablePassword) {
      message.error('请输入密码');
      return;
    }

    try {
      setLoading(true);
      await apiMethods.auth.disableTOTP({ password: disablePassword });
      message.success('TOTP已成功禁用');
      setDisableModalVisible(false);
      setDisablePassword('');
      await fetchTOTPStatus();
    } catch (error: any) {
      message.error(error.response?.data?.message || 'TOTP禁用失败');
    } finally {
      setLoading(false);
    }
  };

  // 复制到剪贴板
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    message.success('已复制到剪贴板');
  };

  useEffect(() => {
    if (user) {
      personalForm.setFieldsValue({
        username: user.username,
        email: user.email,
      });
    }
    loadSystemConfig();
    fetchTOTPStatus();
  }, [user, personalForm]);

  return (
    <div>
      <Title level={3}>系统设置</Title>
      
      <Tabs activeKey={activeTab} onChange={setActiveTab}>
        {/* 个人设置 */}
        <TabPane tab={
          <span>
            <UserOutlined />
            个人设置
          </span>
        } key="personal">
          <Row gutter={24}>
            <Col span={12}>
              <Card title="个人信息" size="small">
                <Form
                  form={personalForm}
                  layout="vertical"
                  onFinish={handleUpdatePersonal}
                >
                  <Form.Item
                    name="username"
                    label="用户名"
                  >
                    <Input disabled prefix={<UserOutlined />} />
                  </Form.Item>
                  
                  <Form.Item
                    name="email"
                    label="邮箱"
                    rules={[
                      { type: 'email', message: '请输入有效的邮箱地址' }
                    ]}
                  >
                    <Input prefix={<UserOutlined />} />
                  </Form.Item>
                  
                  <Form.Item>
                    <Button type="primary" htmlType="submit" loading={loading}>
                      更新信息
                    </Button>
                  </Form.Item>
                </Form>
              </Card>
            </Col>
            
            <Col span={12}>
              <Card title="修改密码" size="small">
                <Form
                  form={passwordForm}
                  layout="vertical"
                  onFinish={handleChangePassword}
                >
                  <Form.Item
                    name="oldPassword"
                    label="当前密码"
                    rules={[{ required: true, message: '请输入当前密码' }]}
                  >
                    <Input.Password prefix={<LockOutlined />} />
                  </Form.Item>
                  
                  <Form.Item
                    name="newPassword"
                    label="新密码"
                    rules={[
                      { required: true, message: '请输入新密码' },
                      { min: 6, message: '密码至少6个字符' }
                    ]}
                  >
                    <Input.Password prefix={<LockOutlined />} />
                  </Form.Item>
                  
                  <Form.Item
                    name="confirmPassword"
                    label="确认新密码"
                    dependencies={['newPassword']}
                    rules={[
                      { required: true, message: '请确认新密码' },
                      ({ getFieldValue }) => ({
                        validator(_, value) {
                          if (!value || getFieldValue('newPassword') === value) {
                            return Promise.resolve();
                          }
                          return Promise.reject(new Error('两次输入的密码不一致'));
                        },
                      }),
                    ]}
                  >
                    <Input.Password prefix={<LockOutlined />} />
                  </Form.Item>
                  
                  <Form.Item>
                    <Button type="primary" htmlType="submit" loading={loading}>
                      修改密码
                    </Button>
                  </Form.Item>
                </Form>
              </Card>
            </Col>
          </Row>
          
          <Row gutter={24} style={{ marginTop: 24 }}>
            <Col span={24}>
              <Card title={
                <span>
                  <SafetyOutlined style={{ marginRight: 8 }} />
                  TOTP双因子认证
                </span>
              } size="small">
                <div style={{ marginBottom: 16 }}>
                  <Alert
                    message="双因子认证"
                    description="TOTP认证器（如Google Authenticator、Microsoft Authenticator）提供额外的安全保护。启用后，登录某些应用时需要输入验证码。"
                    type="info"
                    showIcon
                  />
                </div>
                
                {totpEnabled ? (
                  <div>
                    <div style={{ marginBottom: 16 }}>
                      <Badge status="success" text="TOTP认证器已启用" />
                    </div>
                    <Button 
                      type="default" 
                      danger
                      icon={<WarningOutlined />}
                      onClick={() => setDisableModalVisible(true)}
                    >
                      禁用TOTP认证器
                    </Button>
                  </div>
                ) : (
                  <div>
                    <div style={{ marginBottom: 16 }}>
                      <Badge status="default" text="TOTP认证器未启用" />
                    </div>
                    <Button 
                      type="primary" 
                      icon={<GoogleOutlined />}
                      onClick={handleSetupTOTP}
                      loading={loading}
                    >
                      设置TOTP认证器
                    </Button>
                  </div>
                )}
              </Card>
            </Col>
          </Row>
        </TabPane>

        {/* 企业微信配置 */}
        {user?.role === 'admin' && (
          <TabPane tab={
            <span>
              <WechatOutlined />
              企业微信
            </span>
          } key="wechat">
            <Card>
              <Alert
                message="企业微信配置说明"
                description="配置企业微信应用信息，用于外网用户认证和单点登录。修改配置后需要重启应用才能生效。"
                type="info"
                showIcon
                style={{ marginBottom: 24 }}
              />
              
              <Form
                form={wechatForm}
                layout="vertical"
                onFinish={handleUpdateWechatConfig}
              >
                <Row gutter={24}>
                  <Col span={12}>
                    <Form.Item
                      name="wechat_corp_id"
                      label="企业ID (Corp ID)"
                      rules={[{ required: true, message: '请输入企业ID' }]}
                    >
                      <Input placeholder="企业微信管理后台获取" />
                    </Form.Item>
                  </Col>
                  <Col span={12}>
                    <Form.Item
                      name="wechat_agent_id"
                      label="应用ID (Agent ID)"
                      rules={[{ required: true, message: '请输入应用ID' }]}
                    >
                      <Input placeholder="企业微信应用管理页面获取" />
                    </Form.Item>
                  </Col>
                </Row>
                
                <Form.Item
                  name="wechat_secret"
                  label="应用密钥 (Secret)"
                  rules={[{ required: true, message: '请输入应用密钥' }]}
                >
                  <Input.Password placeholder="企业微信应用密钥" />
                </Form.Item>
                
                <Form.Item
                  name="wechat_redirect_uri"
                  label="回调地址"
                  rules={[
                    { required: true, message: '请输入回调地址' },
                    { type: 'url', message: '请输入有效的URL' }
                  ]}
                >
                  <Input placeholder="https://your-domain.com/api/wechat/callback" />
                </Form.Item>
                
                <Divider />
                
                <Space>
                  <Button type="primary" htmlType="submit" loading={loading}>
                    保存配置
                  </Button>
                  <Button onClick={handleTestWechatConnection} loading={loading}>
                    测试连接
                  </Button>
                </Space>
              </Form>
            </Card>
          </TabPane>
        )}

        {/* 安全策略 */}
        {user?.role === 'admin' && (
          <TabPane tab={
            <span>
              <SafetyOutlined />
              安全策略
            </span>
          } key="security">
            <Card>
              <Alert
                message="安全策略配置"
                description="配置系统安全参数，包括密码策略、登录限制、MFA要求等。"
                type="warning"
                showIcon
                style={{ marginBottom: 24 }}
              />
              
              <Form
                form={securityForm}
                layout="vertical"
                onFinish={handleUpdateSecurityPolicy}
              >
                <Title level={5}>密码策略</Title>
                <Row gutter={24}>
                  <Col span={8}>
                    <Form.Item
                      name="password_min_length"
                      label="最小密码长度"
                      rules={[{ required: true, message: '请输入密码长度' }]}
                    >
                      <InputNumber min={6} max={20} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col span={16}>
                    <Form.Item
                      name="password_require_special"
                      label="密码要求"
                      valuePropName="checked"
                    >
                      <Switch 
                        checkedChildren="需要特殊字符" 
                        unCheckedChildren="仅字母数字" 
                      />
                    </Form.Item>
                  </Col>
                </Row>
                
                <Divider />
                
                <Title level={5}>登录安全</Title>
                <Row gutter={24}>
                  <Col span={8}>
                    <Form.Item
                      name="max_login_attempts"
                      label="最大登录尝试次数"
                      rules={[{ required: true, message: '请输入尝试次数' }]}
                    >
                      <InputNumber min={3} max={10} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item
                      name="lockout_duration"
                      label="锁定时长（分钟）"
                      rules={[{ required: true, message: '请输入锁定时长' }]}
                    >
                      <InputNumber min={5} max={60} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                  <Col span={8}>
                    <Form.Item
                      name="session_timeout"
                      label="会话超时（分钟）"
                      rules={[{ required: true, message: '请输入会话超时时间' }]}
                    >
                      <InputNumber min={15} max={480} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                </Row>
                
                <Divider />
                
                <Title level={5}>MFA策略</Title>
                <Form.Item
                  name="mfa_required_for_admin"
                  label="管理员MFA要求"
                  valuePropName="checked"
                >
                  <Switch 
                    checkedChildren="强制启用" 
                    unCheckedChildren="可选" 
                  />
                </Form.Item>
                
                <Divider />
                
                <Title level={5}>网络访问控制</Title>
                <Form.Item
                  name="internal_ip_ranges"
                  label="内网IP范围"
                  rules={[{ required: true, message: '请输入内网IP范围' }]}
                  extra="多个IP段用逗号分隔，例如：192.168.0.0/16,10.0.0.0/8"
                >
                  <TextArea rows={3} />
                </Form.Item>
                
                <Form.Item
                  name="external_access_enabled"
                  label="外网访问"
                  valuePropName="checked"
                >
                  <Switch 
                    checkedChildren="允许" 
                    unCheckedChildren="禁止" 
                  />
                </Form.Item>
                
                <Divider />
                
                <Button type="primary" htmlType="submit" loading={loading}>
                  保存安全策略
                </Button>
              </Form>
            </Card>
          </TabPane>
        )}

        {/* 系统参数 */}
        {user?.role === 'admin' && (
          <TabPane tab={
            <span>
              <SettingOutlined />
              系统参数
            </span>
          } key="system">
            <Card>
              <Alert
                message="系统参数配置"
                description="配置系统运行参数，修改后可能需要重启应用。"
                type="info"
                showIcon
                style={{ marginBottom: 24 }}
              />
              
              <Form
                form={systemForm}
                layout="vertical"
                onFinish={handleUpdateSystemParams}
              >
                <Title level={5}>JWT配置</Title>
                <Row gutter={24}>
                  <Col span={12}>
                    <Form.Item
                      name="jwt_expires_in"
                      label="Token有效期"
                      rules={[{ required: true, message: '请输入Token有效期' }]}
                    >
                      <Select>
                        <Option value="1h">1小时</Option>
                        <Option value="8h">8小时</Option>
                        <Option value="24h">24小时</Option>
                        <Option value="7d">7天</Option>
                        <Option value="30d">30天</Option>
                      </Select>
                    </Form.Item>
                  </Col>
                </Row>
                
                <Divider />
                
                <Title level={5}>日志配置</Title>
                <Row gutter={24}>
                  <Col span={12}>
                    <Form.Item
                      name="audit_log_retention"
                      label="审计日志保留天数"
                      rules={[{ required: true, message: '请输入保留天数' }]}
                    >
                      <InputNumber min={30} max={365} style={{ width: '100%' }} />
                    </Form.Item>
                  </Col>
                </Row>
                
                <Divider />
                
                <Button type="primary" htmlType="submit" loading={loading}>
                  保存系统参数
                </Button>
              </Form>
            </Card>
          </TabPane>
        )}
      </Tabs>

      {/* TOTP设置Modal */}
      <Modal
        title="设置TOTP认证器"
        open={setupModalVisible}
        onCancel={() => {
          setSetupModalVisible(false);
          setCurrentStep(0);
          setVerificationCode('');
          setTotpSetupData(null);
        }}
        footer={null}
        width={600}
      >
        <Steps current={currentStep} style={{ marginBottom: 24 }}>
          <Steps.Step title="扫描二维码" description="使用认证器应用扫描" />
          <Steps.Step title="验证设置" description="输入6位验证码" />
          <Steps.Step title="保存备用码" description="保存恢复代码" />
        </Steps>

        {currentStep === 0 && totpSetupData && (
          <div>
            <Alert
              message="请按照以下步骤设置TOTP认证器"
              description="推荐使用 Google Authenticator、Microsoft Authenticator 等应用"
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
            
            <Row gutter={24}>
              <Col span={12}>
                <div style={{ textAlign: 'center' }}>
                  <QRCode value={totpSetupData.qrcode} size={200} />
                  <div style={{ marginTop: 8, fontSize: '12px', color: '#666' }}>
                    请使用认证器应用扫描此二维码
                  </div>
                </div>
              </Col>
              <Col span={12}>
                <div>
                  <strong>手动输入密钥：</strong>
                  <Input
                    value={totpSetupData.manualEntryKey}
                    readOnly
                    style={{ marginTop: 8, marginBottom: 8 }}
                  />
                  <Button 
                    size="small" 
                    icon={<CopyOutlined />}
                    onClick={() => copyToClipboard(totpSetupData.manualEntryKey)}
                  >
                    复制密钥
                  </Button>
                </div>
              </Col>
            </Row>
            
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Button type="primary" onClick={() => setCurrentStep(1)}>
                下一步：验证设置
              </Button>
            </div>
          </div>
        )}

        {currentStep === 1 && (
          <div>
            <Alert
              message="请输入认证器应用中的6位验证码"
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
            
            <div style={{ textAlign: 'center' }}>
              <Input
                placeholder="请输入6位验证码"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                style={{ width: 200, fontSize: '18px', textAlign: 'center' }}
                maxLength={6}
              />
              <div style={{ marginTop: 16 }}>
                <Button 
                  type="primary" 
                  onClick={handleEnableTOTP}
                  loading={loading}
                  disabled={verificationCode.length !== 6}
                >
                  验证并启用TOTP
                </Button>
              </div>
            </div>
          </div>
        )}

        {currentStep === 2 && (
          <div>
            <Alert
              message="TOTP设置成功！"
              description="请保存以下备用恢复代码，在无法使用认证器时可以使用这些代码"
              type="success"
              showIcon
              style={{ marginBottom: 16 }}
            />
            
            <div style={{ background: '#f5f5f5', padding: 16, borderRadius: 4 }}>
              <strong>备用恢复代码：</strong>
              <div style={{ marginTop: 8, fontFamily: 'monospace' }}>
                {backupCodes.map((code, index) => (
                  <div key={index} style={{ marginBottom: 4 }}>
                    {code}
                  </div>
                ))}
              </div>
            </div>
            
            <div style={{ textAlign: 'center', marginTop: 16 }}>
              <Button 
                type="primary" 
                onClick={() => {
                  setSetupModalVisible(false);
                  setCurrentStep(0);
                  setVerificationCode('');
                  setTotpSetupData(null);
                }}
              >
                完成设置
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* 禁用TOTP Modal */}
      <Modal
        title="禁用TOTP认证器"
        open={disableModalVisible}
        onOk={handleDisableTOTP}
        onCancel={() => {
          setDisableModalVisible(false);
          setDisablePassword('');
        }}
        confirmLoading={loading}
      >
        <Alert
          message="警告"
          description="禁用TOTP认证器将降低您账户的安全性。请确认您真的要禁用双因子认证。"
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
        
        <Form layout="vertical">
          <Form.Item label="请输入密码确认操作" required>
            <Input.Password
              value={disablePassword}
              onChange={(e) => setDisablePassword(e.target.value)}
              placeholder="请输入当前密码"
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Settings; 