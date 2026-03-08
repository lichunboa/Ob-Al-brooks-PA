'use client';

import { Activity, TrendingUp, Clock, Shield, DollarSign } from 'lucide-react';
import type { BotSummary, EvolutionSummary } from '@/lib/executionApi';
import { getBotConfig } from '@/lib/botConfig';

interface BotDetailPanelProps {
  botId: string;
  summary: BotSummary | null;
  evolution: EvolutionSummary | null;
}

export function BotDetailPanel({ botId, summary, evolution }: BotDetailPanelProps) {
  const bot = getBotConfig(botId);

  if (!summary) {
    return (
      <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-4">
        <p className="text-slate-400 text-sm">{bot?.emoji} {botId} 加载中...</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/50 rounded-lg border border-slate-700 p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-xl">{bot?.emoji}</span>
        <h4 className="text-white font-medium">{summary.config.name} 详情</h4>
        <span className={`text-xs px-2 py-0.5 rounded-full ${
          summary.can_trade
            ? 'bg-green-900/30 text-green-400'
            : 'bg-red-900/30 text-red-400'
        }`}>
          {summary.can_trade ? '可交易' : '已停止'}
        </span>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard
          icon={<Activity className="w-4 h-4" />}
          label="可用保证金"
          value={`$${summary.available_margin.toFixed(2)}`}
          color="text-blue-400"
        />
        <StatCard
          icon={<TrendingUp className="w-4 h-4" />}
          label="今日盈亏"
          value={`${(summary.daily_pnl.realized + summary.daily_pnl.unrealized) >= 0 ? '+' : ''}$${(summary.daily_pnl.realized + summary.daily_pnl.unrealized).toFixed(2)}`}
          color={(summary.daily_pnl.realized + summary.daily_pnl.unrealized) >= 0 ? 'text-green-400' : 'text-red-400'}
        />
        <StatCard
          icon={<Shield className="w-4 h-4" />}
          label="仓位"
          value={`${summary.config.max_positions - summary.remaining_positions}/${summary.config.max_positions}`}
          color="text-slate-300"
        />
        <StatCard
          icon={<Clock className="w-4 h-4" />}
          label="日亏损余额"
          value={`$${summary.risk_status.daily_loss_remaining.toFixed(0)} / $${Math.max(summary.config.daily_loss_limit, summary.config.allocated_usdt * (summary.config.daily_loss_pct || 5) / 100).toFixed(0)}`}
          color={summary.risk_status.daily_loss_ok ? 'text-slate-300' : 'text-red-400'}
        />
      </div>

      {/* 名义价值 (V3.0) */}
      {summary.notional && (
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-slate-900/50 rounded px-3 py-2">
            <div className="flex items-center gap-1 text-xs text-slate-400 mb-1">
              <DollarSign className="w-3 h-3" />
              单仓名义
            </div>
            <p className="text-sm font-medium text-slate-200">${summary.notional.max_per_position.toFixed(0)}</p>
          </div>
          <div className="bg-slate-900/50 rounded px-3 py-2">
            <p className="text-xs text-slate-400 mb-1">总名义容量</p>
            <p className="text-sm font-medium text-slate-200">${summary.notional.total_capacity.toFixed(0)}</p>
          </div>
          <div className="bg-slate-900/50 rounded px-3 py-2">
            <p className="text-xs text-slate-400 mb-1">杠杆</p>
            <p className="text-sm font-medium text-slate-200">{summary.notional.leverage}x</p>
          </div>
        </div>
      )}

      {/* Positions */}
      {summary.positions.length > 0 && (
        <div>
          <p className="text-xs text-slate-500 mb-2 uppercase tracking-wider">当前持仓</p>
          <div className="space-y-1">
            {summary.positions.map((pos) => (
              <div key={pos.symbol} className="flex items-center justify-between text-sm bg-slate-900/50 rounded px-3 py-1.5">
                <div className="flex items-center gap-2">
                  <span className={pos.side === 'LONG' ? 'text-green-400' : 'text-red-400'}>
                    {pos.side === 'LONG' ? '▲' : '▼'}
                  </span>
                  <span className="text-white">{pos.symbol}</span>
                  <span className="text-slate-500">{pos.leverage}x</span>
                </div>
                <span className={pos.unrealized_pnl >= 0 ? 'text-green-400' : 'text-red-400'}>
                  {pos.unrealized_pnl >= 0 ? '+' : ''}${pos.unrealized_pnl.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cooldowns */}
      {Object.keys(summary.risk_status.cooldowns).length > 0 && (
        <div>
          <p className="text-xs text-slate-500 mb-2 uppercase tracking-wider">冷却中品种</p>
          <div className="flex gap-2 flex-wrap">
            {Object.entries(summary.risk_status.cooldowns).map(([symbol, minutes]) => (
              <span key={symbol} className="text-xs bg-yellow-900/20 text-yellow-400 px-2 py-1 rounded">
                {symbol} ({minutes}分)
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Evolution Summary */}
      {evolution && (
        <div>
          <p className="text-xs text-slate-500 mb-2 uppercase tracking-wider">进化摘要</p>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div className="bg-slate-900/50 rounded px-3 py-2">
              <p className="text-slate-400 text-xs">成长阶段</p>
              <p className="text-white">{evolution.growth_stage}</p>
            </div>
            <div className="bg-slate-900/50 rounded px-3 py-2">
              <p className="text-slate-400 text-xs">总交易数</p>
              <p className="text-white">{evolution.total_trades}</p>
            </div>
            <div className="bg-slate-900/50 rounded px-3 py-2">
              <p className="text-slate-400 text-xs">冷却策略</p>
              <p className="text-white">{evolution.cooldown_strategies.length}</p>
            </div>
          </div>
          {evolution.top_strategies.length > 0 && (
            <div className="mt-2 space-y-1">
              {evolution.top_strategies.slice(0, 3).map((s) => (
                <div key={s.name} className="flex items-center justify-between text-xs bg-slate-900/50 rounded px-3 py-1.5">
                  <span className="text-slate-300">{s.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-500">{s.trades}笔 {s.wins}胜</span>
                    <span className={`font-medium ${
                      s.trend === 'up' ? 'text-green-400' : s.trend === 'down' ? 'text-red-400' : 'text-slate-400'
                    }`}>
                      W:{s.weight}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="bg-slate-900/50 rounded px-3 py-2">
      <div className="flex items-center gap-1 text-xs text-slate-400 mb-1">
        {icon}
        {label}
      </div>
      <p className={`text-sm font-medium ${color}`}>{value}</p>
    </div>
  );
}
