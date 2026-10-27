import React, { useState, useEffect } from 'react';
import {
  Table,
  Card,
  Row,
  Col,
  DatePicker,
  Select,
  Input,
  Button,
  Space,
  Tag,
  Typography,
  Statistic,
  message,
  Tooltip,
  Badge,
  Divider,
  Form,
  Modal,
  Alert
} from 'antd';
import {
  SearchOutlined,
  ReloadOutlined,
  DownloadOutlined,
  EyeOutlined,
  UserOutlined,
  GlobalOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  WarningOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import { apiMethods } from '../utils/api.ts';
import dayjs from 'dayjs';

const { Title, Text } = Typography;
const { Option } = Select;
const { RangePicker } = DatePicker;

interface AccessLog {
  id: number;
  user_id: number;
  username: string;
  ip_address: string;
  user_agent: string;
  access_type: string;
  application_id?: number;
  status: 'success' | 'failed' | 'blocked';
  error_message?: string;
  created_at: string;
}

interface LogStats {
  totalLogs: number;
  todayLogs: number;
  successLogs: number;
  failedLogs: number;
  uniqueUsers: number;
  uniqueIPs: number;
  topUsers: Array<{ username: string; count: number }>;
  topIPs: Array<{ ip: string; count: number }>;
  hourlyStats: Array<{ hour: number; count: number }>;
}

interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

const AccessLogs: React.FC = () => {
  const [logs, setLogs] = useState<AccessLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<LogStats | null>(null);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    pages: 0
  });
  
  // 筛选条件
  const [filters, setFilters] = useState({
    username: '',
    ip_address: '',
    access_type: '',
    status: '',
    date_range: null as [dayjs.Dayjs, dayjs.Dayjs] | null,
  });
  
  // Modal状态
  const [detailModalVisible, setDetailModalVisible] = useState(false);
  const [selectedLog, setSelectedLog] = useState<AccessLog | null>(null);
  
  // 表单
  const [filterForm] = Form.useForm();

  // 加载访问日志
  const loadAccessLogs = async () => {
    try {
      setLoading(true);
      
      const params: any = {
        page: pagination.page,
        limit: pagination.limit,
      };
      
      if (filters.username) params.username = filters.username;
      if (filters.ip_address) params.ip_address = filters.ip_address;
      if (filters.access_type) params.access_type = filters.access_type;
      if (filters.status) params.status = filters.status;
      
      if (filters.date_range) {
        params.start_date = filters.date_range[0].format('YYYY-MM-DD');
        params.end_date = filters.date_range[1].format('YYYY-MM-DD');
      }
      
      const response = await apiMethods.logs.getAccessLogs(params);
      setLogs(response.data.logs || []);
      setPagination(response.data.pagination || pagination);
    } catch (error) {
      console.error('Load access logs error:', error);
      message.error('加载访问日志失败');
    } finally {
      setLoading(false);
    }
  };

  // 加载统计数据
  const loadStats = async () => {
    try {
      const response = await apiMethods.logs.getStats();
      setStats(response.data);
    } catch (error) {
      console.error('Load log stats error:', error);
      message.error('加载统计数据失败');
    }
  };

  // 应用筛选
  const handleApplyFilters = (values: any) => {
    setFilters({
      username: values.username || '',
      ip_address: values.ip_address || '',
      access_type: values.access_type || '',
      status: values.status || '',
      date_range: values.date_range || null,
    });
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  // 重置筛选
  const handleResetFilters = () => {
    setFilters({
      username: '',
      ip_address: '',
      access_type: '',
      status: '',
      date_range: null,
    });
    filterForm.resetFields();
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  // 查看详情
  const handleViewDetail = (log: AccessLog) => {
    setSelectedLog(log);
    setDetailModalVisible(true);
  };

  // 导出日志
  const handleExportLogs = async () => {
    try {
      setLoading(true);
      
      const params: any = {
        format: 'csv',
      };
      
      if (filters.username) params.username = filters.username;
      if (filters.ip_address) params.ip_address = filters.ip_address;
      if (filters.access_type) params.access_type = filters.access_type;
      if (filters.status) params.status = filters.status;
      
      if (filters.date_range) {
        params.start_date = filters.date_range[0].format('YYYY-MM-DD');
        params.end_date = filters.date_range[1].format('YYYY-MM-DD');
      }
      
      const response = await apiMethods.logs.export(params);
      
      // 创建下载链接
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `access_logs_${dayjs().format('YYYY-MM-DD_HH-mm-ss')}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      message.success('日志导出成功');
    } catch (error) {
      console.error('Export logs error:', error);
      message.error('导出失败');
    } finally {
      setLoading(false);
    }
  };

  // 分页处理
  const handleTableChange = (page: number, pageSize: number) => {
    setPagination(prev => ({ ...prev, page, limit: pageSize }));
  };

  useEffect(() => {
    loadAccessLogs();
  }, [pagination.page, pagination.limit, filters]);

  useEffect(() => {
    loadStats();
    loadAccessLogs();
  }, []);

  // 状态渲染
  const renderStatus = (status: string) => {
    const statusConfig = {
      success: { color: 'green', icon: <CheckCircleOutlined />, text: '成功' },
      failed: { color: 'red', icon: <CloseCircleOutlined />, text: '失败' },
      blocked: { color: 'orange', icon: <WarningOutlined />, text: '阻止' },
    };
    
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.failed;
    
    return (
      <Tag color={config.color} icon={config.icon}>
        {config.text}
      </Tag>
    );
  };

  // 访问类型渲染
  const renderAccessType = (type: string) => {
    const typeConfig = {
      login: { color: 'blue', text: '登录' },
      logout: { color: 'default', text: '注销' },
      api: { color: 'purple', text: 'API访问' },
      wechat: { color: 'green', text: '微信登录' },
      mfa: { color: 'orange', text: 'MFA验证' },
    };
    
    const config = typeConfig[type as keyof typeof typeConfig] || { color: 'default', text: type };
    
    return (
      <Tag color={config.color}>
        {config.text}
      </Tag>
    );
  };

  // 表格列定义
  const columns = [
    {
      title: '时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (date: string) => (
        <Text>{dayjs(date).format('YYYY-MM-DD HH:mm:ss')}</Text>
      ),
    },
    {
      title: '用户',
      dataIndex: 'username',
      key: 'username',
      width: 120,
      render: (username: string) => (
        <Space>
          <UserOutlined />
          <Text>{username || '未知'}</Text>
        </Space>
      ),
    },
    {
      title: 'IP地址',
      dataIndex: 'ip_address',
      key: 'ip_address',
      width: 130,
      render: (ip: string) => (
        <Space>
          <GlobalOutlined />
          <Text code>{ip}</Text>
        </Space>
      ),
    },
    {
      title: '访问类型',
      dataIndex: 'access_type',
      key: 'access_type',
      width: 120,
      render: renderAccessType,
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      render: renderStatus,
    },
    {
      title: '设备信息',
      dataIndex: 'user_agent',
      key: 'user_agent',
      ellipsis: true,
      render: (userAgent: string) => (
        <Tooltip title={userAgent}>
          <Text ellipsis style={{ maxWidth: 200 }}>
            {userAgent}
          </Text>
        </Tooltip>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 80,
      render: (_, record: AccessLog) => (
        <Button
          type="text"
          icon={<EyeOutlined />}
          onClick={() => handleViewDetail(record)}
        />
      ),
    },
  ];

  return (
    <div>
      <Title level={3}>访问日志</Title>
      
      {/* 统计卡片 */}
      <Row gutter={16} style={{ marginBottom: 24 }}>
        <Col span={4}>
          <Card>
            <Statistic
              title="总访问量"
              value={stats?.totalLogs || 0}
              prefix={<InfoCircleOutlined />}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="今日访问"
              value={stats?.todayLogs || 0}
              prefix={<EyeOutlined />}
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="成功访问"
              value={stats?.successLogs || 0}
              prefix={<CheckCircleOutlined />}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="失败访问"
              value={stats?.failedLogs || 0}
              prefix={<CloseCircleOutlined />}
              valueStyle={{ color: '#f5222d' }}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="独立用户"
              value={stats?.uniqueUsers || 0}
              prefix={<UserOutlined />}
            />
          </Card>
        </Col>
        <Col span={4}>
          <Card>
            <Statistic
              title="独立IP"
              value={stats?.uniqueIPs || 0}
              prefix={<GlobalOutlined />}
            />
          </Card>
        </Col>
      </Row>

      {/* 筛选条件 */}
      <Card title="筛选条件" style={{ marginBottom: 16 }}>
        <Form
          form={filterForm}
          layout="inline"
          onFinish={handleApplyFilters}
        >
          <Form.Item name="username">
            <Input
              placeholder="用户名"
              prefix={<UserOutlined />}
              style={{ width: 150 }}
            />
          </Form.Item>
          
          <Form.Item name="ip_address">
            <Input
              placeholder="IP地址"
              prefix={<GlobalOutlined />}
              style={{ width: 150 }}
            />
          </Form.Item>
          
          <Form.Item name="access_type">
            <Select placeholder="访问类型" style={{ width: 120 }} allowClear>
              <Option value="login">登录</Option>
              <Option value="logout">注销</Option>
              <Option value="api">API访问</Option>
              <Option value="wechat">微信登录</Option>
              <Option value="mfa">MFA验证</Option>
            </Select>
          </Form.Item>
          
          <Form.Item name="status">
            <Select placeholder="状态" style={{ width: 100 }} allowClear>
              <Option value="success">成功</Option>
              <Option value="failed">失败</Option>
              <Option value="blocked">阻止</Option>
            </Select>
          </Form.Item>
          
          <Form.Item name="date_range">
            <RangePicker
              placeholder={['开始日期', '结束日期']}
              style={{ width: 250 }}
            />
          </Form.Item>
          
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit" icon={<SearchOutlined />}>
                查询
              </Button>
              <Button onClick={handleResetFilters}>
                重置
              </Button>
              <Button icon={<ReloadOutlined />} onClick={() => {
                loadStats();
                loadAccessLogs();
              }}>
                刷新
              </Button>
              <Button icon={<DownloadOutlined />} onClick={handleExportLogs}>
                导出
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      {/* 访问日志表格 */}
      <Card title="访问记录">
        <Table
          columns={columns}
          dataSource={logs}
          rowKey="id"
          loading={loading}
          size="small"
          scroll={{ x: 1200 }}
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

      {/* 详情Modal */}
      <Modal
        title="访问日志详情"
        open={detailModalVisible}
        onCancel={() => {
          setDetailModalVisible(false);
          setSelectedLog(null);
        }}
        footer={[
          <Button key="close" onClick={() => {
            setDetailModalVisible(false);
            setSelectedLog(null);
          }}>
            关闭
          </Button>
        ]}
        width={600}
      >
        {selectedLog && (
          <div>
            <Row gutter={16}>
              <Col span={12}>
                <div style={{ marginBottom: 16 }}>
                  <Text strong>访问时间：</Text>
                  <br />
                  <Text>{dayjs(selectedLog.created_at).format('YYYY-MM-DD HH:mm:ss')}</Text>
                </div>
                
                <div style={{ marginBottom: 16 }}>
                  <Text strong>用户：</Text>
                  <br />
                  <Space>
                    <UserOutlined />
                    <Text>{selectedLog.username || '未知'}</Text>
                  </Space>
                </div>
                
                <div style={{ marginBottom: 16 }}>
                  <Text strong>IP地址：</Text>
                  <br />
                  <Space>
                    <GlobalOutlined />
                    <Text code>{selectedLog.ip_address}</Text>
                  </Space>
                </div>
              </Col>
              
              <Col span={12}>
                <div style={{ marginBottom: 16 }}>
                  <Text strong>访问类型：</Text>
                  <br />
                  {renderAccessType(selectedLog.access_type)}
                </div>
                
                <div style={{ marginBottom: 16 }}>
                  <Text strong>状态：</Text>
                  <br />
                  {renderStatus(selectedLog.status)}
                </div>
                
                {selectedLog.error_message && (
                  <div style={{ marginBottom: 16 }}>
                    <Text strong>错误信息：</Text>
                    <br />
                    <Alert
                      message={selectedLog.error_message}
                      type="error"
                    />
                  </div>
                )}
              </Col>
            </Row>
            
            <Divider />
            
            <div>
              <Text strong>设备信息：</Text>
              <br />
              <Text code style={{ wordBreak: 'break-all' }}>
                {selectedLog.user_agent}
              </Text>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default AccessLogs; 