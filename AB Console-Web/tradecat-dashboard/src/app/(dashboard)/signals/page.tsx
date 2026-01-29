'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Bell, Check, Trash2, Filter, ArrowUp, ArrowDown, RefreshCw } from 'lucide-react';

// 信号类型
interface TradingSignal {
  id: string;
  symbol: string;
  direction: 'BUY' | 'SELL' | 'NEUTRAL';
  signalName: string;
  price: number;
  timestamp: number;
  confidence: number;
  timeframe: string;
  read?: boolean;
}

export default function SignalsPage() {
  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [filter, setFilter] = useState<'all' | 'buy' | 'sell' | 'unread'>('all');
  const [soundEnabled, setSoundEnabled] = useState(false);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8088';

  // 获取信号
  const fetchSignals = useCallback(async () => {
    setIsLoading(true);
    try {
      const timestamp = Date.now();
      const res = await fetch(
        `${apiUrl}/api/v1/signals/analyze?symbol=BTCUSDT&interval=5m&t=${timestamp}`
      );
      
      if (res.ok) {
        const data = await res.json();
        const newSignals: TradingSignal[] = (data.signals || []).map((sig: any) => ({
          id: `${sig.symbol}-${sig.timestamp}`,
          symbol: sig.symbol,
          direction: sig.type,
          signalName: sig.name,
          price: sig.metadata?.previous_high || sig.metadata?.previous_low || 0,
          timestamp: sig.timestamp,
          confidence: sig.confidence,
          timeframe: sig.interval,
          read: false,
        }));

        // 合并新旧信号，避免重复
        setSignals(prev => {
          const existingIds = new Set(prev.map(s => s.id));
          const uniqueNew = newSignals.filter((s: TradingSignal) => !existingIds.has(s.id));
          
          // 如果有新信号且声音开启，播放提示音
          if (uniqueNew.length > 0 && soundEnabled) {
            playNotificationSound();
          }
          
          return [...uniqueNew, ...prev].slice(0, 50); // 保留最近50条
        });
        
        setLastUpdate(new Date());
      }
    } catch (e) {
      console.error('[Signals] Failed to fetch:', e);
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl, soundEnabled]);

  // 播放提示音
  const playNotificationSound = () => {
    try {
      const audio = new Audio('/notification.mp3');
      audio.volume = 0.3;
      audio.play().catch(() => {});
    } catch {
      // 忽略音频播放错误
    }
  };

  // 标记已读
  const markAsRead = (id: string) => {
    setSignals(prev => 
      prev.map(s => s.id === id ? { ...s, read: true } : s)
    );
  };

  // 标记全部已读
  const markAllAsRead = () => {
    setSignals(prev => prev.map(s => ({ ...s, read: true })));
  };

  // 删除信号
  const deleteSignal = (id: string) => {
    setSignals(prev => prev.filter(s => s.id !== id));
  };

  // 清空所有
  const clearAll = () => {
    if (confirm('确定要清空所有信号吗？')) {
      setSignals([]);
    }
  };

  // 初始加载和定时刷新
  useEffect(() => {
    fetchSignals();
    const interval = setInterval(fetchSignals, 10000);
    return () => clearInterval(interval);
  }, [fetchSignals]);

  // 过滤信号
  const filteredSignals = signals.filter(s => {
    if (filter === 'buy') return s.direction === 'BUY';
    if (filter === 'sell') return s.direction === 'SELL';
    if (filter === 'unread') return !s.read;
    return true;
  });

  // 未读数量
  const unreadCount = signals.filter(s => !s.read).length;

  // 格式化时间
  const formatTime = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  // 格式化日期
  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="h-full flex flex-col">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-white">信号监控</h2>
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 bg-green-600 text-white text-xs rounded-full">
              {unreadCount} 新
            </span>
          )}
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* 声音开关 */}
          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-2 transition-colors ${
              soundEnabled
                ? 'bg-green-600/20 text-green-400 border border-green-600/50'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            {soundEnabled ? '🔔' : '🔕'}
            {soundEnabled ? '声音开启' : '声音关闭'}
          </button>

          {/* 刷新按钮 */}
          <button
            onClick={fetchSignals}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-700 text-white text-sm rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            刷新
          </button>

          {/* 全部已读 */}
          {unreadCount > 0 && (
            <button
              onClick={markAllAsRead}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg transition-colors"
            >
              <Check className="w-4 h-4" />
              全部已读
            </button>
          )}

          {/* 清空 */}
          {signals.length > 0 && (
            <button
              onClick={clearAll}
              className="flex items-center gap-2 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-sm rounded-lg transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              清空
            </button>
          )}
        </div>
      </div>

      {/* 过滤器 */}
      <div className="flex items-center gap-2 mb-4">
        <Filter className="w-4 h-4 text-slate-400" />
        <div className="flex gap-2">
          {(['all', 'buy', 'sell', 'unread'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${
                filter === f
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {f === 'all' && `全部 (${signals.length})`}
              {f === 'buy' && '买入'}
              {f === 'sell' && '卖出'}
              {f === 'unread' && `未读 (${unreadCount})`}
            </button>
          ))}
        </div>
      </div>

      {/* 信号列表 */}
      <div className="flex-1 overflow-auto">
        {filteredSignals.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <Bell className="w-12 h-12 mb-4 opacity-30" />
            <p>暂无信号</p>
            <p className="text-sm mt-1">信号将自动出现在这里</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredSignals.map((signal) => (
              <div
                key={signal.id}
                className={`p-4 rounded-xl border transition-all ${
                  signal.read
                    ? 'bg-slate-900/50 border-slate-800 opacity-60'
                    : signal.direction === 'BUY'
                    ? 'bg-green-900/20 border-green-800/50'
                    : 'bg-red-900/20 border-red-800/50'
                }`}
              >
                <div className="flex items-start justify-between">
                  {/* 左侧：方向图标 */}
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        signal.direction === 'BUY'
                          ? 'bg-green-600/20 text-green-500'
                          : 'bg-red-600/20 text-red-500'
                      }`}
                    >
                      {signal.direction === 'BUY' ? (
                        <ArrowUp className="w-5 h-5" />
                      ) : (
                        <ArrowDown className="w-5 h-5" />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{signal.symbol}</span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded ${
                            signal.direction === 'BUY'
                              ? 'bg-green-600/20 text-green-400'
                              : 'bg-red-600/20 text-red-400'
                          }`}
                        >
                          {signal.direction === 'BUY' ? '买入' : '卖出'}
                        </span>
                        {!signal.read && (
                          <span className="w-2 h-2 bg-green-500 rounded-full" />
                        )}
                      </div>
                      <div className="text-sm text-slate-400 mt-0.5">
                        {signal.signalName} · 置信度 {signal.confidence}%
                      </div>
                    </div>
                  </div>

                  {/* 右侧：时间和操作 */}
                  <div className="text-right">
                    <div className="text-lg font-bold text-white font-mono">
                      ${signal.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {formatDate(signal.timestamp)} {formatTime(signal.timestamp)}
                    </div>
                  </div>
                </div>

                {/* 操作按钮 */}
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-800">
                  {!signal.read && (
                    <button
                      onClick={() => markAsRead(signal.id)}
                      className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition-colors"
                    >
                      <Check className="w-3 h-3" />
                      标记已读
                    </button>
                  )}
                  <button
                    onClick={() => deleteSignal(signal.id)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 text-xs rounded-lg transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部统计 */}
      {signals.length > 0 && (
        <div className="mt-4 pt-4 border-t border-slate-800 text-sm text-slate-500 flex items-center justify-between">
          <span>
            共 {signals.length} 条信号 · 买入 {signals.filter(s => s.direction === 'BUY').length} · 卖出 {signals.filter(s => s.direction === 'SELL').length}
          </span>
          {lastUpdate && (
            <span>更新于: {lastUpdate.toLocaleTimeString('zh-CN')}</span>
          )}
        </div>
      )}
    </div>
  );
}
