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
  isRealtime?: boolean;
}

interface UseChartDataOptions {
  backend: BackendSettings;
  symbol: string;
  interval: string;
  autoRefresh?: boolean;
  enableRealtime?: boolean;  // 启用 WebSocket 实时更新
}

// WebSocket 中继端口
const WS_RELAY_PORT = 8085;

// 计算刷新间隔
const getRefreshInterval = (interval: string): number => {
  switch (interval) {
    case "1m": return 5000;
    case "5m": return 10000;
    case "15m": return 15000;
    default: return 30000;
  }
};

export function useChartData(options: UseChartDataOptions) {
  const {
    backend,
    symbol,
    interval,
    autoRefresh = true,
    enableRealtime = true,
  } = options;

  const [data, setData] = useState<ChartData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRealtimeConnected, setIsRealtimeConnected] = useState(false);

  const intervalRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);
  const lastFetchRef = useRef<number>(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectCountRef = useRef(0);

  // 转换后端数据格式
  const convertBackendData = useCallback((raw: Record<string, unknown>[]): Candle[] => {
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
      openTime: candleData.time * 1000,
      open: candleData.open,
      high: candleData.high,
      low: candleData.low,
      close: candleData.close,
      volume: candleData.volume,
      closeTime: candleData.time * 1000 + 60000,
    };

    setData(prev => {
      if (!prev) return prev;

      const candles = [...prev.candles];
      const lastCandle = candles[candles.length - 1];

      if (lastCandle && lastCandle.openTime === newCandle.openTime) {
        candles[candles.length - 1] = newCandle;
      } else if (!lastCandle || newCandle.openTime > lastCandle.openTime) {
        candles.push(newCandle);
        if (candles.length > 200) {
          candles.shift();
        }
      }

      return {
        ...prev,
        candles,
        lastUpdate: Date.now(),
        isRealtime: true,
      };
    });
  }, []);

  // 主数据获取函数（HTTP）
  const fetchData = useCallback(async (force = false) => {
    if (!backend.enabled || !symbol || !isMountedRef.current) return;

    const now = Date.now();
    if (!force && now - lastFetchRef.current < 2000) return;
    lastFetchRef.current = now;

    setIsLoading(true);
    setError(null);

    try {
      // 1. 先尝试从缓存加载
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
        }
      }

      // 2. 从后端拉取数据
      const url = `${backend.baseUrl}/api/v1/candles/${symbol}?interval=${interval}&limit=100`;

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

      // 3. 保存到缓存
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

      // 4. 更新状态
      if (isMountedRef.current) {
        const lastCandle = candles[candles.length - 1];
        console.log(`[ChartData] 更新数据: ${symbol} ${interval}, 最新K线: ${new Date(lastCandle?.openTime).toLocaleTimeString()}, close=${lastCandle?.close}`);
        setData({
          symbol,
          interval,
          candles,
          lastUpdate: Date.now(),
          isFromCache: false,
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
  }, [backend.enabled, backend.baseUrl, backend.apiToken, symbol, interval, convertBackendData]);

  // WebSocket 连接
  useEffect(() => {
    if (!backend.enabled || !enableRealtime || !symbol || interval !== "1m") return;

    const connectWebSocket = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;

      try {
        const url = new URL(backend.baseUrl);
        const wsUrl = `ws://${url.hostname}:${WS_RELAY_PORT}`;

        console.log("[ChartData] 连接 WebSocket:", wsUrl);
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
          console.log("[ChartData] WebSocket 已连接");
          setIsRealtimeConnected(true);
          reconnectCountRef.current = 0;
          ws.send(JSON.stringify({ type: "subscribe", symbol }));
        };

        ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === "candle" && msg.symbol === symbol) {
              handleRealtimeCandle(msg.data);
            } else if (msg.type === "subscribed") {
              console.log("[ChartData] 已订阅:", msg.symbol);
            }
          } catch (e) {
            console.error("[ChartData] 解析消息失败:", e);
          }
        };

        ws.onclose = () => {
          console.log("[ChartData] WebSocket 断开");
          setIsRealtimeConnected(false);
          wsRef.current = null;

          if (isMountedRef.current && reconnectCountRef.current < 5) {
            reconnectCountRef.current++;
            const delay = Math.min(1000 * reconnectCountRef.current, 5000);
            console.log(`[ChartData] ${delay}ms 后重连...`);
            reconnectTimerRef.current = window.setTimeout(connectWebSocket, delay);
          }
        };

        ws.onerror = (err) => {
          console.error("[ChartData] WebSocket 错误:", err);
        };

      } catch (e) {
        console.error("[ChartData] 创建 WebSocket 失败:", e);
      }
    };

    connectWebSocket();

    return () => {
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setIsRealtimeConnected(false);
    };
  }, [backend.enabled, backend.baseUrl, enableRealtime, symbol, interval, handleRealtimeCandle]);

  // 初始加载
  useEffect(() => {
    isMountedRef.current = true;
    fetchData(true);

    return () => {
      isMountedRef.current = false;
    };
  }, [symbol, interval, backend.baseUrl, backend.enabled]);

  // 自动刷新
  useEffect(() => {
    if (!autoRefresh || !backend.enabled) return;

    const refreshInterval = getRefreshInterval(interval);
    console.log(`[ChartData] 设置自动刷新: ${refreshInterval}ms`);

    intervalRef.current = window.setInterval(() => {
      fetchData(false);
    }, refreshInterval);

    return () => {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [autoRefresh, backend.enabled, interval, fetchData]);

  return {
    data,
    isLoading,
    error,
    isRealtimeConnected,
    refresh: () => fetchData(true),
  };
}
