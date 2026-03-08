'use client';

import React from 'react';
import { RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { SyncStatus } from '@/lib/syncApi';

interface ConnectionStatusProps {
  isConnected: boolean;
  error: string | null;
  status: SyncStatus | null;
  onRefresh: () => void;
  isLoading: boolean;
}

export function ConnectionStatus({
  isConnected,
  error,
  status,
  onRefresh,
  isLoading
}: ConnectionStatusProps) {
  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Connection Indicator */}
          <div className={`
            w-3 h-3 rounded-full animate-pulse
            ${isConnected ? 'bg-green-500' : 'bg-red-500'}
          `} />

          <div>
            <div className="flex items-center gap-2">
              {isConnected ? (
                <Wifi className="w-4 h-4 text-green-400" />
              ) : (
                <WifiOff className="w-4 h-4 text-red-400" />
              )}
              <span className="font-medium text-white">
                {isConnected ? '已连接 Sync Service' : '未连接 Sync Service'}
              </span>
            </div>

            {status && (
              <p className="text-slate-400 text-sm mt-1">
                {status.stats.total_trades} 笔交易 · {status.stats.total_strategies} 个策略
              </p>
            )}

            {error && (
              <p className="text-red-400 text-sm mt-1">{error}</p>
            )}
          </div>
        </div>

        {/* Refresh Button */}
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700
                     text-white rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          <span className="text-sm">刷新</span>
        </button>
      </div>

      {/* Last Sync Info */}
      {status?.last_sync && (
        <div className="mt-4 pt-4 border-t border-slate-800 text-sm text-slate-400">
          <div className="flex justify-between">
            <span>上次交易同步:</span>
            <span className="text-slate-300">
              {status.last_sync.trades
                ? new Date(status.last_sync.trades).toLocaleString('zh-CN')
                : '从未同步'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
