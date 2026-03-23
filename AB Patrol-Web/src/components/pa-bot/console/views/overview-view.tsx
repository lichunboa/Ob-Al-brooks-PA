'use client';

import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';
import { Cpu, ExternalLink, Image as ImageIcon, LineChart, ShieldCheck, Wallet } from 'lucide-react';
import type { AccountPanel, RuntimeData } from '../types';
import { TradeChartPanel, type TradeChartPayload } from '../../trade-chart-panel';
import {
  LABEL_CLASS,
  MUTED_CLASS,
  MetricCard,
  SECTION_CLASS,
  TERMINAL_STRIP_CLASS,
  SUBCARD_CLASS,
  TABLE_CLASS,
  TABLE_HEAD_CLASS,
  TABLE_ROW_CLASS,
  TABLE_STICKY_CELL_ALT_CLASS,
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

type OverviewViewProps = {
  runtimeData: RuntimeData;
  trackedSymbols: string[];
  accountSnapshots: RuntimeData['system']['accounts'];
  symbolBuckets: Record<string, number>;
  tradableAccountCount: number;
  accountPanels: AccountPanel[];
  bestCandidateCard: RuntimeData['symbols'][number] | null;
};

function SectionEmpty({ text = '当前没有数据。' }: { text?: string }) {
  return (
    <div className="rounded-[18px] border border-dashed border-white/[0.08] bg-black/18 px-4 py-10 text-center">
      <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">暂无数据</div>
      <div className="mt-3 text-sm leading-7 text-slate-400">{text}</div>
    </div>
  );
}

function inferPreviewTimeframe(candidates: string[]): string {
  for (const value of candidates) {
    const matched = String(value || '').trim().match(/^(1m|5m|15m|1h|1d)/i);
    if (matched?.[1]) {
      return matched[1].toLowerCase();
    }
  }
  return '15m';
}

export function OverviewView({
  runtimeData,
  trackedSymbols,
  accountSnapshots,
  symbolBuckets,
  tradableAccountCount,
  accountPanels,
  bestCandidateCard,
}: OverviewViewProps) {
  const [livePreviewChart, setLivePreviewChart] = useState<TradeChartPayload | null>(null);
  const [livePreviewLoading, setLivePreviewLoading] = useState(false);
  const [livePreviewError, setLivePreviewError] = useState('');
  const [previewRefreshNonce, setPreviewRefreshNonce] = useState(0);
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
  const previewCard =
    bestCandidateCard?.primary_chart_api_path
      ? bestCandidateCard
      : focusCards.find((item) => item.primary_chart_api_path) || bestCandidateCard;
  const previewEvents = useMemo(
    () =>
      previewCard
        ? [...runtimeData.recentExecutions, ...runtimeData.historicalOrders, ...runtimeData.managementActions].filter(
            (item) => item.symbol === previewCard.symbol,
          )
        : [],
    [previewCard, runtimeData.historicalOrders, runtimeData.managementActions, runtimeData.recentExecutions],
  );
  const previewTimeframe = useMemo(
    () => inferPreviewTimeframe(previewEvents.flatMap((item) => item.timeframeSignals || [])),
    [previewEvents],
  );
  const previewBaseUrl =
    (previewCard
      ? runtimeData.system.accounts.find((item) => (item.configuredSymbols || []).includes(previewCard.symbol))?.baseUrl
      : '') ||
    runtimeData.system.accounts[0]?.baseUrl ||
    'http://127.0.0.1:8093';

  useEffect(() => {
    let cancelled = false;
    async function loadPreviewChart() {
      if (!previewCard || previewEvents.length === 0) {
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
          body: JSON.stringify({
            symbol: previewCard.symbol,
            timeframe: previewTimeframe,
            baseUrl: previewBaseUrl,
            events: previewEvents,
            eventIndex: previewEvents.length - 1,
          }),
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

  return (
    <div className="space-y-6">
      <section className={cn(TERMINAL_STRIP_CLASS, 'px-4 py-3')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-cyan-400/[0.09]">
              <LineChart className="h-4 w-4 text-cyan-200" />
            </div>
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <div className="text-[10px] uppercase tracking-[0.3em] text-slate-500">AB PATROL LIVE</div>
              <div className="text-sm font-semibold text-white">统一实盘交易台</div>
              <div className="min-w-0 max-w-[680px] truncate text-sm text-slate-300">{headline}</div>
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label="市场覆盖"
          value={String(trackedSymbols.length)}
          sub={`${Object.entries(symbolBuckets)
            .map(([bucket, count]) => `${bucket} ${count}`)
            .join(' / ')}`}
        />
        <MetricCard
          label="持仓 / 挂单"
          value={`${runtimeData.positions.length} / ${runtimeData.orders.length}`}
          sub={`动作 ${runtimeData.summary.actionsCount} / 管理 ${runtimeData.summary.positionManagementCount}`}
        />
        <MetricCard
          label="账户"
          value={`${tradableAccountCount}/${accountSnapshots.length}`}
          sub={
            accountSnapshots.filter((item) => item.stale).length > 0
              ? `回退快照 ${accountSnapshots.filter((item) => item.stale).length}`
              : '全部实时快照'
          }
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_300px]">
        <div className="space-y-6">
          <Section title="本轮判断" icon={ShieldCheck} subtitle="当前结论。">
            <div className="grid gap-4 xl:grid-cols-[1.12fr_0.88fr]">
              <article className={cn(SUBCARD_CLASS, 'px-4 py-4')}>
                <div className={LABEL_CLASS}>判断</div>
                <div className="mt-3 text-lg leading-8 text-white">{headline}</div>
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
                        <div className="text-[28px] font-semibold tracking-[-0.04em] text-white">
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
                  <div className="mt-4 text-sm leading-7 text-slate-300">
                      {bestCandidateCard.execution_summary || bestCandidateCard.planned_action || '-'}
                    </div>
                  </>
                ) : (
                  <div className="mt-3 text-sm text-slate-500">当前没有突出结构。</div>
                )}
              </article>
            </div>
            <article className={cn(SUBCARD_CLASS, 'mt-4 overflow-hidden px-4 py-4')}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className={LABEL_CLASS}>实时图表</div>
                  <div className="mt-2 text-sm text-slate-300">
                    {previewCard ? `${previewCard.symbol} · ${previewCard.strategy_label || previewCard.strategy_family || '结构图'}` : '当前没有可用图表'}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <TerminalBadge kind="info">Live</TerminalBadge>
                  <Link
                    href="/pa-bot/backtest"
                    className="inline-flex items-center gap-1 rounded-[10px] border border-white/[0.08] px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/[0.04]"
                  >
                    <ImageIcon className="h-3.5 w-3.5" />
                    回测图
                  </Link>
                </div>
              </div>
              {previewCard ? (
                <div className="mt-4 space-y-3">
                  <TradeChartPanel
                    eyebrow="实时图表"
                    title={`${previewCard.symbol} · ${previewTimeframe}`}
                    badgeText="Live"
                    helperText={previewCard.chart_note || '当前焦点品种的最新执行与管理事件会直接叠加到 K 线上。'}
                    chart={livePreviewChart}
                    loading={livePreviewLoading}
                    error={livePreviewError}
                    emptyText="当前焦点品种还没有可用于绘图的执行事件。"
                    refreshLabel="刷新图表"
                    onRefresh={() => {
                      setPreviewRefreshNonce((current) => current + 1);
                    }}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
                    <div className="min-w-0 flex-1 truncate">
                      图表数据来自每日归档 K 线、实盘执行 journal 和运行态上下文。
                    </div>
                    <Link
                      href="/pa-bot/review"
                      className="inline-flex items-center gap-1 text-cyan-300 transition hover:text-cyan-200"
                    >
                      打开统一复盘
                      <ExternalLink className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              ) : (
                <div className="mt-4 rounded-[14px] border border-dashed border-white/[0.08] px-4 py-10 text-center text-sm text-slate-500">
                  当前轮次还没给焦点品种附上图表。先看 `/pa-bot/backtest` 的标注图，或者等待下一轮 live 图表刷新。
                </div>
              )}
            </article>
          </Section>

          <div className="grid gap-6 xl:grid-cols-[1.18fr_0.82fr]">
            <Section title="焦点榜单" icon={LineChart} subtitle="优先盯盘。">
              {focusCards.length === 0 ? (
                <SectionEmpty />
              ) : (
                <div className={TABLE_CLASS}>
                  <TableScroll className="max-h-[760px]">
                    <div
                      className={cn(
                        TABLE_HEAD_CLASS,
                        'sticky top-0 z-10 hidden grid-cols-[0.72fr_0.56fr_0.42fr_0.62fr_1.12fr] gap-3 bg-[#091019]/95 px-4 py-3 md:grid',
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
                              index % 2 === 1 ? TABLE_STICKY_CELL_ALT_CLASS : TABLE_STICKY_CELL_CLASS,
                            )}
                          >
                            <div className="font-medium text-white">{symbol.symbol}</div>
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
                          <div className="text-sm font-semibold text-slate-100">
                            {translateStatusLabel(symbol.stage || '-')}
                          </div>
                          <div className="text-sm text-slate-300">
                            {symbol.strategy_label ||
                              translateStrategyFamilyLabel(symbol.strategy_family || '') ||
                              symbol.brooks_label ||
                              symbol.risk ||
                              '观察中'}
                          </div>
                          <div className="text-sm leading-6 text-slate-400">
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
                        <div className="text-sm text-slate-200">{translateStrategyFamilyLabel(item.label)}</div>
                        <div className="font-mono tabular-nums text-sm text-slate-300">{item.count}</div>
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
                            <div className="truncate text-sm text-slate-200">{reason?.label || '—'}</div>
                            <div className="mt-1 text-xs text-slate-500">{reason ? `${reason.count} 次` : '暂无'}</div>
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm text-slate-200">{occupied?.symbol || '—'}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {occupied ? occupied.occupiedBy.join(' / ') || '占用中' : '暂无'}
                            </div>
                          </div>
                          <div className="font-mono tabular-nums text-sm text-slate-300">
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

        <aside className="space-y-4 xl:sticky xl:top-24 self-start">
          <section className={cn(SECTION_CLASS, 'px-4 py-4')}>
            <div className="mb-3 flex items-center gap-2 text-slate-400">
              <Cpu className="h-4 w-4" />
              <h2 className="text-[11px] uppercase tracking-[0.24em]">状态板</h2>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              <article className={cn(SUBCARD_CLASS, 'px-4 py-3.5')}>
                <div className={LABEL_CLASS}>下轮</div>
                <div className="mt-1.5 font-mono tabular-nums text-[15px] font-semibold text-white">
                  {runtimeData.nextScan.inSeconds ?? '-'} 秒
                </div>
              </article>
              <article className={cn(SUBCARD_CLASS, 'px-4 py-3.5')}>
                <div className={LABEL_CLASS}>运行</div>
                <div className="mt-1.5 font-mono tabular-nums text-[15px] font-semibold text-white">
                  {formatDuration(runtimeData.monitoring.uptimeSeconds ?? runtimeData.monitoring.sessionAgeSeconds)}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  {translateTradeReadiness(runtimeData.runtime.tradeReadiness || 'waiting')}
                </div>
              </article>
            </div>
          </section>

          <section className={cn(SECTION_CLASS, 'px-4 py-4')}>
            <div className="mb-3 flex items-center gap-2 text-slate-400">
              <Wallet className="h-4 w-4" />
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
                    <div className="text-sm font-medium text-white">{panel.account.label || panel.account.exchange}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {panel.account.role === 'primary' ? '主路由' : '辅助路由'} ·{' '}
                      {panel.account.stale ? '回退快照' : '实时快照'}
                    </div>
                  </div>
                    <div className="text-right">
                      <div className="font-mono tabular-nums text-sm text-white">{panel.configuredSymbols.length} 个品种</div>
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

          <section className={cn(SECTION_CLASS, 'px-4 py-4')}>
            <div className="mb-3 flex items-center gap-2 text-slate-400">
              <LineChart className="h-4 w-4" />
              <h2 className="text-[11px] uppercase tracking-[0.24em]">策略快照</h2>
            </div>
            <div className={TABLE_CLASS}>
              {(topStrategyFamilies.length > 0 ? topStrategyFamilies : [{ label: '暂无', count: 0 }]).map((item, index) => (
                <article
                  key={`overview-side-strategy-${item.label}`}
                  className={cn(
                    'flex items-center justify-between gap-4 px-4 py-3.5',
                    TABLE_ROW_CLASS,
                    index > 0 && 'border-t',
                    index % 2 === 1 && 'bg-white/[0.015]',
                  )}
                >
                  <div className="text-sm text-slate-200">{translateStrategyFamilyLabel(item.label)}</div>
                  <div className="font-mono tabular-nums text-sm text-slate-300">{item.count}</div>
                </article>
              ))}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
