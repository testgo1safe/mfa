import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import api from '../utils/api.ts';

interface NetworkInfo {
  ip: string;
  isInternal: boolean;
  accessType: 'internal' | 'external';
}

interface NetworkContextType {
  networkInfo: NetworkInfo | null;
  loading: boolean;
  refreshNetworkInfo: () => Promise<void>;
}

const NetworkContext = createContext<NetworkContextType | undefined>(undefined);

export const useNetwork = () => {
  const context = useContext(NetworkContext);
  if (context === undefined) {
    throw new Error('useNetwork must be used within a NetworkProvider');
  }
  return context;
};

interface NetworkProviderProps {
  children: ReactNode;
}

export const NetworkProvider: React.FC<NetworkProviderProps> = ({ children }) => {
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const getNetworkInfo = async () => {
    try {
      // 通过健康检查获取网络信息
      const response = await api.get('/api/health');
      
      // 从响应头或其他方式获取网络信息
      // 这里可能需要后端在健康检查接口中返回网络信息
      const clientIP = response.headers['x-client-ip'] || 'unknown';
      
      // 简单判断内外网（这里可以根据实际情况调整）
      const isInternal = isInternalIP(clientIP);
      
      setNetworkInfo({
        ip: clientIP,
        isInternal,
        accessType: isInternal ? 'internal' : 'external'
      });
    } catch (error) {
      console.error('Get network info error:', error);
      // 设置默认值
      setNetworkInfo({
        ip: 'unknown',
        isInternal: false,
        accessType: 'external'
      });
    } finally {
      setLoading(false);
    }
  };

  // 简单的内网IP判断函数
  const isInternalIP = (ip: string): boolean => {
    if (!ip || ip === 'unknown') return false;
    
    // 清理IPv6映射的IPv4地址
    const cleanIP = ip.replace(/^::ffff:/, '');
    
    // 本地回环地址
    if (cleanIP === '127.0.0.1' || cleanIP === '::1' || cleanIP === 'localhost') {
      return true;
    }
    
    // 私有IP地址段
    const privateRanges = [
      /^10\./,                    // 10.0.0.0/8
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./, // 172.16.0.0/12
      /^192\.168\./               // 192.168.0.0/16
    ];
    
    return privateRanges.some(range => range.test(cleanIP));
  };

  const refreshNetworkInfo = async () => {
    setLoading(true);
    await getNetworkInfo();
  };

  useEffect(() => {
    getNetworkInfo();
  }, []);

  const value: NetworkContextType = {
    networkInfo,
    loading,
    refreshNetworkInfo,
  };

  return (
    <NetworkContext.Provider value={value}>
      {children}
    </NetworkContext.Provider>
  );
}; 