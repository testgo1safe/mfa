import React, { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Modal,
  Form,
  Input,
  Select,
  Switch,
  Space,
  Card,
  Tag,
  Tooltip,
  message,
  Popconfirm,
  Row,
  Col,
  Alert,
  Typography,
  Divider,
  Badge,
  InputNumber,
  Tabs
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  LockOutlined,
  SafetyOutlined,
  QrcodeOutlined,
  WechatOutlined,
  MobileOutlined,
  MailOutlined,
  SettingOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined
} from '@ant-design/icons';
import { apiMethods } from '../utils/api.ts';

const { Option } = Select;
const { TextArea } = Input;
const { Text, Title } = Typography;
const { TabPane } = Tabs;

interface AuthMethod {
  id: number;
  name: string;
  type: string;
  description: string;
  icon: string;
  config: any;
  is_enabled: boolean;
  is_system: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

const AuthMethodManagement: React.FC = () => {
  const [authMethods, setAuthMethods] = useState<AuthMethod[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [configModalVisible, setConfigModalVisible] = useState(false);
  const [editingMethod, setEditingMethod] = useState<AuthMethod | null>(null);
  const [testingMethod, setTestingMethod] = useState<AuthMethod | null>(null);
  const [testModalVisible, setTestModalVisible] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [form] = Form.useForm();
  const [configForm] = Form.useForm();

  // 认证方式类型选项
  const authTypeOptions = [
    { value: 'password', label: '用户名密码', icon: <LockOutlined /> },
    { value: 'totp', label: 'TOTP双因子', icon: <SafetyOutlined /> },
    { value: 'wechat_qr', label: '企业微信扫码', icon: <QrcodeOutlined /> },
    { value: 'wechat_push', label: '企业微信推送', icon: <WechatOutlined /> },
    { value: 'sms', label: '短信验证码', icon: <MobileOutlined /> },
    { value: 'email', label: '邮箱验证码', icon: <MailOutlined /> },
    { value: 'ldap', label: 'LDAP认证', icon: <SettingOutlined /> },
    { value: 'oauth', label: 'OAuth认证', icon: <SettingOutlined /> },
    { value: 'custom', label: '自定义认证', icon: <SettingOutlined /> }
  ];

  // 图标选项
  const iconOptions = authTypeOptions.map(option => ({
    value: option.icon.type.name,
    label: option.label,
    icon: option.icon
  }));

  // 加载认证方式列表
  const loadAuthMethods = async () => {
    try {
      setLoading(true);
      const response = await apiMethods.authMethods.getList();
      setAuthMethods(response.data.authMethods || []);
    } catch (error) {
      console.error('Failed to load auth methods:', error);
      message.error('加载认证方式失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAuthMethods();
  }, []);

  // 打开编辑/新增模态框
  const handleEdit = (method?: AuthMethod) => {
    setEditingMethod(method || null);
    setModalVisible(true);
    if (method) {
      form.setFieldsValue({
        ...method
      });
    } else {
      form.resetFields();
    }
  };

  // 保存认证方式
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      
      if (editingMethod) {
        await apiMethods.authMethods.update(editingMethod.id, values);
        message.success('认证方式更新成功');
      } else {
        await apiMethods.authMethods.create(values);
        message.success('认证方式创建成功');
      }

      setModalVisible(false);
      loadAuthMethods();
    } catch (error: any) {
      message.error(error.response?.data?.message || '操作失败');
    }
  };

  // 删除认证方式
  const handleDelete = async (id: number) => {
    try {
      await apiMethods.authMethods.delete(id);
      message.success('认证方式删除成功');
      loadAuthMethods();
    } catch (error: any) {
      message.error(error.response?.data?.message || '删除失败');
    }
  };

  // 切换启用状态
  const toggleMethodStatus = async (id: number, enabled: boolean) => {
    try {
      await apiMethods.authMethods.update(id, { is_enabled: enabled });
      message.success(`认证方式已${enabled ? '启用' : '禁用'}`);
      loadAuthMethods();
    } catch (error: any) {
      message.error(error.response?.data?.message || '操作失败');
    }
  };

  // 配置认证方式
  const handleConfig = (method: AuthMethod) => {
    setEditingMethod(method);
    setConfigModalVisible(true);
    configForm.setFieldsValue(method.config || {});
  };

  // 保存配置
  const handleSaveConfig = async () => {
    try {
      const config = await configForm.validateFields();
      await apiMethods.authMethods.update(editingMethod!.id, { config });
      message.success('配置保存成功');
      setConfigModalVisible(false);
      loadAuthMethods();
    } catch (error: any) {
      message.error(error.response?.data?.message || '保存失败');
    }
  };

  // 测试认证方式
  const handleTest = async (method: AuthMethod) => {
    try {
      setTestingMethod(method);
      const response = await apiMethods.authMethods.test(method.id);
      setTestResult(response.data);
      setTestModalVisible(true);
      message.success('测试完成');
    } catch (error: any) {
      setTestResult({
        success: false,
        message: error.response?.data?.message || '测试失败'
      });
      setTestModalVisible(true);
      message.error(error.response?.data?.message || '测试失败');
    }
  };

  // 获取图标组件
  const getIconComponent = (iconName: string) => {
    const iconMap: { [key: string]: React.ReactNode } = {
      'LockOutlined': <LockOutlined />,
      'SafetyOutlined': <SafetyOutlined />,
      'QrcodeOutlined': <QrcodeOutlined />,
      'WechatOutlined': <WechatOutlined />,
      'MobileOutlined': <MobileOutlined />,
      'MailOutlined': <MailOutlined />,
      'SettingOutlined': <SettingOutlined />
    };
    return iconMap[iconName] || <SettingOutlined />;
  };

  // 渲染配置表单
  const renderConfigForm = (type: string) => {
    switch (type) {
      case 'totp':
        return (
          <>
            <Alert
              message="TOTP双因子认证配置"
              description="配置Google Authenticator等TOTP应用的参数"
              type="info"
              style={{ marginBottom: 16 }}
            />
            <Form.Item name="window" label="时间窗口" initialValue={2}>
              <InputNumber min={1} max={10} />
            </Form.Item>
            <Form.Item name="digits" label="验证码位数" initialValue={6}>
              <Select>
                <Option value={6}>6位</Option>
                <Option value={8}>8位</Option>
              </Select>
            </Form.Item>
            <Form.Item name="period" label="有效期(秒)" initialValue={30}>
              <InputNumber min={15} max={300} />
            </Form.Item>
            <Form.Item name="issuer" label="发行者名称" initialValue="MFA管控平台">
              <Input placeholder="显示在认证器中的名称" />
            </Form.Item>
          </>
        );
      case 'sms':
        return (
          <>
            <Alert
              message="短信验证码配置"
              description="配置短信服务商和验证码参数"
              type="info"
              style={{ marginBottom: 16 }}
            />
            <Form.Item name="timeout" label="验证码有效期(秒)" initialValue={300}>
              <InputNumber min={60} max={600} />
            </Form.Item>
            <Form.Item name="length" label="验证码长度" initialValue={6}>
              <Select>
                <Option value={4}>4位</Option>
                <Option value={6}>6位</Option>
                <Option value={8}>8位</Option>
              </Select>
            </Form.Item>
            <Form.Item name="provider" label="短信服务商" rules={[{ required: true, message: '请选择短信服务商' }]}>
              <Select placeholder="选择短信服务商">
                <Option value="aliyun">阿里云短信</Option>
                <Option value="tencent">腾讯云短信</Option>
                <Option value="custom">自定义接口</Option>
              </Select>
            </Form.Item>
            <Form.Item name="access_key_id" label="AccessKeyId" rules={[{ required: true, message: '请输入AccessKeyId' }]}>
              <Input.Password placeholder="短信服务商的AccessKeyId" />
            </Form.Item>
            <Form.Item name="access_key_secret" label="AccessKeySecret" rules={[{ required: true, message: '请输入AccessKeySecret' }]}>
              <Input.Password placeholder="短信服务商的AccessKeySecret" />
            </Form.Item>
            <Form.Item name="sign_name" label="短信签名" rules={[{ required: true, message: '请输入短信签名' }]}>
              <Input placeholder="已备案的短信签名" />
            </Form.Item>
            <Form.Item name="template_code" label="模板代码" rules={[{ required: true, message: '请输入模板代码' }]}>
              <Input placeholder="短信模板代码" />
            </Form.Item>
          </>
        );
      case 'email':
        return (
          <>
            <Alert
              message="邮箱验证码配置"
              description="配置SMTP服务器和验证码参数"
              type="info"
              style={{ marginBottom: 16 }}
            />
            <Form.Item name="timeout" label="验证码有效期(秒)" initialValue={600}>
              <InputNumber min={300} max={1800} />
            </Form.Item>
            <Form.Item name="length" label="验证码长度" initialValue={6}>
              <Select>
                <Option value={4}>4位</Option>
                <Option value={6}>6位</Option>
                <Option value={8}>8位</Option>
              </Select>
            </Form.Item>
            <Form.Item name="smtp_host" label="SMTP服务器" rules={[{ required: true, message: '请输入SMTP服务器' }]}>
              <Input placeholder="smtp.gmail.com" />
            </Form.Item>
            <Form.Item name="smtp_port" label="SMTP端口" initialValue={587}>
              <InputNumber min={1} max={65535} />
            </Form.Item>
            <Form.Item name="smtp_user" label="SMTP用户名" rules={[{ required: true, message: '请输入SMTP用户名' }]}>
              <Input placeholder="邮箱账号" />
            </Form.Item>
            <Form.Item name="smtp_password" label="SMTP密码" rules={[{ required: true, message: '请输入SMTP密码' }]}>
              <Input.Password placeholder="邮箱密码或应用专用密码" />
            </Form.Item>
            <Form.Item name="from_email" label="发件人邮箱" rules={[{ required: true, message: '请输入发件人邮箱' }]}>
              <Input placeholder="发送验证码的邮箱地址" />
            </Form.Item>
          </>
        );
      case 'wechat_qr':
        return (
          <>
            <Alert
              message="企业微信扫码认证配置"
              description="配置企业微信应用参数以支持扫码登录"
              type="info"
              style={{ marginBottom: 16 }}
            />
            <Form.Item name="timeout" label="二维码有效期(秒)" initialValue={300}>
              <InputNumber min={60} max={600} />
            </Form.Item>
            <Form.Item name="refresh_interval" label="刷新间隔(秒)" initialValue={5}>
              <InputNumber min={3} max={30} />
            </Form.Item>
            <Form.Item name="corp_id" label="企业ID" rules={[{ required: true, message: '请输入企业ID' }]}>
              <Input placeholder="企业微信的CorpId" />
            </Form.Item>
            <Form.Item name="agent_id" label="应用AgentId" rules={[{ required: true, message: '请输入应用AgentId' }]}>
              <InputNumber placeholder="企业微信应用的AgentId" />
            </Form.Item>
            <Form.Item name="app_secret" label="应用Secret" rules={[{ required: true, message: '请输入应用Secret' }]}>
              <Input.Password placeholder="企业微信应用的Secret" />
            </Form.Item>
            <Form.Item name="redirect_uri" label="回调地址" rules={[{ required: true, message: '请输入回调地址' }]}>
              <Input placeholder="https://mfa.example.com/api/wechat/callback" />
            </Form.Item>
          </>
        );
      case 'wechat_push':
        return (
          <>
            <Alert
              message="企业微信推送认证配置"
              description="配置企业微信应用以支持推送消息验证"
              type="info"
              style={{ marginBottom: 16 }}
            />
            <Form.Item name="timeout" label="推送超时(秒)" initialValue={120}>
              <InputNumber min={30} max={300} />
            </Form.Item>
            <Form.Item name="retry" label="重试次数" initialValue={3}>
              <InputNumber min={1} max={5} />
            </Form.Item>
            <Form.Item name="corp_id" label="企业ID" rules={[{ required: true, message: '请输入企业ID' }]}>
              <Input placeholder="企业微信的CorpId" />
            </Form.Item>
            <Form.Item name="agent_id" label="应用AgentId" rules={[{ required: true, message: '请输入应用AgentId' }]}>
              <InputNumber placeholder="企业微信应用的AgentId" />
            </Form.Item>
            <Form.Item name="app_secret" label="应用Secret" rules={[{ required: true, message: '请输入应用Secret' }]}>
              <Input.Password placeholder="企业微信应用的Secret" />
            </Form.Item>
            <Form.Item name="template_id" label="消息模板ID" rules={[{ required: true, message: '请输入消息模板ID' }]}>
              <Input placeholder="推送消息的模板ID" />
            </Form.Item>
          </>
        );
      case 'ldap':
        return (
          <>
            <Alert
              message="LDAP认证配置"
              description="配置LDAP服务器连接参数"
              type="info"
              style={{ marginBottom: 16 }}
            />
            <Form.Item name="server_url" label="LDAP服务器" rules={[{ required: true, message: '请输入LDAP服务器地址' }]}>
              <Input placeholder="ldap://ldap.example.com:389" />
            </Form.Item>
            <Form.Item name="bind_dn" label="绑定DN" rules={[{ required: true, message: '请输入绑定DN' }]}>
              <Input placeholder="cn=admin,dc=example,dc=com" />
            </Form.Item>
            <Form.Item name="bind_password" label="绑定密码" rules={[{ required: true, message: '请输入绑定密码' }]}>
              <Input.Password placeholder="LDAP绑定密码" />
            </Form.Item>
            <Form.Item name="search_base" label="搜索基准" rules={[{ required: true, message: '请输入搜索基准' }]}>
              <Input placeholder="ou=users,dc=example,dc=com" />
            </Form.Item>
            <Form.Item name="user_filter" label="用户过滤器" initialValue="(uid={username})">
              <Input placeholder="(uid={username})" />
            </Form.Item>
          </>
        );
      case 'oauth':
        return (
          <>
            <Alert
              message="OAuth认证配置"
              description="配置第三方OAuth服务提供商"
              type="info"
              style={{ marginBottom: 16 }}
            />
            <Form.Item name="provider" label="OAuth提供商" rules={[{ required: true, message: '请选择OAuth提供商' }]}>
              <Select placeholder="选择OAuth提供商">
                <Option value="github">GitHub</Option>
                <Option value="google">Google</Option>
                <Option value="microsoft">Microsoft</Option>
                <Option value="custom">自定义</Option>
              </Select>
            </Form.Item>
            <Form.Item name="client_id" label="客户端ID" rules={[{ required: true, message: '请输入客户端ID' }]}>
              <Input placeholder="OAuth应用的Client ID" />
            </Form.Item>
            <Form.Item name="client_secret" label="客户端密钥" rules={[{ required: true, message: '请输入客户端密钥' }]}>
              <Input.Password placeholder="OAuth应用的Client Secret" />
            </Form.Item>
            <Form.Item name="auth_url" label="授权地址">
              <Input placeholder="自定义OAuth授权地址" />
            </Form.Item>
            <Form.Item name="token_url" label="Token地址">
              <Input placeholder="自定义Token获取地址" />
            </Form.Item>
            <Form.Item name="user_info_url" label="用户信息地址">
              <Input placeholder="自定义用户信息获取地址" />
            </Form.Item>
          </>
        );
      default:
        return (
          <>
            <Alert
              message="自定义认证配置"
              description="以JSON格式配置自定义认证参数"
              type="info"
              style={{ marginBottom: 16 }}
            />
            <Form.Item name="custom_config" label="自定义配置">
              <TextArea rows={8} placeholder='{"key": "value", "timeout": 300}' />
            </Form.Item>
          </>
        );
    }
  };

  const columns = [
    {
      title: '认证方式',
      key: 'info',
      render: (record: AuthMethod) => (
        <Space>
          {getIconComponent(record.icon)}
          <div>
            <div style={{ fontWeight: 'bold' }}>
              {record.name}
              {record.is_system && (
                <Tag color="blue" style={{ marginLeft: 8 }}>
                  系统
                </Tag>
              )}
            </div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.description}
            </Text>
          </div>
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'type',
      render: (type: string) => {
        const typeOption = authTypeOptions.find(opt => opt.value === type);
        return (
          <Tag color="geekblue">
            {typeOption?.icon} {typeOption?.label || type}
          </Tag>
        );
      }
    },
    {
      title: '排序',
      dataIndex: 'sort_order',
      width: 80,
      sorter: (a: AuthMethod, b: AuthMethod) => a.sort_order - b.sort_order
    },
    {
      title: '状态',
      key: 'status',
      render: (record: AuthMethod) => (
        <Space direction="vertical" size="small">
          <Badge
            status={record.is_enabled ? 'success' : 'default'}
            text={record.is_enabled ? '已启用' : '已禁用'}
          />
          <Switch
            size="small"
            checked={record.is_enabled}
            onChange={(checked) => toggleMethodStatus(record.id, checked)}
            checkedChildren={<CheckCircleOutlined />}
            unCheckedChildren={<ExclamationCircleOutlined />}
          />
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      render: (record: AuthMethod) => (
        <Space>
          <Tooltip title="测试配置">
            <Button
              type="link"
              icon={<EyeOutlined />}
              onClick={() => handleTest(record)}
              disabled={!record.is_enabled}
            />
          </Tooltip>
          <Tooltip title="配置参数">
            <Button
              type="link"
              icon={<SettingOutlined />}
              onClick={() => handleConfig(record)}
            />
          </Tooltip>
          {!record.is_system && (
            <Tooltip title="编辑">
              <Button
                type="link"
                icon={<EditOutlined />}
                onClick={() => handleEdit(record)}
              />
            </Tooltip>
          )}
          {!record.is_system && (
            <Tooltip title="删除">
              <Popconfirm
                title="确定要删除这个认证方式吗？"
                onConfirm={() => handleDelete(record.id)}
                okText="确定"
                cancelText="取消"
              >
                <Button type="link" danger icon={<DeleteOutlined />} />
              </Popconfirm>
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={18}>
          <Title level={4}>
            <SettingOutlined /> 认证方式管理
          </Title>
        </Col>
        <Col span={6} style={{ textAlign: 'right' }}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => handleEdit()}
          >
            添加认证方式
          </Button>
        </Col>
      </Row>

      <Alert
        message="认证方式配置说明"
        description={
          <div>
            <p>• 系统内置认证方式不能删除，只能配置参数和启用状态</p>
            <p>• 每个应用可以选择不同的认证方式</p>
            <p>• 认证方式支持参数配置，如超时时间、验证码长度等</p>
          </div>
        }
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Card>
        <Table
          columns={columns}
          dataSource={authMethods}
          loading={loading}
          rowKey="id"
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 种认证方式`,
          }}
        />
      </Card>

      {/* 添加/编辑模态框 */}
      <Modal
        title={editingMethod ? '编辑认证方式' : '添加认证方式'}
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
        width={600}
        okText="保存"
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{
            is_enabled: true,
            sort_order: 0
          }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label="认证方式名称"
                rules={[{ required: true, message: '请输入认证方式名称' }]}
              >
                <Input placeholder="例：企业微信认证" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="type"
                label="认证类型"
                rules={[{ required: true, message: '请选择认证类型' }]}
              >
                <Select placeholder="选择认证类型">
                  {authTypeOptions.map(option => (
                    <Option key={option.value} value={option.value}>
                      {option.icon} {option.label}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="description"
            label="描述"
          >
            <TextArea rows={2} placeholder="认证方式描述" />
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="icon"
                label="图标"
              >
                <Select placeholder="选择图标">
                  {iconOptions.map(option => (
                    <Option key={option.value} value={option.value}>
                      {option.icon} {option.label}
                    </Option>
                  ))}
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="sort_order"
                label="排序"
              >
                <InputNumber min={0} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="is_enabled"
            label="启用状态"
            valuePropName="checked"
          >
            <Switch
              checkedChildren={<CheckCircleOutlined />}
              unCheckedChildren={<ExclamationCircleOutlined />}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 配置模态框 */}
      <Modal
        title={`配置 - ${editingMethod?.name}`}
        open={configModalVisible}
        onOk={handleSaveConfig}
        onCancel={() => setConfigModalVisible(false)}
        width={600}
        okText="保存配置"
        cancelText="取消"
      >
        <Form
          form={configForm}
          layout="vertical"
        >
          {editingMethod && renderConfigForm(editingMethod.type)}
        </Form>
      </Modal>

      {/* 测试结果模态框 */}
      <Modal
        title={`测试结果 - ${testingMethod?.name}`}
        open={testModalVisible}
        onCancel={() => setTestModalVisible(false)}
        width={600}
        footer={[
          <Button key="close" onClick={() => setTestModalVisible(false)}>
            关闭
          </Button>
        ]}
      >
        {testResult && (
          <div>
            <Alert
              message={testResult.success ? '测试成功' : '测试失败'}
              description={testResult.message}
              type={testResult.success ? 'success' : 'error'}
              showIcon
              style={{ marginBottom: 16 }}
            />
            
            {testResult.result && testResult.result.details && (
              <Card title="配置详情" size="small">
                <div style={{ fontFamily: 'monospace', fontSize: 12 }}>
                  <pre>{JSON.stringify(testResult.result.details, null, 2)}</pre>
                </div>
              </Card>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AuthMethodManagement; 