'use client';

import React from 'react';
import { Trophy } from 'lucide-react';
import { StrategyPerformance } from '@/lib/syncApi';

interface StrategyPerformanceListProps {
  strategies: StrategyPerformance[];
  isLoading: boolean;
}

export function StrategyPerformanceList({ strategies, isLoading }: StrategyPerformanceListProps) {
  if (isLoading) {
    return (
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 animate-pulse">
        <div className="h-6 w-32 bg-slate-800 rounded mb-4" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-slate-800 rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (strategies.length === 0) {
    return (
      <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
        <h3 className="text-lg font-semibold text-white mb-4">策略表现</h3>
        <p className="text-slate-400 text-sm">暂无策略数据</p>
      </div>
    );
  }

  // Sort by total PnL
  const sortedStrategies = [...strategies].sort((a, b) => b.total_pnl_r - a.total_pnl_r);

  return (
    <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-white">策略表现</h3>
        <Trophy className="w-5 h-5 text-yellow-500" />
      </div>

      <div className="space-y-3 max-h-64 overflow-y-auto">
        {sortedStrategies.slice(0, 5).map((strategy, index) => (
          <div
            key={strategy.strategy_name}
            className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className={`
                w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                ${index === 0 ? 'bg-yellow-500/20 text-yellow-500' : 
                  index === 1 ? 'bg-slate-400/20 text-slate-400' : 
                  index === 2 ? 'bg-orange-500/20 text-orange-500' : 
                  'bg-slate-700 text-slate-500'}
              `}>
                {index + 1}
              </span>
              <div>
                <p className="text-white font-medium text-sm">{strategy.strategy_name}</p>
                <p className="text-slate-400 text-xs">
                  {strategy.trade_count} 笔交易 · {strategy.win_rate.toFixed(1)}% 胜率
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className={`font-semibold ${strategy.total_pnl_r >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {strategy.total_pnl_r > 0 ? '+' : ''}{strategy.total_pnl_r.toFixed(2)} R
              </p>
              <p className="text-slate-500 text-xs">
                avg {strategy.avg_pnl_r > 0 ? '+' : ''}{strategy.avg_pnl_r.toFixed(2)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {sortedStrategies.length > 5 && (
        <p className="text-slate-500 text-xs mt-3 text-center">
          还有 {sortedStrategies.length - 5} 个策略...
        </p>
      )}
    </div>
  );
}
