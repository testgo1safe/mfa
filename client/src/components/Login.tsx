import React, { useState, useEffect } from 'react';
import { Form, Input, Button, Card, Alert, Modal } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useAuth } from '../contexts/AuthContext.tsx';

import { apiMethods } from '../utils/api.ts';
import { useNavigate, useLocation } from 'react-router-dom';

interface LoginForm {
  username: string;
  password: string;
}

interface BindForm {
  username: string;
  password: string;
}

const Login: React.FC = () => {
  const [form] = Form.useForm();
  const [bindForm] = Form.useForm();
  const { login, wechatLogin, bindWechat } = useAuth();
  const [loading, setLoading] = useState(false);

  const [showBindModal, setShowBindModal] = useState(false);
  const [wechatUserId, setWechatUserId] = useState<string>('');
  const navigate = useNavigate();
  const location = useLocation();

  // 获取redirect参数
  const redirectUrl = new URLSearchParams(location.search).get('redirect') || '/dashboard';

  // 检查是否为代理应用并自动启动认证
  useEffect(() => {
    const checkProxyAppAuth = async () => {
      if (redirectUrl.startsWith('/proxy/')) {
        try {
          // 提取应用路径，例如 /proxy/test1 -> /test1
          const appPath = redirectUrl.replace('/proxy', '').split('/')[1];
          if (appPath) {
            const response = await apiMethods.applications.getList();
            const applications = response.data.applications || [];
            const targetApp = applications.find((app: any) => 
              app.external_path === `/${appPath}` && app.is_enabled
            );

            if (targetApp && targetApp.auth_method_id) {
              // 获取认证方式详情
              const authResponse = await apiMethods.authMethods.getById(targetApp.auth_method_id);
              const authMethod = authResponse.data.authMethod;

              console.log('Target app auth method:', authMethod);

              // 对于企业微信认证，需要使用专门的验证流程
              if (authMethod.type === 'wechat_qr' || authMethod.type === 'wechat_push') {
                console.log('WeChat auth required for app:', targetApp.name);
                // 企业微信推送验证码通过专门的H5页面处理
                return;
              }
              // 其他认证方式可以在这里添加
            }
          }
        } catch (error) {
          console.error('Failed to check proxy app auth method:', error);
        }
      }

      // 检查是否有企业微信token（原有逻辑）
      const wechatToken = localStorage.getItem('wechat_token');
      if (wechatToken) {
        handleWechatLogin(wechatToken);
      }
    };

    checkProxyAppAuth();
  }, [redirectUrl]);

  const handleLogin = async (values: LoginForm) => {
    setLoading(true);
    const success = await login(values.username, values.password);
    setLoading(false);
    
    if (success) {
      // 登录成功，跳转到指定页面
      if (redirectUrl.startsWith('/proxy/')) {
        // 如果是代理应用，直接跳转到该URL
        window.location.href = redirectUrl;
      } else {
        // 否则使用React Router导航
        navigate(redirectUrl);
      }
    }
  };

  const handleWechatLogin = async (wechatToken: string) => {
    const result = await wechatLogin(wechatToken);

    if (result.success) {
      // 登录成功，跳转到指定页面
      if (redirectUrl.startsWith('/proxy/')) {
        // 如果是代理应用，直接跳转到该URL
        window.location.href = redirectUrl;
      } else {
        // 否则使用React Router导航
        navigate(redirectUrl);
      }
    } else if (result.needBind) {
      setWechatUserId(result.wechat_userid || '');
      setShowBindModal(true);
    }
  };



  const handleBind = async (values: BindForm) => {
    const wechatToken = localStorage.getItem('wechat_token');
    if (!wechatToken) {
      return;
    }

    const success = await bindWechat(values.username, values.password, wechatToken);
    if (success) {
      setShowBindModal(false);
      // 绑定成功后，尝试重新登录
      await handleWechatLogin(wechatToken);
    }
  };



  return (
    <div className="login-container">
      <Card className="login-form">
        <div className="login-title">
          MFA管控平台
        </div>
        


        <Form
          form={form}
          onFinish={handleLogin}
          autoComplete="off"
        >
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input
              prefix={<UserOutlined />}
              placeholder="用户名"
              size="large"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined />}
              placeholder="密码"
              size="large"
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              htmlType="submit"
              className="full-width"
              size="large"
              loading={loading}
            >
              登录
            </Button>
          </Form.Item>
        </Form>



        <div className="login-subtitle">
          统一身份认证平台
        </div>
      </Card>

      {/* 绑定账号模态框 */}
      <Modal
        title="绑定系统账号"
        open={showBindModal}
        onCancel={() => setShowBindModal(false)}
        footer={null}
        closable={false}
      >
        <Alert
          message="首次使用"
          description={`检测到企业微信用户 ${wechatUserId}，请绑定系统账号以完成登录`}
          type="info"
          showIcon
          className="mb-24"
        />
        
        <Form
          form={bindForm}
          onFinish={handleBind}
          layout="vertical"
        >
          <Form.Item
            label="用户名"
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input placeholder="请输入系统用户名" />
          </Form.Item>

          <Form.Item
            label="密码"
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password placeholder="请输入密码" />
          </Form.Item>

          <Form.Item>
            <Button type="primary" htmlType="submit" className="full-width">
              绑定账号
            </Button>
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default Login; 