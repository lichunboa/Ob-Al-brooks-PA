'use client';

import React, { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDot,
  Clock,
  Database,
  FileJson,
  RefreshCw,
  Shield,
  XCircle,
} from 'lucide-react';

interface MetricCardProps {
  label: string;
  value: string;
  sub?: string;
}

interface SymbolCardData {
  symbol: string;
  status: string;
  stage: string;
  ai_direction: string;
  market_state: string;
  thesis: string;
  structure_summary: string;
  pre_signal: string;
  execution_summary: string;
  brooks_label: string;
  upgrade_condition: string;
  planned_action: string;
  refs: string[];
  risk: string;
  order_type: string;
  entry_price: number | null;
  execution_mode: string;
}

interface RecentCycle {
  cycleId: string;
  phase: string;
  nextScanSeconds: number | null;
  focusSymbols: string[];
  summary: string;
}

interface RecentDecision {
  loggedAt: string;
  cycleId: string;
  summary: string;
  actionsCount: number;
  focusSymbols: string[];
}

interface RecentExecution {
  loggedAt: string;
  cycleId: string;
  symbol: string;
  status: string;
  message: string;
  success: boolean | null;
}

interface ThemeItem {
  label: string;
  count: number;
}

interface RuntimeData {
  runtimeKey: string;
  runtimeLabel: string;
  source: 'query-service' | 'fallback';
  queryUrl: string | null;
  health: {
    overall: string;
    cycleFresh: boolean | null;
    freshnessLabel: string;
    cycleAgeSeconds: number | null;
    patrolLive: boolean;
    queryLive: boolean;
    executionPortOpen: boolean;
  };
  runtime: {
    botId: string;
    exchange: string;
    marketProfile: string;
    phase: string;
    focusSymbols: string[];
    activeSymbols: string[];
    dryRun: boolean;
    bestCandidate: string;
    bestCandidateStatus: string;
    tradeReadiness: string;
    lastScanDecision: string;
    llmProvider: string;
    decisionModel: string;
    decisionSessionId: string;
    riskMode: string;
  };
  summary: {
    cycleId: string | null;
    marketSummary: string;
    explanation: string;
    actionsCount: number;
    positionManagementCount: number;
    readingTargets: {
      barCountTotal: number | null;
      browseTargetBars: number | null;
      closeReadTargetBars: number | null;
    };
    promptReferences: string[];
  };
  execution: {
    exchange: string;
    accountAsset: string;
    canTrade: boolean | null;
    canTradeReason: string;
    positionsCount: number;
    ordersCount: number;
    healthStatus: string;
  };
  timestamps: {
    latestCycleAt: string | null;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    lastFailureReason: string | null;
  };
  monitoring: {
    knowledgeChars: number | null;
    refsCount: number;
    fullRefsCount: number;
    briefRefsCount: number;
    requestChars: number | null;
    requestSizeBytes: number | null;
    sessionAgeSeconds: number | null;
    sessionTurnCount: number | null;
    sessionModel: string | null;
  };
  nextScan: {
    inSeconds: number | null;
    requestedSeconds: number | null;
    modelSuggestedSeconds: number | null;
    modelSuggestedReason: string;
    reasonCode: string;
    reasonText: string;
    bucketRule: string;
    bucketSourceRefs: string[];
  };
  symbols: SymbolCardData[];
  recentCycles: RecentCycle[];
  recentDecisions: RecentDecision[];
  recentExecutions: RecentExecution[];
  funnel: {
    counts: {
      filled: number;
      candidateExecutionFailed: number;
      candidateGateRejected: number;
      preSignalOnly: number;
    };
    topThemes: ThemeItem[];
  };
}

interface RuntimeBundle {
  generatedAt: string;
  primary: RuntimeData | null;
  secondary: RuntimeData | null;
  runtimes: RuntimeData[];
}

function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function timeAgo(value: string | null): string {
  if (!value) return '-';
  const diffMs = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diffMs)) return '-';
  const seconds = Math.max(0, Math.floor(diffMs / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时`;
  return `${Math.floor(hours / 24)} 天`;
}

function formatNumber(value: number | null, suffix = ''): string {
  if (value === null || Number.isNaN(value)) return '-';
  return `${value}${suffix}`;
}

function marketTitle(profile: string, exchange: string): string {
  const normalizedProfile = profile.toLowerCase();
  const normalizedExchange = exchange.toLowerCase();
  if (normalizedExchange === 'ctrader' || normalizedProfile.includes('multi')) {
    return 'PA交易 Multi-Asset';
  }
  if (normalizedExchange === 'okx' || normalizedProfile.includes('swap')) {
    return 'PA交易 OKX';
  }
  return 'PA交易 Crypto';
}

function marketSubtitle(profile: string, exchange: string, asset: string): string {
  const normalizedExchange = exchange.toLowerCase();
  const normalizedProfile = profile.toLowerCase();
  if (normalizedExchange === 'ctrader' || normalizedProfile.includes('multi')) {
    return `cTrader ${asset || 'USD'} · 外汇 / 指数 / 贵金属`;
  }
  if (normalizedExchange === 'okx' || normalizedProfile.includes('swap')) {
    return `OKX ${asset || 'USDT'} · 永续合约`;
  }
  return `Binance ${asset || 'USDT'} · 合约`;
}

function statusLabel(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized.includes('executable')) return 'executable';
  if (normalized.includes('candidate')) return 'candidate';
  if (normalized.includes('pre')) return 'pre-signal';
  if (normalized.includes('watch')) return 'watch';
  if (normalized.includes('trade')) return 'in-trade';
  return value || 'unknown';
}

function statusTone(value: string): string {
  const normalized = value.toLowerCase();
  if (normalized.includes('executable')) return 'border-cyan-500/40 bg-cyan-500/10 text-cyan-200';
  if (normalized.includes('candidate')) return 'border-slate-500/40 bg-slate-500/10 text-slate-200';
  if (normalized.includes('pre')) return 'border-amber-500/40 bg-amber-500/10 text-amber-200';
  if (normalized.includes('trade')) return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200';
  return 'border-slate-600/40 bg-slate-700/20 text-slate-300';
}

function healthTone(value: string): string {
  const normalized = value.toUpperCase();
  if (normalized === 'HEALTHY') return 'text-emerald-300';
  if (normalized === 'DEGRADED') return 'text-amber-300';
  return 'text-rose-300';
}

function MetricCard({ label, value, sub }: MetricCardProps) {
  return (
    <div className="rounded-2xl border border-white/12 bg-black/20 px-4 py-4 backdrop-blur">
      <div className="text-xs uppercase tracking-[0.22em] text-slate-400">{label}</div>
      <div className="mt-3 text-4xl font-semibold text-white">{value}</div>
      {sub ? <div className="mt-2 text-sm text-slate-400">{sub}</div> : null}
    </div>
  );
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[26px] border border-white/10 bg-slate-950/70 p-5 shadow-[0_24px_80px_rgba(0,0,0,0.32)]">
      <div className="mb-4 flex items-center gap-2 text-slate-400">
        <Icon className="h-4 w-4" />
        <h2 className="text-sm tracking-[0.18em]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function PABotPage() {
  const [bundle, setBundle] = useState<RuntimeBundle | null>(null);
  const [selectedRuntimeKey, setSelectedRuntimeKey] = useState('primary');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch('/api/pa-bot/runtime', { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        const payload = (await response.json()) as RuntimeBundle;
        if (!cancelled) {
          setBundle(payload);
          setSelectedRuntimeKey((current) =>
            payload.runtimes.some((item) => item.runtimeKey === current)
              ? current
              : payload.runtimes[0]?.runtimeKey || 'primary',
          );
          setError('');
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : '加载失败');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    const timer = window.setInterval(load, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const runtimes = bundle?.runtimes ?? [];
  const data =
    runtimes.find((item) => item.runtimeKey === selectedRuntimeKey) ||
    bundle?.primary ||
    runtimes[0] ||
    null;

  if (loading) {
    return (
      <div className="flex h-72 items-center justify-center">
        <RefreshCw className="h-7 w-7 animate-spin text-slate-500" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-[26px] border border-rose-500/20 bg-rose-950/10 p-8 text-center">
        <Bot className="mx-auto h-12 w-12 text-rose-300/70" />
        <p className="mt-4 text-lg text-white">PA 运行态不可用</p>
        <p className="mt-2 text-sm text-slate-400">{error || '没有拿到巡逻数据'}</p>
      </div>
    );
  }

  const summaryText = data.summary.marketSummary || data.runtime.lastScanDecision || '暂无本轮结论';
  const canTradeText =
    data.execution.canTrade === null ? '待确认' : data.execution.canTrade ? '可以' : '等待';
  const healthText = `${data.health.overall}`;
  const healthSub = `${data.health.freshnessLabel} / ${data.execution.healthStatus || '执行状态未知'}`;
  const queryConnectedText = data.health.queryLive ? '已连接' : '未连接';
  const recentDecision = data.recentDecisions[0];
  const currentExchange = data.execution.exchange || data.runtime.exchange || 'binance';
  const currentAsset = data.execution.accountAsset || 'USDT';
  const title = marketTitle(data.runtime.marketProfile, currentExchange);
  const subtitle = marketSubtitle(data.runtime.marketProfile, currentExchange, currentAsset);
  const lastAggregatedAt = bundle?.generatedAt ? formatDateTime(bundle.generatedAt) : '-';

  return (
    <div className="space-y-6">
      {runtimes.length > 1 ? (
        <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
          {runtimes.map((item) => {
            const exchange = item.execution.exchange || item.runtime.exchange || 'binance';
            const asset = item.execution.accountAsset || 'USDT';
            const selected = item.runtimeKey === data.runtimeKey;
            return (
              <button
                key={item.runtimeKey}
                type="button"
                onClick={() => setSelectedRuntimeKey(item.runtimeKey)}
                className={cn(
                  'rounded-[24px] border p-5 text-left transition',
                  selected
                    ? 'border-amber-400/40 bg-amber-400/8 shadow-[0_18px_45px_rgba(245,158,11,0.12)]'
                    : 'border-white/10 bg-slate-950/60 hover:border-white/20 hover:bg-slate-900/80',
                )}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-[0.28em] text-slate-500">{item.runtimeLabel}</div>
                    <div className="mt-2 text-2xl font-semibold text-white">
                      {marketTitle(item.runtime.marketProfile, exchange)}
                    </div>
                    <div className="mt-2 text-sm text-slate-400">
                      {marketSubtitle(item.runtime.marketProfile, exchange, asset)}
                    </div>
                  </div>
                  <div className={cn('text-sm font-medium', healthTone(item.health.overall))}>
                    {item.health.overall}
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-300">
                  <div>
                    <div className="text-slate-500">当前阶段</div>
                    <div className="mt-1">{item.runtime.phase || '-'}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">持仓 / 挂单</div>
                    <div className="mt-1">{item.execution.positionsCount} / {item.execution.ordersCount}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">焦点品种</div>
                    <div className="mt-1">{item.runtime.focusSymbols.join(' / ') || '-'}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">交易状态</div>
                    <div className="mt-1">
                      {item.execution.canTrade === null ? '待确认' : item.execution.canTrade ? '可以' : '等待'}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </section>
      ) : null}

      <section className="overflow-hidden rounded-[30px] border border-blue-900/45 bg-[radial-gradient(circle_at_top_left,rgba(27,74,188,0.28),rgba(8,15,35,0.96)_48%,rgba(2,6,18,0.98)_100%)] p-6 shadow-[0_30px_120px_rgba(0,0,0,0.45)] md:p-8">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-5xl">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-400/35 bg-amber-400/10">
                <Bot className="h-7 w-7 text-amber-300" />
              </div>
              <div>
                <div className="text-xs uppercase tracking-[0.34em] text-amber-300/90">
                  AB PATROL-AGENT · {data.runtimeLabel} · {data.runtime.botId}
                </div>
                <h1 className="mt-2 text-4xl font-semibold text-white">{title}</h1>
                <p className="mt-2 text-sm text-slate-400">{subtitle}</p>
              </div>
            </div>

            <p className="mt-5 max-w-4xl text-sm leading-8 text-slate-300">
              {summaryText}
            </p>

            {data.summary.explanation ? (
              <p className="mt-3 max-w-4xl text-sm leading-7 text-slate-400">
                {data.summary.explanation}
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm',
                data.health.queryLive
                  ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-200'
                  : 'border-rose-500/25 bg-rose-500/10 text-rose-200',
              )}
            >
              <CircleDot className="h-4 w-4" />
              {queryConnectedText}
            </div>

            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white transition hover:bg-white/10"
            >
              <RefreshCw className="h-4 w-4" />
              刷新数据
            </button>

            {data.queryUrl ? (
              <a
                href={data.queryUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-transparent px-4 py-2 text-sm text-white transition hover:bg-white/10"
              >
                <FileJson className="h-4 w-4" />
                打开 Query JSON
                <ArrowRight className="h-4 w-4" />
              </a>
            ) : null}

            <div className="text-xs text-slate-500">聚合刷新: {lastAggregatedAt}</div>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="当前阶段"
            value={data.runtime.phase || '-'}
            sub={data.runtime.focusSymbols.join(' / ') || '暂无关注品种'}
          />
          <MetricCard
            label="当前可交易"
            value={canTradeText}
            sub={data.execution.canTradeReason || data.runtime.tradeReadiness || 'OK'}
          />
          <MetricCard
            label="持仓 / 挂单"
            value={`${data.execution.positionsCount} / ${data.execution.ordersCount}`}
            sub={`dry-run: ${data.runtime.dryRun ? 'true' : 'false'}`}
          />
          <MetricCard label="总体健康 / 新鲜度" value={healthText} sub={healthSub} />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.65fr)_360px]">
        <div className="space-y-6">
          <Panel title="巡逻结论" icon={Activity}>
            <div className="rounded-[22px] border border-white/8 bg-black/20 p-5">
              <p className="whitespace-pre-wrap text-sm leading-8 text-slate-200">{summaryText}</p>
              {recentDecision?.summary ? (
                <p className="mt-4 border-t border-white/8 pt-4 text-sm leading-7 text-slate-400">
                  最新决策摘要：{recentDecision.summary}
                </p>
              ) : null}
            </div>
          </Panel>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 2xl:grid-cols-3">
            {data.symbols.map((symbol) => (
              <section
                key={symbol.symbol}
                className="rounded-[24px] border border-white/10 bg-slate-950/75 p-5 shadow-[0_20px_60px_rgba(0,0,0,0.32)]"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-3xl font-semibold text-white">{symbol.symbol}</h3>
                    <p className="mt-3 text-sm text-slate-400">
                      {symbol.ai_direction || 'AI -'} / {symbol.market_state || '市场状态 -'}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs uppercase tracking-[0.18em]',
                      statusTone(symbol.status),
                    )}
                  >
                    {statusLabel(symbol.status)}
                  </span>
                </div>

                <div className="mt-6 space-y-4 text-sm leading-7 text-slate-300">
                  <div>
                    <div className="text-slate-500">结构</div>
                    <div>{symbol.thesis || symbol.structure_summary || '-'}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">预信号</div>
                    <div>{symbol.pre_signal || '-'}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">执行语义</div>
                    <div>{symbol.execution_summary || symbol.execution_mode || '-'}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Trader&apos;s Equation</div>
                    <div>{symbol.risk || '-'}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">Brooks分类</div>
                    <div>{symbol.brooks_label || '-'}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">升级条件</div>
                    <div>{symbol.upgrade_condition || '-'}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">候选动作</div>
                    <div>{symbol.planned_action || '-'}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">阶段</div>
                    <div>{symbol.stage || '-'}</div>
                  </div>
                </div>

                {symbol.refs.length > 0 ? (
                  <div className="mt-5 border-t border-white/8 pt-4 text-xs leading-6 text-amber-300/90">
                    来源：{symbol.refs.slice(0, 5).join(' / ')}
                  </div>
                ) : null}
              </section>
            ))}
          </div>

          <Panel title="最近巡逻" icon={Clock}>
            <div className="space-y-4">
              {data.recentCycles.length === 0 ? (
                <div className="rounded-[22px] border border-white/8 bg-black/20 p-5 text-sm text-slate-400">
                  暂无最近轮次。
                </div>
              ) : (
                data.recentCycles.map((cycle) => (
                  <article
                    key={cycle.cycleId}
                    className="rounded-[22px] border border-white/8 bg-black/20 p-5"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div>
                        <div className="text-xl font-semibold text-white">{cycle.cycleId}</div>
                        <div className="mt-2 text-sm text-slate-500">
                          {cycle.focusSymbols.join(' / ') || '无 focus symbols'}
                        </div>
                      </div>
                      <div className="text-sm text-slate-400">
                        {cycle.phase || '-'} / {formatNumber(cycle.nextScanSeconds, 's')}
                      </div>
                    </div>
                    <p className="mt-4 text-sm leading-7 text-slate-300">{cycle.summary || '暂无摘要'}</p>
                  </article>
                ))
              )}
            </div>
          </Panel>

          <Panel title="交易漏斗" icon={Shield}>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-[22px] border border-white/8 bg-black/20 p-5">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="text-slate-500">已成交</div>
                    <div className="mt-2 text-2xl font-semibold text-white">{data.funnel.counts.filled}</div>
                  </div>
                  <div>
                    <div className="text-slate-500">执行失败</div>
                    <div className="mt-2 text-2xl font-semibold text-rose-300">
                      {data.funnel.counts.candidateExecutionFailed}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">Gate 拒绝</div>
                    <div className="mt-2 text-2xl font-semibold text-amber-300">
                      {data.funnel.counts.candidateGateRejected}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">仅预信号</div>
                    <div className="mt-2 text-2xl font-semibold text-slate-200">
                      {data.funnel.counts.preSignalOnly}
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[22px] border border-white/8 bg-black/20 p-5">
                <div className="space-y-3">
                  {data.funnel.topThemes.length === 0 ? (
                    <div className="text-sm text-slate-400">暂无漏斗主题统计。</div>
                  ) : (
                    data.funnel.topThemes.map((theme) => (
                      <div key={theme.label} className="flex items-center justify-between gap-4 text-sm">
                        <span className="text-slate-300">{theme.label}</span>
                        <span className="font-mono text-amber-300">{theme.count}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="当前状态" icon={Shield}>
            <div className="space-y-4 text-sm leading-7">
              <div>
                <div className="text-slate-500">轮次</div>
                <div className="text-lg font-semibold text-amber-300">{data.summary.cycleId || '-'}</div>
              </div>
              <div>
                <div className="text-slate-500">阶段</div>
                <div className="text-white">{data.runtime.phase || '-'}</div>
              </div>
              <div>
                <div className="text-slate-500">关注品种</div>
                <div className="text-amber-300">{data.runtime.focusSymbols.join(', ') || '-'}</div>
              </div>
              <div>
                <div className="text-slate-500">读盘窗口</div>
                <div className="text-white">
                  {formatNumber(data.summary.readingTargets.barCountTotal, ' 根')} / 浏览{' '}
                  {formatNumber(data.summary.readingTargets.browseTargetBars, ' 根')} / 精读{' '}
                  {formatNumber(data.summary.readingTargets.closeReadTargetBars, ' 根')}
                </div>
              </div>
              <div>
                <div className="text-slate-500">Cycle 年龄</div>
                <div className="text-amber-300">{formatNumber(data.health.cycleAgeSeconds, ' 秒')}</div>
              </div>
              <div>
                <div className="text-slate-500">最近成功</div>
                <div className="text-white">{formatDateTime(data.timestamps.lastSuccessAt)}</div>
              </div>
              <div>
                <div className="text-slate-500">最近失败</div>
                <div className="text-white">{formatDateTime(data.timestamps.lastFailureAt)}</div>
              </div>
              {data.timestamps.lastFailureReason ? (
                <div className="rounded-2xl border border-amber-500/20 bg-amber-500/8 p-4 text-sm text-amber-200">
                  {data.timestamps.lastFailureReason}
                </div>
              ) : null}
            </div>
          </Panel>

          <Panel title="上下文监控" icon={Database}>
            <div className="space-y-4 text-sm leading-7">
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-500">knowledge_chars</span>
                <span className="font-mono text-amber-300">{formatNumber(data.monitoring.knowledgeChars)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-500">refs_count</span>
                <span className="font-mono text-amber-300">{data.monitoring.refsCount}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-500">refs 拆分</span>
                <span className="font-mono text-amber-300">
                  完整 {data.monitoring.fullRefsCount} / 摘要 {data.monitoring.briefRefsCount}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-500">request_size</span>
                <span className="font-mono text-amber-300">
                  {formatNumber(data.monitoring.requestChars, ' chars')} / {formatNumber(data.monitoring.requestSizeBytes, ' bytes')}
                </span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-500">session_age</span>
                <span className="font-mono text-amber-300">{formatNumber(data.monitoring.sessionAgeSeconds, ' 秒')}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-500">session_turns</span>
                <span className="font-mono text-amber-300">{formatNumber(data.monitoring.sessionTurnCount)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-slate-500">session_model</span>
                <span className="font-mono text-amber-300">{data.monitoring.sessionModel || data.runtime.decisionModel || '-'}</span>
              </div>
            </div>
          </Panel>

          <Panel title="下一次扫描" icon={Clock}>
            <div className="space-y-4 text-sm leading-7">
              <div>
                <div className="text-slate-500">倒计时</div>
                <div className="text-2xl font-semibold text-amber-300">
                  {formatNumber(data.nextScan.inSeconds, ' 秒')}
                </div>
              </div>
              <div>
                <div className="text-slate-500">模型建议</div>
                <div className="text-white">{formatNumber(data.nextScan.modelSuggestedSeconds, ' 秒')}</div>
              </div>
              <div className="rounded-2xl border border-white/8 bg-black/20 p-4 text-slate-200">
                {data.nextScan.reasonText || data.nextScan.modelSuggestedReason || '暂无下一次扫描说明'}
              </div>
              <div className="rounded-2xl border border-amber-500/18 bg-amber-500/8 p-4 text-amber-200">
                规则: {data.nextScan.bucketRule || '-'}
              </div>
              {data.nextScan.bucketSourceRefs.length > 0 ? (
                <div className="text-xs leading-6 text-amber-300/90">
                  来源: {data.nextScan.bucketSourceRefs.slice(0, 6).join(' / ')}
                </div>
              ) : null}
            </div>
          </Panel>

          <Panel title="最近执行" icon={Activity}>
            <div className="space-y-4">
              {data.recentExecutions.length === 0 ? (
                <div className="rounded-2xl border border-white/8 bg-black/20 p-4 text-sm text-slate-400">
                  暂无执行记录。
                </div>
              ) : (
                data.recentExecutions.map((item) => (
                  <article
                    key={`${item.loggedAt}-${item.symbol}-${item.status}`}
                    className="rounded-2xl border border-white/8 bg-black/20 p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-white">{item.symbol || item.cycleId || '-'}</div>
                        <div className="mt-1 text-xs text-slate-500">{formatDateTime(item.loggedAt)}</div>
                      </div>
                      <div
                        className={cn(
                          'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs',
                          item.success === true
                            ? 'bg-emerald-500/10 text-emerald-200'
                            : item.success === false
                              ? 'bg-rose-500/10 text-rose-200'
                              : 'bg-slate-600/20 text-slate-300',
                        )}
                      >
                        {item.success === true ? <CheckCircle2 className="h-3.5 w-3.5" /> : null}
                        {item.success === false ? <XCircle className="h-3.5 w-3.5" /> : null}
                        {item.status || 'UNKNOWN'}
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-7 text-slate-300">{item.message || '无执行说明'}</p>
                  </article>
                ))
              )}
            </div>
          </Panel>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-amber-500/20 bg-amber-500/8 px-4 py-3 text-sm text-amber-200">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            接口最近一次刷新失败：{error}
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-white/8 bg-slate-950/70 p-4 text-sm text-slate-300">
          <div className="mb-2 flex items-center gap-2 text-slate-500">
            <Shield className="h-4 w-4" />
            运行链路
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span>Patrol</span>
              <span className={data.health.patrolLive ? 'text-emerald-300' : 'text-rose-300'}>
                {data.health.patrolLive ? 'UP' : 'DOWN'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Query Service</span>
              <span className={data.health.queryLive ? 'text-emerald-300' : 'text-rose-300'}>
                {data.health.queryLive ? 'UP' : 'DOWN'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Execution API</span>
              <span className={data.health.executionPortOpen ? 'text-emerald-300' : 'text-rose-300'}>
                {data.health.executionPortOpen ? 'UP' : 'DOWN'}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/8 bg-slate-950/70 p-4 text-sm text-slate-300">
          <div className="mb-2 flex items-center gap-2 text-slate-500">
            <CircleDot className="h-4 w-4" />
            运行模式
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span>Provider</span>
              <span className="font-mono text-amber-300">{data.runtime.llmProvider || '-'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Model</span>
              <span className="font-mono text-amber-300">{data.runtime.decisionModel || '-'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Risk Mode</span>
              <span className="text-white">{data.runtime.riskMode || '-'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Best Candidate</span>
              <span className="text-white">
                {data.runtime.bestCandidate || '-'} {data.runtime.bestCandidateStatus ? `/${data.runtime.bestCandidateStatus}` : ''}
              </span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/8 bg-slate-950/70 p-4 text-sm text-slate-300">
          <div className="mb-2 flex items-center gap-2 text-slate-500">
            <Clock className="h-4 w-4" />
            时间状态
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span>最新轮次</span>
              <span className="text-white">{timeAgo(data.timestamps.latestCycleAt)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>最后成功</span>
              <span className="text-white">{timeAgo(data.timestamps.lastSuccessAt)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>来源</span>
              <span className={healthTone(data.health.overall)}>
                {data.source === 'query-service' ? 'query-service' : 'fallback'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>新鲜度</span>
              <span className={healthTone(data.health.overall)}>{data.health.freshnessLabel}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
