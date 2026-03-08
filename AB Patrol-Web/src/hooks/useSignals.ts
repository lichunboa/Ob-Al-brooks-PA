'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export interface TradingSignal {
  id: string;
  symbol: string;
  signal_name: string;
  direction: 'BUY' | 'SELL' | 'ALERT';
  strength: number;
  timestamp: number;
  message: string;
  pattern?: string;
  timeframe?: string;
  metadata?: Record<string, unknown>;
}

interface UseSignalsOptions {
  apiUrl: string;
  autoRefresh?: boolean;
  refreshInterval?: number; // 秒
  symbol?: string; // 过滤特定品种
  direction?: 'BUY' | 'SELL' | 'ALERT';
}

interface UseSignalsResult {
  signals: TradingSignal[];
  unreadCount: number;
  isLoading: boolean;
  error: string | null;
  lastCheck: Date | null;
  refresh: () => Promise<void>;
  markAsRead: () => void;
  clearSignals: () => void;
}

export function useSignals(options: UseSignalsOptions): UseSignalsResult {
  const { apiUrl, autoRefresh = true, refreshInterval = 10, symbol, direction } = options;

  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const lastSignalIdRef = useRef<string | null>(null);

  const fetchSignals = useCallback(async () => {
    if (!isMountedRef.current) return;

    setIsLoading(true);
    setError(null);

    try {
      let url = `${apiUrl}/api/v1/signals?limit=50`;
      if (symbol) url += `&symbol=${symbol}`;
      if (direction) url += `&direction=${direction}`;

      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const newSignals: TradingSignal[] = (data.signals || []).map((s: Record<string, unknown>) => ({
        id: `${s.symbol}-${s.timestamp}-${Math.random().toString(36).slice(2, 8)}`,
        symbol: s.symbol as string,
        signal_name: s.signal_name as string,
        direction: s.direction as 'BUY' | 'SELL' | 'ALERT',
        strength: (s.strength as number) || 0.5,
        timestamp: new Date(s.timestamp as string).getTime(),
        message: s.message as string,
        pattern: s.pattern as string | undefined,
        timeframe: s.timeframe as string | undefined,
        metadata: s.metadata as Record<string, unknown> | undefined,
      }));

      // 检查是否有新信号
      if (lastSignalIdRef.current && newSignals.length > 0) {
        const lastId = lastSignalIdRef.current;
        const newCount = newSignals.findIndex((s) => s.id === lastId);
        if (newCount > 0) {
          setUnreadCount((prev) => prev + newCount);
        }
      }

      if (newSignals.length > 0) {
        lastSignalIdRef.current = newSignals[0].id;
      }

      if (isMountedRef.current) {
        setSignals(newSignals);
        setLastCheck(new Date());
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [apiUrl, symbol, direction]);

  const markAsRead = useCallback(() => {
    setUnreadCount(0);
  }, []);

  const clearSignals = useCallback(() => {
    setSignals([]);
    setUnreadCount(0);
  }, []);

  // 初始加载和自动刷新
  useEffect(() => {
    isMountedRef.current = true;

    fetchSignals();

    if (autoRefresh && refreshInterval > 0) {
      intervalRef.current = setInterval(fetchSignals, refreshInterval * 1000);
    }

    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchSignals, autoRefresh, refreshInterval]);

  return {
    signals,
    unreadCount,
    isLoading,
    error,
    lastCheck,
    refresh: fetchSignals,
    markAsRead,
    clearSignals,
  };
}

// 格式化信号为显示文本
export function formatSignalMessage(signal: TradingSignal): string {
  const directionEmoji = {
    BUY: '🟢',
    SELL: '🔴',
    ALERT: '🟡',
  }[signal.direction];

  const timeStr = new Date(signal.timestamp).toLocaleTimeString('zh-CN');

  return `${directionEmoji} ${signal.symbol} ${signal.signal_name}\n⏰ ${timeStr}\n💪 强度: ${(signal.strength * 100).toFixed(0)}%\n📝 ${signal.message}`;
}

// 过滤特定品种的信号
export function filterSignalsBySymbol(signals: TradingSignal[], symbol: string): TradingSignal[] {
  return signals.filter(s => {
    const symbolMatch = s.symbol.includes(symbol) ||
      symbol.includes(s.symbol.replace('=X', '').replace('=F', ''));
    return symbolMatch;
  });
}
