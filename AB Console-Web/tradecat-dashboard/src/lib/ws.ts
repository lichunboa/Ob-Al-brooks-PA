// WebSocket 客户端封装
import { io, Socket } from 'socket.io-client';
import { Candle, Signal, WSEvents } from '@/types';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8088';

class WebSocketClient {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 3000;
  private listeners: Map<string, Set<Function>> = new Map();

  // 连接状态回调
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;

  connect() {
    if (this.socket?.connected) return;

    this.socket = io(WS_URL, {
      transports: ['websocket', 'polling'],  // 允许回退到 polling
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: this.reconnectDelay,
      timeout: 10000,
    });

    this.socket.on('connect', () => {
      console.log('[WS] Connected');
      this.reconnectAttempts = 0;
      this.onConnect?.();
    });

    this.socket.on('disconnect', (reason) => {
      console.log('[WS] Disconnected:', reason);
      this.onDisconnect?.();
    });

    this.socket.on('connect_error', (error) => {
      console.error('[WS] Connection error:', error);
      this.reconnectAttempts++;
      this.onError?.(error);
    });

    // 监听数据事件
    this.socket.on('candle:update', (data: WSEvents['candle:update']) => {
      this.emit('candle:update', data);
    });

    this.socket.on('signal:new', (data: Signal) => {
      this.emit('signal:new', data);
    });

    this.socket.on('pong', (data: WSEvents['pong']) => {
      this.emit('pong', data);
    });

    this.socket.on('error', (data: WSEvents['error']) => {
      console.error('[WS] Server error:', data);
      this.emit('error', data);
    });

    // 启动心跳
    this.startHeartbeat();
  }

  disconnect() {
    this.socket?.disconnect();
    this.socket = null;
  }

  // 订阅 K 线数据
  subscribeCandles(symbol: string, interval: string) {
    this.socket?.emit('sub:candles', { symbol, interval });
  }

  // 取消订阅 K 线数据
  unsubscribeCandles(symbol: string, interval: string) {
    this.socket?.emit('unsub:candles', { symbol, interval });
  }

  // 订阅信号
  subscribeSignals(symbols?: string[]) {
    this.socket?.emit('sub:signals', { symbols });
  }

  // 取消订阅信号
  unsubscribeSignals() {
    this.socket?.emit('unsub:signals', {});
  }

  // 发送心跳
  ping() {
    this.socket?.emit('ping', { timestamp: Date.now() });
  }

  // 事件监听
  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  off(event: string, callback: Function) {
    this.listeners.get(event)?.delete(callback);
  }

  private emit(event: string, data: any) {
    this.listeners.get(event)?.forEach(callback => callback(data));
  }

  // 心跳保活
  private heartbeatInterval: NodeJS.Timeout | null = null;

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.socket?.connected) {
        this.ping();
      }
    }, 30000); // 30 秒一次
  }

  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  // 获取连接状态
  get isConnected() {
    return this.socket?.connected ?? false;
  }
}

// 单例导出
export const wsClient = new WebSocketClient();

// React Hook 封装
import { useEffect, useRef, useState, useCallback } from 'react';

export function useWebSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [latency, setLatency] = useState<number | null>(null);

  useEffect(() => {
    wsClient.onConnect = () => setIsConnected(true);
    wsClient.onDisconnect = () => setIsConnected(false);
    
    wsClient.on('pong', (data: WSEvents['pong']) => {
      setLatency(Date.now() - data.timestamp);
    });

    wsClient.connect();

    return () => {
      // 注意：这里不 disconnect，因为是单例
    };
  }, []);

  return { isConnected, latency, wsClient };
}

export function useCandles(symbol: string, interval: string) {
  const [candles, setCandles] = useState<Candle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const candlesRef = useRef<Candle[]>([]);

  useEffect(() => {
    if (!symbol || !interval) return;

    setIsLoading(true);
    
    // 订阅实时数据
    const handleCandleUpdate = (data: WSEvents['candle:update']) => {
      if (data.symbol === symbol && data.interval === interval) {
        const newCandle = data.candle;
        
        setCandles(prev => {
          const exists = prev.find(c => c.time === newCandle.time);
          if (exists) {
            // 更新现有蜡烛
            return prev.map(c => c.time === newCandle.time ? newCandle : c);
          } else {
            // 添加新蜡烛并排序
            const updated = [...prev, newCandle].sort((a, b) => a.time - b.time);
            // 限制数量
            return updated.slice(-500);
          }
        });
      }
    };

    wsClient.on('candle:update', handleCandleUpdate);
    wsClient.subscribeCandles(symbol, interval);

    // 初始加载历史数据（通过 HTTP）
    fetchHistoricalData(symbol, interval).then(data => {
      setCandles(data);
      candlesRef.current = data;
      setIsLoading(false);
    });

    return () => {
      wsClient.off('candle:update', handleCandleUpdate);
      wsClient.unsubscribeCandles(symbol, interval);
    };
  }, [symbol, interval]);

  return { candles, isLoading };
}

// HTTP 获取历史数据（初始加载）
async function fetchHistoricalData(symbol: string, interval: string): Promise<Candle[]> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080';
  
  try {
    const response = await fetch(
      `${apiUrl}/api/v1/candles?symbol=${symbol}&interval=${interval}&limit=500`
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    return data.candles || [];
  } catch (error) {
    console.error('Failed to fetch historical data:', error);
    return [];
  }
}

export function useSignals(symbols?: string[]) {
  const [signals, setSignals] = useState<Signal[]>([]);

  useEffect(() => {
    const handleNewSignal = (data: Signal) => {
      setSignals(prev => [data, ...prev].slice(0, 100)); // 保留最近 100 条
    };

    wsClient.on('signal:new', handleNewSignal);
    wsClient.subscribeSignals(symbols);

    return () => {
      wsClient.off('signal:new', handleNewSignal);
      wsClient.unsubscribeSignals();
    };
  }, [symbols?.join(',')]);

  return { signals };
}
