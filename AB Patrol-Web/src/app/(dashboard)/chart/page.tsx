'use client';

import React, { useState, useMemo } from 'react';
import { TradingViewChart } from '@/components/chart/TradingViewChart';
import { TimeFrame, ChartSignal } from '@/types';
import { RefreshCw, ChevronDown, Wifi, WifiOff, Database, Bell } from 'lucide-react';
import { useChartData } from '@/hooks/useChartData';
import { useSignals, TradingSignal, filterSignalsBySymbol } from '@/hooks/useSignals';
import { useStrategies, matchStrategies, calculateIndicators } from '@/hooks/useStrategies';
import { useRealtimeData } from '@/hooks/useRealtimeData';
import { config } from '@/lib/config';

// 品种类型
interface SymbolInfo {
  id: string;
  name: string;
  ticker: string;
  category: 'crypto' | 'stock' | 'forex' | 'future' | 'metal';
  exchange: string;
}

// 默认品种列表（与插件版对齐）
const DEFAULT_SYMBOLS: SymbolInfo[] = [
  { id: 'ES', name: 'E-mini S&P 500', ticker: 'ES=F', category: 'future', exchange: 'CME' },
  { id: 'NQ', name: 'E-mini Nasdaq', ticker: 'NQ=F', category: 'future', exchange: 'CME' },
  { id: 'BTC', name: 'Bitcoin', ticker: 'BTCUSDT', category: 'crypto', exchange: 'Binance' },
  { id: 'ETH', name: 'Ethereum', ticker: 'ETHUSDT', category: 'crypto', exchange: 'Binance' },
  { id: 'SOL', name: 'Solana', ticker: 'SOLUSDT', category: 'crypto', exchange: 'Binance' },
  { id: 'NVDA', name: 'NVIDIA', ticker: 'NVDA', category: 'stock', exchange: 'NASDAQ' },
  { id: 'AAPL', name: 'Apple', ticker: 'AAPL', category: 'stock', exchange: 'NASDAQ' },
  { id: 'EURUSD', name: 'EUR/USD', ticker: 'EURUSD=X', category: 'forex', exchange: 'Forex' },
  { id: 'GBPUSD', name: 'GBP/USD', ticker: 'GBPUSD=X', category: 'forex', exchange: 'Forex' },
  { id: 'USDJPY', name: 'USD/JPY', ticker: 'USDJPY=X', category: 'forex', exchange: 'Forex' },
  { id: 'XAUUSD', name: 'Gold', ticker: 'GC=F', category: 'metal', exchange: 'COMEX' },
];

const CATEGORY_CONFIG: Record<string, { emoji: string; label: string; color: string }> = {
  crypto: { emoji: '💰', label: '加密货币', color: '#F59E0B' },
  stock: { emoji: '📈', label: '股票', color: '#3B82F6' },
  forex: { emoji: '💱', label: '外汇', color: '#8B5CF6' },
  future: { emoji: '📊', label: '期货', color: '#10B981' },
  metal: { emoji: '🥇', label: '贵金属', color: '#FBBF24' },
};

const INTERVALS: { value: TimeFrame; label: string }[] = [
  { value: '1m', label: '1分' },
  { value: '5m', label: '5分' },
  { value: '15m', label: '15分' },
  { value: '30m', label: '30分' },
  { value: '1h', label: '1时' },
  { value: '4h', label: '4时' },
  { value: '1d', label: '日线' },
];

const CANDLE_LIMITS = [100, 200, 500, 1000];

// 信号卡片组件
const SignalMiniCard: React.FC<{ signal: TradingSignal }> = ({ signal }) => {
  const directionConfig = {
    BUY: { emoji: '🟢', color: '#10B981', bg: 'rgba(16, 185, 129, 0.1)' },
    SELL: { emoji: '🔴', color: '#EF4444', bg: 'rgba(239, 68, 68, 0.1)' },
    ALERT: { emoji: '🟡', color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.1)' },
  }[signal.direction];

  const timeStr = new Date(signal.timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-md text-xs cursor-pointer min-w-[140px] max-w-[200px]"
      style={{
        background: directionConfig.bg,
        border: `1px solid ${directionConfig.color}30`,
      }}
    >
      <span>{directionConfig.emoji}</span>
      <span className="font-semibold">{signal.symbol}</span>
      <span className="flex-1 truncate text-slate-400">{signal.signal_name}</span>
      <span className="text-slate-500 text-[10px]">{timeStr}</span>
    </div>
  );
};

export default function ChartPage() {
  const [selectedSymbol, setSelectedSymbol] = useState('BTC');
  const [timeframe, setTimeframe] = useState<TimeFrame>('5m');
  const [candleLimit, setCandleLimit] = useState(200); // 默认200根K线
  const [showSymbolDropdown, setShowSymbolDropdown] = useState(false);

  const apiUrl = config.apiUrl;
  const syncApiUrl = config.syncApiUrl;
  const wsUrl = `${config.wsUrl}/ws`;

  const currentSymbol = DEFAULT_SYMBOLS.find((s) => s.id === selectedSymbol) || DEFAULT_SYMBOLS[2];

  // WebSocket 实时数据
  const {
    priceData: realtimePrice,
    isConnected: isWsConnected,
    error: wsError,
  } = useRealtimeData({
    wsUrl,
    symbol: currentSymbol.ticker,
    enabled: true,
  });

  // 使用新的 hooks
  const {
    candles,
    isLoading: isChartLoading,
    isFromCache,
    error: chartError,
    lastUpdate,
    refresh: refreshChart,
  } = useChartData({
    symbol: currentSymbol.ticker,
    timeframe,
    apiUrl,
    autoRefresh: true,
    limit: candleLimit,
  });

  const {
    signals,
    unreadCount,
    isLoading: isSignalsLoading,
    lastCheck,
  } = useSignals({
    apiUrl,
    autoRefresh: true,
    refreshInterval: 10,
  });

  const {
    strategies,
    isLoading: isStrategiesLoading,
  } = useStrategies({
    apiUrl,
    syncApiUrl,
    autoRefresh: false,
  });

  // 计算品种趋势（基于最后一根K线）
  const trend = useMemo<'bullish' | 'bearish' | 'neutral'>(() => {
    if (candles.length < 2) return 'neutral';
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const change = last.close - prev.close;
    if (change > 0) return 'bullish';
    if (change < 0) return 'bearish';
    return 'neutral';
  }, [candles]);

  // 计算涨跌幅
  const changePercent = useMemo(() => {
    if (candles.length < 2) return 0;
    const last = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    return ((last.close - prev.close) / prev.close) * 100;
  }, [candles]);

  // 当前价格（直接使用 K 线数据，保证与图表一致）
  const currentPrice = useMemo(() => {
    if (candles.length === 0) return 0;
    return candles[candles.length - 1].close;
  }, [candles]);

  // 24h 涨跌幅（基于 K 线数据计算）
  const changePercent24h = useMemo(() => {
    return changePercent;
  }, [changePercent]);

  // 过滤当前品种的信号
  const symbolSignals = useMemo(() => {
    return filterSignalsBySymbol(signals, currentSymbol.id).slice(0, 5);
  }, [signals, currentSymbol.id]);

  // 转换信号为图表标记
  const chartSignals: ChartSignal[] = useMemo(() => {
    return symbolSignals.map((s) => ({
      time: Math.floor(s.timestamp / 1000),
      position: (s.direction === 'BUY' ? 'belowBar' : 'aboveBar') as 'belowBar' | 'aboveBar',
      color: s.direction === 'BUY' ? '#10B981' : '#EF4444',
      shape: (s.direction === 'BUY' ? 'arrowUp' : 'arrowDown') as 'arrowUp' | 'arrowDown' | 'circle',
      text: s.signal_name,
    }));
  }, [symbolSignals]);

  // 匹配策略
  const matchedStrategies = useMemo(() => {
    return matchStrategies(
      strategies,
      symbolSignals.map((s) => ({
        signal_name: s.signal_name,
        pattern: s.pattern,
        direction: s.direction,
        symbol: s.symbol,
        timeframe: s.timeframe,
      })),
      { trend, price: currentPrice, changePercent: changePercent24h, timeframe }
    );
  }, [strategies, symbolSignals, trend, currentPrice, changePercent, timeframe]);

  // 技术指标
  const indicators = useMemo(() => {
    return calculateIndicators(selectedSymbol, trend, changePercent24h);
  }, [selectedSymbol, trend, changePercent]);

  const handleSelectSymbol = (sym: SymbolInfo) => {
    setSelectedSymbol(sym.id);
    setShowSymbolDropdown(false);
  };

  return (
    <div className="h-full flex flex-col">
      {/* 顶部工具栏 */}
      <div className="mb-4 flex items-center gap-4 flex-wrap">
        {/* 品种选择 */}
        <div className="flex items-center gap-2 relative">
          <label className="text-sm text-slate-400">品种:</label>
          <button
            onClick={() => setShowSymbolDropdown(!showSymbolDropdown)}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm hover:bg-slate-700 transition-colors min-w-[160px]"
          >
            <span>{CATEGORY_CONFIG[currentSymbol.category].emoji}</span>
            <span>{currentSymbol.name}</span>
            <span className={`text-xs ${changePercent24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              ${currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
            <ChevronDown className="w-4 h-4 ml-auto text-slate-400" />
          </button>

          {showSymbolDropdown && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowSymbolDropdown(false)} />
              <div className="absolute top-full left-0 mt-1 w-72 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 max-h-96 overflow-auto">
                {DEFAULT_SYMBOLS.map((sym) => {
                  const config = CATEGORY_CONFIG[sym.category];
                  return (
                    <button
                      key={sym.id}
                      onClick={() => handleSelectSymbol(sym)}
                      className={`w-full px-3 py-2 text-left text-sm hover:bg-slate-800 transition-colors flex items-center justify-between ${
                        sym.id === selectedSymbol ? 'bg-blue-600/20 text-blue-400' : 'text-white'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span>{config.emoji}</span>
                        <div>
                          <div className="font-medium">{sym.name}</div>
                          <div className="text-xs text-slate-500">{sym.ticker}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* 周期选择器 */}
        <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1">
          {INTERVALS.map((int) => (
            <button
              key={int.value}
              onClick={() => setTimeframe(int.value)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                timeframe === int.value
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              {int.label}
            </button>
          ))}
        </div>

        {/* K线数量选择器 */}
        <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1">
          {CANDLE_LIMITS.map((limit) => (
            <button
              key={limit}
              onClick={() => setCandleLimit(limit)}
              className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                candleLimit === limit
                  ? 'bg-purple-600 text-white'
                  : 'text-slate-400 hover:text-white hover:bg-slate-700'
              }`}
            >
              {limit}
            </button>
          ))}
        </div>

        {/* 信号数量 */}
        {signals.length > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded-lg text-xs">
            <Bell className="w-3 h-3 text-green-400" />
            <span>{signals.length} 信号</span>
            {unreadCount > 0 && (
              <span className="px-1.5 py-0.5 bg-green-500 text-white rounded-full text-[10px]">
                {unreadCount}
              </span>
            )}
          </div>
        )}

        {/* 数据源状态 */}
        <div className="flex items-center gap-2 text-xs">
          {isWsConnected ? (
            <span className="flex items-center gap-1 text-green-400">
              <Wifi className="w-3 h-3" />
              WebSocket
            </span>
          ) : chartError ? (
            <span className="flex items-center gap-1 text-yellow-400">
              <WifiOff className="w-3 h-3" />
              模拟数据
            </span>
          ) : isFromCache ? (
            <span className="flex items-center gap-1 text-blue-400">
              <Database className="w-3 h-3" />
              缓存
            </span>
          ) : (
            <span className="flex items-center gap-1 text-slate-400">
              <Wifi className="w-3 h-3" />
              HTTP
            </span>
          )}
        </div>

        {/* 刷新按钮 */}
        <div className="flex items-center gap-2 ml-auto">
          {lastUpdate && (
            <span className="text-xs text-slate-500">
              更新: {lastUpdate.toLocaleTimeString('zh-CN')}
            </span>
          )}
          <button
            onClick={() => refreshChart(true)}
            disabled={isChartLoading}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isChartLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* 左侧：图表 */}
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex-1 bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
            <TradingViewChart
              symbol={currentSymbol.ticker}
              interval={timeframe}
              candles={candles}
              signals={chartSignals}
              onTimeFrameChange={setTimeframe}
              className="h-full"
            />
          </div>
        </div>

        {/* 右侧：策略和信号面板 */}
        <div className="w-80 flex flex-col gap-4 overflow-y-auto">
          {/* 市场状态 */}
          <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
            <h3 className="text-sm font-medium text-white mb-3">市场状态</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-slate-800 rounded p-2">
                <div className="text-slate-400 mb-1">趋势</div>
                <div
                  className={`font-semibold ${
                    trend === 'bullish' ? 'text-green-400' : trend === 'bearish' ? 'text-red-400' : 'text-slate-300'
                  }`}
                >
                  {trend === 'bullish' ? '看涨 📈' : trend === 'bearish' ? '看跌 📉' : '震荡 ➡️'}
                </div>
              </div>
              <div className="bg-slate-800 rounded p-2">
                <div className="text-slate-400 mb-1">涨跌幅</div>
                <div className={`font-semibold ${changePercent24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {changePercent24h >= 0 ? '+' : ''}
                  {changePercent24h.toFixed(2)}%
                </div>
              </div>
              <div className="bg-slate-800 rounded p-2">
                <div className="text-slate-400 mb-1">RSI</div>
                <div
                  className={`font-semibold ${
                    indicators.rsi > 70 ? 'text-red-400' : indicators.rsi < 30 ? 'text-green-400' : 'text-slate-300'
                  }`}
                >
                  {indicators.rsi.toFixed(1)}
                  {indicators.rsi > 70 && ' 超买'}
                  {indicators.rsi < 30 && ' 超卖'}
                </div>
              </div>
              <div className="bg-slate-800 rounded p-2">
                <div className="text-slate-400 mb-1">波动率</div>
                <div className="font-semibold text-slate-300">{indicators.volatility.toFixed(2)}%</div>
              </div>
            </div>
          </div>

          {/* 相关信号 */}
          {symbolSignals.length > 0 && (
            <div className="bg-slate-900 rounded-lg border border-slate-800 p-4">
              <h3 className="text-sm font-medium text-white mb-3">相关信号</h3>
              <div className="flex flex-col gap-2">
                {symbolSignals.map((signal) => (
                  <SignalMiniCard key={signal.id} signal={signal} />
                ))}
              </div>
            </div>
          )}

          {/* 匹配策略 */}
          <div className="flex-1 bg-slate-900 rounded-lg border border-slate-800 p-4 overflow-y-auto">
            <h3 className="text-sm font-medium text-white mb-3">
              策略匹配
              {matchedStrategies.length > 0 && (
                <span className="ml-2 text-xs text-slate-400">
                  ({matchedStrategies.length}个)
                </span>
              )}
            </h3>

            {isStrategiesLoading ? (
              <div className="text-center text-slate-500 text-sm py-4">加载策略...</div>
            ) : matchedStrategies.length === 0 ? (
              <div className="text-center text-slate-500 text-sm py-4">
                {strategies.length === 0 ? '暂无策略数据' : '当前条件下无匹配策略'}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {matchedStrategies.map((strategy) => (
                  <div
                    key={strategy.id}
                    className="bg-slate-800 rounded-lg p-3 border border-slate-700"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-white truncate">{strategy.name}</span>
                      <span
                        className="text-xs px-2 py-0.5 rounded"
                        style={{
                          background:
                            strategy.matchScore >= 80
                              ? 'rgba(16, 185, 129, 0.2)'
                              : strategy.matchScore >= 50
                              ? 'rgba(245, 158, 11, 0.2)'
                              : 'rgba(107, 114, 128, 0.2)',
                          color:
                            strategy.matchScore >= 80
                              ? '#10B981'
                              : strategy.matchScore >= 50
                              ? '#F59E0B'
                              : '#6B7280',
                        }}
                      >
                        {strategy.matchScore}
                      </span>
                    </div>
                    {strategy.matchedSignals.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {strategy.matchedSignals.slice(0, 3).map((sig, idx) => (
                          <span
                            key={idx}
                            className="text-[10px] px-1.5 py-0.5 bg-slate-700 text-slate-300 rounded"
                          >
                            {sig}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
