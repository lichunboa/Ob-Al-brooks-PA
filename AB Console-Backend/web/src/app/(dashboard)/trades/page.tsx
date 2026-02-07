'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  TrendingUp, TrendingDown, RefreshCw,
  AlertCircle, Filter
} from 'lucide-react';
import {
  getTradeHistory, getAccountSummary,
  type TradeHistory, type AccountSummary
} from '@/lib/executionApi';

// 机器人配置
const BOT_CONFIG: Record<string, { label: string; emoji: string; color: string }> = {
  'al-brooks': { label: 'PA交易', emoji: '🦁', color: 'text-amber-400' },
  'trader': { label: '量化分析师', emoji: '📊', color: 'text-blue-400' },
  'wyckoff': { label: '威科夫大师', emoji: '🔮', color: 'text-purple-400' },
};

// 按 order_id 聚合交易（一个订单可能多次成交）
interface AggregatedOrder {
  order_id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  total_quantity: number;
  avg_price: number;
  realized_pnl: number;
  commission: number;
  timestamp: string;
  bot_id: string | null;
  fill_count: number;
}

function aggregateByOrder(trades: TradeHistory[]): AggregatedOrder[] {
  const map = new Map<string, AggregatedOrder>();

  for (const t of trades) {
    const existing = map.get(t.order_id);
    if (existing) {
      const totalValue = existing.avg_price * existing.total_quantity + t.price * t.quantity;
      existing.total_quantity += t.quantity;
      existing.avg_price = totalValue / existing.total_quantity;
      existing.realized_pnl += t.realized_pnl;
      existing.commission += t.commission;
      existing.fill_count++;
      if (!existing.bot_id && t.bot_id) existing.bot_id = t.bot_id;
    } else {
      map.set(t.order_id, {
        order_id: t.order_id,
        symbol: t.symbol.replace(':USDT', ''),
        side: t.side as 'BUY' | 'SELL',
        total_quantity: t.quantity,
        avg_price: t.price,
        realized_pnl: t.realized_pnl,
        commission: t.commission,
        timestamp: t.timestamp,
        bot_id: t.bot_id,
        fill_count: 1,
      });
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
}

export default function TradesPage() {
  const [trades, setTrades] = useState<TradeHistory[]>([]);
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedBot, setSelectedBot] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [tradesData, summaryData] = await Promise.all([
        getTradeHistory(undefined, 500),
        getAccountSummary(),
      ]);
      setTrades(tradesData);
      setSummary(summaryData);
    } catch (e) {
      console.error('获取币安交易数据失败:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 聚合订单
  const orders = useMemo(() => aggregateByOrder(trades), [trades]);

  // 按 bot 筛选
  const filteredOrders = useMemo(() => {
    if (!selectedBot) return orders;
    return orders.filter((o) => o.bot_id === selectedBot);
  }, [orders, selectedBot]);

  // 统计
  const stats = useMemo(() => {
    const data = filteredOrders;
    const totalPnl = data.reduce((s, o) => s + o.realized_pnl, 0);
    const totalCommission = data.reduce((s, o) => s + o.commission, 0);
    const netPnl = totalPnl - totalCommission;
    const closes = data.filter((o) => o.realized_pnl !== 0);
    const wins = closes.filter((o) => o.realized_pnl > 0).length;
    const losses = closes.filter((o) => o.realized_pnl < 0).length;
    return {
      totalOrders: data.length,
      closeOrders: closes.length,
      totalPnl,
      totalCommission,
      netPnl,
      wins,
      losses,
      winRate: closes.length > 0 ? (wins / closes.length) * 100 : 0,
    };
  }, [filteredOrders]);

  // 机器人 tab 统计
  const botCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const o of orders) {
      const key = o.bot_id || 'unknown';
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [orders]);

  const formatTime = (ts: string) => {
    if (!ts) return '-';
    const d = new Date(ts);
    return d.toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    });
  };

  const getBotInfo = (botId: string | null) => {
    if (!botId) return { label: '未知', emoji: '❓', color: 'text-slate-400' };
    return BOT_CONFIG[botId] || { label: botId, emoji: '🤖', color: 'text-slate-400' };
  };

  return (
    <div className="h-full flex flex-col">
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-bold text-white">交易记录</h2>
          <p className="text-sm text-slate-400">
            币安 Demo Trading 真实成交数据
            {summary && ` · 余额 $${summary.total_balance.toFixed(2)}`}
          </p>
        </div>
        <button
          onClick={fetchData}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm rounded-lg"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          刷新
        </button>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-6 gap-3 mb-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
          <div className="text-xs text-slate-500">总订单 / 平仓</div>
          <div className="text-2xl font-bold text-white">
            {stats.totalOrders} <span className="text-sm text-slate-500">/ {stats.closeOrders}</span>
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
          <div className="text-xs text-slate-500">已实现盈亏</div>
          <div className={`text-2xl font-bold ${stats.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {stats.totalPnl >= 0 ? '+' : ''}${stats.totalPnl.toFixed(2)}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
          <div className="text-xs text-slate-500">手续费</div>
          <div className="text-2xl font-bold text-orange-400">
            ${stats.totalCommission.toFixed(2)}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
          <div className="text-xs text-slate-500">净盈亏</div>
          <div className={`text-2xl font-bold ${stats.netPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {stats.netPnl >= 0 ? '+' : ''}${stats.netPnl.toFixed(2)}
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
          <div className="text-xs text-slate-500">胜/负</div>
          <div className="text-2xl font-bold text-white">
            <span className="text-green-400">{stats.wins}</span>
            <span className="text-slate-600"> / </span>
            <span className="text-red-400">{stats.losses}</span>
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
          <div className="text-xs text-slate-500">胜率</div>
          <div className={`text-2xl font-bold ${stats.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
            {stats.winRate.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* 机器人筛选 */}
      <div className="flex items-center gap-2 mb-3">
        <Filter className="w-4 h-4 text-slate-500" />
        <button
          onClick={() => setSelectedBot(null)}
          className={`px-3 py-1 text-xs rounded-full transition-colors ${
            !selectedBot
              ? 'bg-slate-700 text-white'
              : 'bg-slate-800/50 text-slate-400 hover:text-white'
          }`}
        >
          全部 ({orders.length})
        </button>
        {Object.entries(BOT_CONFIG).map(([id, cfg]) => (
          <button
            key={id}
            onClick={() => setSelectedBot(selectedBot === id ? null : id)}
            className={`px-3 py-1 text-xs rounded-full transition-colors ${
              selectedBot === id
                ? 'bg-slate-700 text-white'
                : 'bg-slate-800/50 text-slate-400 hover:text-white'
            }`}
          >
            {cfg.emoji} {cfg.label} ({botCounts[id] || 0})
          </button>
        ))}
      </div>

      {/* 订单列表 */}
      <div className="flex-1 overflow-auto">
        {filteredOrders.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-500">
            <AlertCircle className="w-12 h-12 mb-4 opacity-30" />
            <p>暂无交易记录</p>
            <p className="text-sm mt-2">等待机器人执行交易...</p>
          </div>
        ) : (
          <div className="space-y-1">
            {/* 表头 */}
            <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs text-slate-500 border-b border-slate-800">
              <div className="col-span-1">机器人</div>
              <div className="col-span-2">时间</div>
              <div className="col-span-2">品种</div>
              <div className="col-span-1">方向</div>
              <div className="col-span-1 text-right">数量</div>
              <div className="col-span-2 text-right">均价</div>
              <div className="col-span-2 text-right">已实现盈亏</div>
              <div className="col-span-1 text-right">手续费</div>
            </div>

            {filteredOrders.map((order) => {
              const bot = getBotInfo(order.bot_id);
              return (
                <div
                  key={order.order_id}
                  className="grid grid-cols-12 gap-2 px-4 py-2.5 rounded-lg bg-slate-900/50 border border-slate-800/50 hover:border-slate-700 items-center"
                >
                  <div className="col-span-1">
                    <span className={`text-sm ${bot.color}`} title={bot.label}>
                      {bot.emoji}
                    </span>
                  </div>
                  <div className="col-span-2 text-xs text-slate-400">
                    {formatTime(order.timestamp)}
                  </div>
                  <div className="col-span-2">
                    <span className="text-sm font-medium text-white">{order.symbol}</span>
                  </div>
                  <div className="col-span-1">
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      order.side === 'BUY'
                        ? 'bg-green-600/20 text-green-400'
                        : 'bg-red-600/20 text-red-400'
                    }`}>
                      {order.side === 'BUY' ? '买入' : '卖出'}
                    </span>
                  </div>
                  <div className="col-span-1 text-right text-sm text-slate-300">
                    {order.total_quantity.toFixed(order.total_quantity < 1 ? 4 : 2)}
                  </div>
                  <div className="col-span-2 text-right text-sm text-slate-300">
                    ${order.avg_price.toFixed(2)}
                  </div>
                  <div className="col-span-2 text-right">
                    {order.realized_pnl !== 0 ? (
                      <span className={`text-sm font-medium ${
                        order.realized_pnl > 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {order.realized_pnl > 0 ? '+' : ''}${order.realized_pnl.toFixed(2)}
                      </span>
                    ) : (
                      <span className="text-xs px-1.5 py-0.5 rounded bg-slate-800 text-slate-500">开仓</span>
                    )}
                  </div>
                  <div className="col-span-1 text-right text-xs text-slate-500">
                    ${order.commission.toFixed(2)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 底部信息 */}
      <div className="mt-3 pt-3 border-t border-slate-800 text-xs text-slate-500 flex justify-between">
        <span>数据来源: Binance Demo Trading (execution-service:8092)</span>
        <span>共 {filteredOrders.length} 笔订单 · {trades.length} 次成交</span>
      </div>
    </div>
  );
}
