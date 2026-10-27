import React, { useState } from 'react';
import { Form, Input, Button, Card, Alert, Typography, message } from 'antd';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { SafetyOutlined, GoogleOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

interface CodeForm {
  code: string;
}

const TotpCodeInput: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const redirectUrl = searchParams.get('redirect') || '/dashboard';
  const appName = searchParams.get('app') || '应用';

  const handleSubmit = async (values: CodeForm) => {
    setLoading(true);
    console.log('提交TOTP验证码:', values.code);

    try {
      console.log('发送TOTP验证请求...');
      
      const baseUrl = window.location.origin;
      const apiUrl = `${baseUrl}/api/totp/verify`;
      
      const token = localStorage.getItem('access_token');
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
      
      console.log('TOTP验证API URL:', apiUrl);
      console.log('验证码:', values.code);
      console.log('重定向URL:', redirectUrl);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          code: values.code
        })
      });

      console.log('TOTP验证响应状态:', response.status);
      console.log('响应头:', Object.fromEntries(response.headers.entries()));

      const result = await response.json();
      console.log('TOTP验证响应数据:', result);

      if (response.ok && result.success) {
        console.log('TOTP验证成功！开始处理跳转...');
        
        if (result.token) {
          console.log('保存JWT token到localStorage');
          localStorage.setItem('access_token', result.token);
        }
        
        message.success('TOTP验证成功，正在跳转...');
        
        // 优先覆盖代理场景：直接浏览器跳转携带cookie
        setTimeout(() => {
          if (redirectUrl.startsWith('/proxy/')) {
            window.location.href = redirectUrl;
          } else {
            navigate(redirectUrl);
          }
        }, 600);
        
      } else {
        console.log('TOTP验证失败:', result);
        message.error(result.message || 'TOTP验证码验证失败');
      }
    } catch (error) {
      console.error('TOTP验证异常:', error);
      message.error('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
    }}>
      <Card 
        style={{ 
          width: 400, 
          boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
          borderRadius: '12px'
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <GoogleOutlined style={{ fontSize: 48, color: '#1890ff', marginBottom: 16 }} />
          <Title level={3} style={{ margin: 0 }}>TOTP双因子认证</Title>
          <Text type="secondary">访问 {appName}</Text>
        </div>

        <Alert
          message="输入TOTP验证码"
          description={
            <div>
              <p>1. 打开您的TOTP认证器应用（如Google Authenticator）</p>
              <p>2. 找到该系统对应的6位验证码</p>
              <p style={{ margin: 0, color: '#52c41a' }}>
                <SafetyOutlined /> 验证码每30秒更新一次
              </p>
            </div>
          }
          type="info"
          showIcon
          style={{ marginBottom: 24 }}
        />

        <Form
          name="totp_code"
          onFinish={handleSubmit}
          autoComplete="off"
          layout="vertical"
        >
          <Form.Item
            label="TOTP验证码"
            name="code"
            rules={[
              { required: true, message: '请输入TOTP验证码' },
              { pattern: /^\d{6}$/, message: '验证码必须是6位数字' }
            ]}
          >
            <Input
              placeholder="请输入6位验证码"
              size="large"
              maxLength={6}
              style={{ 
                fontSize: '18px', 
                textAlign: 'center',
                letterSpacing: '4px'
              }}
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0 }}>
            <Button 
              type="primary" 
              htmlType="submit" 
              loading={loading}
              size="large"
              block
            >
              验证并访问
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center', marginTop: 16, color: '#666' }}>
          <Text type="secondary" style={{ fontSize: '12px' }}>
            如果验证码错误，请等待新验证码生成后重试
          </Text>
        </div>
      </Card>
    </div>
  );
};

export default TotpCodeInput; 