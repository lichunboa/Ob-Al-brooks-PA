import { useState, useEffect, useCallback, useRef } from "react";
import { BackendSettings } from "../settings";

export interface TradingSignal {
  id: string;
  symbol: string;
  signal_name: string;
  direction: "BUY" | "SELL" | "ALERT";
  strength: number; // 0-1
  timestamp: number;
  message: string;
  pattern?: string;
  timeframe?: string;
  metadata?: Record<string, unknown>;
}

interface UseSignalsOptions {
  backend: BackendSettings;
  autoRefresh?: boolean;
  refreshInterval?: number;
  symbol?: string; // Filter by symbol
  direction?: "BUY" | "SELL" | "ALERT";
}

export function useSignals(options: UseSignalsOptions) {
  const { backend, autoRefresh = true, refreshInterval = 30, symbol, direction } = options;

  const [signals, setSignals] = useState<TradingSignal[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastCheck, setLastCheck] = useState<number>(0);
  const intervalRef = useRef<number | null>(null);
  const lastSignalIdRef = useRef<string | null>(null);

  const fetchSignals = useCallback(async () => {
    if (!backend.enabled) return;

    setIsLoading(true);
    setError(null);

    try {
      let url = `${backend.baseUrl}/api/v1/signals?limit=50`;
      if (symbol) url += `&symbol=${symbol}`;
      if (direction) url += `&direction=${direction}`;

      const headers: Record<string, string> = {};
      if (backend.apiToken) {
        headers["Authorization"] = `Bearer ${backend.apiToken}`;
      }

      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      const newSignals: TradingSignal[] = (data.signals || []).map((s: Record<string, unknown>) => ({
        id: `${s.symbol}-${s.timestamp}-${Math.random().toString(36).slice(2, 8)}`,
        symbol: s.symbol as string,
        signal_name: s.signal_name as string,
        direction: s.direction as "BUY" | "SELL" | "ALERT",
        strength: (s.strength as number) || 0.5,
        timestamp: new Date(s.timestamp as string).getTime(),
        message: s.message as string,
        pattern: s.pattern as string | undefined,
        timeframe: s.timeframe as string | undefined,
        metadata: s.metadata as Record<string, unknown> | undefined,
      }));

      // Check for new signals
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

      setSignals(newSignals);
      setLastCheck(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [backend.enabled, backend.baseUrl, backend.apiToken, symbol, direction]);

  const markAsRead = useCallback(() => {
    setUnreadCount(0);
  }, []);

  const clearSignals = useCallback(() => {
    setSignals([]);
    setUnreadCount(0);
  }, []);

  // Auto refresh
  useEffect(() => {
    fetchSignals();

    if (autoRefresh && backend.enabled && refreshInterval > 0) {
      intervalRef.current = window.setInterval(fetchSignals, refreshInterval * 1000);
    }

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, [fetchSignals, autoRefresh, backend.enabled, refreshInterval]);

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

/**
 * Send signal to Telegram
 */
export async function sendSignalToTelegram(
  backend: BackendSettings,
  signal: Omit<TradingSignal, "id" | "timestamp">
): Promise<{ success: boolean; message: string }> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (backend.apiToken) {
      headers["Authorization"] = `Bearer ${backend.apiToken}`;
    }

    const res = await fetch(`${backend.baseUrl}/api/v1/signals/telegram`, {
      method: "POST",
      headers,
      body: JSON.stringify(signal),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { success: true, message: "Signal sent" };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Format signal for display
 */
export function formatSignalMessage(signal: TradingSignal): string {
  const directionEmoji = {
    BUY: "🟢",
    SELL: "🔴",
    ALERT: "🟡",
  }[signal.direction];

  const timeStr = new Date(signal.timestamp).toLocaleTimeString("zh-CN");

  return `${directionEmoji} ${signal.symbol} ${signal.signal_name}\n⏰ ${timeStr}\n💪 强度: ${(signal.strength * 100).toFixed(0)}%\n📝 ${signal.message}`;
}
