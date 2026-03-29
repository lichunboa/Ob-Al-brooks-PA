'use client';

import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';
import { Cpu, ExternalLink, Image as ImageIcon, LineChart, ShieldCheck, Wallet } from 'lucide-react';
import type { AccountPanel, RuntimeData } from '../types';
import {
  LIVE_CHART_DEFAULT_TIMEFRAME,
  listLiveChartTimeframes,
  resolveLiveChartTimeframe,
  type LiveChartTimeframe,
} from '../../../../lib/pa-bot/live-chart-timeframe';
import { normalizeChartSymbol, normalizeSymbolKey } from '../../../../lib/pa-bot/runtime-symbols';
import { TradeChartPanel, type TradeChartPayload } from '../../trade-chart-panel';
import {
  CARD_CLASS,
  EmptyState,
  LABEL_CLASS,
  MetricCard,
  MUTED_CLASS,
  ProgressBar,
  SUBCARD_CLASS,
  TABLE_CLASS,
  TABLE_HEAD_CLASS,
  TABLE_ROW_CLASS,
  TABLE_STICKY_CELL_CLASS,
  TABLE_STICKY_HEAD_CLASS,
  TerminalBadge,
  Section,
  TableScroll,
  cn,
  statusTone,
} from '../ui';
import {
  formatDuration,
  formatMoney,
  formatNumber,
  marketBucket,
  translateHealthLabel,
  translateMarketStateLabel,
  translatePhaseLabel,
  translateSourceLabel,
  translateStrategyFamilyLabel,
  translateStatusLabel,
  translateTradeReadiness,
} from '../formatters';
import { isRealExecutionStatus } from '../derived';

type OverviewViewProps = {
  updatedAt: string;
  runtimeData: RuntimeData;
  trackedSymbols: string[];
  accountSnapshots: RuntimeData['system']['accounts'];
  symbolBuckets: Record<string, number>;
  tradableAccountCount: number;
  accountPanels: AccountPanel[];
  bestCandidateCard: RuntimeData['symbols'][number] | null;
};

export function OverviewView({
  updatedAt,
  runtimeData,
  trackedSymbols,
  accountSnapshots,
  symbolBuckets,
  tradableAccountCount,
  accountPanels,
  bestCandidateCard,
}: OverviewViewProps) {
  const chartSymbol = (value: string) => normalizeChartSymbol(value);
  const [livePreviewChart, setLivePreviewChart] = useState<TradeChartPayload | null>(null);
  const [livePreviewLoading, setLivePreviewLoading] = useState(false);
  const [livePreviewError, setLivePreviewError] = useState('');
  const [previewRefreshNonce, setPreviewRefreshNonce] = useState(0);
  const [previewTimeframe, setPreviewTimeframe] = useState<LiveChartTimeframe>(resolveLiveChartTimeframe());
  const [previewSymbol, setPreviewSymbol] = useState('');
  const [deskExchange, setDeskExchange] = useState('ALL');
  const symbolMetaMap = new Map<string, { exchange: string; bucket: string }>();
  accountPanels.forEach((panel) => {
    panel.configuredSymbols.forEach((symbol) => {
      if (!symbolMetaMap.has(symbol)) {
        symbolMetaMap.set(symbol, {
          exchange: panel.account.exchange,
          bucket: marketBucket(symbol),
        });
      }
    });
  });
  const focusCards = runtimeData.symbols.slice(0, 8).map((item) => ({
    ...item,
    meta: symbolMetaMap.get(item.symbol) || {
      exchange: '-',
      bucket: marketBucket(item.symbol),
    },
  }));
  const headline = runtimeData.summary.marketSummary || '暂无本轮交易结论';
  const topStrategyFamilies =
    (runtimeData.summary.strategyFamilies.length > 0
      ? runtimeData.summary.strategyFamilies
      : runtimeData.audit.signalFamilies
    ).slice(0, 5);
  const topRejections = runtimeData.capacity.rejectionSummary.slice(0, 4);
  const topOccupancies = runtimeData.capacity.occupiedSymbols.slice(0, 4);
  const availablePreviewSymbols = useMemo(
    () =>
      Array.from(
        new Set([
          ...focusCards.map((item) => chartSymbol(item.symbol)),
          ...trackedSymbols,
          ...runtimeData.positions.map((item) => chartSymbol(item.symbol)),
          ...runtimeData.orders.map((item) => chartSymbol(item.symbol)),
          ...runtimeData.currentActions.map((item) => chartSymbol(item.symbol)),
          ...runtimeData.system.accounts.flatMap((item) => item.configuredSymbols || []),
        ]),
      ).filter(Boolean),
    [focusCards, runtimeData.currentActions, runtimeData.orders, runtimeData.positions, runtimeData.system.accounts, trackedSymbols],
  );
  useEffect(() => {
    if (availablePreviewSymbols.length === 0) {
      setPreviewSymbol('');
      return;
    }
    setPreviewSymbol((current) => {
      if (current && availablePreviewSymbols.includes(current)) return current;
      return chartSymbol(bestCandidateCard?.symbol || '') || availablePreviewSymbols[0] || '';
    });
  }, [availablePreviewSymbols, bestCandidateCard?.symbol]);
  const previewCard = useMemo(() => {
    if (!previewSymbol) {
      return bestCandidateCard?.primary_chart_api_path
        ? bestCandidateCard
        : focusCards.find((item) => item.primary_chart_api_path) || bestCandidateCard;
    }
    const focusMatch = focusCards.find((item) => normalizeSymbolKey(item.symbol) === normalizeSymbolKey(previewSymbol));
    if (focusMatch) return focusMatch;
    const fallbackMatch = runtimeData.symbols.find((item) => normalizeSymbolKey(item.symbol) === normalizeSymbolKey(previewSymbol));
    if (!fallbackMatch) return null;
    return {
      ...fallbackMatch,
      meta: symbolMetaMap.get(fallbackMatch.symbol) || {
        exchange: '-',
        bucket: marketBucket(fallbackMatch.symbol),
      },
    };
  }, [bestCandidateCard, focusCards, previewSymbol, runtimeData.symbols, symbolMetaMap]);
  const previewEvents = useMemo(() => {
    if (!previewSymbol) return [];
    const symbolEvents = [...runtimeData.recentExecutions, ...runtimeData.historicalOrders, ...runtimeData.managementActions]
      .filter((item) => normalizeSymbolKey(item.symbol || '') === normalizeSymbolKey(previewSymbol))
      .sort((left, right) => String(left.loggedAt || '').localeCompare(String(right.loggedAt || '')));
    const preferred = [...symbolEvents]
      .reverse()
      .find((item) => {
        const orderClass = String(item.orderClass || '').toUpperCase();
        return isRealExecutionStatus(item.status) && orderClass !== 'MANAGEMENT';
      });
    return preferred ? [preferred] : symbolEvents.slice(-1);
  }, [previewSymbol, runtimeData.historicalOrders, runtimeData.managementActions, runtimeData.recentExecutions]);
  const previewBaseUrl =
    (previewSymbol
      ? runtimeData.system.accounts.find((item) =>
          (item.configuredSymbols || []).some((symbol) => normalizeSymbolKey(symbol) === normalizeSymbolKey(previewSymbol)),
        )?.baseUrl
      : '') ||
    runtimeData.system.accounts.find((item) => String(item.exchange || '').trim().toLowerCase() === (previewSymbol.endsWith('USDT') ? 'binance' : 'ctrader'))?.baseUrl ||
    runtimeData.system.accounts[0]?.baseUrl ||
    'http://127.0.0.1:8093';
  const totalEquity = accountPanels.reduce((sum, panel) => sum + (panel.account.balanceTotal || 0), 0);
  const totalAvailable = accountPanels.reduce((sum, panel) => sum + (panel.account.balanceAvailable || 0), 0);
  const totalUnrealizedPnl = runtimeData.positions.reduce((sum, item) => sum + (item.unrealizedPnl || 0), 0);
  const totalGateBlocks = runtimeData.capacity.rejectionSummary.reduce((sum, item) => sum + item.count, 0);
  const primaryAsset = accountPanels[0]?.account.accountAsset || runtimeData.system.accounts[0]?.accountAsset || 'USD';
  const recentDecisionCards = runtimeData.currentActions.slice(0, 6);
  const rejectionHighlights = runtimeData.capacity.rejectionDetails.slice(0, 3);
  const updatedAtLabel = updatedAt
    ? new Date(updatedAt).toLocaleString('zh-CN', { hour12: false, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    : '-';
  const deskExchangeTabs = useMemo(
    () => ['ALL', ...Array.from(new Set(accountPanels.map((panel) => String(panel.account.exchange || '').trim().toUpperCase()).filter(Boolean)))],
    [accountPanels],
  );
  const resolvedDeskExchange = deskExchangeTabs.includes(deskExchange) ? deskExchange : 'ALL';
  const visibleDeskPanels =
    resolvedDeskExchange === 'ALL'
      ? accountPanels
      : accountPanels.filter((panel) => String(panel.account.exchange || '').trim().toUpperCase() === resolvedDeskExchange);
  const deskEquity = visibleDeskPanels.reduce((sum, panel) => sum + (panel.account.balanceTotal || 0), 0);
  const deskAvailable = visibleDeskPanels.reduce((sum, panel) => sum + (panel.account.balanceAvailable || 0), 0);
  const deskPositions = visibleDeskPanels.reduce((sum, panel) => sum + (panel.account.positionsCount || 0), 0);
  const deskOrders = visibleDeskPanels.reduce((sum, panel) => sum + (panel.account.ordersCount || 0), 0);
  const deskTradable = visibleDeskPanels.filter((panel) => panel.account.canTrade === true).length;
  const deskFocusSymbols = Array.from(new Set(visibleDeskPanels.flatMap((panel) => panel.configuredSymbols)));

  useEffect(() => {
    let cancelled = false;
    async function loadPreviewChart() {
      if (!previewSymbol) {
        setLivePreviewChart(null);
        setLivePreviewError('');
        return;
      }
      setLivePreviewLoading(true);
      setLivePreviewError('');
      try {
        const response = await fetch('/api/pa-bot/live-chart', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            previewEvents.length > 0
              ? {
                  symbol: previewSymbol,
                  timeframe: previewTimeframe,
                  baseUrl: previewBaseUrl,
                  events: previewEvents,
                  eventIndex: previewEvents.length - 1,
                }
              : {
                  symbol: previewSymbol,
                  timeframe: previewTimeframe,
                  baseUrl: previewBaseUrl,
                },
          ),
        });
        const payload = await response.json();
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error || `HTTP ${response.status}`);
        }
        if (!cancelled) {
          setLivePreviewChart(payload.chart as TradeChartPayload);
        }
      } catch (error) {
        if (!cancelled) {
          setLivePreviewChart(null);
          setLivePreviewError(error instanceof Error ? error.message : '实时图表生成失败');
        }
      } finally {
        if (!cancelled) {
          setLivePreviewLoading(false);
        }
      }
    }
    void loadPreviewChart();
    return () => {
      cancelled = true;
    };
  }, [previewBaseUrl, previewCard, previewEvents, previewRefreshNonce, previewTimeframe]);

  const candidateSignalCount =
    runtimeData.summary.candidateCount;
  const executableSignalCount =
    runtimeData.summary.executableCount;
  const gateRejectedSignalCount =
    runtimeData.summary.gateRejectedCount ||
    runtimeData.currentActions.filter((item) => String(item.finalStatus || '').toUpperCase() === 'TRADE_GATE_REJECTED').length;
  const livePositionSignalCount = runtimeData.summary.livePositionCount || runtimeData.positions.length;
  const liveOrderSignalCount = runtimeData.summary.liveOrderCount || runtimeData.orders.length;

  return (
    <div className="flex flex-col gap-5">
      <section className={cn(CARD_CLASS, 'px-4 py-3')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-accent/10">
              <LineChart className="size-4 text-accent" />
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <div className="text-[10px] uppercase tracking-[0.3em] text-foreground-faint">AB PATROL LIVE</div>
              <div className="text-sm font-semibold text-foreground">统一实盘交易台</div>
              <div className="min-w-0 max-w-[680px] truncate text-sm text-foreground-muted">{headline}</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <TerminalBadge>轮次 {runtimeData.summary.cycleId || '-'}</TerminalBadge>
            <TerminalBadge kind="success">{translateHealthLabel(runtimeData.health.overall)}</TerminalBadge>
            <TerminalBadge kind="info">{translatePhaseLabel(runtimeData.runtime.phase || '-')}</TerminalBadge>
            <TerminalBadge>{runtimeData.nextScan.inSeconds ?? '-'} 秒</TerminalBadge>
            <TerminalBadge>{translateSourceLabel(runtimeData.system.sourceLabel)}</TerminalBadge>
          </div>
        </div>
      </section>

      <section className={cn(CARD_CLASS, 'px-4 py-2.5')}>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-foreground-faint">
          <span>Last Update: {updatedAtLabel}</span>
          <span>Total Equity: {formatMoney(totalEquity, primaryAsset)}</span>
          <span>Available: {formatMoney(totalAvailable, primaryAsset)}</span>
          <span>PnL: {formatMoney(totalUnrealizedPnl, primaryAsset)}</span>
          <span>当前轮次候选 / 可执行: {candidateSignalCount} / {executableSignalCount}</span>
          <span>真实持仓 / 活动挂单: {livePositionSignalCount} / {liveOrderSignalCount}</span>
          <span>动作 / Gate 拒绝: {runtimeData.summary.actionsCount} / {gateRejectedSignalCount}</span>
        </div>
      </section>

      <section className={cn(CARD_CLASS, 'px-4 py-3')}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
          <div className="rounded-xl border border-border bg-white/[0.02] px-4 py-3">
            <div className={LABEL_CLASS}>Last Update</div>
            <div className="mt-2 font-mono text-sm text-foreground">{updatedAtLabel}</div>
            <div className="mt-1 text-xs text-foreground-faint">数据源 {translateSourceLabel(runtimeData.system.sourceLabel)}</div>
          </div>
          <div className="rounded-xl border border-cyan-400/18 bg-cyan-400/[0.06] px-4 py-3">
            <div className={LABEL_CLASS}>当前轮次候选</div>
            <div className="mt-2 font-mono text-lg text-cyan-100">{candidateSignalCount}</div>
            <div className="mt-1 text-xs text-foreground-faint">只看当前轮次动作，不混入历史持仓</div>
          </div>
          <div className="rounded-xl border border-emerald-400/18 bg-emerald-400/[0.06] px-4 py-3">
            <div className={LABEL_CLASS}>当前轮次可执行</div>
            <div className="mt-2 font-mono text-lg text-emerald-100">{executableSignalCount}</div>
            <div className="mt-1 text-xs text-foreground-faint">已到执行阶段但未必已真正成交</div>
          </div>
          <div className="rounded-xl border border-amber-400/18 bg-amber-400/[0.06] px-4 py-3">
            <div className={LABEL_CLASS}>真实持仓 / 挂单</div>
            <div className="mt-2 font-mono text-lg text-amber-100">
              {livePositionSignalCount} / {liveOrderSignalCount}
            </div>
            <div className="mt-1 text-xs text-foreground-faint">直接按交易所实时返回统计</div>
          </div>
          <div className="rounded-xl border border-rose-400/18 bg-rose-400/[0.06] px-4 py-3">
            <div className={LABEL_CLASS}>Trade Gate 拒绝</div>
            <div className="mt-2 font-mono text-lg text-rose-100">{gateRejectedSignalCount}</div>
            <div className="mt-1 text-xs text-foreground-faint">当前轮次被风控/收益风险约束挡回</div>
          </div>
          <div className="rounded-xl border border-border bg-white/[0.02] px-4 py-3">
            <div className={LABEL_CLASS}>Total Equity</div>
            <div className="mt-2 font-mono text-lg text-foreground">{formatMoney(totalEquity, primaryAsset)}</div>
            <div className="mt-1 text-xs text-foreground-faint">已纳入 {accountPanels.length} 个账户快照</div>
          </div>
          <div className="rounded-xl border border-border bg-white/[0.02] px-4 py-3">
            <div className={LABEL_CLASS}>Available</div>
            <div className="mt-2 font-mono text-lg text-foreground">{formatMoney(totalAvailable, primaryAsset)}</div>
            <div className="mt-1 text-xs text-foreground-faint">实时可交易账户 {tradableAccountCount}</div>
          </div>
          <div className="rounded-xl border border-border bg-white/[0.02] px-4 py-3">
            <div className={LABEL_CLASS}>PnL</div>
            <div className={cn('mt-2 font-mono text-lg', totalUnrealizedPnl >= 0 ? 'text-success' : 'text-danger')}>
              {formatMoney(totalUnrealizedPnl, primaryAsset)}
            </div>
            <div className="mt-1 text-xs text-foreground-faint">当前持仓实时浮盈亏</div>
          </div>
          <div className="rounded-xl border border-border bg-white/[0.02] px-4 py-3">
            <div className={LABEL_CLASS}>动作 / 管理</div>
            <div className="mt-2 font-mono text-lg text-foreground">
              {runtimeData.summary.actionsCount} / {runtimeData.summary.positionManagementCount}
            </div>
            <div className="mt-1 text-xs text-foreground-faint">本轮动作 / 本轮持仓管理动作</div>
          </div>
        </div>
      </section>

      <section className={cn(CARD_CLASS, 'px-4 py-3')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-foreground-faint">Trading Desk</div>
            <div className="mt-2 text-sm font-semibold text-foreground">交易席位驾驶舱</div>
            <div className="mt-1 text-xs text-foreground-faint">吸收 `tradecat` 的账户驾驶舱思路，把账户、交易所和监控池放在同一条控制带里。</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {deskExchangeTabs.map((exchange) => {
              const active = exchange === resolvedDeskExchange;
              return (
                <button
                  key={exchange}
                  type="button"
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition',
                    active
                      ? 'border-cyan-400/40 bg-cyan-400/12 text-cyan-100'
                      : 'border-border bg-white/[0.03] text-foreground-faint hover:border-cyan-400/25 hover:text-foreground',
                  )}
                  onClick={() => setDeskExchange(exchange)}
                >
                  {exchange === 'ALL' ? '全部交易所' : exchange}
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-5">
          <div className="rounded-lg border border-border bg-white/[0.02] px-4 py-3">
            <div className={LABEL_CLASS}>权益</div>
            <div className="mt-2 font-mono text-lg text-foreground">{formatMoney(deskEquity, primaryAsset)}</div>
            <div className="mt-1 text-xs text-foreground-faint">{resolvedDeskExchange === 'ALL' ? '全部账户汇总' : `${resolvedDeskExchange} 汇总`}</div>
          </div>
          <div className="rounded-lg border border-border bg-white/[0.02] px-4 py-3">
            <div className={LABEL_CLASS}>可用</div>
            <div className="mt-2 font-mono text-lg text-foreground">{formatMoney(deskAvailable, primaryAsset)}</div>
            <div className="mt-1 text-xs text-foreground-faint">可继续开仓的实际余额</div>
          </div>
          <div className="rounded-lg border border-border bg-white/[0.02] px-4 py-3">
            <div className={LABEL_CLASS}>持仓 / 挂单</div>
            <div className="mt-2 font-mono text-lg text-foreground">{deskPositions} / {deskOrders}</div>
            <div className="mt-1 text-xs text-foreground-faint">已按交易所实时状态对账</div>
          </div>
          <div className="rounded-lg border border-border bg-white/[0.02] px-4 py-3">
            <div className={LABEL_CLASS}>可交易账户</div>
            <div className="mt-2 font-mono text-lg text-foreground">{deskTradable}/{visibleDeskPanels.length}</div>
            <div className="mt-1 text-xs text-foreground-faint">阻塞账户会在账户页单独展开</div>
          </div>
          <div className="rounded-lg border border-border bg-white/[0.02] px-4 py-3">
            <div className={LABEL_CLASS}>监控池</div>
            <div className="mt-2 font-mono text-lg text-foreground">{deskFocusSymbols.length}</div>
            <div className="mt-1 text-xs text-foreground-faint">当前视图覆盖的交易品种数</div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-foreground-faint">
          {deskFocusSymbols.slice(0, 18).map((symbol) => (
            <span key={`${resolvedDeskExchange}-${symbol}`} className="rounded-full border border-border bg-white/[0.03] px-2 py-0.5">
              {symbol}
            </span>
          ))}
          {deskFocusSymbols.length > 18 ? <span>+{deskFocusSymbols.length - 18}</span> : null}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-1 2xl:grid-cols-[minmax(0,1.45fr)_minmax(520px,1fr)]">
        <div className="flex flex-col gap-5">
          <Section title="本轮判断" icon={ShieldCheck} subtitle="当前结论。">
            <div className="grid gap-4 xl:grid-cols-[1.12fr_0.88fr]">
              <article className={cn(SUBCARD_CLASS, 'px-4 py-4')}>
                <div className={LABEL_CLASS}>判断</div>
                <div className="mt-3 text-lg leading-8 text-foreground">{headline}</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <TerminalBadge kind="success">
                    准备度 {translateTradeReadiness(runtimeData.runtime.tradeReadiness || '-')}
                  </TerminalBadge>
                  <TerminalBadge>账户 {tradableAccountCount}/{accountSnapshots.length}</TerminalBadge>
                  <TerminalBadge kind="info">
                    运行 {formatDuration(runtimeData.monitoring.uptimeSeconds ?? runtimeData.monitoring.sessionAgeSeconds)}
                  </TerminalBadge>
                </div>
              </article>

              <article className={cn(SUBCARD_CLASS, 'px-4 py-4')}>
                <div className={LABEL_CLASS}>焦点</div>
                {bestCandidateCard ? (
                  <>
                    <div className="mt-3 flex items-start justify-between gap-3">
                      <div>
                        <div className="text-[28px] font-semibold tracking-[-0.04em] text-foreground">
                          {bestCandidateCard.symbol}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {bestCandidateCard.strategy_family ? (
                            <TerminalBadge>
                              {translateStrategyFamilyLabel(bestCandidateCard.strategy_family)}
                            </TerminalBadge>
                          ) : null}
                          <TerminalBadge kind="info">
                            {translateMarketStateLabel(bestCandidateCard.market_state || '-')}
                          </TerminalBadge>
                          <TerminalBadge kind="warn">
                            {translateStatusLabel(bestCandidateCard.status || '-')}
                          </TerminalBadge>
                        </div>
                      </div>
                    </div>
                  <div className="mt-4 text-sm leading-7 text-foreground-muted">
                      {bestCandidateCard.execution_summary || bestCandidateCard.planned_action || '-'}
                    </div>
                  </>
                ) : (
                  <div className="mt-3 text-sm text-foreground-faint">当前没有突出结构。</div>
                )}
              </article>
            </div>
            <article className={cn(SUBCARD_CLASS, 'mt-4 overflow-hidden px-4 py-4')}>
              <div className="flex items-center justify-between gap-3">
                <div>
                    <div className={LABEL_CLASS}>实时图表</div>
                  <div className="mt-2 text-sm text-foreground-muted">
                    {previewSymbol ? `${previewSymbol} · ${previewCard?.strategy_label || previewCard?.strategy_family || '结构图'}` : '当前没有可用图表'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <TerminalBadge kind="info">Live</TerminalBadge>
                  <Link
                    href="/pa-bot/backtest"
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-1.5 text-xs text-foreground-muted transition hover:bg-white/[0.04]"
                  >
                    <ImageIcon className="size-3.5" />
                    回测图
                  </Link>
                </div>
              </div>
              {previewSymbol ? (
                <div className="mt-4 flex flex-col gap-3">
                  <TradeChartPanel
                    eyebrow="实时图表"
                    title={`${previewSymbol || previewCard?.symbol || ''} · ${previewTimeframe}`}
                    badgeText={LIVE_CHART_DEFAULT_TIMEFRAME}
                    helperText={previewEvents.length > 0 ? (previewCard?.chart_note || '优先聚焦最近真实事件；没有事件时会自动回退到当前品种实时结构图。') : '当前没有真实事件，已自动回退到实时结构图。'}
                    chart={livePreviewChart}
                    loading={livePreviewLoading}
                    error={livePreviewError}
                    emptyText="当前焦点品种还没有可用于绘图的实时数据。"
                    refreshLabel="刷新图表"
                    chartHeight={1120}
                    timeframeOptions={[...listLiveChartTimeframes()]}
                    selectedTimeframe={previewTimeframe}
                    onSelectTimeframe={(value) => setPreviewTimeframe(value as LiveChartTimeframe)}
                    symbolOptions={availablePreviewSymbols}
                    selectedSymbol={previewSymbol}
                    onSelectSymbol={setPreviewSymbol}
                    onRefresh={() => {
                      setPreviewRefreshNonce((current) => current + 1);
                    }}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-foreground-faint">
                    <div className="min-w-0 flex-1 truncate">
                      图表数据来自每日归档 K 线、实盘执行 journal 和运行态上下文。
                    </div>
                    <Link
                      href="/pa-bot/review"
                      className="inline-flex items-center gap-1 text-accent transition hover:text-accent"
                    >
                      打开统一复盘
                      <ExternalLink className="size-3.5" />
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-foreground-faint">
                  当前轮次还没给焦点品种附上图表。先看 `/pa-bot/backtest` 的标注图，或者等待下一轮 live 图表刷新。
                </div>
              )}
            </article>
          </Section>

          <div className="grid gap-6 xl:grid-cols-[1.18fr_0.82fr]">
            <Section title="焦点榜单" icon={LineChart} subtitle="优先盯盘。">
              {focusCards.length === 0 ? (
                <EmptyState text="当前没有数据。" />
              ) : (
                <div className={TABLE_CLASS}>
                  <TableScroll className="max-h-[760px]">
                    <div
                      className={cn(
                        TABLE_HEAD_CLASS,
                        'sticky top-0 z-10 hidden grid-cols-[0.72fr_0.56fr_0.42fr_0.62fr_1.12fr] gap-3 bg-surface px-4 py-3 md:grid',
                      )}
                    >
                      <div className={cn('md:sticky md:left-0', TABLE_STICKY_HEAD_CLASS)}>品种</div>
                      <div>市场 / 状态</div>
                      <div>阶段</div>
                      <div>模式</div>
                      <div>执行摘要</div>
                    </div>
                    {focusCards.map((symbol, index) => {
                      return (
                        <article
                          key={symbol.symbol}
                          className={cn(
                            'grid gap-3 px-4 py-4 md:grid-cols-[0.72fr_0.56fr_0.42fr_0.62fr_1.12fr]',
                            TABLE_ROW_CLASS,
                            index > 0 && 'border-t',
                            index % 2 === 1 && 'bg-white/[0.015]',
                          )}
                        >
                          <div
                            className={cn(
                              'md:sticky md:left-0',
                              TABLE_STICKY_CELL_CLASS,
                            )}
                          >
                            <div className="font-medium text-foreground">{symbol.symbol}</div>
                            <div className={MUTED_CLASS}>{symbol.meta.exchange} · {symbol.meta.bucket}</div>
                          </div>
                          <div>
                            <TerminalBadge className={statusTone(symbol.status || 'watch')}>
                              {translateStatusLabel(symbol.status || '-')}
                            </TerminalBadge>
                            <div className={cn(MUTED_CLASS, 'mt-2')}>
                              {translateMarketStateLabel(symbol.market_state || '-')}
                            </div>
                          </div>
                          <div className="text-sm font-semibold text-foreground">
                            {translateStatusLabel(symbol.stage || '-')}
                          </div>
                          <div className="text-sm text-foreground-muted">
                            {symbol.strategy_label ||
                              translateStrategyFamilyLabel(symbol.strategy_family || '') ||
                              symbol.brooks_label ||
                              symbol.risk ||
                              '观察中'}
                          </div>
                          <div className="text-sm leading-6 text-foreground-muted">
                            {symbol.execution_summary || symbol.planned_action || symbol.thesis || '-'}
                          </div>
                        </article>
                      );
                    })}
                  </TableScroll>
                </div>
              )}
            </Section>

            <Section title="策略与容量" icon={Wallet} subtitle="当前活跃策略与冲突热点。">
              <div className="grid gap-4 xl:grid-cols-[0.86fr_1.14fr]">
                <div className="grid gap-3 sm:grid-cols-3">
                  <MetricCard
                    label="剩余槽位"
                    value={String(runtimeData.capacity.remainingPositionSlots || 0)}
                    sub={`最大 ${runtimeData.capacity.maxPositions} / 已开 ${runtimeData.capacity.currentPositions}`}
                  />
                  <MetricCard
                    label="高频拦截"
                    value={runtimeData.capacity.rejectionSummary[0]?.label || '暂无'}
                    sub={
                      runtimeData.capacity.rejectionSummary[0]
                        ? `${runtimeData.capacity.rejectionSummary[0].count} 次`
                        : '当前无拒单'
                    }
                  />
                  <MetricCard
                    label="最拥挤合约"
                    value={runtimeData.capacity.occupiedSymbols[0]?.symbol || '暂无'}
                    sub={
                      runtimeData.capacity.occupiedSymbols[0]
                        ? `拦截 ${runtimeData.capacity.occupiedSymbols[0].blockedConflictCount} 次`
                        : '当前无占用'
                    }
                  />
                  <ProgressBar
                    label="槽位使用率"
                    value={runtimeData.capacity.currentPositions}
                    max={runtimeData.capacity.maxPositions}
                  />
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <div className={TABLE_CLASS}>
                    <div className={cn(TABLE_HEAD_CLASS, 'grid grid-cols-[1fr_auto] gap-3 px-4 py-3')}>
                      <div>策略快照</div>
                      <div>次数</div>
                    </div>
                    {(topStrategyFamilies.length > 0 ? topStrategyFamilies : [{ label: '暂无', count: 0 }]).map((item, index) => (
                      <article
                        key={`strategy-family-${item.label}`}
                        className={cn(
                          'flex items-center justify-between gap-4 px-4 py-3.5',
                          TABLE_ROW_CLASS,
                          index > 0 && 'border-t',
                          index % 2 === 1 && 'bg-white/[0.015]',
                        )}
                      >
                        <div className="text-sm text-foreground">{translateStrategyFamilyLabel(item.label)}</div>
                        <div className="font-mono tabular-nums text-sm text-foreground-muted">{item.count}</div>
                      </article>
                    ))}
                  </div>
                  <div className={TABLE_CLASS}>
                    <div className={cn(TABLE_HEAD_CLASS, 'grid grid-cols-[0.9fr_0.82fr_auto] gap-3 px-4 py-3')}>
                      <div>拒单 / 冲突</div>
                      <div>当前占用</div>
                      <div>热度</div>
                    </div>
                    {Array.from({ length: Math.max(3, Math.min(4, Math.max(topRejections.length, topOccupancies.length))) }).map((_, index) => {
                      const reason = topRejections[index];
                      const occupied = topOccupancies[index];
                      return (
                        <article
                          key={`capacity-overview-${index}`}
                          className={cn(
                            'grid grid-cols-[0.9fr_0.82fr_auto] gap-3 px-4 py-3.5',
                            TABLE_ROW_CLASS,
                            index > 0 && 'border-t',
                            index % 2 === 1 && 'bg-white/[0.015]',
                          )}
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm text-foreground">{reason?.label || '—'}</div>
                            <div className="mt-1 text-xs text-foreground-faint">{reason ? `${reason.count} 次` : '暂无'}</div>
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm text-foreground">{occupied?.symbol || '—'}</div>
                            <div className="mt-1 text-xs text-foreground-faint">
                              {occupied ? occupied.occupiedBy.join(' / ') || '占用中' : '暂无'}
                            </div>
                          </div>
                          <div className="font-mono tabular-nums text-sm text-foreground-muted">
                            {occupied ? occupied.blockedConflictCount : reason?.count || 0}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </div>
              </div>
            </Section>
          </div>
        </div>

        <aside className="flex flex-col gap-4 xl:sticky xl:top-24 self-start">
          <section className={cn(CARD_CLASS, 'px-4 py-4')}>
            <div className="mb-3 flex items-center gap-2 text-foreground-muted">
              <Cpu className="size-4" />
              <h2 className="text-[11px] uppercase tracking-[0.24em]">最近决策</h2>
            </div>
            <div className="space-y-2">
              {recentDecisionCards.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-3 py-6 text-sm text-foreground-faint">
                  当前没有新的 runtime 决策动作。
                </div>
              ) : (
                recentDecisionCards.map((item, index) => (
                  <article
                    key={`decision-${item.symbol}-${item.type}-${item.status}-${index}`}
                    className={cn(
                      SUBCARD_CLASS,
                      'px-3 py-3',
                      index % 2 === 1 && 'bg-white/[0.04]',
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground">{item.symbol}</div>
                        <div className="mt-1 text-xs text-foreground-faint">
                          {item.strategy || item.type || '系统动作'}
                        </div>
                      </div>
                      <TerminalBadge className={statusTone(item.status || 'watch')}>
                        {translateStatusLabel(item.status || '-')}
                      </TerminalBadge>
                    </div>
                    <div className="mt-2 text-xs leading-5 text-foreground-muted">
                      {item.reason || item.message || '当前没有附加说明。'}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-foreground-faint">
                      {item.candidateStage ? <TerminalBadge>{item.candidateStage}</TerminalBadge> : null}
                      {item.executionMode ? <TerminalBadge kind="info">{item.executionMode}</TerminalBadge> : null}
                      {item.timeframe ? <TerminalBadge>{item.timeframe}</TerminalBadge> : null}
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className={cn(CARD_CLASS, 'px-4 py-4')}>
            <div className="mb-3 flex items-center gap-2 text-foreground-muted">
              <ShieldCheck className="size-4" />
              <h2 className="text-[11px] uppercase tracking-[0.24em]">最近拒绝</h2>
            </div>
            <div className="space-y-2">
              {rejectionHighlights.length === 0 ? (
                <div className="rounded-lg border border-dashed border-border px-3 py-6 text-sm text-foreground-faint">
                  当前没有门禁拒绝。
                </div>
              ) : (
                rejectionHighlights.map((item) => (
                  <article key={`reject-${item.label}`} className={cn(SUBCARD_CLASS, 'px-3 py-3')}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-foreground">{item.label}</div>
                      <TerminalBadge kind="danger">{item.count}</TerminalBadge>
                    </div>
                    <div className="mt-2 space-y-1 text-xs leading-5 text-foreground-muted">
                      {item.entries.slice(0, 2).map((entry, index) => (
                        <div key={`${item.label}-${entry.symbol}-${index}`}>
                          {entry.symbol} · {entry.status || entry.type || '-'} · {entry.message || '无说明'}
                        </div>
                      ))}
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          <section className={cn(CARD_CLASS, 'px-4 py-4')}>
            <div className="mb-3 flex items-center gap-2 text-foreground-muted">
              <Cpu className="size-4" />
              <h2 className="text-[11px] uppercase tracking-[0.24em]">状态板</h2>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              <article className={cn(SUBCARD_CLASS, 'px-4 py-3.5')}>
                <div className={LABEL_CLASS}>下轮</div>
                <div className="mt-1.5 font-mono tabular-nums text-[15px] font-semibold text-foreground">
                  {runtimeData.nextScan.inSeconds ?? '-'} 秒
                </div>
              </article>
              <article className={cn(SUBCARD_CLASS, 'px-4 py-3.5')}>
                <div className={LABEL_CLASS}>运行</div>
                <div className="mt-1.5 font-mono tabular-nums text-[15px] font-semibold text-foreground">
                  {formatDuration(runtimeData.monitoring.uptimeSeconds ?? runtimeData.monitoring.sessionAgeSeconds)}
                </div>
                <div className="mt-1 text-xs text-foreground-faint">
                  {translateTradeReadiness(runtimeData.runtime.tradeReadiness || 'waiting')}
                </div>
              </article>
            </div>
          </section>

          <section className={cn(CARD_CLASS, 'px-4 py-4')}>
            <div className="mb-3 flex items-center gap-2 text-foreground-muted">
              <Wallet className="size-4" />
              <h2 className="text-[11px] uppercase tracking-[0.24em]">账户路由</h2>
            </div>
            <div className={TABLE_CLASS}>
              {accountPanels.map((panel, index) => (
                <article
                  key={`${panel.account.exchange}-overview-route`}
                  className={cn(
                    'flex items-center justify-between gap-3 px-4 py-3.5',
                    TABLE_ROW_CLASS,
                    index > 0 && 'border-t',
                    index % 2 === 1 && 'bg-white/[0.015]',
                  )}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-foreground">{panel.account.label || panel.account.exchange}</div>
                    <div className="mt-1 text-xs text-foreground-faint">
                      {panel.account.role === 'primary' ? '主路由' : '辅助路由'} ·{' '}
                      {panel.account.stale ? '回退快照' : '实时快照'}
                    </div>
                  </div>
                    <div className="text-right">
                      <div className="font-mono tabular-nums text-sm text-foreground">{panel.configuredSymbols.length} 个品种</div>
                      <div className="mt-1">
                        <TerminalBadge
                          kind={
                            panel.account.canTrade === true
                              ? 'success'
                              : panel.account.canTrade === false
                                ? 'danger'
                                : 'neutral'
                          }
                        >
                          {panel.account.canTrade === true ? '可交易' : panel.account.canTrade === false ? '阻塞' : '待确认'}
                        </TerminalBadge>
                      </div>
                    </div>
                  </article>
              ))}
            </div>
          </section>

        </aside>
      </div>
    </div>
  );
}
