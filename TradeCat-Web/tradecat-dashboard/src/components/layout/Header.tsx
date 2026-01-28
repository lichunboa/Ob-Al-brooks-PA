'use client';

import React, { useState, useEffect } from 'react';
import { SidebarToggle } from './Sidebar';
import { Wifi, WifiOff } from 'lucide-react';

interface HeaderProps {
  onMenuToggle: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onMenuToggle }) => {
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    // 简单的连接检查，不使用 async/await
    const checkConnection = () => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8088';
      
      fetch(`${apiUrl}/health`, { cache: 'no-store' })
        .then(response => {
          setIsConnected(response.ok);
        })
        .catch(() => {
          setIsConnected(false);
        });
    };

    checkConnection();
    const interval = setInterval(checkConnection, 5000);

    return () => clearInterval(interval);
  }, []);

  return (
    <header className="flex items-center justify-between h-16 px-4 bg-slate-900 border-b border-slate-800">
      <div className="flex items-center gap-4">
        <SidebarToggle onClick={onMenuToggle} />
        <h1 className="text-lg font-semibold text-white hidden sm:block">
          交易员控制台
        </h1>
      </div>

      <div className="flex items-center gap-4">
        {/* 连接状态 */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800">
          {isConnected ? (
            <>
              <Wifi className="w-4 h-4 text-green-500" />
              <span className="text-xs text-green-500">已连接</span>
            </>
          ) : (
            <>
              <WifiOff className="w-4 h-4 text-red-500" />
              <span className="text-xs text-red-500">未连接</span>
            </>
          )}
        </div>
      </div>
    </header>
  );
};
