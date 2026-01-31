'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Play, Download, Calendar, TrendingUp, TrendingDown, 
  DollarSign, Percent, Clock, BarChart3, RotateCcw,
  ChevronDown, Filter, Target, AlertCircle
} from 'lucide-react';

// 回测结果类型
interface BacktestResult {
  symbol: string;
  strategy: string;
  timeframe: string;
  startDate: string;
  endDate: string;
  totalReturn: number;
  winRate: number;
  totalTrades: number;
  profitFactor: number;
  maxDrawdown: number;
  sharpeRatio: number;
  trades: Trade[];
  equityCurve: EquityPoint[];
}

interface Trade {
  id: number;
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  direction: 'LONG' | 'SHORT';
  size: number;
  pnl: number;
  pnlPercent: number;
  status: 'OPEN' | 'CLOSED';
}

interface EquityPoint {
  time: number;
  value: number;
}

// 模拟回测结果
const generateMockBacktest = (symbol: string, strategy: string, timeframe: string): BacktestResult => {
  const trades: Trade[] = [];
  const equityCurve: EquityPoint[] = [];
  let equity = 10000;
  const startTime = Date.now() / 1000 - 30 * 86400; // 30天前
  
  equityCurve.push({ time: startTime, value: equity });
  
  for (let i = 0; i < 20; i++) {
    const entryTime = startTime + i * 1.5 * 86400;
    const exitTime = entryTime + 0.5 * 86400;
    const direction = Math.random() > 0.5 ? 'LONG' : 'SHORT';
    const entryPrice = 40000 + Math.random() * 5000;
    const pnlPercent = (Math.random() - 0.35) * 10; // 65%胜率偏向
    const pnl = equity * pnlPercent / 100;
    
    equity += pnl;
    
    trades.push({
      id: i + 1,
      entryTime,
      exitTime,
      entryPrice,
      exitPrice: entryPrice * (1 + pnlPercent / 100),
      direction,
      size: 0.1,
      pnl,
      pnlPercent,
      status: 'CLOSED'
    });
    
    equityCurve.push({ time: exitTime, value: equity });
  }

  const winningTrades = trades.filter(t => t.pnl > 0);
  const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
  const grossProfit = winningTrades.reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = trades.filter(t => t.pnl < 0).reduce((sum, t) => sum + Math.abs(t.pnl), 0);
  
  return {
    symbol,
    strategy,
    timeframe,
    startDate: new Date(startTime * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    totalReturn: (equity - 10000) / 10000 * 100,
    winRate: winningTrades.length / trades.length * 100,
    totalTrades: trades.length,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : grossProfit,
    maxDrawdown: 8.5,
    sharpeRatio: 1.2,
    trades,
    equityCurve
  };
};

export default function BacktestPage() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  
  // 回测参数
  const [params, setParams] = useState({
    symbol: 'BTCUSDT',
    strategy: 'h1-breakout',
    timeframe: '1h',
    startDate: new Date(Date.now() - 30 * 86400 * 1000).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    initialCapital: 10000,
    positionSize: 10 // %
  });

  // 运行回测
  const runBacktest = useCallback(async () => {
    setIsRunning(true);
    setResult(null);
    
    // 模拟API延迟
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const mockResult = generateMockBacktest(params.symbol, params.strategy, params.timeframe);
    setResult(mockResult);
    setIsRunning(false);
  }, [params]);

  // 导出结果
  const exportResults = () => {
    if (!result) return;
    
    const data = JSON.stringify(result, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backtest_${result.symbol}_${result.strategy}_${Date.now()}.json`;
    a.click();
  };

  // 格式化货币
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('zh-CN', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(value);
  };

  // 格式化时间
  const formatTime = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString('zh-CN', {
      month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  return (
    <div className="h-full flex flex-col">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
        <h2 className="text-xl font-bold text-white">策略回测</h2>
        
        {result && (
          <button
            onClick={exportResults}
            className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg transition-colors"
          >
            <Download className="w-4 h-4" />
            导出结果
          </button>
        )}
      </div>

      {/* 参数配置区 */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 mb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {/* 品种 */}
          <div>
            <label className="text-xs text-slate-500">交易品种</label>
            <select
              value={params.symbol}
              onChange={(e) => setParams({ ...params, symbol: e.target.value })}
              className="w-full mt-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
            >
              <option value="BTCUSDT">BTC/USDT</option>
              <option value="ETHUSDT">ETH/USDT</option>
              <option value="SOLUSDT">SOL/USDT</option>
              <option value="BNBUSDT">BNB/USDT</option>
            </select>
          </div>

          {/* 策略 */}
          <div>
            <label className="text-xs text-slate-500">策略</label>
            <select
              value={params.strategy}
              onChange={(e) => setParams({ ...params, strategy: e.target.value })}
              className="w-full mt-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
            >
              <option value="h1-breakout">H1突破</option>
              <option value="l1-breakout">L1突破</option>
              <option value="strong-trend-up">强趋势(多)</option>
              <option value="strong-trend-down">强趋势(空)</option>
            </select>
          </div>

          {/* 时间框架 */}
          <div>
            <label className="text-xs text-slate-500">时间框架</label>
            <select
              value={params.timeframe}
              onChange={(e) => setParams({ ...params, timeframe: e.target.value })}
              className="w-full mt-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
            >
              <option value="5m">5分钟</option>
              <option value="15m">15分钟</option>
              <option value="1h">1小时</option>
              <option value="4h">4小时</option>
              <option value="1d">日线</option>
            </select>
          </div>

          {/* 开始日期 */}
          <div>
            <label className="text-xs text-slate-500">开始日期</label>
            <input
              type="date"
              value={params.startDate}
              onChange={(e) => setParams({ ...params, startDate: e.target.value })}
              className="w-full mt-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
            />
          </div>

          {/* 结束日期 */}
          <div>
            <label className="text-xs text-slate-500">结束日期</label>
            <input
              type="date"
              value={params.endDate}
              onChange={(e) => setParams({ ...params, endDate: e.target.value })}
              className="w-full mt-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
            />
          </div>

          {/* 初始资金 */}
          <div>
            <label className="text-xs text-slate-500">初始资金 (USD)</label>
            <input
              type="number"
              value={params.initialCapital}
              onChange={(e) => setParams({ ...params, initialCapital: parseInt(e.target.value) })}
              className="w-full mt-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white text-sm"
            />
          </div>
        </div>

        {/* 运行按钮 */}
        <div className="mt-4 pt-4 border-t border-slate-800 flex justify-end">
          <button
            onClick={runBacktest}
            disabled={isRunning}
            className="flex items-center gap-2 px-6 py-2 bg-green-600 hover:bg-green-500 disabled:bg-green-700 text-white rounded-lg transition-colors"
          >
            {isRunning ? (
              <>
                <RotateCcw className="w-4 h-4 animate-spin" />
                运行中...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                开始回测
              </>
            )}
          </button>
        </div>
      </div>

      {/* 回测结果 */}
      {result ? (
        <div className="flex-1 overflow-auto space-y-4">
          {/* 统计卡片 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
                <Percent className="w-4 h-4" />
                总收益率
              </div>
              <div className={`text-2xl font-bold ${result.totalReturn >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {result.totalReturn >= 0 ? '+' : ''}{result.totalReturn.toFixed(2)}%
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
                <Target className="w-4 h-4" />
                胜率
              </div>
              <div className="text-2xl font-bold text-white">
                {result.winRate.toFixed(1)}%
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
                <BarChart3 className="w-4 h-4" />
                交易次数
              </div>
              <div className="text-2xl font-bold text-white">
                {result.totalTrades}
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className="flex items-center gap-2 text-slate-400 text-sm mb-1">
                <TrendingDown className="w-4 h-4" />
                最大回撤
              </div>
              <div className="text-2xl font-bold text-red-400">
                -{result.maxDrawdown.toFixed(1)}%
              </div>
            </div>
          </div>

          {/* 详细指标 */}
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3">
              <div className="text-xs text-slate-500">盈亏比</div>
              <div className="text-lg font-medium text-white">{result.profitFactor.toFixed(2)}</div>
            </div>
            <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3">
              <div className="text-xs text-slate-500">夏普比率</div>
              <div className="text-lg font-medium text-white">{result.sharpeRatio.toFixed(2)}</div>
            </div>
            <div className="bg-slate-900/50 border border-slate-800 rounded-lg p-3">
              <div className="text-xs text-slate-500">回测区间</div>
              <div className="text-sm font-medium text-white">{result.startDate} ~ {result.endDate}</div>
            </div>
          </div>

          {/* 交易记录 */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800 font-medium text-white">
              交易记录
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-800 text-slate-400">
                  <tr>
                    <th className="px-4 py-2 text-left">#</th>
                    <th className="px-4 py-2 text-left">方向</th>
                    <th className="px-4 py-2 text-left">入场时间</th>
                    <th className="px-4 py-2 text-left">入场价</th>
                    <th className="px-4 py-2 text-left">出场价</th>
                    <th className="px-4 py-2 text-right">盈亏</th>
                    <th className="px-4 py-2 text-right">盈亏%</th>
                  </tr>
                </thead>
                <tbody>
                  {result.trades.map((trade) => (
                    <tr
                      key={trade.id}
                      onClick={() => setSelectedTrade(trade)}
                      className="border-t border-slate-800 hover:bg-slate-800/50 cursor-pointer"
                    >
                      <td className="px-4 py-2 text-slate-400">{trade.id}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
                          trade.direction === 'LONG'
                            ? 'bg-green-600/20 text-green-400'
                            : 'bg-red-600/20 text-red-400'
                        }`}>
                          {trade.direction === 'LONG' ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : (
                            <TrendingDown className="w-3 h-3" />
                          )}
                          {trade.direction === 'LONG' ? '多' : '空'}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-slate-300">{formatTime(trade.entryTime)}</td>
                      <td className="px-4 py-2 text-slate-300">${trade.entryPrice.toFixed(2)}</td>
                      <td className="px-4 py-2 text-slate-300">${trade.exitPrice.toFixed(2)}</td>
                      <td className={`px-4 py-2 text-right font-medium ${
                        trade.pnl >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {trade.pnl >= 0 ? '+' : ''}{formatCurrency(trade.pnl)}
                      </td>
                      <td className={`px-4 py-2 text-right font-medium ${
                        trade.pnlPercent >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {trade.pnlPercent >= 0 ? '+' : ''}{trade.pnlPercent.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
          <BarChart3 className="w-16 h-16 mb-4 opacity-30" />
          <p>配置参数并点击"开始回测"</p>
          <p className="text-sm mt-1">回测结果将显示在这里</p>
        </div>
      )}

      {/* 交易详情弹窗 */}
      {selectedTrade && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-white">交易详情 #{selectedTrade.id}</h3>
              <button
                onClick={() => setSelectedTrade(null)}
                className="p-1 text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-slate-400">方向</span>
                <span className={selectedTrade.direction === 'LONG' ? 'text-green-400' : 'text-red-400'}>
                  {selectedTrade.direction === 'LONG' ? '做多' : '做空'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">入场价</span>
                <span className="text-white">${selectedTrade.entryPrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">出场价</span>
                <span className="text-white">${selectedTrade.exitPrice.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">盈亏</span>
                <span className={selectedTrade.pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                  {selectedTrade.pnl >= 0 ? '+' : ''}{formatCurrency(selectedTrade.pnl)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">持仓时间</span>
                <span className="text-white">
                  {Math.round((selectedTrade.exitTime - selectedTrade.entryTime) / 3600)} 小时
                </span>
              </div>
            </div>

            <button
              onClick={() => setSelectedTrade(null)}
              className="w-full mt-6 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors"
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
