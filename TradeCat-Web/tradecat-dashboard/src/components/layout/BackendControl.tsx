'use client';

import React, { useState, useEffect } from 'react';
import { Server, RefreshCw, CheckCircle, AlertCircle, Wifi, WifiOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface BackendStatus {
  http: 'online' | 'offline' | 'checking';
  websocket: 'online' | 'offline' | 'checking';
  version?: string;
  uptime?: number;
}

export const BackendControl: React.FC = () => {
  const [status, setStatus] = useState<BackendStatus>({
    http: 'checking',
    websocket: 'checking',
  });
  const [isLoading, setIsLoading] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8088';
  const wsHealthUrl = apiUrl.replace('8088', '8089');

  // 检查后端状态
  const checkStatus = async () => {
    setStatus(prev => ({ ...prev, http: 'checking', websocket: 'checking' }));

    // 检查 HTTP API
    try {
      const response = await fetch(`${apiUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      
      if (response.ok) {
        const data = await response.json();
        setStatus(prev => ({
          ...prev,
          http: 'online',
          version: data.version,
        }));
      } else {
        setStatus(prev => ({ ...prev, http: 'offline' }));
      }
    } catch {
      setStatus(prev => ({ ...prev, http: 'offline' }));
    }

    // 检查 WebSocket（通过健康检查端口）
    try {
      const wsCheck = await fetch(`${wsHealthUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(3000)
      });
      
      if (wsCheck.ok) {
        setStatus(prev => ({ ...prev, websocket: 'online' }));
      } else {
        setStatus(prev => ({ ...prev, websocket: 'offline' }));
      }
    } catch {
      setStatus(prev => ({ ...prev, websocket: 'offline' }));
    }
  };

  // 初始检查和定期检查
  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  const isHttpOnline = status.http === 'online';
  const isWsOnline = status.websocket === 'online';

  return (
    <div className="px-4 py-3 border-t border-slate-800">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-medium text-slate-300">后端服务</span>
        </div>
        
        <button
          onClick={checkStatus}
          disabled={isLoading}
          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          title="刷新状态"
        >
          <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />
        </button>
      </div>

      {/* 状态显示 */}
      <div className="space-y-1.5 mb-3">
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">HTTP API</span>
          <StatusBadge status={status.http} />
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-slate-500">WebSocket</span>
          <WsStatusBadge status={status.websocket} />
        </div>
        {status.version && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-slate-500">版本</span>
            <span className="text-slate-400">{status.version}</span>
          </div>
        )}
      </div>

      {/* 状态提示 */}
      {isHttpOnline ? (
        isWsOnline ? (
          <div className="flex items-center gap-2 px-3 py-2 bg-green-900/30 border border-green-800 rounded-lg">
            <CheckCircle className="w-3.5 h-3.5 text-green-500" />
            <span className="text-xs text-green-400">所有服务正常</span>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-900/30 border border-blue-800 rounded-lg">
            <WifiOff className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-xs text-blue-400">实时数据离线</span>
          </div>
        )
      ) : (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-900/30 border border-red-800 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5 text-red-500" />
          <span className="text-xs text-red-400">服务离线</span>
        </div>
      )}
    </div>
  );
};

const StatusBadge: React.FC<{ status: 'online' | 'offline' | 'checking' }> = ({ status }) => {
  const config = {
    online: { color: 'bg-green-500', text: '在线' },
    offline: { color: 'bg-red-500', text: '离线' },
    checking: { color: 'bg-yellow-500 animate-pulse', text: '检查中' },
  };

  return (
    <div className="flex items-center gap-1.5">
      <div className={cn('w-1.5 h-1.5 rounded-full', config[status].color)} />
      <span className="text-slate-400">{config[status].text}</span>
    </div>
  );
};

const WsStatusBadge: React.FC<{ status: 'online' | 'offline' | 'checking' }> = ({ status }) => {
  const config = {
    online: { icon: Wifi, color: 'text-green-400', text: '实时' },
    offline: { icon: WifiOff, color: 'text-slate-500', text: '离线' },
    checking: { icon: Wifi, color: 'text-yellow-400', text: '检查中' },
  };
  
  const Icon = config[status].icon;

  return (
    <div className="flex items-center gap-1.5">
      <Icon className={cn('w-3 h-3', config[status].color)} />
      <span className="text-slate-400">{config[status].text}</span>
    </div>
  );
};
