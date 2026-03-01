'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  Bot,
  Activity,
  TrendingUp,
  TrendingDown,
  Zap,
  Clock,
  BarChart3,
  RefreshCw,
  CircleDot,
  ArrowUpCircle,
  ArrowDownCircle,
} from 'lucide-react';

interface BotStatus {
  alive: boolean;
  pid: number | null;
  uptime_cycles: number;
}

interface Signal {
  cycle_id: string;
  cycle_time: string;
  symbol: string;
  timeframe: string;
  side: string;
  strategy: string;
  entry: number;
  stop_loss: number;
  take_profit: number;
  score: number;
  scores_detail: Record<string, number>;
  ai_direction: string;
  market_state: string;
  reason: string;
  executed: boolean;
}

interface Trade {
  cycle_id: string;
  cycle_time: string;
  signal: {
    symbol: string;
    timeframe: string;
    side: string;
    strategy: string;
    entry: number;
    stop_loss: number;
    take_profit: number;
    score: number;
    scores_detail: Record<string, number>;
    ai_direction: string;
    market_state: string;
    reason: string;
  };
  result: {
    success: boolean;
    order_id: string;
    symbol: string;
    side: string;
    quantity: number;
    price: number;
    timestamp: string;
    bot_id: string;
  };
}

interface Summary {
  total_cycles: number;
  total_trades: number;
  successful_trades: number;
  total_signals_scanned: number;
  signals_above_threshold: number;
  avg_score: number;
  direction: { buy: number; sell: number };
  by_strategy: Record<string, number>;
  by_symbol: Record<string, number>;
  by_market_state: Record<string, number>;
  latest_status: {
    available_margin: number;
    daily_pnl: { realized: number; unrealized: number };
    remaining_positions: number;
  };
  latest_timestamp: string;
}

interface PABotData {
  bot: BotStatus;
  summary: Summary | null;
  recent_trades: Trade[];
  recent_signals: Signal[];
  total_cycles: number;
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return '刚刚';
  if (mins < 60) return `${mins}分钟前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}小时前`;
  return `${Math.floor(hrs / 24)}天前`;
}

function ScoreBar({ score }: { score: number }) {
  const color = score >= 80 ? 'bg-green-500' : score >= 65 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-2 bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${score}%` }} />
      </div>
      <span className="text-xs text-slate-400">{score}</span>
    </div>
  );
}

function StatCard({ label, value, sub, icon: Icon, color = 'text-white' }: {
  label: string; value: string | number; sub?: string;
  icon: React.ComponentType<{ className?: string }>; color?: string;
}) {
  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-slate-400">{label}</span>
      </div>
      <div className={`text-xl font-bold ${color}`}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-1">{sub}</div>}
    </div>
  );
}

export default function PABotPage() {
  const [data, setData] = useState<PABotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'trades' | 'signals'>('trades');

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/pa-bot?mode=full');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('PA Bot fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 30_000); // refresh every 30s
    return () => clearInterval(iv);
  }, [fetchData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 text-slate-500 animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-8 text-center">
        <Bot className="w-12 h-12 text-slate-600 mx-auto mb-3" />
        <p className="text-slate-400">Claude PA 未运行或无数据</p>
        <p className="text-xs text-slate-600 mt-2">在 Claude Code 中运行 /patrol 开始交易</p>
      </div>
    );
  }

  const { bot, summary, recent_trades, recent_signals } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${bot.alive ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
          <h1 className="text-xl font-bold text-white">Claude PA</h1>
          <span className="text-xs text-slate-500">Al Brooks PA 交易员</span>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-slate-300 bg-slate-800 border border-slate-700 rounded-lg hover:bg-slate-700 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          刷新
        </button>
      </div>

      {/* Stats Row */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <StatCard
            label="总交易" value={summary.total_trades}
            sub={`${summary.successful_trades} 成功`}
            icon={Zap} color="text-blue-400"
          />
          <StatCard
            label="扫描信号" value={summary.total_signals_scanned}
            sub={`${summary.signals_above_threshold} 达标`}
            icon={Activity} color="text-purple-400"
          />
          <StatCard
            label="平均分" value={summary.avg_score}
            sub="执行交易"
            icon={BarChart3} color="text-yellow-400"
          />
          <StatCard
            label="可用保证金"
            value={`$${summary.latest_status.available_margin.toFixed(0)}`}
            sub={`剩余 ${summary.latest_status.remaining_positions} 仓`}
            icon={CircleDot} color="text-green-400"
          />
          <StatCard
            label="日已实现"
            value={`$${summary.latest_status.daily_pnl.realized.toFixed(2)}`}
            icon={TrendingUp}
            color={summary.latest_status.daily_pnl.realized >= 0 ? 'text-green-400' : 'text-red-400'}
          />
          <StatCard
            label="运行周期" value={data.total_cycles}
            sub={summary.latest_timestamp ? timeAgo(summary.latest_timestamp) : ''}
            icon={Clock} color="text-slate-300"
          />
        </div>
      )}

      {/* Strategy & Direction Breakdown */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Direction */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-300 mb-3">方向分布</h3>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <ArrowUpCircle className="w-4 h-4 text-green-400" />
                <span className="text-green-400 font-bold">{summary.direction.buy}</span>
                <span className="text-xs text-slate-500">BUY</span>
              </div>
              <div className="flex items-center gap-2">
                <ArrowDownCircle className="w-4 h-4 text-red-400" />
                <span className="text-red-400 font-bold">{summary.direction.sell}</span>
                <span className="text-xs text-slate-500">SELL</span>
              </div>
            </div>
            {(summary.direction.buy + summary.direction.sell) > 0 && (
              <div className="mt-2 h-2 bg-slate-700 rounded-full overflow-hidden flex">
                <div
                  className="h-full bg-green-500"
                  style={{ width: `${(summary.direction.buy / (summary.direction.buy + summary.direction.sell)) * 100}%` }}
                />
                <div className="h-full bg-red-500 flex-1" />
              </div>
            )}
          </div>

          {/* Strategy */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-300 mb-3">策略分布</h3>
            <div className="space-y-1.5">
              {Object.entries(summary.by_strategy)
                .sort(([, a], [, b]) => b - a)
                .map(([strategy, count]) => (
                  <div key={strategy} className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">{strategy}</span>
                    <span className="text-xs font-mono text-slate-300">{count}</span>
                  </div>
                ))}
            </div>
          </div>

          {/* Symbol */}
          <div className="bg-slate-800/50 border border-slate-700 rounded-xl p-4">
            <h3 className="text-sm font-semibold text-slate-300 mb-3">品种分布</h3>
            <div className="space-y-1.5">
              {Object.entries(summary.by_symbol)
                .sort(([, a], [, b]) => b - a)
                .map(([sym, count]) => (
                  <div key={sym} className="flex items-center justify-between">
                    <span className="text-xs text-slate-400">{sym.replace('USDT', '')}</span>
                    <span className="text-xs font-mono text-slate-300">{count}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Tabs: Trades / Signals */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-xl">
        <div className="flex border-b border-slate-700">
          <button
            onClick={() => setTab('trades')}
            className={`px-4 py-3 text-sm font-medium transition-colors ${
              tab === 'trades' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-400 hover:text-white'
            }`}
          >
            交易记录 ({recent_trades.length})
          </button>
          <button
            onClick={() => setTab('signals')}
            className={`px-4 py-3 text-sm font-medium transition-colors ${
              tab === 'signals' ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-400 hover:text-white'
            }`}
          >
            信号日志 ({recent_signals.length})
          </button>
        </div>

        <div className="p-4">
          {tab === 'trades' && (
            <div className="overflow-x-auto">
              {recent_trades.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">暂无交易记录</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 border-b border-slate-700">
                      <th className="py-2 text-left">时间</th>
                      <th className="py-2 text-left">品种</th>
                      <th className="py-2 text-left">方向</th>
                      <th className="py-2 text-left">策略</th>
                      <th className="py-2 text-right">价格</th>
                      <th className="py-2 text-right">数量</th>
                      <th className="py-2 text-right">SL</th>
                      <th className="py-2 text-right">TP</th>
                      <th className="py-2 text-center">分数</th>
                      <th className="py-2 text-left">市场状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent_trades.map((t, i) => (
                      <tr key={`${t.result.order_id}-${i}`} className="border-b border-slate-800 hover:bg-slate-700/30">
                        <td className="py-2.5 text-slate-400 text-xs">
                          {new Date(t.result.timestamp).toLocaleString('zh-CN', {
                            month: '2-digit', day: '2-digit',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </td>
                        <td className="py-2.5 font-mono text-slate-200">
                          {t.signal.symbol.replace('USDT', '')}
                        </td>
                        <td className="py-2.5">
                          <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${
                            t.signal.side === 'BUY'
                              ? 'bg-green-900/40 text-green-400'
                              : 'bg-red-900/40 text-red-400'
                          }`}>
                            {t.signal.side === 'BUY' ? (
                              <ArrowUpCircle className="w-3 h-3" />
                            ) : (
                              <ArrowDownCircle className="w-3 h-3" />
                            )}
                            {t.signal.side}
                          </span>
                        </td>
                        <td className="py-2.5 text-slate-300">{t.signal.strategy}</td>
                        <td className="py-2.5 text-right font-mono text-slate-200">
                          {t.result.price != null ? t.result.price.toFixed(t.result.price > 100 ? 1 : 2) : '-'}
                        </td>
                        <td className="py-2.5 text-right font-mono text-slate-400">{t.result.quantity ?? '-'}</td>
                        <td className="py-2.5 text-right font-mono text-red-400/70 text-xs">
                          {t.signal.stop_loss.toFixed(t.signal.stop_loss > 100 ? 1 : 2)}
                        </td>
                        <td className="py-2.5 text-right font-mono text-green-400/70 text-xs">
                          {t.signal.take_profit.toFixed(t.signal.take_profit > 100 ? 1 : 2)}
                        </td>
                        <td className="py-2.5 text-center">
                          <ScoreBar score={t.signal.score} />
                        </td>
                        <td className="py-2.5 text-xs text-slate-500">{t.signal.market_state}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'signals' && (
            <div className="overflow-x-auto">
              {recent_signals.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">暂无信号记录</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-slate-500 border-b border-slate-700">
                      <th className="py-2 text-left">时间</th>
                      <th className="py-2 text-left">品种</th>
                      <th className="py-2 text-left">方向</th>
                      <th className="py-2 text-left">策略</th>
                      <th className="py-2 text-center">分数</th>
                      <th className="py-2 text-left">AI</th>
                      <th className="py-2 text-left">状态</th>
                      <th className="py-2 text-left">原因</th>
                      <th className="py-2 text-center">执行</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recent_signals.map((s, i) => (
                      <tr key={`${s.cycle_id}-${s.symbol}-${s.strategy}-${i}`} className="border-b border-slate-800 hover:bg-slate-700/30">
                        <td className="py-2.5 text-slate-400 text-xs">
                          {new Date(s.cycle_time).toLocaleString('zh-CN', {
                            month: '2-digit', day: '2-digit',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </td>
                        <td className="py-2.5 font-mono text-slate-200">
                          {s.symbol.replace('USDT', '')}
                        </td>
                        <td className="py-2.5">
                          <span className={`text-xs font-medium ${
                            s.side === 'BUY' ? 'text-green-400' : 'text-red-400'
                          }`}>
                            {s.side}
                          </span>
                        </td>
                        <td className="py-2.5 text-slate-300">{s.strategy}</td>
                        <td className="py-2.5 text-center">
                          <ScoreBar score={s.score} />
                        </td>
                        <td className="py-2.5 text-xs">
                          <span className={s.ai_direction === 'AIL' ? 'text-green-400' : s.ai_direction === 'AIS' ? 'text-red-400' : 'text-slate-400'}>
                            {s.ai_direction}
                          </span>
                        </td>
                        <td className="py-2.5 text-xs text-slate-500">{s.market_state}</td>
                        <td className="py-2.5 text-xs text-slate-400 max-w-[200px] truncate" title={s.reason}>
                          {s.reason}
                        </td>
                        <td className="py-2.5 text-center">
                          {s.executed ? (
                            <span className="text-green-400 text-xs font-medium">已执行</span>
                          ) : (
                            <span className="text-slate-600 text-xs">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
