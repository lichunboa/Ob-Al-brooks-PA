'use client';

import React from 'react';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { TradeStats } from '@/lib/syncApi';

interface TradeStatsCardProps {
  stats: TradeStats | null;
  isLoading: boolean;
}

export function TradeStatsCard({ stats, isLoading }: TradeStatsCardProps) {
  if (isLoading) {
    return (
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 animate-pulse">
        <div className="h-6 w-32 bg-slate-800 rounded mb-4" />
        <div className="grid grid-cols-2 gap-4">
          <div className="h-16 bg-slate-800 rounded" />
          <div className="h-16 bg-slate-800 rounded" />
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">交易统计</h3>
        <p className="text-slate-400 text-sm">暂无数据</p>
      </div>
    );
  }

  const winRate = stats.win_rate || 0;
  const isProfitable = (stats.total_pnl_r || 0) > 0;

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">交易统计</h3>
        <Activity className="w-5 h-5 text-slate-500" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Total Trades */}
        <div className="bg-slate-800/50 rounded-lg p-4">
          <p className="text-slate-400 text-xs mb-1">总交易数</p>
          <p className="text-2xl font-bold text-white">{stats.total_trades}</p>
        </div>

        {/* Win Rate */}
        <div className="bg-slate-800/50 rounded-lg p-4">
          <p className="text-slate-400 text-xs mb-1">胜率</p>
          <div className="flex items-center gap-2">
            <p className={`text-2xl font-bold ${winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
              {winRate.toFixed(1)}%
            </p>
            {winRate >= 50 ? (
              <TrendingUp className="w-4 h-4 text-green-400" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-400" />
            )}
          </div>
        </div>

        {/* PnL R */}
        <div className="bg-slate-800/50 rounded-lg p-4">
          <p className="text-slate-400 text-xs mb-1">总盈亏 (R)</p>
          <p className={`text-2xl font-bold ${isProfitable ? 'text-green-400' : 'text-red-400'}`}>
            {stats.total_pnl_r > 0 ? '+' : ''}{stats.total_pnl_r?.toFixed(2) || '0.00'}
          </p>
        </div>

        {/* Avg PnL */}
        <div className="bg-slate-800/50 rounded-lg p-4">
          <p className="text-slate-400 text-xs mb-1">平均盈亏 (R)</p>
          <p className={`text-2xl font-bold ${(stats.avg_pnl_r || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {stats.avg_pnl_r > 0 ? '+' : ''}{stats.avg_pnl_r?.toFixed(2) || '0.00'}
          </p>
        </div>
      </div>

      {/* Win/Loss/Breakdown */}
      <div className="mt-4 pt-4 border-t border-slate-800">
        <div className="flex items-center justify-between text-sm">
          <span className="text-green-400">✓ 盈利: {stats.win_count}</span>
          <span className="text-red-400">✗ 亏损: {stats.loss_count}</span>
          <span className="text-slate-400">− 持平: {stats.breakeven_count}</span>
        </div>
      </div>
    </div>
  );
}
