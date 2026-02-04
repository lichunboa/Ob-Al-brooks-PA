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

// WebSocket 中继端口
const WS_RELAY_PORT = 8085;

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
  enableRealtime?: boolean;  // 启用 WebSocket 实时更新
  limit?: number; // K线数量限制
}

interface UseChartDataResult {
  candles: Candle[];
  isLoading: boolean;
  isFromCache: boolean;
  isRealtimeConnected: boolean;
  error: string | null;
  lastUpdate: Date | null;
  refresh: (force?: boolean) => Promise<void>;
}

export function useChartData(options: UseChartDataOptions): UseChartDataResult {
  const { symbol, timeframe, apiUrl, autoRefresh = true, enableRealtime = true, limit: userLimit } = options;

  const [candles, setCandles] = useState<Candle[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFromCache, setIsFromCache] = useState(false);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const isMountedRef = useRef(true);
  const lastFetchRef = useRef<number>(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectCountRef = useRef(0);

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

  // 处理实时 K 线更新
  const handleRealtimeCandle = useCallback((candleData: {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }) => {
    if (!isMountedRef.current) return;

    const newCandle: Candle = {
      time: candleData.time,
      open: candleData.open,
      high: candleData.high,
      low: candleData.low,
      close: candleData.close,
      volume: candleData.volume,
    };

    setCandles(prev => {
      if (prev.length === 0) return prev;

      const candles = [...prev];
      const lastCandle = candles[candles.length - 1];

      // 如果是同一根 K 线，更新它
      if (lastCandle && lastCandle.time === newCandle.time) {
        candles[candles.length - 1] = newCandle;
      } else if (!lastCandle || newCandle.time > lastCandle.time) {
        // 新的 K 线，追加
        candles.push(newCandle);
        // 保持最多 200 根
        if (candles.length > 200) {
          candles.shift();
        }
      }

      return candles;
    });

    setLastUpdate(new Date());
  }, []);

  // 主数据获取函数
  const fetchData = useCallback(async (force = false) => {
    if (!isMountedRef.current) return;

    // 防抖：非强制模式下，2秒内不重复请求
    const now = Date.now();
    if (!force && now - lastFetchRef.current < 2000) return;
    lastFetchRef.current = now;

    const cacheKey = getCacheKey(symbol, timeframe);
    const cached = chartCache.get(cacheKey);
    const limit = userLimit || 100;

    // 1. 先尝试从缓存加载（立即显示）
    if (!force && cached && cached.candles.length > 0) {
      setCandles(cached.candles);
      setIsFromCache(true);
      setLastUpdate(new Date(cached.lastFetch));
    }

    setIsLoading(true);
    setError(null);

    try {
      // 2. 从后端拉取数据
      const url = `${apiUrl}/api/v1/candles/${symbol}?interval=${timeframe}&limit=${limit}`;

      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const raw: RawCandle[] = await res.json();
      const newCandles = convertBackendData(raw);

      if (newCandles.length === 0) {
        setIsLoading(false);
        return;
      }

      // 3. 保存到缓存
      chartCache.set(cacheKey, {
        candles: newCandles,
        lastFetch: Date.now(),
        symbol,
        timeframe
      });

      // 4. 更新状态
      if (isMountedRef.current) {
        setCandles(newCandles);
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
  }, [symbol, timeframe, apiUrl, userLimit, convertBackendData]);

  // WebSocket 连接（使用 ref 避免依赖问题）
  useEffect(() => {
    if (!enableRealtime || !symbol || timeframe !== '1m') return;

    const connectWebSocket = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;

      try {
        const url = new URL(apiUrl);
        const wsUrl = `ws://${url.hostname}:${WS_RELAY_PORT}`;

        console.log('[ChartData] 连接 WebSocket:', wsUrl);
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('[ChartData] WebSocket 已连接');
          setIsRealtimeConnected(true);
          reconnectCountRef.current = 0;
          ws.send(JSON.stringify({ type: 'subscribe', symbol }));
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'candle' && msg.symbol === symbol) {
              handleRealtimeCandle(msg.data);
            } else if (msg.type === 'subscribed') {
              console.log('[ChartData] 已订阅:', msg.symbol);
            }
          } catch (e) {
            console.error('[ChartData] 解析消息失败:', e);
          }
        };

        ws.onclose = () => {
          console.log('[ChartData] WebSocket 断开');
          setIsRealtimeConnected(false);
          wsRef.current = null;

          // 自动重连（最多 5 次）
          if (isMountedRef.current && reconnectCountRef.current < 5) {
            reconnectCountRef.current++;
            const delay = Math.min(1000 * reconnectCountRef.current, 5000);
            console.log(`[ChartData] ${delay}ms 后重连...`);
            reconnectTimerRef.current = setTimeout(connectWebSocket, delay);
          }
        };

        ws.onerror = (err) => {
          console.error('[ChartData] WebSocket 错误:', err);
        };

      } catch (e) {
        console.error('[ChartData] 创建 WebSocket 失败:', e);
      }
    };

    connectWebSocket();

    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsRealtimeConnected(false);
    };
  }, [apiUrl, enableRealtime, symbol, timeframe, handleRealtimeCandle]);

  // 初始加载
  useEffect(() => {
    isMountedRef.current = true;
    fetchData(true);

    return () => {
      isMountedRef.current = false;
    };
  }, [symbol, timeframe, apiUrl]);

  // 自动刷新（独立的 effect）
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = getRefreshInterval(timeframe);
    console.log(`[ChartData] 设置自动刷新: ${interval}ms`);

    intervalRef.current = setInterval(() => {
      fetchData(false);
    }, interval);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefresh, timeframe, fetchData]);

  return {
    candles,
    isLoading,
    isFromCache,
    isRealtimeConnected,
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
