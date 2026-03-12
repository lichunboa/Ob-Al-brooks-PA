'use client';

import { useState, type ReactNode } from 'react';
import { ExecutionProvider, useExecutionContext } from '@/contexts/ExecutionContext';
import { Wallet, RefreshCw, ArrowLeftRight } from 'lucide-react';
import { switchExchange } from '@/lib/executionApi';

const EXCHANGE_OPTIONS = [
  { value: 'binance', label: 'Binance Demo' },
  { value: 'ctrader', label: 'cTrader Demo' },
  { value: 'okx', label: 'OKX Demo' },
] as const;

function ExecutionHeader() {
  const { isConnected, isLoading, error, health, refresh } = useExecutionContext();
  const [switching, setSwitching] = useState(false);

  const currentExchange = health?.exchange || 'binance';
  const exchangeLabel =
    currentExchange === 'okx' ? 'OKX' : currentExchange === 'ctrader' ? 'cTrader' : 'Binance';
  const modeLabel = health?.mode === 'demo' ? 'Demo' : health?.mode === 'testnet' ? '测试网' : '主网';

  const handleSwitch = async (target: 'okx' | 'binance' | 'ctrader') => {
    if (target === currentExchange) return;
    const option = EXCHANGE_OPTIONS.find((item) => item.value === target);
    if (!confirm(`切换到 ${option?.label || target}？需要重启服务。`)) return;
    setSwitching(true);
    try {
      await switchExchange(target, 'demo');
      alert(`已保存。请重启 execution-service 生效。`);
    } catch (e) {
      alert(`切换失败: ${e}`);
    } finally {
      setSwitching(false);
    }
  };

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Wallet className="w-8 h-8" />
            交易执行
          </h1>
          <p className="text-slate-400 mt-1">{exchangeLabel} {modeLabel} · V4.1</p>
        </div>
        <div className="flex items-center gap-2 ml-2">
          <div className={`w-2.5 h-2.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className={`text-sm font-medium ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
            {isConnected ? `${exchangeLabel} ${modeLabel}` : '未连接'}
          </span>
          {health?.version && <span className="text-slate-500 text-xs">v{health.version}</span>}
        </div>
      </div>
      <div className="flex items-center gap-3">
        {isConnected ? (
          <div className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/70 p-1">
            <ArrowLeftRight className="ml-2 h-3.5 w-3.5 text-slate-500" />
            {EXCHANGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => handleSwitch(option.value)}
                disabled={switching || option.value === currentExchange}
                className={`rounded-md px-3 py-1.5 text-xs transition-colors disabled:cursor-default ${
                  option.value === currentExchange
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        ) : null}
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
