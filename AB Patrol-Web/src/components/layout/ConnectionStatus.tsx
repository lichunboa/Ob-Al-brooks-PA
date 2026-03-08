'use client';

import React from 'react';
import { Wifi, WifiOff } from 'lucide-react';

interface ConnectionStatusProps {
  isConnected: boolean;
  latency: number | null;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  isConnected,
  latency,
}) => {
  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800">
      {isConnected ? (
        <>
          <Wifi className="w-4 h-4 text-green-500" />
          <span className="text-xs text-green-500">已连接</span>
          {latency !== null && (
            <span className="text-xs text-slate-500">
              {latency}ms
            </span>
          )}
        </>
      ) : (
        <>
          <WifiOff className="w-4 h-4 text-red-500" />
          <span className="text-xs text-red-500">未连接</span>
        </>
      )}
    </div>
  );
};
