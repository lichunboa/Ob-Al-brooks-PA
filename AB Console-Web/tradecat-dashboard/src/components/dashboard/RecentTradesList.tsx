'use client';

import React from 'react';
import { History, ArrowUpCircle, ArrowDownCircle, MinusCircle } from 'lucide-react';
import { TradeRecord } from '@/lib/syncApi';

interface RecentTradesListProps {
  trades: TradeRecord[];
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

  if (trades.length === 0) {
    return (
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">最近交易</h3>
        <p className="text-slate-400 text-sm">暂无交易记录</p>
      </div>
    );
  }

  const getResultIcon = (result?: string) => {
    switch (result) {
      case 'win':
        return <ArrowUpCircle className="w-4 h-4 text-green-400" />;
      case 'loss':
        return <ArrowDownCircle className="w-4 h-4 text-red-400" />;
      default:
        return <MinusCircle className="w-4 h-4 text-slate-400" />;
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">最近交易</h3>
        <History className="w-5 h-5 text-slate-500" />
      </div>

      <div className="space-y-2">
        {trades.map((trade) => (
          <div
            key={trade.id}
            className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <div className="flex items-center gap-3">
              {getResultIcon(trade.result)}
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-white font-medium text-sm">{trade.symbol}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded ${
                    trade.direction === 'long' 
                      ? 'bg-green-500/20 text-green-400' 
                      : 'bg-red-500/20 text-red-400'
                  }`}>
                    {trade.direction === 'long' ? '多' : '空'}
                  </span>
                </div>
                <p className="text-slate-400 text-xs">
                  {formatDate(trade.trade_date)} · {trade.strategy_name || '无策略'}
                </p>
              </div>
            </div>
            <div className="text-right">
              {trade.pnl_r !== undefined ? (
                <p className={`font-semibold text-sm ${trade.pnl_r >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {trade.pnl_r > 0 ? '+' : ''}{trade.pnl_r.toFixed(2)} R
                </p>
              ) : (
                <p className="text-slate-500 text-sm">--</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
