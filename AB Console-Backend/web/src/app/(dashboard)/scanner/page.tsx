'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, TrendingUp, TrendingDown, Activity, LayoutGrid, Maximize2 } from 'lucide-react';
import { config } from '@/lib/config';

// 品种配置
interface SymbolCard {
  id: string;
  ticker: string;
  name: string;
  category: 'crypto' | 'stock' | 'forex' | 'future' | 'metal';
  price: number;
  change: number;
  changePercent: number;
  trend: 'bullish' | 'bearish' | 'neutral';
  loading: boolean;
}

const CATEGORY_CONFIG: Record<string, { emoji: string; label: string; color: string }> = {
  crypto: { emoji: '💰', label: '加密货币', color: '#F59E0B' },
  stock: { emoji: '📈', label: '股票', color: '#3B82F6' },
  forex: { emoji: '💱', label: '外汇', color: '#8B5CF6' },
  future: { emoji: '📊', label: '期货', color: '#10B981' },
  metal: { emoji: '🥇', label: '贵金属', color: '#FBBF24' },
};

const DEFAULT_SYMBOLS: SymbolCard[] = [
  { id: 'BTC', ticker: 'BTCUSDT', name: 'Bitcoin', category: 'crypto', price: 0, change: 0, changePercent: 0, trend: 'neutral', loading: true },
  { id: 'ETH', ticker: 'ETHUSDT', name: 'Ethereum', category: 'crypto', price: 0, change: 0, changePercent: 0, trend: 'neutral', loading: true },
  { id: 'SOL', ticker: 'SOLUSDT', name: 'Solana', category: 'crypto', price: 0, change: 0, changePercent: 0, trend: 'neutral', loading: true },
  { id: 'BNB', ticker: 'BNBUSDT', name: 'BNB', category: 'crypto', price: 0, change: 0, changePercent: 0, trend: 'neutral', loading: true },
  { id: 'XRP', ticker: 'XRPUSDT', name: 'Ripple', category: 'crypto', price: 0, change: 0, changePercent: 0, trend: 'neutral', loading: true },
  { id: 'DOGE', ticker: 'DOGEUSDT', name: 'Dogecoin', category: 'crypto', price: 0, change: 0, changePercent: 0, trend: 'neutral', loading: true },
];

export default function ScannerPage() {
  const [symbols, setSymbols] = useState<SymbolCard[]>(DEFAULT_SYMBOLS);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [chartInterval, setChartInterval] = useState('5m');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const apiUrl = config.apiUrl;

  // 获取单个品种数据
  const fetchSymbolData = async (symbol: SymbolCard): Promise<Partial<SymbolCard>> => {
    try {
      const timestamp = Date.now();
      const res = await fetch(
        `${apiUrl}/api/v1/candles/${symbol.ticker}?interval=${chartInterval}&limit=2&t=${timestamp}`
      );
      
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const candles = data.candles || [];

      if (candles.length >= 2) {
        const current = candles[candles.length - 1];
        const prev = candles[candles.length - 2];
        const change = current.close - prev.close;
        const changePercent = (change / prev.close) * 100;
        
        return {
          price: current.close,
          change,
          changePercent,
          trend: change > 0 ? 'bullish' : change < 0 ? 'bearish' : 'neutral',
          loading: false,
        };
      } else if (candles.length === 1) {
        return {
          price: candles[0].close,
          change: 0,
          changePercent: 0,
          trend: 'neutral',
          loading: false,
        };
      }
    } catch (e) {
      console.error(`[Scanner] Failed to fetch ${symbol.id}:`, e);
    }
    return { loading: false };
  };

  // 刷新所有数据
  const refreshAll = useCallback(async () => {
    setIsRefreshing(true);
    const updates = await Promise.all(
      symbols.map(async (sym) => {
        const update = await fetchSymbolData(sym);
        return { ...sym, ...update };
      })
    );
    setSymbols(updates);
    setLastUpdate(new Date());
    setIsRefreshing(false);
  }, [symbols, chartInterval, apiUrl]);

  // 初始加载和定时刷新
  useEffect(() => {
    refreshAll();
    const interval = setInterval(refreshAll, 10000);
    return () => clearInterval(interval);
  }, [chartInterval]);

  // 过滤品种
  const filteredSymbols = selectedCategory === 'all' 
    ? symbols 
    : symbols.filter((s) => s.category === selectedCategory);

  // 格式化价格
  const formatPrice = (price: number) => {
    return price.toLocaleString(undefined, { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
  };

  return (
    <div className="h-full flex flex-col">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
        <h2 className="text-xl font-bold text-white">市场扫描仪</h2>
        
        <div className="flex items-center gap-3 flex-wrap">
          {/* 时间框架选择 */}
          <select
            value={chartInterval}
            onChange={(e) => setChartInterval(e.target.value)}
            className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="1m">1分钟</option>
            <option value="5m">5分钟</option>
            <option value="15m">15分钟</option>
            <option value="1h">1小时</option>
            <option value="4h">4小时</option>
          </select>

          {/* 视图切换 */}
          <div className="flex bg-slate-800 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1.5 rounded text-sm flex items-center gap-1 transition-colors ${
                viewMode === 'grid' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="w-4 h-4" />
              网格
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1.5 rounded text-sm flex items-center gap-1 transition-colors ${
                viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Maximize2 className="w-4 h-4" />
              列表
            </button>
          </div>

          {/* 最后更新时间 */}
          {lastUpdate && (
            <span className="text-xs text-slate-500">
              更新于: {lastUpdate.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}

          {/* 刷新按钮 */}
          <button
            onClick={refreshAll}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-700 text-white text-sm rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </div>

      {/* 分类过滤器 */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            selectedCategory === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          全部 ({symbols.length})
        </button>
        {Object.entries(CATEGORY_CONFIG).map(([key, config]) => {
          const count = symbols.filter((s) => s.category === key).length;
          return (
            <button
              key={key}
              onClick={() => setSelectedCategory(key)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                selectedCategory === key
                  ? 'text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
              style={{
                backgroundColor: selectedCategory === key ? config.color : undefined,
              }}
            >
              {config.emoji} {config.label} ({count})
            </button>
          );
        })}
      </div>

      {/* 网格视图 */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-auto">
          {filteredSymbols.map((sym) => {
            const category = CATEGORY_CONFIG[sym.category];

            return (
              <div
                key={sym.id}
                className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-slate-700 transition-all hover:shadow-lg hover:-translate-y-1"
              >
                {/* 头部 */}
                <div className="px-4 py-3 bg-slate-800 border-b border-slate-700 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{category.emoji}</span>
                    <div>
                      <div className="font-bold text-white">{sym.id}</div>
                      <div className="text-xs text-slate-400">{sym.name}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    {sym.loading ? (
                      <div className="text-slate-500 text-xs">加载中...</div>
                    ) : (
                      <>
                        <div className="font-bold text-lg text-white font-mono">
                          ${formatPrice(sym.price)}
                        </div>
                        <div
                          className={`text-xs font-medium ${
                            sym.trend === 'bullish'
                              ? 'text-green-500'
                              : sym.trend === 'bearish'
                              ? 'text-red-500'
                              : 'text-slate-500'
                          }`}
                        >
                          {sym.trend === 'bullish' ? '▲' : sym.trend === 'bearish' ? '▼' : '—'}
                          {sym.changePercent >= 0 ? '+' : ''}
                          {sym.changePercent.toFixed(2)}%
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* 内容 */}
                <div className="p-4">
                  {/* 趋势指示器 */}
                  <div
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                      sym.trend === 'bullish'
                        ? 'bg-green-900/20 border-green-800 text-green-400'
                        : sym.trend === 'bearish'
                        ? 'bg-red-900/20 border-red-800 text-red-400'
                        : 'bg-slate-800 border-slate-700 text-slate-400'
                    }`}
                  >
                    {sym.trend === 'bullish' ? (
                      <TrendingUp className="w-5 h-5" />
                    ) : sym.trend === 'bearish' ? (
                      <TrendingDown className="w-5 h-5" />
                    ) : (
                      <Activity className="w-5 h-5" />
                    )}
                    <span className="font-medium">
                      {sym.trend === 'bullish' ? '看涨' : sym.trend === 'bearish' ? '看跌' : '震荡'}
                    </span>
                    <span className="ml-auto text-xs text-slate-500">{chartInterval}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 列表视图 */}
      {viewMode === 'list' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">品种</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">价格</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">涨跌幅</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-400">趋势</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-400">分类</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredSymbols.map((sym) => {
                const category = CATEGORY_CONFIG[sym.category];
                return (
                  <tr key={sym.id} className="hover:bg-slate-800/50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span>{category.emoji}</span>
                        <div>
                          <div className="font-medium text-white">{sym.id}</div>
                          <div className="text-xs text-slate-500">{sym.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {sym.loading ? (
                        <span className="text-slate-500">-</span>
                      ) : (
                        <span className="font-mono text-white">${formatPrice(sym.price)}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {sym.loading ? (
                        <span className="text-slate-500">-</span>
                      ) : (
                        <span
                          className={`font-medium ${
                            sym.trend === 'bullish'
                              ? 'text-green-500'
                              : sym.trend === 'bearish'
                              ? 'text-red-500'
                              : 'text-slate-400'
                          }`}
                        >
                          {sym.changePercent >= 0 ? '+' : ''}
                          {sym.changePercent.toFixed(2)}%
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {sym.trend === 'bullish' ? (
                        <span className="text-green-500">看涨</span>
                      ) : sym.trend === 'bearish' ? (
                        <span className="text-red-500">看跌</span>
                      ) : (
                        <span className="text-slate-400">震荡</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span
                        className="px-2 py-1 rounded text-xs"
                        style={{ backgroundColor: `${category.color}30`, color: category.color }}
                      >
                        {category.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
