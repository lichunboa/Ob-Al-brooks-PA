import { useState, useEffect, useCallback, useRef } from "react";
import { BackendSettings } from "../settings";

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export interface MarketData {
  symbol: string;
  interval: string;
  candles: Candle[];
  lastUpdate: number;
}

interface UseMarketDataOptions {
  backend: BackendSettings;
  symbol: string;
  interval: string;
  limit?: number;
  autoRefresh?: boolean;
}

export function useMarketData(options: UseMarketDataOptions) {
  const { backend, symbol, interval, limit = 100, autoRefresh = true } = options;

  const [data, setData] = useState<MarketData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);
  const lastFetchRef = useRef<number>(0);

  const fetchData = useCallback(async (force = false) => {
    if (!backend.enabled || !symbol) return;

    // 防抖：如果不是强制刷新，且距离上次请求不到 5 秒，则跳过
    const now = Date.now();
    if (!force && now - lastFetchRef.current < 5000) return;
    lastFetchRef.current = now;

    setIsLoading(true);
    setError(null);

    try {
      const url = `${backend.baseUrl}/api/v1/candles/${symbol}?interval=${interval}&limit=${limit}`;
      const headers: Record<string, string> = {};
      if (backend.apiToken) {
        headers["Authorization"] = `Bearer ${backend.apiToken}`;
      }

      const res = await fetch(url, { headers });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const raw = await res.json();
      const candles: Candle[] = raw
        .filter((c: Record<string, unknown>) => 
          c.open !== null && c.open !== undefined &&
          c.high !== null && c.high !== undefined &&
          c.low !== null && c.low !== undefined &&
          c.close !== null && c.close !== undefined
        )
        .map((c: Record<string, unknown>) => {
          // Handle different field naming conventions from backend
          const openTime = c.open_time || c.openTime;
          const closeTime = c.close_time || c.closeTime;
          
          // Parse ISO date strings if needed
          const parseTime = (t: unknown): number => {
            if (typeof t === "number") return t;
            if (typeof t === "string") return new Date(t).getTime();
            return Date.now();
          };
          
          const open = Number(c.open) || 0;
          const high = Number(c.high) || 0;
          const low = Number(c.low) || 0;
          const close = Number(c.close) || 0;
          
          // Ensure high >= max(open, close) and low <= min(open, close)
          const validHigh = Math.max(high, open, close);
          const validLow = Math.min(low, open, close);
          
          return {
            openTime: parseTime(openTime),
            open,
            high: validHigh,
            low: validLow,
            close,
            volume: Number(c.volume) || 0,
            closeTime: parseTime(closeTime),
          };
        });

      // 只在新数据与旧数据不同时才更新状态
      const newData = {
        symbol,
        interval,
        candles,
        lastUpdate: Date.now(),
      };
      
      setData(prev => {
        // 比较蜡烛数量和时间戳
        if (prev && 
            prev.candles.length === newData.candles.length &&
            prev.candles.length > 0 &&
            newData.candles.length > 0 &&
            prev.candles[prev.candles.length - 1].openTime === newData.candles[newData.candles.length - 1].openTime) {
          return prev; // 数据相同，不更新
        }
        return newData;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  }, [backend.enabled, backend.baseUrl, backend.apiToken, symbol, interval, limit]);

  // Initial fetch and auto-refresh
  useEffect(() => {
    fetchData(true); // 首次强制加载

    // 根据周期动态调整刷新频率
    // 1m: 10秒, 5m: 15秒, 其他: 30秒
    const refreshInterval = interval === "1m" ? 10 : 
                           interval === "5m" ? 15 : 30;
    
    if (autoRefresh && backend.enabled) {
      intervalRef.current = window.setInterval(
        () => fetchData(false),
        refreshInterval * 1000
      );
    }

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, [fetchData, autoRefresh, backend.enabled, interval]); // 添加 interval 到依赖

  return {
    data,
    isLoading,
    error,
    refresh: fetchData,
  };
}

// Calculate price change statistics
export function usePriceStats(candles: Candle[] | undefined) {
  if (!candles || candles.length === 0) {
    return {
      change: 0,
      changePercent: 0,
      high24h: 0,
      low24h: 0,
      volume24h: 0,
      volatility: 0,
    };
  }

  const latest = candles[candles.length - 1];
  const first = candles[0];
  const change = latest.close - first.open;
  const changePercent = (change / first.open) * 100;

  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const volumes = candles.map((c) => c.volume);

  const high24h = Math.max(...highs);
  const low24h = Math.min(...lows);
  const volume24h = volumes.reduce((a, b) => a + b, 0);

  // Calculate volatility (standard deviation of returns)
  const returns = candles.slice(1).map((c, i) => {
    const prev = candles[i];
    return (c.close - prev.close) / prev.close;
  });
  const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
  const volatility = Math.sqrt(variance) * 100;

  return {
    change,
    changePercent,
    high24h,
    low24h,
    volume24h,
    volatility,
  };
}
