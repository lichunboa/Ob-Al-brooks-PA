// ============================================
// 交易员控制台 - 类型定义
// 与 Obsidian 端保持一致
// ============================================

// K线数据
export interface Candle {
  time: number;           // Unix timestamp (seconds)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// 市场数据
export interface MarketData {
  symbol: string;
  interval: string;
  candles: Candle[];
  lastUpdate: number;
}

// 交易品种
export interface Symbol {
  id: string;            // 唯一标识
  ticker: string;        // 代码，如 BTCUSDT
  name: string;          // 名称，如 Bitcoin
  category: 'crypto' | 'forex' | 'stock' | 'commodity';
  exchange?: string;     // 交易所
  price?: number;        // 当前价格
  change24h?: number;    // 24h涨跌幅
  changePercent?: number;// 24h涨跌幅百分比
  trend?: 'bullish' | 'bearish' | 'neutral';
  volume24h?: number;    // 24h成交量
}

// 信号
export interface Signal {
  id: string;
  symbol: string;
  direction: 'BUY' | 'SELL' | 'NEUTRAL';
  signalName: string;      // 信号名称，如 "H1突破"
  price: number;
  timestamp: number;
  timeframe: string;
  confidence?: number;     // 置信度 0-100
  description?: string;
  read?: boolean;          // 是否已读
}

// 图表信号标记
export interface ChartSignal {
  time: number;
  position: 'aboveBar' | 'belowBar' | 'inBar';
  color: string;
  shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square';
  text: string;
  size?: number;
}

// 策略
export interface Strategy {
  id: string;
  name: string;
  description: string;
  category: string;
  rules: StrategyRule[];
  tags: string[];
  createdAt: number;
  updatedAt: number;
  backtestConfig?: BacktestConfig;
}

export interface StrategyRule {
  condition: string;
  action: 'enter_long' | 'enter_short' | 'exit';
  parameters?: Record<string, any>;
}

export interface BacktestConfig {
  initialCapital: number;
  positionSize: number;
  stopLoss?: number;
  takeProfit?: number;
  maxPositions?: number;
}

// 交易记录
export interface Trade {
  id: string;
  symbol: string;
  direction: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice?: number;
  size: number;
  entryTime: number;
  exitTime?: number;
  pnl?: number;
  pnlPercent?: number;
  strategy?: string;
  notes?: string;
  tags: string[];
  status: 'open' | 'closed';
  source: 'obsidian' | 'web' | 'import';
  obsidianNotePath?: string;
}

// 时间框架
export type TimeFrame = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d' | '1w' | '1M';

// WebSocket 事件
export interface WSEvents {
  // 客户端 → 服务端
  'sub:candles': { symbol: string; interval: string };
  'unsub:candles': { symbol: string; interval: string };
  'sub:signals': { symbols?: string[] };
  'unsub:signals': {};
  'ping': { timestamp: number };
  
  // 服务端 → 客户端
  'candle:update': {
    symbol: string;
    interval: string;
    candle: Candle;
  };
  'signal:new': Signal;
  'pong': { timestamp: number; latency: number };
  'error': { code: string; message: string };
}

// 应用状态
export interface AppState {
  selectedSymbol: string;
  selectedTimeFrame: TimeFrame;
  sidebarOpen: boolean;
  theme: 'light' | 'dark';
}
