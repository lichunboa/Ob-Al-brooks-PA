'use client';

import { useState } from 'react';
import { Power, RefreshCw, Zap, ZapOff } from 'lucide-react';

interface TradingControlProps {
  tradingEnabled: boolean;
  lastSync: string | null;
  binanceBalance: number;
  binanceAvailable: number;
  unrealizedPnl: number;
  onToggle: (enabled: boolean) => Promise<void>;
  onSync: () => Promise<void>;
  isLoading?: boolean;
}

export function TradingControl({
  tradingEnabled,
  lastSync,
  binanceBalance,
  binanceAvailable,
  unrealizedPnl,
  onToggle,
  onSync,
  isLoading = false,
}: TradingControlProps) {
  const [toggling, setToggling] = useState(false);
  const [syncing, setSyncing] = useState(false);

  const handleToggle = async () => {
    setToggling(true);
    try {
      await onToggle(!tradingEnabled);
    } finally {
      setToggling(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      await onSync();
    } finally {
      setSyncing(false);
    }
  };

  const formatTime = (isoString: string | null) => {
    if (!isoString) return '未同步';
    try {
      return new Date(isoString).toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return '未知';
    }
  };

  return (
    <div
      className={`rounded-xl border p-6 transition-all ${
        tradingEnabled
          ? 'bg-gradient-to-br from-green-900/30 to-green-900/10 border-green-700/50'
          : 'bg-slate-900 border-slate-800'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          {tradingEnabled ? (
            <Zap className="w-6 h-6 text-green-400" />
          ) : (
            <ZapOff className="w-6 h-6 text-slate-500" />
          )}
          <div>
            <h3 className="text-lg font-semibold text-white">交易控制</h3>
            <p className="text-sm text-slate-400">
              {tradingEnabled ? '机器人可以执行交易' : '机器人仅分析不交易'}
            </p>
          </div>
        </div>
        <button
          onClick={handleSync}
          disabled={syncing || isLoading}
          className="p-2 hover:bg-slate-700 rounded-lg transition-colors disabled:opacity-50"
          title="同步币安数据"
        >
          <RefreshCw
            className={`w-5 h-5 text-slate-400 ${syncing ? 'animate-spin' : ''}`}
          />
        </button>
      </div>

      {/* Main Toggle */}
      <div className="flex items-center justify-between p-4 bg-slate-800/50 rounded-lg mb-4">
        <div className="flex items-center gap-3">
          <Power
            className={`w-5 h-5 ${
              tradingEnabled ? 'text-green-400' : 'text-slate-500'
            }`}
          />
          <span className="text-white font-medium">自动交易</span>
        </div>
        <button
          onClick={handleToggle}
          disabled={toggling || isLoading}
          className={`relative w-14 h-7 rounded-full transition-colors disabled:opacity-50 ${
            tradingEnabled ? 'bg-green-600' : 'bg-slate-600'
          }`}
        >
          <span
            className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform shadow-md ${
              tradingEnabled ? 'left-8' : 'left-1'
            }`}
          />
        </button>
      </div>

      {/* Balance Info */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-800/50 rounded-lg p-3">
          <p className="text-slate-400 text-xs mb-1">总余额</p>
          <p className="text-lg font-semibold text-white">
            ${binanceBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3">
          <p className="text-slate-400 text-xs mb-1">可用</p>
          <p className="text-lg font-semibold text-green-400">
            ${binanceAvailable.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
        <div className="bg-slate-800/50 rounded-lg p-3">
          <p className="text-slate-400 text-xs mb-1">未实现盈亏</p>
          <p
            className={`text-lg font-semibold ${
              unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'
            }`}
          >
            {unrealizedPnl >= 0 ? '+' : ''}
            ${unrealizedPnl.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Last Sync */}
      <div className="mt-4 text-center">
        <p className="text-slate-500 text-xs">
          最后同步: {formatTime(lastSync)}
        </p>
      </div>
    </div>
  );
}
