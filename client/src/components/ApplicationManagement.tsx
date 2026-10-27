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
  Badge
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  LinkOutlined,
  SafetyOutlined,
  GlobalOutlined,
  SettingOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined
} from '@ant-design/icons';
import { apiMethods } from '../utils/api.ts';
import { useAuth } from '../contexts/AuthContext.tsx';

const { Option } = Select;
const { TextArea } = Input;
const { Text, Title } = Typography;

interface Application {
  id: number;
  name: string;
  description: string;
  internal_url: string;
  external_path: string;
  icon: string;
  category: string;
  is_enabled: boolean;
  require_mfa: boolean;
  auth_method_id: number;
  allowed_users: string;
  created_at: string;
  updated_at: string;
  allow_internal_direct?: boolean;
  internal_ip_ranges?: string;
  direct_excluded_ips?: string;
}

interface AuthMethod {
  id: number;
  name: string;
  type: string;
  description: string;
  icon: string;
  is_enabled: boolean;
}

const ApplicationManagement: React.FC = () => {
  const { user } = useAuth();
  const [applications, setApplications] = useState<Application[]>([]);
  const [authMethods, setAuthMethods] = useState<AuthMethod[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingApp, setEditingApp] = useState<Application | null>(null);
  const [form] = Form.useForm();

  // 加载应用列表和认证方式
  const loadApplications = async () => {
    try {
      setLoading(true);
      const [appsResponse, authResponse] = await Promise.all([
        apiMethods.applications.getList(),
        apiMethods.authMethods.getList({ enabled_only: true })
      ]);
      setApplications(appsResponse.data.applications || []);
      setAuthMethods(authResponse.data.authMethods || []);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApplications();
  }, []);

  // 打开编辑/新增模态框
  const handleEdit = (app?: Application) => {
    setEditingApp(app || null);
    setModalVisible(true);
    if (app) {
      form.setFieldsValue({
        ...app,
        allowed_users: app.allowed_users ? app.allowed_users.split(',') : []
      });
    } else {
      form.resetFields();
    }
  };

  // 保存应用
  const handleSave = async () => {
    try {
      const values = await form.validateFields();
      const data = {
        ...values,
        allowed_users: values.allowed_users ? values.allowed_users.join(',') : ''
      };

      if (editingApp) {
        await apiMethods.applications.update(editingApp.id, data);
        message.success('应用更新成功');
      } else {
        await apiMethods.applications.create(data);
        message.success('应用创建成功');
      }

      setModalVisible(false);
      loadApplications();
    } catch (error: any) {
      message.error(error.response?.data?.message || '操作失败');
    }
  };

  // 删除应用
  const handleDelete = async (id: number) => {
    try {
      await apiMethods.applications.delete(id);
      message.success('应用删除成功');
      loadApplications();
    } catch (error: any) {
      message.error(error.response?.data?.message || '删除失败');
    }
  };

  // 切换应用状态
  const toggleAppStatus = async (id: number, enabled: boolean) => {
    try {
      await apiMethods.applications.update(id, { is_enabled: enabled });
      message.success(`应用已${enabled ? '启用' : '禁用'}`);
      loadApplications();
    } catch (error: any) {
      message.error(error.response?.data?.message || '操作失败');
    }
  };

  const columns = [
    {
      title: '应用信息',
      key: 'info',
      render: (record: Application) => (
        <Space>
          {record.icon ? (
            <img src={record.icon} alt={record.name} style={{ width: 24, height: 24 }} />
          ) : (
            <GlobalOutlined style={{ fontSize: 24, color: '#1890ff' }} />
          )}
          <div>
            <div style={{ fontWeight: 'bold' }}>{record.name}</div>
            <Text type="secondary" style={{ fontSize: 12 }}>
              {record.description}
            </Text>
          </div>
        </Space>
      ),
    },
    {
      title: '代理配置',
      key: 'proxy',
      render: (record: Application) => (
        <div>
          <div>
            <Text strong>内网地址:</Text> <Text code>{record.internal_url}</Text>
          </div>
          <div>
            <Text strong>外部路径:</Text> <Text code>/proxy{record.external_path}</Text>
          </div>
          <div style={{ marginTop: 4 }}>
            <Text strong>访问地址:</Text>{' '}
            <a
              href={`https://mfa.example.com/proxy${record.external_path}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <LinkOutlined /> mfa.example.com/proxy{record.external_path}
            </a>
          </div>
        </div>
      ),
    },
    {
      title: '安全设置',
      key: 'security',
      render: (record: Application) => {
        const authMethod = authMethods.find(method => method.id === record.auth_method_id);
        return (
          <Space direction="vertical" size="small">
            <div>
              <Tag color="blue" icon={<SafetyOutlined />}>
                {authMethod?.name || '默认认证'}
              </Tag>
              {record.require_mfa && (
                <Tag color="red">
                  强制MFA
                </Tag>
              )}
              {record.allow_internal_direct ? (
                <Tag color="green">内网直连</Tag>
              ) : (
                <Tag>内网需认证</Tag>
              )}
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {record.internal_ip_ranges ? `内网段: ${record.internal_ip_ranges}` : '使用全局内网段'}
              </Text>
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {record.direct_excluded_ips ? `直连排除: ${record.direct_excluded_ips}` : '未配置直连排除'}
              </Text>
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12 }}>
                {record.allowed_users
                  ? `限制用户: ${record.allowed_users.split(',').length}人`
                  : '所有用户可访问'}
              </Text>
            </div>
          </Space>
        );
      },
    },
    {
      title: '状态',
      key: 'status',
      render: (record: Application) => (
        <Space direction="vertical" size="small">
          <Badge
            status={record.is_enabled ? 'success' : 'default'}
            text={record.is_enabled ? '运行中' : '已停止'}
          />
          <Switch
            size="small"
            checked={record.is_enabled}
            onChange={(checked) => toggleAppStatus(record.id, checked)}
            checkedChildren={<PlayCircleOutlined />}
            unCheckedChildren={<PauseCircleOutlined />}
          />
        </Space>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      render: (record: Application) => (
        <Space>
          <Tooltip title="编辑应用">
            <Button
              type="link"
              icon={<EditOutlined />}
              onClick={() => handleEdit(record)}
            />
          </Tooltip>
          <Tooltip title="删除应用">
            <Popconfirm
              title="确定要删除这个应用吗？"
              onConfirm={() => handleDelete(record.id)}
              okText="确定"
              cancelText="取消"
            >
              <Button type="link" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Tooltip>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Row gutter={16} style={{ marginBottom: 16 }}>
        <Col span={18}>
          <Title level={4}>
            <GlobalOutlined /> 应用管理
          </Title>
        </Col>
        <Col span={6} style={{ textAlign: 'right' }}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => handleEdit()}
          >
            添加应用
          </Button>
        </Col>
      </Row>

      <Alert
        message="应用代理说明"
        description={
          <div>
            <p>• 配置的应用将通过 mfa.example.com 域名代理访问内网服务</p>
            <p>• 内网直连：可根据全局/自定义内网段识别内外网</p>
            <p>• 外网访问将要求认证，支持强制MFA</p>
          </div>
        }
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
      />

      <Card>
        <Table
          columns={columns}
          dataSource={applications}
          loading={loading}
          rowKey="id"
          pagination={{
            pageSize: 10,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 个应用`,
          }}
        />
      </Card>

      <Modal
        title={editingApp ? '编辑应用' : '添加应用'}
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
            require_mfa: false,
            category: 'web',
            auth_method_id: 1,
            allow_internal_direct: true,
            internal_ip_ranges: '',
            direct_excluded_ips: ''
          }}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="name"
                label="应用名称"
                rules={[{ required: true, message: '请输入应用名称' }]}
              >
                <Input placeholder="例：内网OA系统" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="category"
                label="应用分类"
                rules={[{ required: true, message: '请选择应用分类' }]}
              >
                <Select placeholder="选择分类">
                  <Option value="web">Web应用</Option>
                  <Option value="api">API服务</Option>
                  <Option value="database">数据库</Option>
                  <Option value="other">其他</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="description"
            label="应用描述"
          >
            <TextArea rows={2} placeholder="应用功能描述" />
          </Form.Item>

          <Divider orientation="left">代理配置</Divider>

          <Form.Item
            name="internal_url"
            label="内网地址"
            rules={[
              { required: true, message: '请输入内网地址' },
              { pattern: /^https?:\/\//, message: '请输入完整的URL，包含http://或https://' }
            ]}
          >
            <Input placeholder="http://192.168.1.100:8080" />
          </Form.Item>

          <Form.Item
            name="external_path"
            label="外部访问路径"
            rules={[
              { required: true, message: '请输入外部路径' },
              { pattern: /^\//, message: '路径必须以/开头' }
            ]}
          >
            <Input
              placeholder="/oa"
              addonBefore="mfa.example.com/proxy"
            />
          </Form.Item>

          <Form.Item
            name="icon"
            label="应用图标URL"
          >
            <Input placeholder="https://example.com/icon.png" />
          </Form.Item>

          <Divider orientation="left">安全设置</Divider>

          <Form.Item
            name="auth_method_id"
            label="认证方式"
            rules={[{ required: true, message: '请选择认证方式' }]}
          >
            <Select placeholder="选择认证方式">
              {authMethods.map(method => (
                <Option key={method.id} value={method.id}>
                  <Space>
                    <SafetyOutlined />
                    {method.name}
                    <Text type="secondary">({method.type})</Text>
                  </Space>
                </Option>
              ))}
            </Select>
          </Form.Item>

          <Row gutter={16}>
            <Col span={12}>
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
            </Col>
            <Col span={12}>
              <Form.Item
                name="require_mfa"
                label="强制MFA验证"
                valuePropName="checked"
                tooltip="启用后即使内网用户也需要进行MFA验证"
              >
                <Switch
                  checkedChildren={<SafetyOutlined />}
                  unCheckedChildren="普通"
                />
              </Form.Item>
            </Col>
          </Row>

          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="allow_internal_direct"
                label="允许内网直连"
                valuePropName="checked"
                tooltip="启用后匹配内网IP段的用户无需认证即可访问"
              >
                <Switch />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="internal_ip_ranges"
                label="内网IP段(可选)"
                tooltip="CIDR，逗号分隔。如: 192.168.0.0/16,10.0.0.0/8；留空则使用全局内网段"
              >
                <Input placeholder="192.168.0.0/16,10.0.0.0/8" />
              </Form.Item>
            </Col>
          </Row>

          <Form.Item
            name="direct_excluded_ips"
            label="直连排除IP/段(可选)"
            tooltip="逗号分隔，支持IP或CIDR；匹配这些来源IP时，即使内网也需要认证"
          >
            <Input placeholder="例如: 192.168.1.10,172.16.5.0/24" />
          </Form.Item>

          <Form.Item
            name="allowed_users"
            label="允许访问的用户"
            tooltip="留空表示所有用户都可以访问"
          >
            <Select
              mode="tags"
              placeholder="输入用户名，回车添加"
              style={{ width: '100%' }}
            >
              {/* 这里可以从用户列表动态加载 */}
            </Select>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default ApplicationManagement; 