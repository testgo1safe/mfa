import React, { useState } from 'react';
import { Form, Input, Button, Card, Alert, Typography, message } from 'antd';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { WechatOutlined, SafetyCertificateOutlined } from '@ant-design/icons';

const { Title, Text } = Typography;

interface CodeForm {
  code: string;
}

const WechatCodeInput: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const initialRedirectUrl = searchParams.get('redirect') || '/dashboard';
  const appName = searchParams.get('app') || '应用';

  // 生成稳定的设备指纹ID
  const getUserIdentifier = () => {
    let userId = localStorage.getItem('wechat_user_id');
    if (!userId) {
      const timestamp = Date.now();
      const random = Math.random().toString(36).substr(2, 9);
      userId = 'device_' + timestamp + '_' + random;
      localStorage.setItem('wechat_user_id', userId);
    }
    return userId;
  };

  const handleSubmit = async (values: CodeForm) => {
    setLoading(true);
    try {
      const baseUrl = window.location.origin;
      const apiUrl = `${baseUrl}/api/wechat/verify-push-code`;
      const deviceId = getUserIdentifier();
      const currentTimestamp = Date.now();

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Device-Fingerprint': deviceId,
          'X-WeChat-Code': values.code
        },
        credentials: 'include',
        body: JSON.stringify({
          code: values.code,
          redirect_url: initialRedirectUrl,
          deviceFingerprint: deviceId,
          testSource: 'wechat_code_input',
          timestamp: currentTimestamp
        })
      });

      const result = await response.json();

      if (response.ok && result.success) {
        if (result.token) {
          // 多种方式存储token，提高Safari兼容性
          try {
            localStorage.setItem('access_token', result.token);
            localStorage.setItem('wechat_token', result.token);
            // Safari Private模式下localStorage可能不可用，使用sessionStorage备用
            sessionStorage.setItem('access_token', result.token);
          } catch (e) {
            console.warn('Token存储失败:', e);
          }
        }
        message.success('企业微信验证成功，正在跳转...');

        const target = (result.redirect_url as string) || initialRedirectUrl;

        // 移动端浏览器优化：增加连接状态检查和错误恢复
        const redirectToTarget = async () => {
          try {
            // 移动端预检查网络连接
            const userAgent = navigator.userAgent.toLowerCase();
            const isMobile = /mobile|android|iphone|ipad|safari/i.test(userAgent);
            const isSafari = userAgent.includes('safari') && !userAgent.includes('chrome');
            const isEdge = userAgent.includes('edge') || userAgent.includes('edg/');
            
            if (isMobile && target.startsWith('/proxy/')) {
              // 移动端代理访问前的连接检查
              console.log('移动端代理访问，执行连接预检查...');
              
              try {
                const healthCheck = await fetch('/api/health', { 
                  method: 'GET',
                  credentials: 'include',
                  headers: {
                    'X-Mobile-Access': 'true',
                    'Cache-Control': 'no-cache'
                  }
                });
                
                if (!healthCheck.ok) {
                  throw new Error(`健康检查失败: ${healthCheck.status}`);
                }
                
                console.log('连接预检查通过');
              } catch (healthError) {
                console.warn('连接预检查失败:', healthError);
                message.warning('网络连接不稳定，正在重试...');
                // 延迟后重试
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            }
            
            if (/^https?:\/\//i.test(target) || target.startsWith('/proxy/')) {
              if (isSafari) {
                // Safari使用更稳定的跳转方式
                console.log('Safari检测，使用location.href跳转');
                window.location.href = target;
              } else if (isEdge && isMobile) {
                // Edge移动端特殊处理
                console.log('Edge移动端检测，使用特殊跳转方式');
                window.location.href = target;
              } else {
                console.log('其他浏览器使用location.replace跳转');
                window.location.replace(target);
              }
            } else {
              navigate(target);
            }
          } catch (error) {
            console.error('跳转过程中出错:', error);
            message.error('跳转失败，请手动刷新页面');
            // 备用方案：延迟后强制跳转
            setTimeout(() => {
              window.location.href = target;
            }, 2000);
          }
        };
        
        setTimeout(redirectToTarget, 500); // 移动端增加延迟确保稳定性
      } else {
        message.error(result.message || '验证码验证失败');
      }
    } catch (error) {
      console.error('验证异常:', error);
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
          <WechatOutlined style={{ fontSize: 48, color: '#07c160', marginBottom: 16 }} />
          <Title level={3} style={{ margin: 0 }}>企业微信验证</Title>
          <Text type="secondary">访问 {appName}</Text>
        </div>

        <Alert
          message="获取验证码"
          description={
            <div>
              <p>1. 在企业微信工作台打开"多因素认证"应用</p>
              <p>2. 点击"获取新验证码"并复制</p>
              <p style={{ margin: 0, color: '#52c41a' }}>
                <SafetyCertificateOutlined /> 跨设备使用，60秒内有效
              </p>
            </div>
          }
          type="info"
          showIcon
          style={{ marginBottom: 24 }}
        />

        <Form
          name="wechat_code"
          onFinish={handleSubmit}
          autoComplete="off"
          layout="vertical"
        >
          <Form.Item
            label="企业微信验证码"
            name="code"
            rules={[
              { required: true, message: '请输入企业微信验证码' },
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
              style={{ 
                background: '#07c160',
                borderColor: '#07c160'
              }}
            >
              {loading ? '验证中...' : '验证并访问'}
            </Button>
          </Form.Item>
        </Form>

        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button 
            type="link" 
            onClick={() => navigate('/login')}
            style={{ color: '#666' }}
          >
            返回登录页面
          </Button>
        </div>
      </Card>
    </div>
  );
};

export default WechatCodeInput; 