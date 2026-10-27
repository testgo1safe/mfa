import React, { useState, useEffect } from 'react';
import {
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Select,
  Tag,
  Popconfirm,
  message,
  Card,
  Row,
  Col,
  Typography,
  Tooltip,
  Badge,
  Divider
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined,
  SearchOutlined,
  KeyOutlined,
  UserOutlined,
  MailOutlined,
  PhoneOutlined
} from '@ant-design/icons';
import { apiMethods } from '../utils/api.ts';
import dayjs from 'dayjs';

const { Title } = Typography;
const { Option } = Select;

interface User {
  id: number;
  username: string;
  email: string;
  phone: string;
  role: 'admin' | 'user';
  status: 'active' | 'inactive';
  wechat_userid?: string;
  created_at: string;
  updated_at: string;
}

interface UserFormData {
  username: string;
  password?: string;
  email: string;
  phone: string;
  role: 'admin' | 'user';
  status: 'active' | 'inactive';
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 10,
    total: 0,
    pages: 0
  });
  
  // 搜索和筛选状态
  const [searchText, setSearchText] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  
  // Modal状态
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [resetPasswordModalVisible, setResetPasswordModalVisible] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  
  // 表单实例
  const [createForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [resetPasswordForm] = Form.useForm();

  // 加载用户列表
  const loadUsers = async () => {
    try {
      setLoading(true);
      const response = await apiMethods.users.getList({
        page: pagination.page,
        limit: pagination.limit,
        search: searchText,
        role: roleFilter
      });
      
      setUsers(response.data.users);
      setPagination(response.data.pagination);
    } catch (error) {
      console.error('Load users error:', error);
      message.error('加载用户列表失败');
    } finally {
      setLoading(false);
    }
  };

  // 创建用户
  const handleCreateUser = async (values: UserFormData) => {
    try {
      await apiMethods.users.create(values);
      message.success('用户创建成功');
      setCreateModalVisible(false);
      createForm.resetFields();
      loadUsers();
    } catch (error: any) {
      console.error('Create user error:', error);
      message.error(error.response?.data?.message || '创建用户失败');
    }
  };

  // 更新用户
  const handleUpdateUser = async (values: Partial<UserFormData>) => {
    if (!selectedUser) return;
    
    try {
      await apiMethods.users.update(selectedUser.id, values);
      message.success('用户更新成功');
      setEditModalVisible(false);
      editForm.resetFields();
      setSelectedUser(null);
      loadUsers();
    } catch (error: any) {
      console.error('Update user error:', error);
      message.error(error.response?.data?.message || '更新用户失败');
    }
  };

  // 删除用户
  const handleDeleteUser = async (userId: number) => {
    try {
      await apiMethods.users.delete(userId);
      message.success('用户删除成功');
      loadUsers();
    } catch (error: any) {
      console.error('Delete user error:', error);
      message.error(error.response?.data?.message || '删除用户失败');
    }
  };

  // 重置密码
  const handleResetPassword = async (values: { newPassword: string }) => {
    if (!selectedUser) return;
    
    try {
      await apiMethods.users.resetPassword(selectedUser.id, values);
      message.success('密码重置成功');
      setResetPasswordModalVisible(false);
      resetPasswordForm.resetFields();
      setSelectedUser(null);
    } catch (error: any) {
      console.error('Reset password error:', error);
      message.error(error.response?.data?.message || '重置密码失败');
    }
  };

  // 打开编辑Modal
  const handleEditUser = (user: User) => {
    setSelectedUser(user);
    editForm.setFieldsValue({
      username: user.username,
      email: user.email,
      phone: user.phone,
      role: user.role,
      status: user.status
    });
    setEditModalVisible(true);
  };

  // 打开重置密码Modal
  const handleResetPasswordModal = (user: User) => {
    setSelectedUser(user);
    setResetPasswordModalVisible(true);
  };

  // 搜索处理
  const handleSearch = () => {
    setPagination(prev => ({ ...prev, page: 1 }));
    loadUsers();
  };

  // 重置搜索
  const handleResetSearch = () => {
    setSearchText('');
    setRoleFilter('');
    setPagination(prev => ({ ...prev, page: 1 }));
    setTimeout(loadUsers, 0);
  };

  // 分页处理
  const handleTableChange = (page: number, pageSize: number) => {
    setPagination(prev => ({ ...prev, page, limit: pageSize }));
  };

  useEffect(() => {
    loadUsers();
  }, [pagination.page, pagination.limit]);

  // 表格列定义
  const columns = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      render: (username: string, record: User) => (
        <Space>
          <UserOutlined />
          <span>{username}</span>
          {record.wechat_userid && (
            <Tooltip title="已绑定企业微信">
              <Badge color="green" />
            </Tooltip>
          )}
        </Space>
      ),
    },
    {
      title: '邮箱',
      dataIndex: 'email',
      key: 'email',
      render: (email: string) => (
        <Space>
          <MailOutlined />
          <span>{email || '-'}</span>
        </Space>
      ),
    },
    {
      title: '电话',
      dataIndex: 'phone',
      key: 'phone',
      render: (phone: string) => (
        <Space>
          <PhoneOutlined />
          <span>{phone || '-'}</span>
        </Space>
      ),
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      render: (role: string) => (
        <Tag color={role === 'admin' ? 'red' : 'blue'}>
          {role === 'admin' ? '管理员' : '普通用户'}
        </Tag>
      ),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => (
        <Tag color={status === 'active' ? 'green' : 'red'}>
          {status === 'active' ? '活跃' : '禁用'}
        </Tag>
      ),
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => dayjs(date).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: '操作',
      key: 'actions',
      fixed: 'right' as const,
      width: 200,
      render: (_, record: User) => (
        <Space size="small">
          <Tooltip title="编辑用户">
            <Button
              type="text"
              icon={<EditOutlined />}
              onClick={() => handleEditUser(record)}
            />
          </Tooltip>
          <Tooltip title="重置密码">
            <Button
              type="text"
              icon={<KeyOutlined />}
              onClick={() => handleResetPasswordModal(record)}
            />
          </Tooltip>
          <Popconfirm
            title="确认删除这个用户吗？"
            description="删除后无法恢复，请谨慎操作。"
            onConfirm={() => handleDeleteUser(record.id)}
            okText="确认"
            cancelText="取消"
          >
            <Tooltip title="删除用户">
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
              />
            </Tooltip>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <Title level={3}>用户管理</Title>
      
      <Card>
        {/* 搜索和筛选 */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={8}>
            <Input
              placeholder="搜索用户名或邮箱"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onPressEnter={handleSearch}
              prefix={<SearchOutlined />}
            />
          </Col>
          <Col span={6}>
            <Select
              placeholder="筛选角色"
              value={roleFilter}
              onChange={setRoleFilter}
              allowClear
              style={{ width: '100%' }}
            >
              <Option value="admin">管理员</Option>
              <Option value="user">普通用户</Option>
            </Select>
          </Col>
          <Col span={10}>
            <Space>
              <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch}>
                搜索
              </Button>
              <Button onClick={handleResetSearch}>重置</Button>
              <Button icon={<ReloadOutlined />} onClick={loadUsers}>
                刷新
              </Button>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => setCreateModalVisible(true)}
              >
                创建用户
              </Button>
            </Space>
          </Col>
        </Row>

        {/* 用户表格 */}
        <Table
          columns={columns}
          dataSource={users}
          rowKey="id"
          loading={loading}
          scroll={{ x: 1000 }}
          pagination={{
            current: pagination.page,
            pageSize: pagination.limit,
            total: pagination.total,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total, range) => `第 ${range[0]}-${range[1]} 条，共 ${total} 条`,
            onChange: handleTableChange,
            onShowSizeChange: handleTableChange,
          }}
        />
      </Card>

      {/* 创建用户Modal */}
      <Modal
        title="创建用户"
        open={createModalVisible}
        onCancel={() => {
          setCreateModalVisible(false);
          createForm.resetFields();
        }}
        footer={null}
        width={600}
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={handleCreateUser}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="username"
                label="用户名"
                rules={[
                  { required: true, message: '请输入用户名' },
                  { min: 3, message: '用户名至少3个字符' },
                  { max: 20, message: '用户名最多20个字符' }
                ]}
              >
                <Input placeholder="请输入用户名" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="password"
                label="密码"
                rules={[
                  { required: true, message: '请输入密码' },
                  { min: 6, message: '密码至少6个字符' }
                ]}
              >
                <Input.Password placeholder="请输入密码" />
              </Form.Item>
            </Col>
          </Row>
          
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="email"
                label="邮箱"
                rules={[
                  { type: 'email', message: '请输入有效的邮箱地址' }
                ]}
              >
                <Input placeholder="请输入邮箱" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="phone"
                label="电话"
              >
                <Input placeholder="请输入电话号码" />
              </Form.Item>
            </Col>
          </Row>
          
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="role"
                label="角色"
                initialValue="user"
                rules={[{ required: true, message: '请选择角色' }]}
              >
                <Select>
                  <Option value="user">普通用户</Option>
                  <Option value="admin">管理员</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="status"
                label="状态"
                initialValue="active"
                rules={[{ required: true, message: '请选择状态' }]}
              >
                <Select>
                  <Option value="active">活跃</Option>
                  <Option value="inactive">禁用</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          
          <Divider />
          
          <Space style={{ float: 'right' }}>
            <Button onClick={() => {
              setCreateModalVisible(false);
              createForm.resetFields();
            }}>
              取消
            </Button>
            <Button type="primary" htmlType="submit">
              创建
            </Button>
          </Space>
        </Form>
      </Modal>

      {/* 编辑用户Modal */}
      <Modal
        title="编辑用户"
        open={editModalVisible}
        onCancel={() => {
          setEditModalVisible(false);
          editForm.resetFields();
          setSelectedUser(null);
        }}
        footer={null}
        width={600}
      >
        <Form
          form={editForm}
          layout="vertical"
          onFinish={handleUpdateUser}
        >
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="username"
                label="用户名"
                rules={[
                  { required: true, message: '请输入用户名' },
                  { min: 3, message: '用户名至少3个字符' },
                  { max: 20, message: '用户名最多20个字符' }
                ]}
              >
                <Input placeholder="请输入用户名" />
              </Form.Item>
            </Col>
          </Row>
          
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="email"
                label="邮箱"
                rules={[
                  { type: 'email', message: '请输入有效的邮箱地址' }
                ]}
              >
                <Input placeholder="请输入邮箱" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="phone"
                label="电话"
              >
                <Input placeholder="请输入电话号码" />
              </Form.Item>
            </Col>
          </Row>
          
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item
                name="role"
                label="角色"
                rules={[{ required: true, message: '请选择角色' }]}
              >
                <Select>
                  <Option value="user">普通用户</Option>
                  <Option value="admin">管理员</Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="status"
                label="状态"
                rules={[{ required: true, message: '请选择状态' }]}
              >
                <Select>
                  <Option value="active">活跃</Option>
                  <Option value="inactive">禁用</Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
          
          <Divider />
          
          <Space style={{ float: 'right' }}>
            <Button onClick={() => {
              setEditModalVisible(false);
              editForm.resetFields();
              setSelectedUser(null);
            }}>
              取消
            </Button>
            <Button type="primary" htmlType="submit">
              更新
            </Button>
          </Space>
        </Form>
      </Modal>

      {/* 重置密码Modal */}
      <Modal
        title={`重置密码 - ${selectedUser?.username}`}
        open={resetPasswordModalVisible}
        onCancel={() => {
          setResetPasswordModalVisible(false);
          resetPasswordForm.resetFields();
          setSelectedUser(null);
        }}
        footer={null}
        width={400}
      >
        <Form
          form={resetPasswordForm}
          layout="vertical"
          onFinish={handleResetPassword}
        >
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[
              { required: true, message: '请输入新密码' },
              { min: 6, message: '密码至少6个字符' }
            ]}
          >
            <Input.Password placeholder="请输入新密码" />
          </Form.Item>
          
          <Form.Item
            name="confirmPassword"
            label="确认密码"
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
            <Input.Password placeholder="请再次输入新密码" />
          </Form.Item>
          
          <Divider />
          
          <Space style={{ float: 'right' }}>
            <Button onClick={() => {
              setResetPasswordModalVisible(false);
              resetPasswordForm.resetFields();
              setSelectedUser(null);
            }}>
              取消
            </Button>
            <Button type="primary" htmlType="submit">
              重置密码
            </Button>
          </Space>
        </Form>
      </Modal>
    </div>
  );
};

export default UserManagement; 