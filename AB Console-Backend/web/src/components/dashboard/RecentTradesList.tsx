'use client';

import React from 'react';
import { History, ArrowUpCircle, ArrowDownCircle, MinusCircle } from 'lucide-react';
import type { TradeHistory } from '@/lib/executionApi';

// 机器人配置
const BOT_CONFIG: Record<string, { label: string; emoji: string }> = {
  'al-brooks': { label: 'PA交易', emoji: '🦁' },
  'trader': { label: '量化', emoji: '📊' },
  'wyckoff': { label: '威科夫', emoji: '🔮' },
};

// 按 order_id 聚合
interface AggOrder {
  order_id: string;
  symbol: string;
  side: string;
  quantity: number;
  price: number;
  realized_pnl: number;
  timestamp: string;
  bot_id: string | null;
}

function aggregate(trades: TradeHistory[]): AggOrder[] {
  const map = new Map<string, AggOrder>();
  for (const t of trades) {
    const e = map.get(t.order_id);
    if (e) {
      const total = e.price * e.quantity + t.price * t.quantity;
      e.quantity += t.quantity;
      e.price = total / e.quantity;
      e.realized_pnl += t.realized_pnl;
      if (!e.bot_id && t.bot_id) e.bot_id = t.bot_id;
    } else {
      map.set(t.order_id, {
        order_id: t.order_id,
        symbol: t.symbol.replace(':USDT', ''),
        side: t.side,
        quantity: t.quantity,
        price: t.price,
        realized_pnl: t.realized_pnl,
        timestamp: t.timestamp,
        bot_id: t.bot_id,
      });
    }
  }
  return Array.from(map.values())
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 8);
}

interface RecentTradesListProps {
  trades: TradeHistory[];
  isLoading: boolean;
}

export function RecentTradesList({ trades, isLoading }: RecentTradesListProps) {
  if (isLoading) {
    return (
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 animate-pulse">
        <div className="h-6 w-32 bg-slate-800 rounded mb-4" />
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 bg-slate-800 rounded" />
          ))}
        </div>
      </div>
    );
  }

  const orders = aggregate(trades);

  if (orders.length === 0) {
    return (
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">最近交易</h3>
        <p className="text-slate-400 text-sm">暂无交易记录</p>
      </div>
    );
  }

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">最近交易</h3>
        <span className="text-xs text-slate-500">来自币安</span>
      </div>

      <div className="space-y-2">
        {orders.map((order) => {
          const bot = order.bot_id ? BOT_CONFIG[order.bot_id] : null;
          const isBuy = order.side === 'BUY';
          const hasPnl = order.realized_pnl !== 0;
          return (
            <div
              key={order.order_id}
              className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <div className="flex items-center gap-3">
                {hasPnl ? (
                  order.realized_pnl > 0
                    ? <ArrowUpCircle className="w-4 h-4 text-green-400" />
                    : <ArrowDownCircle className="w-4 h-4 text-red-400" />
                ) : (
                  <MinusCircle className="w-4 h-4 text-slate-400" />
                )}
                <div>
                  <div className="flex items-center gap-2">
                    {bot && <span className="text-xs">{bot.emoji}</span>}
                    <span className="text-white font-medium text-sm">{order.symbol}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                      isBuy ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {isBuy ? '买' : '卖'}
                    </span>
                  </div>
                  <p className="text-slate-400 text-xs">
                    {formatTime(order.timestamp)} · ${order.price.toFixed(2)}
                  </p>
                </div>
              </div>
              <div className="text-right">
                {hasPnl ? (
                  <p className={`font-semibold text-sm ${order.realized_pnl > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {order.realized_pnl > 0 ? '+' : ''}${order.realized_pnl.toFixed(2)}
                  </p>
                ) : (
                  <p className="text-slate-500 text-sm">{order.quantity.toFixed(2)}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
