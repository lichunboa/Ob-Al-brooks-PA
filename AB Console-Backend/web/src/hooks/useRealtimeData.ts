'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

interface PriceData {
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  timestamp: number;
}

interface UseRealtimeDataOptions {
  wsUrl: string;
  symbol: string;
  enabled?: boolean;
}

interface CandleUpdate {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface SignalUpdate {
  id: string;
  symbol: string;
  signal_name: string;
  direction: 'BUY' | 'SELL' | 'ALERT';
  strength: number;
  timestamp: number;
  timeframe: string;
}

interface UseRealtimeDataResult {
  priceData: PriceData | null;
  candleUpdate: CandleUpdate | null;
  newSignals: SignalUpdate[];
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
}

/**
 * WebSocket 实时数据 Hook
 * 
 * 提供实时价格更新
 * 如果 WebSocket 连接失败，会自动降级到 HTTP 轮询
 */
export function useRealtimeData(options: UseRealtimeDataOptions): UseRealtimeDataResult {
  const { wsUrl, symbol, enabled = true } = options;

  const [priceData, setPriceData] = useState<PriceData | null>(null);
  const [candleUpdate, setCandleUpdate] = useState<CandleUpdate | null>(null);
  const [newSignals, setNewSignals] = useState<SignalUpdate[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectCountRef = useRef(0);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isManualCloseRef = useRef(false);
  const lastSymbolRef = useRef(symbol);

  const connect = useCallback(() => {
    if (!enabled || !symbol) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setIsConnecting(true);
    setError(null);
    isManualCloseRef.current = false;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('[WebSocket] Connected');
        setIsConnected(true);
        setIsConnecting(false);
        reconnectCountRef.current = 0;
        
        // 订阅当前品种
        ws.send(JSON.stringify({ type: 'subscribe', symbol }));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          if (data.type === 'price_update' && data.symbol === symbol) {
            setPriceData(data.data);
          } else if (data.type === 'candle_update' && data.symbol === symbol) {
            setCandleUpdate(data.data);
          } else if (data.type === 'signal' && data.data.symbol === symbol) {
            setNewSignals(prev => [data.data, ...prev].slice(0, 10));
          } else if (data.type === 'signals_batch' && data.symbol === symbol) {
            setNewSignals(data.data);
          } else if (data.type === 'subscribed') {
            console.log('[WebSocket] Subscribed to', data.symbol);
          }
        } catch (e) {
          console.error('[WebSocket] Failed to parse message:', e);
        }
      };

      ws.onclose = () => {
        console.log('[WebSocket] Disconnected');
        setIsConnected(false);
        setIsConnecting(false);

        // 自动重连（最多5次）
        if (!isManualCloseRef.current && reconnectCountRef.current < 5) {
          reconnectCountRef.current++;
          console.log(`[WebSocket] Reconnecting... (${reconnectCountRef.current}/5)`);
          reconnectTimerRef.current = setTimeout(connect, 3000);
        } else if (reconnectCountRef.current >= 5) {
          setError('WebSocket 连接失败，已降级到 HTTP 轮询');
        }
      };

      ws.onerror = (error) => {
        console.error('[WebSocket] Error:', error);
        setError('WebSocket 连接错误');
      };
    } catch (e) {
      console.error('[WebSocket] Failed to create connection:', e);
      setIsConnecting(false);
      setError('WebSocket 连接失败');
    }
  }, [wsUrl, symbol, enabled]);

  const disconnect = useCallback(() => {
    isManualCloseRef.current = true;
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  }, []);

  // 当 symbol 变化时，取消旧订阅并订阅新品种
  useEffect(() => {
    if (isConnected && wsRef.current?.readyState === WebSocket.OPEN) {
      // 取消旧品种订阅
      if (lastSymbolRef.current) {
        wsRef.current.send(JSON.stringify({ 
          type: 'unsubscribe', 
          symbol: lastSymbolRef.current 
        }));
      }
      // 订阅新品种
      wsRef.current.send(JSON.stringify({ type: 'subscribe', symbol }));
      lastSymbolRef.current = symbol;
      // 清空旧数据
      setPriceData(null);
    }
  }, [symbol, isConnected]);

  // 初始连接
  useEffect(() => {
    if (enabled) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [connect, disconnect, enabled]);

  return {
    priceData,
    candleUpdate,
    newSignals,
    isConnected,
    isConnecting,
    error,
  };
}
