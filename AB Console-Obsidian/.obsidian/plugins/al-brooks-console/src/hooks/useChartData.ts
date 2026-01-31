import { useState, useEffect, useCallback, useRef } from "react";
import { chartDataCache, type CachedCandle } from "../services/chart-data-cache";
import type { BackendSettings } from "../settings";

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
}

export interface ChartData {
  symbol: string;
  interval: string;
  candles: Candle[];
  lastUpdate: number;
  isFromCache: boolean;
}

interface UseChartDataOptions {
  backend: BackendSettings;
  symbol: string;
  interval: string;
  autoRefresh?: boolean;
}

export function useChartData(options: UseChartDataOptions) {
  const { backend, symbol, interval, autoRefresh = true } = options;

  const [data, setData] = useState<ChartData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);
  const lastFetchRef = useRef<number>(0);

  // 转换后端数据格式
  const convertBackendData = (raw: Record<string, unknown>[]): Candle[] => {
    return raw
      .filter(c => 
        c.open !== null && c.open !== undefined &&
        c.high !== null && c.high !== undefined &&
        c.low !== null && c.low !== undefined &&
        c.close !== null && c.close !== undefined
      )
      .map(c => {
        const openTime = c.open_time || c.openTime;
        const closeTime = c.close_time || c.closeTime;
        
        const parseTime = (t: unknown): number => {
          if (typeof t === "number") return t;
          if (typeof t === "string") return new Date(t).getTime();
          return Date.now();
        };
        
        const open = Number(c.open) || 0;
        const high = Number(c.high) || 0;
        const low = Number(c.low) || 0;
        const close = Number(c.close) || 0;
        
        return {
          openTime: parseTime(openTime),
          open,
          high: Math.max(high, open, close),
          low: Math.min(low, open, close),
          close,
          volume: Number(c.volume) || 0,
          closeTime: parseTime(closeTime),
        };
      });
  };

  // 主数据获取函数
  const fetchData = useCallback(async (force = false) => {
    if (!backend.enabled || !symbol || !isMountedRef.current) return;

    // 防抖：非强制模式下，2秒内不重复请求
    const now = Date.now();
    if (!force && now - lastFetchRef.current < 2000) return;
    lastFetchRef.current = now;

    setIsLoading(true);
    setError(null);

    try {
      // 1. 先尝试从缓存加载（立即显示）
      if (!force) {
        const cached = await chartDataCache.getCandles(symbol, interval);
        if (cached.length > 0 && isMountedRef.current) {
          setData({
            symbol,
            interval,
            candles: cached.map(c => ({
              openTime: c.time * 1000,
              open: c.open,
              high: c.high,
              low: c.low,
              close: c.close,
              volume: c.volume,
              closeTime: c.time * 1000 + 60000,
            })),
            lastUpdate: Date.now(),
            isFromCache: true,
          });
          setIsLoading(false);
        }
      }

      // 2. 检查是否需要从后端更新
      const range = chartDataCache.getFetchRange(symbol, interval);
      
      if (range.limit === 0 && !force) {
        // 数据还新鲜，不需要更新
        return;
      }

      // 3. 从后端拉取数据
      let url: string;
      if (range.needFullFetch || force) {
        // 全量拉取
        url = `${backend.baseUrl}/api/v1/candles/${symbol}?interval=${interval}&limit=${range.limit}`;
      } else {
        // 增量拉取（从某个时间点之后）
        url = `${backend.baseUrl}/api/v1/candles/${symbol}?interval=${interval}&limit=${range.limit}&since=${range.since}`;
      }

      const headers: Record<string, string> = {};
      if (backend.apiToken) {
        headers["Authorization"] = `Bearer ${backend.apiToken}`;
      }

      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const raw = await res.json();
      const candles = convertBackendData(raw);

      if (candles.length === 0) {
        setIsLoading(false);
        return;
      }

      // 4. 保存到缓存
      const cachedCandles: CachedCandle[] = candles.map(c => ({
        symbol,
        interval,
        time: Math.floor(c.openTime / 1000),
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      }));
      await chartDataCache.saveCandles(symbol, interval, cachedCandles);

      // 5. 更新状态（如果组件还在挂载）
      if (isMountedRef.current) {
        setData(prev => {
          // 只有当数据真正变化时才更新
          if (prev && 
              prev.candles.length === candles.length &&
              prev.candles.length > 0 &&
              candles.length > 0 &&
              prev.candles[prev.candles.length - 1].openTime === candles[candles.length - 1].openTime) {
            return prev;
          }
          return {
            symbol,
            interval,
            candles,
            lastUpdate: Date.now(),
            isFromCache: false,
          };
        });
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
  }, [backend.enabled, backend.baseUrl, backend.apiToken, symbol, interval]);

  // 初始加载和自动刷新
  useEffect(() => {
    isMountedRef.current = true;
    
    // 立即加载（优先从缓存）
    fetchData(false);

    // 设置自动刷新
    if (autoRefresh && backend.enabled) {
      const refreshInterval = interval === "1m" ? 5000 : 
                             interval === "5m" ? 10000 : 
                             interval === "15m" ? 15000 : 30000;
      
      intervalRef.current = window.setInterval(() => {
        fetchData(false);
      }, refreshInterval);
    }

    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, [fetchData, autoRefresh, backend.enabled, interval]);

  // 当 symbol 或 interval 变化时，强制刷新
  useEffect(() => {
    fetchData(true);
  }, [symbol, interval]);

  return {
    data,
    isLoading,
    error,
    refresh: () => fetchData(true),
  };
}
