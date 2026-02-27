'use client';

import { type ReactNode } from 'react';
import { ExecutionProvider, useExecutionContext } from '@/contexts/ExecutionContext';
import { Wallet, RefreshCw } from 'lucide-react';

function ExecutionHeader() {
  const { isConnected, isLoading, error, health, refresh } = useExecutionContext();

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Wallet className="w-8 h-8" />
            交易执行
          </h1>
          <p className="text-slate-400 mt-1">币安 Demo Trading · V3.0</p>
        </div>
        <div className="flex items-center gap-2 ml-2">
          <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className={`text-sm ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
            {isConnected
              ? health?.mode === 'demo' ? 'Demo' : health?.mode === 'testnet' ? '测试网' : '主网'
              : '未连接'}
          </span>
          {health?.version && <span className="text-slate-500 text-xs">v{health.version}</span>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {error && <span className="text-red-400 text-sm max-w-xs truncate">{error}</span>}
        <button
          onClick={() => refresh()}
          disabled={isLoading}
          className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>
    </div>
  );
}

export default function ExecutionLayout({ children }: { children: ReactNode }) {
  return (
    <ExecutionProvider>
      <div className="max-w-7xl mx-auto space-y-6">
        <ExecutionHeader />
        {children}
      </div>
    </ExecutionProvider>
  );
}
