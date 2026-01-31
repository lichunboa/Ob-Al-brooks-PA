'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Candle, TimeFrame } from '@/types';

// 内存缓存（可考虑升级至 localStorage/IndexedDB）
interface CacheEntry {
  candles: Candle[];
  lastFetch: number;
  symbol: string;
  timeframe: TimeFrame;
}

const chartCache = new Map<string, CacheEntry>();

// 获取缓存键
const getCacheKey = (symbol: string, timeframe: TimeFrame) => `${symbol}-${timeframe}`;

// 计算智能刷新间隔（根据周期调整）
const getRefreshInterval = (timeframe: TimeFrame): number => {
  switch (timeframe) {
    case '1m': return 5000;    // 5秒
    case '5m': return 10000;   // 10秒
    case '15m': return 15000;  // 15秒
    case '30m': return 20000;  // 20秒
    case '1h': return 30000;   // 30秒
    case '4h': return 60000;   // 1分钟
    case '1d': return 300000;  // 5分钟
    default: return 30000;
  }
};

// 计算数据新鲜度阈值（超过此时间认为需要更新）
const getFreshnessThreshold = (timeframe: TimeFrame): number => {
  const tfMinutes: Record<TimeFrame, number> = {
    '1m': 1, '5m': 5, '15m': 15, '30m': 30,
    '1h': 60, '4h': 240, '1d': 1440, '1w': 10080, '1M': 43200
  };
  const minutes = tfMinutes[timeframe] || 5;
  
  // 阈值 = 2个K线周期，但至少5秒
  return Math.max(5000, minutes * 2 * 60 * 1000);
};

// 后端原始数据格式
interface RawCandle {
  open_time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  close_time: number;
}

interface UseChartDataOptions {
  symbol: string;
  timeframe: TimeFrame;
  apiUrl: string;
  autoRefresh?: boolean;
  limit?: number; // K线数量限制
}

interface UseChartDataResult {
  candles: Candle[];
  isLoading: boolean;
  isFromCache: boolean;
  error: string | null;
  lastUpdate: Date | null;
  refresh: (force?: boolean) => Promise<void>;
}

export function useChartData(options: UseChartDataOptions): UseChartDataResult {
  const { symbol, timeframe, apiUrl, autoRefresh = true, limit: userLimit } = options;

  const [candles, setCandles] = useState<Candle[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFromCache, setIsFromCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const lastFetchRef = useRef<number>(0);

  // 转换后端数据
  const convertBackendData = useCallback((raw: RawCandle[]): Candle[] => {
    return raw
      .filter(c => 
        c.open !== null && c.open !== undefined &&
        c.high !== null && c.high !== undefined &&
        c.low !== null && c.low !== undefined &&
        c.close !== null && c.close !== undefined
      )
      .map(c => ({
        time: Math.floor(c.open_time / 1000), // 转换为秒
        open: Number(c.open) || 0,
        high: Math.max(Number(c.high) || 0, Number(c.open) || 0, Number(c.close) || 0),
        low: Math.min(Number(c.low) || 0, Number(c.open) || 0, Number(c.close) || 0),
        close: Number(c.close) || 0,
        volume: Number(c.volume) || 0,
      }));
  }, []);

  // 计算需要获取的数据范围
  const getFetchRange = useCallback((): { 
    needFullFetch: boolean; 
    limit: number; 
    since?: number;
  } => {
    const cacheKey = getCacheKey(symbol, timeframe);
    const cached = chartCache.get(cacheKey);
    const now = Date.now();
    const threshold = getFreshnessThreshold(timeframe);
    const limit = userLimit || 100;

    if (!cached || cached.candles.length === 0) {
      return { needFullFetch: true, limit };
    }

    // 检查缓存是否还新鲜
    if (now - cached.lastFetch < threshold) {
      return { needFullFetch: false, limit: 0 }; // 数据新鲜，不需要更新
    }

    // 计算需要增量拉取的起点
    const lastCandle = cached.candles[cached.candles.length - 1];
    const since = lastCandle.time * 1000; // 转换为毫秒

    return { needFullFetch: false, limit: Math.min(50, limit), since };
  }, [symbol, timeframe, userLimit]);

  // 主数据获取函数
  const fetchData = useCallback(async (force = false) => {
    if (!isMountedRef.current) return;

    // 防抖：非强制模式下，2秒内不重复请求
    const now = Date.now();
    if (!force && now - lastFetchRef.current < 2000) return;
    lastFetchRef.current = now;

    const cacheKey = getCacheKey(symbol, timeframe);
    const cached = chartCache.get(cacheKey);

    // 1. 先尝试从缓存加载（立即显示）
    if (!force && cached && cached.candles.length > 0) {
      setCandles(cached.candles);
      setIsFromCache(true);
      setLastUpdate(new Date(cached.lastFetch));
      setIsLoading(false);
    }

    // 2. 检查是否需要从后端更新
    const range = getFetchRange();
    if (range.limit === 0 && !force) {
      // 数据还新鲜，不需要更新
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 3. 从后端拉取数据
      let url: string;
      if (range.needFullFetch || force) {
        url = `${apiUrl}/api/v1/candles/${symbol}?interval=${timeframe}&limit=${range.limit}`;
      } else {
        url = `${apiUrl}/api/v1/candles/${symbol}?interval=${timeframe}&limit=${range.limit}&since=${range.since}`;
      }

      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const raw: RawCandle[] = await res.json();
      const newCandles = convertBackendData(raw);

      if (newCandles.length === 0) {
        setIsLoading(false);
        return;
      }

      // 4. 更新缓存
      let mergedCandles: Candle[];
      if (!range.needFullFetch && cached && cached.candles.length > 0) {
        // 增量合并：保留旧数据，追加新数据，更新重叠部分
        const existingMap = new Map(cached.candles.map(c => [c.time, c]));
        
        for (const candle of newCandles) {
          existingMap.set(candle.time, candle);
        }
        
        const maxCandles = userLimit || 200;
        mergedCandles = Array.from(existingMap.values())
          .sort((a, b) => a.time - b.time)
          .slice(-maxCandles); // 根据用户设置保留最多 K线
      } else {
        mergedCandles = newCandles;
      }

      // 保存到缓存
      chartCache.set(cacheKey, {
        candles: mergedCandles,
        lastFetch: Date.now(),
        symbol,
        timeframe
      });

      // 5. 更新状态（只有当数据真正变化时才更新）
      if (isMountedRef.current) {
        setCandles(prev => {
          // 检查数据是否真的变化了
          if (prev.length === mergedCandles.length && 
              prev.length > 0 && 
              mergedCandles.length > 0 &&
              prev[prev.length - 1].time === mergedCandles[mergedCandles.length - 1].time &&
              prev[prev.length - 1].close === mergedCandles[mergedCandles.length - 1].close) {
            return prev; // 数据没变化，保持原状态
          }
          return mergedCandles;
        });
        setIsFromCache(false);
        setLastUpdate(new Date());
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(err instanceof Error ? err.message : String(err));
        // 如果有缓存，继续显示缓存数据
        if (cached && cached.candles.length > 0) {
          setCandles(cached.candles);
        }
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [symbol, timeframe, apiUrl, convertBackendData, getFetchRange]);

  // 初始加载和自动刷新
  useEffect(() => {
    isMountedRef.current = true;

    // 立即加载（优先从缓存）
    fetchData(false);

    // 设置自动刷新
    if (autoRefresh) {
      const interval = getRefreshInterval(timeframe);
      intervalRef.current = setInterval(() => {
        fetchData(false);
      }, interval);
    }

    return () => {
      isMountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchData, autoRefresh, timeframe]);

  // 当 symbol 或 timeframe 变化时，强制刷新
  useEffect(() => {
    fetchData(true);
  }, [symbol, timeframe]);

  return {
    candles,
    isLoading,
    isFromCache,
    error,
    lastUpdate,
    refresh: fetchData,
  };
}

// 清除指定品种的缓存
export function clearChartCache(symbol?: string, timeframe?: TimeFrame) {
  if (symbol && timeframe) {
    chartCache.delete(getCacheKey(symbol, timeframe));
  } else if (symbol) {
    Array.from(chartCache.keys()).forEach(key => {
      if (key.startsWith(symbol)) {
        chartCache.delete(key);
      }
    });
  } else {
    chartCache.clear();
  }
}
