'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  LayoutGrid,
  Maximize2,
  RefreshCw,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

type SymbolCategory = 'crypto' | 'forex' | 'index' | 'metal';
type Trend = 'bullish' | 'bearish' | 'neutral';

interface ScanItem {
  id: string;
  ticker: string;
  name: string;
  category: SymbolCategory;
  market: string;
  source: string;
  price: number;
  change: number;
  changePercent: number;
  trend: Trend;
  loading: boolean;
  error?: string;
}

interface ScanGroup {
  id: string;
  label: string;
  interval: string;
  items: ScanItem[];
}

const CATEGORY_CONFIG: Record<SymbolCategory, { emoji: string; label: string; color: string }> = {
  crypto: { emoji: 'BTC', label: '加密', color: '#f59e0b' },
  forex: { emoji: 'FX', label: '外汇', color: '#06b6d4' },
  index: { emoji: 'IDX', label: '指数', color: '#10b981' },
  metal: { emoji: 'MET', label: '贵金属', color: '#eab308' },
};

export default function ScannerPage() {
  const [groups, setGroups] = useState<ScanGroup[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [chartInterval, setChartInterval] = useState('5m');
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const refreshAll = async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch(`/api/market-scan?interval=${encodeURIComponent(chartInterval)}`, {
        cache: 'no-store',
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const payload = await response.json();
      setGroups(Array.isArray(payload.groups) ? payload.groups : []);
      setLastUpdate(new Date());
    } catch (error) {
      console.error('[Scanner] 获取扫描数据失败:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    refreshAll();
    const timer = window.setInterval(refreshAll, 10000);
    return () => window.clearInterval(timer);
  }, [chartInterval]);

  const allItems = useMemo(() => groups.flatMap((group) => group.items), [groups]);

  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      const groupOk = selectedGroup === 'all' || item.market === selectedGroup;
      const categoryOk = selectedCategory === 'all' || item.category === selectedCategory;
      return groupOk && categoryOk;
    });
  }, [allItems, selectedCategory, selectedGroup]);

  const groupCounts = useMemo(() => {
    const result: Record<string, number> = { all: allItems.length };
    for (const group of groups) {
      result[group.id] = group.items.length;
    }
    return result;
  }, [allItems.length, groups]);

  const categoryCounts = useMemo(() => {
    const result: Record<string, number> = { all: filteredItems.length };
    for (const item of allItems) {
      result[item.category] = (result[item.category] || 0) + 1;
    }
    return result;
  }, [allItems, filteredItems.length]);

  const formatPrice = (price: number) =>
    price.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-4">
        <div>
          <h2 className="text-xl font-bold text-white">市场扫描仪</h2>
          <p className="text-sm text-slate-400 mt-1">多资产主栈 + Binance Demo 双扫描视图</p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={chartInterval}
            onChange={(event) => setChartInterval(event.target.value)}
            className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded text-white text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="5m">5分钟</option>
            <option value="15m">15分钟</option>
            <option value="1h">1小时</option>
          </select>

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

          {lastUpdate && (
            <span className="text-xs text-slate-500">
              更新于 {lastUpdate.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}

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

      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setSelectedGroup('all')}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            selectedGroup === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          全部 ({groupCounts.all ?? 0})
        </button>
        {groups.map((group) => (
          <button
            key={group.id}
            onClick={() => setSelectedGroup(group.id)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              selectedGroup === group.id ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {group.label} ({groupCounts[group.id] ?? group.items.length})
          </button>
        ))}
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setSelectedCategory('all')}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            selectedCategory === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
          }`}
        >
          全部类别 ({categoryCounts.all ?? 0})
        </button>
        {Object.entries(CATEGORY_CONFIG).map(([key, item]) => (
          <button
            key={key}
            onClick={() => setSelectedCategory(key)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              selectedCategory === key ? 'text-white' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
            style={{ backgroundColor: selectedCategory === key ? item.color : undefined }}
          >
            {item.label} ({categoryCounts[key] ?? 0})
          </button>
        ))}
      </div>

      {viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 overflow-auto">
          {filteredItems.map((item) => (
            <ScanCard key={`${item.market}-${item.ticker}`} item={item} formatPrice={formatPrice} />
          ))}
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-800">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">品种</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-slate-400">市场</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">价格</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-slate-400">涨跌幅</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-400">趋势</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-slate-400">来源</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filteredItems.map((item) => (
                <tr key={`${item.market}-${item.ticker}`} className="hover:bg-slate-800/50">
                  <td className="px-4 py-3">
                    <div>
                      <div className="font-medium text-white">{item.id}</div>
                      <div className="text-xs text-slate-500">{item.name}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-300">{item.market === 'multi_asset' ? '多资产主栈' : 'Binance Demo'}</td>
                  <td className="px-4 py-3 text-right text-white font-mono">{formatPrice(item.price)}</td>
                  <td className={`px-4 py-3 text-right font-medium ${item.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {item.changePercent >= 0 ? '+' : ''}
                    {item.changePercent.toFixed(2)}%
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={item.trend === 'bullish' ? 'text-green-400' : item.trend === 'bearish' ? 'text-red-400' : 'text-slate-500'}>
                      {item.trend === 'bullish' ? '看涨' : item.trend === 'bearish' ? '看跌' : '震荡'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-xs text-slate-500">{item.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ScanCard({
  item,
  formatPrice,
}: {
  item: ScanItem;
  formatPrice: (price: number) => string;
}) {
  const category = CATEGORY_CONFIG[item.category];

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden hover:border-slate-700 transition-all hover:shadow-lg hover:-translate-y-1">
      <div className="px-4 py-3 bg-slate-800 border-b border-slate-700 flex justify-between items-center">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300">{category.label}</span>
            <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-300">
              {item.market === 'multi_asset' ? '多资产主栈' : 'Binance Demo'}
            </span>
          </div>
          <div className="mt-2 font-bold text-white">{item.id}</div>
          <div className="text-xs text-slate-400">{item.name}</div>
        </div>
        <div className="text-right">
          <div className="font-bold text-lg text-white font-mono">{formatPrice(item.price)}</div>
          <div className={`text-xs font-medium ${
            item.trend === 'bullish'
              ? 'text-green-500'
              : item.trend === 'bearish'
              ? 'text-red-500'
              : 'text-slate-500'
          }`}>
            {item.changePercent >= 0 ? '+' : ''}
            {item.changePercent.toFixed(2)}%
          </div>
        </div>
      </div>

      <div className="p-4 space-y-3">
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
            item.trend === 'bullish'
              ? 'bg-green-900/20 border-green-800 text-green-400'
              : item.trend === 'bearish'
              ? 'bg-red-900/20 border-red-800 text-red-400'
              : 'bg-slate-800 border-slate-700 text-slate-400'
          }`}
        >
          {item.trend === 'bullish' ? (
            <TrendingUp className="w-5 h-5" />
          ) : item.trend === 'bearish' ? (
            <TrendingDown className="w-5 h-5" />
          ) : (
            <Activity className="w-5 h-5" />
          )}
          <span className="font-medium">
            {item.trend === 'bullish' ? '看涨' : item.trend === 'bearish' ? '看跌' : '震荡'}
          </span>
          <span className="ml-auto text-xs text-slate-500">{item.source}</span>
        </div>

        {item.error && (
          <div className="rounded-lg border border-amber-800/50 bg-amber-900/20 px-3 py-2 text-xs text-amber-300">
            数据回退: {item.error}
          </div>
        )}
      </div>
    </div>
  );
}
