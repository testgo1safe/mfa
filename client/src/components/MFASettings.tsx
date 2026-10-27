import React, { useState, useEffect } from 'react';
import {
  Card,
  Button,
  Input,
  Switch,
  message,
  Modal,
  Steps,
  Typography,
  Space,
  Divider,
  Alert,
  Image,
  Tag,
  List,
  Tooltip
} from 'antd';
import {
  SafetyOutlined,
  QrcodeOutlined,
  MobileOutlined,
  CopyOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  LockOutlined
} from '@ant-design/icons';
import dayjs from 'dayjs';
import api from '../utils/api.ts';

const { Title, Text, Paragraph } = Typography;
const { Step } = Steps;

interface MFAStatus {
  hasMFA: boolean;
  isEnabled: boolean;
  mfaType: string | null;
  setupDate: string | null;
}

interface TOTPSetupData {
  qrcode: string;
  manualEntryKey: string;
  instructions: {
    step1: string;
    step2: string;
    step3: string;
  };
}

const MFASettings: React.FC = () => {
  const [mfaStatus, setMFAStatus] = useState<MFAStatus>({
    hasMFA: false,
    isEnabled: false,
    mfaType: null,
    setupDate: null
  });
  const [loading, setLoading] = useState(false);
  const [setupModalVisible, setSetupModalVisible] = useState(false);
  const [disableModalVisible, setDisableModalVisible] = useState(false);
  const [backupCodesModalVisible, setBackupCodesModalVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [totpSetupData, setTotpSetupData] = useState<TOTPSetupData | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [password, setPassword] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);

  // 获取MFA状态
  const fetchMFAStatus = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/auth/mfa/status');
      setMFAStatus(response.data);
    } catch (error: any) {
      message.error(error.response?.data?.message || '获取MFA状态失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMFAStatus();
  }, []);

  // 开始设置TOTP
  const handleSetupTOTP = async () => {
    try {
      setLoading(true);
      const response = await api.post('/api/auth/mfa/totp/setup');
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
      const response = await api.post('/api/auth/mfa/totp/enable', {
        token: verificationCode
      });
      
      setBackupCodes(response.data.backupCodes);
      setCurrentStep(2);
      message.success('TOTP已成功启用');
      
      // 刷新状态
      await fetchMFAStatus();
    } catch (error: any) {
      message.error(error.response?.data?.message || 'TOTP启用失败');
    } finally {
      setLoading(false);
    }
  };

  // 禁用TOTP
  const handleDisableTOTP = async () => {
    if (!password) {
      message.error('请输入密码');
      return;
    }

    try {
      setLoading(true);
      await api.post('/api/auth/mfa/totp/disable', {
        password: password,
        token: verificationCode
      });
      
      message.success('TOTP已成功禁用');
      setDisableModalVisible(false);
      setPassword('');
      setVerificationCode('');
      
      // 刷新状态
      await fetchMFAStatus();
    } catch (error: any) {
      message.error(error.response?.data?.message || 'TOTP禁用失败');
    } finally {
      setLoading(false);
    }
  };

  // 重新生成备用代码
  const handleRegenerateBackupCodes = async () => {
    if (!password || !verificationCode) {
      message.error('请输入密码和验证码');
      return;
    }

    try {
      setLoading(true);
      const response = await api.post('/api/auth/mfa/backup-codes/regenerate', {
        password: password,
        token: verificationCode
      });
      
      setBackupCodes(response.data.backupCodes);
      message.success('备用代码已重新生成');
    } catch (error: any) {
      message.error(error.response?.data?.message || '生成备用代码失败');
    } finally {
      setLoading(false);
    }
  };

  // 复制到剪贴板
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      message.success('已复制到剪贴板');
    });
  };

  // 复制备用代码
  const copyBackupCodes = () => {
    const codes = backupCodes.join('\n');
    copyToClipboard(codes);
  };

  const resetModals = () => {
    setSetupModalVisible(false);
    setDisableModalVisible(false);
    setBackupCodesModalVisible(false);
    setCurrentStep(0);
    setTotpSetupData(null);
    setVerificationCode('');
    setPassword('');
    setBackupCodes([]);
  };

  return (
    <Card title={
      <Space>
        <SafetyOutlined />
        多因素认证 (MFA)
      </Space>
    } loading={loading}>
      {/* MFA状态显示 */}
      <div style={{ marginBottom: 24 }}>
        {mfaStatus.isEnabled ? (
          <Alert
            message="多因素认证已启用"
            description={
              <div>
                <p>您的账户已启用 {mfaStatus.mfaType?.toUpperCase()} 多因素认证</p>
                <p>启用时间: {dayjs(mfaStatus.setupDate).format('YYYY-MM-DD HH:mm:ss')}</p>
              </div>
            }
            type="success"
            icon={<CheckCircleOutlined />}
            showIcon
          />
        ) : (
          <Alert
            message="多因素认证未启用"
            description="启用多因素认证可以大大提高您账户的安全性，建议您立即设置。"
            type="warning"
            icon={<WarningOutlined />}
            showIcon
          />
        )}
      </div>

      {/* TOTP设置 */}
      <Card 
        size="small" 
        title={
          <Space>
            <MobileOutlined />
            TOTP认证器
          </Space>
        }
        extra={
          mfaStatus.isEnabled ? (
            <Tag color="green">已启用</Tag>
          ) : (
            <Tag color="default">未启用</Tag>
          )
        }
      >
        <Paragraph>
          使用Google Authenticator、Microsoft Authenticator等应用生成6位验证码。
        </Paragraph>
        
        <Space wrap>
          {!mfaStatus.isEnabled ? (
            <Button 
              type="primary" 
              icon={<QrcodeOutlined />}
              onClick={handleSetupTOTP}
              loading={loading}
            >
              设置TOTP认证器
            </Button>
          ) : (
            <>
              <Button 
                icon={<LockOutlined />}
                onClick={() => setDisableModalVisible(true)}
              >
                禁用TOTP
              </Button>
              <Button 
                onClick={() => setBackupCodesModalVisible(true)}
              >
                管理备用代码
              </Button>
            </>
          )}
        </Space>
      </Card>

      {/* TOTP设置流程Modal */}
      <Modal
        title="设置TOTP认证器"
        open={setupModalVisible}
        onCancel={resetModals}
        footer={null}
        width={600}
        destroyOnClose
      >
        <Steps current={currentStep} direction="vertical">
          <Step 
            title="扫描二维码" 
            description={
              totpSetupData && (
                <div style={{ marginTop: 16 }}>
                  <Alert
                    message="请使用认证应用扫描二维码"
                    description={
                      <div>
                        <p>推荐应用：Google Authenticator、Microsoft Authenticator</p>
                        <p>如果无法扫描，可以手动输入以下密钥：</p>
                        <Input.Group compact>
                          <Input 
                            value={totpSetupData.manualEntryKey} 
                            readOnly 
                            style={{ width: 'calc(100% - 40px)' }}
                          />
                          <Tooltip title="复制密钥">
                            <Button 
                              icon={<CopyOutlined />} 
                              onClick={() => copyToClipboard(totpSetupData.manualEntryKey)}
                            />
                          </Tooltip>
                        </Input.Group>
                      </div>
                    }
                    type="info"
                    style={{ marginBottom: 16 }}
                  />
                  
                  <div style={{ textAlign: 'center' }}>
                    <Image 
                      src={totpSetupData.qrcode} 
                      alt="TOTP QR Code"
                      style={{ border: '1px solid #d9d9d9' }}
                    />
                  </div>
                  
                  <div style={{ marginTop: 16, textAlign: 'right' }}>
                    <Button 
                      type="primary" 
                      onClick={() => setCurrentStep(1)}
                    >
                      下一步
                    </Button>
                  </div>
                </div>
              )
            } 
          />
          
          <Step 
            title="输入验证码" 
            description={
              currentStep >= 1 && (
                <div style={{ marginTop: 16 }}>
                  <Alert
                    message="请输入认证应用显示的6位验证码"
                    type="info"
                    style={{ marginBottom: 16 }}
                  />
                  
                  <Input.Group compact>
                    <Input 
                      placeholder="输入6位验证码"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value)}
                      maxLength={6}
                      style={{ width: 'calc(100% - 80px)' }}
                    />
                    <Button 
                      type="primary"
                      onClick={handleEnableTOTP}
                      loading={loading}
                      disabled={verificationCode.length !== 6}
                    >
                      验证
                    </Button>
                  </Input.Group>
                </div>
              )
            } 
          />
          
          <Step 
            title="保存备用代码" 
            description={
              currentStep >= 2 && backupCodes.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <Alert
                    message="请妥善保存备用代码"
                    description="当您无法使用认证应用时，可以使用备用代码登录。每个备用代码只能使用一次。"
                    type="warning"
                    style={{ marginBottom: 16 }}
                  />
                  
                  <List
                    size="small"
                    bordered
                    dataSource={backupCodes}
                    renderItem={(code, index) => (
                      <List.Item>
                        <Text code>{code}</Text>
                      </List.Item>
                    )}
                    style={{ maxHeight: 200, overflow: 'auto' }}
                  />
                  
                  <div style={{ marginTop: 16, textAlign: 'center' }}>
                    <Space>
                      <Button onClick={copyBackupCodes}>
                        <CopyOutlined /> 复制所有代码
                      </Button>
                      <Button type="primary" onClick={resetModals}>
                        完成设置
                      </Button>
                    </Space>
                  </div>
                </div>
              )
            } 
          />
        </Steps>
      </Modal>

      {/* 禁用TOTP Modal */}
      <Modal
        title="禁用TOTP认证器"
        open={disableModalVisible}
        onOk={handleDisableTOTP}
        onCancel={() => setDisableModalVisible(false)}
        confirmLoading={loading}
        okType="danger"
        okText="确认禁用"
      >
        <Alert
          message="警告"
          description="禁用TOTP将降低您账户的安全性。请确认您真的要禁用多因素认证。"
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
        
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Text>请输入账户密码确认：</Text>
            <Input.Password
              placeholder="输入密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          
          <div>
            <Text>请输入当前验证码：</Text>
            <Input
              placeholder="输入6位验证码"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              maxLength={6}
            />
          </div>
        </Space>
      </Modal>

      {/* 备用代码管理Modal */}
      <Modal
        title="备用代码管理"
        open={backupCodesModalVisible}
        onCancel={() => setBackupCodesModalVisible(false)}
        footer={null}
        width={500}
      >
        <Alert
          message="重新生成备用代码"
          description="生成新的备用代码将使旧的备用代码失效。请确保在生成新代码前已安全保存。"
          type="info"
          style={{ marginBottom: 16 }}
        />
        
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Text>请输入账户密码：</Text>
            <Input.Password
              placeholder="输入密码"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          
          <div>
            <Text>请输入当前验证码：</Text>
            <Input
              placeholder="输入6位验证码"
              value={verificationCode}
              onChange={(e) => setVerificationCode(e.target.value)}
              maxLength={6}
            />
          </div>
          
          <Button 
            type="primary" 
            block
            onClick={handleRegenerateBackupCodes}
            loading={loading}
            disabled={!password || verificationCode.length !== 6}
          >
            重新生成备用代码
          </Button>
        </Space>
        
        {backupCodes.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <Divider>新的备用代码</Divider>
            <List
              size="small"
              bordered
              dataSource={backupCodes}
              renderItem={(code) => (
                <List.Item>
                  <Text code>{code}</Text>
                </List.Item>
              )}
              style={{ maxHeight: 200, overflow: 'auto' }}
            />
            <div style={{ marginTop: 8, textAlign: 'center' }}>
              <Button onClick={copyBackupCodes}>
                <CopyOutlined /> 复制所有代码
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
};

export default MFASettings; 