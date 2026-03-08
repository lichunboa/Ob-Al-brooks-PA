'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  RefreshCw,
  AlertCircle, Filter, Clock
} from 'lucide-react';
import {
  getTradeHistory, getAccountSummary, getPositions,
  type TradeHistory, type AccountSummary, type Position
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

// 配对交易（开仓+平仓）
interface PairedTrade {
  symbol: string;
  bot_id: string | null;
  direction: 'LONG' | 'SHORT';
  entry_price: number;
  exit_price: number;
  quantity: number;
  entry_time: string;
  exit_time: string;
  realized_pnl: number;
  total_commission: number;
  net_pnl: number;
  duration_seconds: number;
  duration_display: string;
  leverage: number | null;
  outcome: string;
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

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分${seconds % 60}秒`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}时${m}分`;
}

// 配对交易：将开仓和平仓订单匹配
function pairTrades(
  orders: AggregatedOrder[],
  posLeverage: Record<string, number>
): PairedTrade[] {
  const closes = orders.filter((o) => o.realized_pnl !== 0);
  const opens = orders.filter((o) => o.realized_pnl === 0);
  const paired: PairedTrade[] = [];
  const usedOpens = new Set<string>();

  for (const close of closes) {
    // 找匹配的开仓：同品种、同 bot、反方向、时间更早
    const match = opens.find((o) =>
      o.symbol === close.symbol &&
      o.bot_id === close.bot_id &&
      o.side !== close.side &&
      !usedOpens.has(o.order_id) &&
      new Date(o.timestamp).getTime() < new Date(close.timestamp).getTime()
    );

    if (!match) continue;
    usedOpens.add(match.order_id);

    const entryTime = new Date(match.timestamp).getTime();
    const exitTime = new Date(close.timestamp).getTime();
    const durationSec = Math.floor((exitTime - entryTime) / 1000);
    const totalComm = match.commission + close.commission;
    const netPnl = close.realized_pnl - totalComm;
    const symClean = close.symbol.replace('/', '').replace(':USDT', '');
    const leverage = posLeverage[symClean] ?? null;

    paired.push({
      symbol: close.symbol,
      bot_id: close.bot_id,
      direction: match.side === 'BUY' ? 'LONG' : 'SHORT',
      entry_price: match.avg_price,
      exit_price: close.avg_price,
      quantity: match.total_quantity,
      entry_time: match.timestamp,
      exit_time: close.timestamp,
      realized_pnl: close.realized_pnl,
      total_commission: totalComm,
      net_pnl: netPnl,
      duration_seconds: durationSec,
      duration_display: formatDuration(durationSec),
      leverage,
      outcome: close.realized_pnl > 0 ? '盈利' : '亏损',
    });
  }

  return paired.sort(
    (a, b) => new Date(b.exit_time).getTime() - new Date(a.exit_time).getTime()
  );
}

export default function TradesPage() {
  const [trades, setTrades] = useState<TradeHistory[]>([]);
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedBot, setSelectedBot] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'orders' | 'paired'>('paired');

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [tradesData, summaryData, posData] = await Promise.all([
        getTradeHistory(undefined, 500),
        getAccountSummary(),
        getPositions().catch(() => [] as Position[]),
      ]);
      setTrades(tradesData);
      setSummary(summaryData);
      setPositions(posData);
    } catch (e) {
      console.error('获取币安交易数据失败:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // 持仓杠杆映射
  const posLeverage = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of positions) {
      const sym = p.symbol.replace('/', '').replace(':USDT', '');
      map[sym] = p.leverage;
    }
    return map;
  }, [positions]);

  // 聚合订单
  const orders = useMemo(() => aggregateByOrder(trades), [trades]);

  // 配对交易
  const pairedTrades = useMemo(
    () => pairTrades(orders, posLeverage),
    [orders, posLeverage]
  );

  // 按 bot 筛选
  const filteredOrders = useMemo(() => {
    if (!selectedBot) return orders;
    return orders.filter((o) => o.bot_id === selectedBot);
  }, [orders, selectedBot]);

  const filteredPaired = useMemo(() => {
    if (!selectedBot) return pairedTrades;
    return pairedTrades.filter((p) => p.bot_id === selectedBot);
  }, [pairedTrades, selectedBot]);

  // 统计（基于配对交易）
  const stats = useMemo(() => {
    const pData = filteredPaired;
    const totalPnl = pData.reduce((s, p) => s + p.realized_pnl, 0);
    const totalCommission = pData.reduce((s, p) => s + p.total_commission, 0);
    const netPnl = totalPnl - totalCommission;
    const wins = pData.filter((p) => p.realized_pnl > 0).length;
    const losses = pData.filter((p) => p.realized_pnl < 0).length;
    const avgDuration = pData.length > 0
      ? pData.reduce((s, p) => s + p.duration_seconds, 0) / pData.length
      : 0;
    return {
      totalOrders: filteredOrders.length,
      pairedCount: pData.length,
      totalPnl,
      totalCommission,
      netPnl,
      wins,
      losses,
      winRate: pData.length > 0 ? (wins / pData.length) * 100 : 0,
      avgDuration: formatDuration(Math.floor(avgDuration)),
    };
  }, [filteredPaired, filteredOrders]);

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
      <div className="grid grid-cols-7 gap-3 mb-4">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
          <div className="text-xs text-slate-500">配对交易 / 总订单</div>
          <div className="text-2xl font-bold text-white">
            {stats.pairedCount} <span className="text-sm text-slate-500">/ {stats.totalOrders}</span>
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
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
          <div className="text-xs text-slate-500">平均持仓</div>
          <div className="text-lg font-bold text-slate-300 flex items-center gap-1">
            <Clock className="w-4 h-4" />
            {stats.avgDuration}
          </div>
        </div>
      </div>

      {/* 机器人筛选 + 视图切换 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
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
        <div className="flex items-center gap-1 bg-slate-800/50 rounded-lg p-0.5">
          <button
            onClick={() => setViewMode('paired')}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              viewMode === 'paired' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            配对交易
          </button>
          <button
            onClick={() => setViewMode('orders')}
            className={`px-3 py-1 text-xs rounded-md transition-colors ${
              viewMode === 'orders' ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            全部订单
          </button>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 overflow-auto">
        {viewMode === 'paired' ? (
          /* 配对交易视图 */
          filteredPaired.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <AlertCircle className="w-12 h-12 mb-4 opacity-30" />
              <p>暂无配对交易</p>
              <p className="text-sm mt-2">需要有完整的开仓+平仓才能配对</p>
            </div>
          ) : (
            <div className="space-y-1">
              {/* 表头 */}
              <div className="grid grid-cols-12 gap-2 px-4 py-2 text-xs text-slate-500 border-b border-slate-800">
                <div className="col-span-1">机器人</div>
                <div className="col-span-1">品种</div>
                <div className="col-span-1">方向</div>
                <div className="col-span-2">入场 / 出场</div>
                <div className="col-span-1 text-right">杠杆</div>
                <div className="col-span-1 text-right">持仓时长</div>
                <div className="col-span-1 text-right">盈亏</div>
                <div className="col-span-1 text-right">手续费</div>
                <div className="col-span-1 text-right">净盈亏</div>
                <div className="col-span-2 text-right">平仓时间</div>
              </div>

              {filteredPaired.map((pt, idx) => {
                const bot = getBotInfo(pt.bot_id);
                return (
                  <div
                    key={idx}
                    className="grid grid-cols-12 gap-2 px-4 py-2.5 rounded-lg bg-slate-900/50 border border-slate-800/50 hover:border-slate-700 items-center"
                  >
                    <div className="col-span-1">
                      <span className={`text-sm ${bot.color}`} title={bot.label}>
                        {bot.emoji}
                      </span>
                    </div>
                    <div className="col-span-1">
                      <span className="text-sm font-medium text-white">{pt.symbol}</span>
                    </div>
                    <div className="col-span-1">
                      <span className={`text-xs px-1.5 py-0.5 rounded ${
                        pt.direction === 'LONG'
                          ? 'bg-green-600/20 text-green-400'
                          : 'bg-red-600/20 text-red-400'
                      }`}>
                        {pt.direction === 'LONG' ? '做多' : '做空'}
                      </span>
                    </div>
                    <div className="col-span-2 text-xs text-slate-300">
                      <div>${pt.entry_price.toFixed(2)}</div>
                      <div className="text-slate-500">${pt.exit_price.toFixed(2)}</div>
                    </div>
                    <div className="col-span-1 text-right text-sm text-slate-300">
                      {pt.leverage ? `${pt.leverage}x` : '-'}
                    </div>
                    <div className="col-span-1 text-right text-xs text-slate-400">
                      {pt.duration_display}
                    </div>
                    <div className="col-span-1 text-right">
                      <span className={`text-sm font-medium ${
                        pt.realized_pnl > 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {pt.realized_pnl > 0 ? '+' : ''}${pt.realized_pnl.toFixed(2)}
                      </span>
                    </div>
                    <div className="col-span-1 text-right text-xs text-orange-400">
                      ${pt.total_commission.toFixed(2)}
                    </div>
                    <div className="col-span-1 text-right">
                      <span className={`text-sm font-bold ${
                        pt.net_pnl > 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {pt.net_pnl > 0 ? '+' : ''}${pt.net_pnl.toFixed(2)}
                      </span>
                    </div>
                    <div className="col-span-2 text-right text-xs text-slate-400">
                      {formatTime(pt.exit_time)}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          /* 全部订单视图 */
          filteredOrders.length === 0 ? (
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
          )
        )}
      </div>

      {/* 底部信息 */}
      <div className="mt-3 pt-3 border-t border-slate-800 text-xs text-slate-500 flex justify-between">
        <span>数据来源: Binance Demo Trading (execution-service:8092)</span>
        <span>
          {viewMode === 'paired'
            ? `${filteredPaired.length} 笔配对交易`
            : `${filteredOrders.length} 笔订单 · ${trades.length} 次成交`
          }
        </span>
      </div>
    </div>
  );
}
