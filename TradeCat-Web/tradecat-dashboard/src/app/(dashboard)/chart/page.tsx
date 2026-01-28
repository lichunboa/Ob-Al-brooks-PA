'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TradingViewChart } from '@/components/chart/TradingViewChart';
import { TimeFrame, Candle, ChartSignal } from '@/types';
import { RefreshCw, ChevronDown, Wifi, WifiOff } from 'lucide-react';
import { useWebSocket } from '@/hooks/useWebSocket';

// 后端策略信号响应类型
interface StrategySignalResponse {
  type: 'BUY' | 'SELL' | 'NEUTRAL';
  name: string;
  description: string;
  confidence: number;
  timestamp: number;
  metadata: Record<string, any>;
}

// 品种类型
interface SymbolInfo {
  id: string;
  name: string;
  category: string;
  exchange: string;
  note?: string;
}

// WebSocket 实时数据
interface WSMarketData {
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
}

export default function ChartPage() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [interval, setInterval] = useState<TimeFrame>('5m');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [signals, setSignals] = useState<ChartSignal[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isBackendAvailable, setIsBackendAvailable] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [symbols, setSymbols] = useState<SymbolInfo[]>([]);
  const [showSymbolDropdown, setShowSymbolDropdown] = useState(false);
  const [realtimePrice, setRealtimePrice] = useState<number | null>(null);
  const [priceChange24h, setPriceChange24h] = useState<number>(0);
  
  const candlesRef = useRef<Candle[]>([]);
  const lastFetchRef = useRef<{ symbol: string; interval: string; time: number } | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8088';
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8090';

  // WebSocket 连接
  const { isConnected, subscribe, unsubscribe } = useWebSocket({
    url: wsUrl,
    onMessage: (data) => {
      if (data.type === 'data' && data.symbol === symbol) {
        const marketData: WSMarketData = data.data;
        setRealtimePrice(marketData.price);
        setPriceChange24h(marketData.change24h);
        
        // 更新最后一根K线的收盘价
        if (candlesRef.current.length > 0) {
          const lastCandle = candlesRef.current[candlesRef.current.length - 1];
          if (Math.abs(lastCandle.close - marketData.price) / lastCandle.close > 0.0001) {
            const updated = [...candlesRef.current];
            updated[updated.length - 1] = {
              ...lastCandle,
              close: marketData.price,
              high: Math.max(lastCandle.high, marketData.price),
              low: Math.min(lastCandle.low, marketData.price)
            };
            candlesRef.current = updated;
            setCandles(updated);
          }
        }
      }
    }
  });

  // 加载品种列表
  useEffect(() => {
    fetch(`${apiUrl}/api/v1/symbols`)
      .then(res => res.json())
      .then(data => {
        setSymbols(data.symbols || []);
      })
      .catch(console.error);
  }, [apiUrl]);

  // 订阅/取消订阅品种
  useEffect(() => {
    if (isConnected) {
      unsubscribe(symbol);
      subscribe(symbol);
    }
  }, [symbol, isConnected, subscribe, unsubscribe]);

  // 获取数据的函数
  const fetchData = useCallback((force = false) => {
    const now = Date.now();
    
    // 防重复请求
    if (!force && lastFetchRef.current) {
      const { symbol: lastSymbol, interval: lastInterval, time: lastTime } = lastFetchRef.current;
      if (lastSymbol === symbol && lastInterval === interval && (now - lastTime) < 3000) {
        return;
      }
    }
    
    lastFetchRef.current = { symbol, interval, time: now };
    setIsLoading(true);
    
    const timestamp = Date.now();
    
    // 获取 K线数据
    fetch(`${apiUrl}/api/v1/candles?symbol=${symbol}&interval=${interval}&limit=100&t=${timestamp}`)
      .then(response => {
        if (response.ok) {
          return response.json();
        }
        throw new Error('Backend not available');
      })
      .then(data => {
        const candlesData: Candle[] = data.candles || [];
        
        // 智能合并数据
        if (candlesRef.current.length > 0 && candlesData.length > 0 && !force) {
          const lastExisting = candlesRef.current[candlesRef.current.length - 1];
          const lastNew = candlesData[candlesData.length - 1];
          
          if (lastExisting.time === lastNew.time) {
            const merged = [...candlesRef.current.slice(0, -1), lastNew];
            candlesRef.current = merged;
            setCandles(merged);
          } else {
            candlesRef.current = candlesData;
            setCandles(candlesData);
          }
        } else {
          candlesRef.current = candlesData;
          setCandles(candlesData);
        }
        
        setIsBackendAvailable(true);
        setLastUpdate(new Date());
        
        // 获取策略信号
        return fetch(`${apiUrl}/api/v1/signals/analyze?symbol=${symbol}&interval=${interval}&t=${timestamp}`);
      })
      .then(signalsResponse => {
        if (signalsResponse && signalsResponse.ok) {
          return signalsResponse.json();
        }
        throw new Error('Signals not available');
      })
      .then(signalsData => {
        const backendSignals: StrategySignalResponse[] = signalsData.signals || [];
        const chartSignals: ChartSignal[] = backendSignals.map((sig) => ({
          time: sig.timestamp,
          position: sig.type === 'BUY' ? 'belowBar' : 'aboveBar',
          color: sig.type === 'BUY' ? '#10B981' : '#EF4444',
          shape: sig.type === 'BUY' ? 'arrowUp' : 'arrowDown',
          text: `${sig.name} (${sig.confidence}%)`,
          size: Math.max(1, Math.min(3, sig.confidence / 30)),
        }));
        setSignals(chartSignals);
      })
      .catch(error => {
        console.log('Backend not available:', error);
        const mockCandles = generateMockCandles(symbol, interval);
        candlesRef.current = mockCandles;
        setCandles(mockCandles);
        setSignals([]);
        setIsBackendAvailable(false);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [symbol, interval, apiUrl]);

  // 初始加载和定时刷新
  useEffect(() => {
    fetchData(true);
    const intervalId = setInterval(() => fetchData(false), 30000); // 30秒刷新一次K线
    return () => clearInterval(intervalId);
  }, [fetchData]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('zh-CN', { 
      hour: '2-digit', 
      minute: '2-digit', 
      second: '2-digit' 
    });
  };

  const handleSelectSymbol = (sym: SymbolInfo) => {
    setSymbol(sym.id);
    setShowSymbolDropdown(false);
    candlesRef.current = [];
    setRealtimePrice(null);
    fetchData(true);
  };

  const currentSymbol = symbols.find(s => s.id === symbol);

  return (
    <div className="h-full flex flex-col">
      <div className="mb-4 flex items-center gap-4 flex-wrap">
        {/* 品种选择 */}
        <div className="flex items-center gap-2 relative">
          <label className="text-sm text-slate-400">品种:</label>
          <button
            onClick={() => setShowSymbolDropdown(!showSymbolDropdown)}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm hover:bg-slate-700 transition-colors min-w-[160px]"
          >
            <span>{currentSymbol?.name || symbol}</span>
            {realtimePrice && (
              <span className={`text-xs ${priceChange24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                ${realtimePrice.toLocaleString(undefined, {minimumFractionDigits: 2})}
              </span>
            )}
            <ChevronDown className="w-4 h-4 ml-auto text-slate-400" />
          </button>
          
          {showSymbolDropdown && (
            <>
              <div 
                className="fixed inset-0 z-40" 
                onClick={() => setShowSymbolDropdown(false)}
              />
              <div className="absolute top-full left-0 mt-1 w-72 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 max-h-96 overflow-auto">
                {['crypto', 'future', 'stock', 'forex'].map(category => {
                  const categorySymbols = symbols.filter(s => s.category === category);
                  if (categorySymbols.length === 0) return null;
                  
                  const categoryNames: Record<string, string> = {
                    crypto: '加密货币',
                    future: '期货',
                    stock: '股票',
                    forex: '外汇'
                  };
                  
                  return (
                    <div key={category}>
                      <div className="px-3 py-2 text-xs font-medium text-slate-500 bg-slate-800/50 sticky top-0">
                        {categoryNames[category]}
                      </div>
                      {categorySymbols.map(sym => (
                        <button
                          key={sym.id}
                          onClick={() => handleSelectSymbol(sym)}
                          className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-800 transition-colors flex items-center justify-between ${
                            sym.id === symbol ? 'bg-blue-600/20 text-blue-400' : 'text-white'
                          }`}
                        >
                          <div>
                            <div className="font-medium">{sym.name}</div>
                            <div className="text-xs text-slate-500">{sym.id} · {sym.exchange}</div>
                          </div>
                          {sym.note && (
                            <span className="text-xs text-yellow-500">{sym.note}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* WebSocket 状态 */}
        <div className="flex items-center gap-2 text-xs">
          {isConnected ? (
            <span className="flex items-center gap-1 text-green-400">
              <Wifi className="w-3 h-3" />
              实时
            </span>
          ) : (
            <span className="flex items-center gap-1 text-slate-500">
              <WifiOff className="w-3 h-3" />
              轮询
            </span>
          )}
          {signals.length > 0 && (
            <span className="text-green-400 ml-2">
              信号: {signals.length}
            </span>
          )}
        </div>

        {/* 刷新按钮 */}
        <div className="flex items-center gap-2 ml-auto">
          {lastUpdate && (
            <span className="text-xs text-slate-500">
              更新于: {formatTime(lastUpdate)}
            </span>
          )}
          <button
            onClick={() => fetchData(true)}
            disabled={isLoading}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex-1 relative">
        <TradingViewChart
          symbol={symbol}
          interval={interval}
          candles={candles}
          signals={signals}
          onTimeFrameChange={setInterval}
          className="h-full"
        />
        
        {isLoading && candles.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 z-10">
            <div className="flex items-center gap-2 text-slate-400">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              加载中...
            </div>
          </div>
        )}
      </div>

      {/* 信号面板 */}
      {signals.length > 0 && (
        <div className="mt-4 p-4 bg-slate-900 rounded-lg border border-slate-800">
          <h3 className="text-sm font-medium text-white mb-2">策略信号</h3>
          <div className="flex flex-wrap gap-2">
            {signals.map((signal, index) => (
              <div
                key={index}
                className="px-3 py-1.5 bg-slate-800 rounded text-xs"
                style={{ color: signal.color }}
              >
                {signal.text}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// 模拟数据生成器
function generateMockCandles(symbol: string, interval: string, count: number = 100): Candle[] {
  const candles: Candle[] = [];
  const basePrice = symbol.includes('BTC') ? 40000 : symbol.includes('ETH') ? 2000 : 100;
  const now = Math.floor(Date.now() / 1000);
  
  const intervalSeconds = {
    '1m': 60, '5m': 300, '15m': 900, '30m': 1800,
    '1h': 3600, '4h': 14400, '1d': 86400
  }[interval] || 300;

  const alignedNow = now - (now % intervalSeconds);
  let lastClose = basePrice;

  for (let i = count; i > 0; i--) {
    const time = alignedNow - i * intervalSeconds;
    const volatility = basePrice * 0.002;
    
    const open = lastClose;
    const change = (Math.random() - 0.5) * volatility * 2;
    const close = open + change;
    const high = Math.max(open, close) + Math.random() * volatility * 0.5;
    const low = Math.min(open, close) - Math.random() * volatility * 0.5;
    const volume = Math.random() * 100 + 50;

    candles.push({ time, open, high, low, close, volume });
    lastClose = close;
  }

  return candles;
}
