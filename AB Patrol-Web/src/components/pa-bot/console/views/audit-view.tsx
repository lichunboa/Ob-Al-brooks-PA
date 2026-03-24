'use client';

import React from 'react';
import { Activity, AlertTriangle, BarChart3, Clock3, Layers3, ShieldCheck } from 'lucide-react';
import type { RuntimeData } from '../types';
import {
  LABEL_CLASS,
  MUTED_CLASS,
  TABLE_CLASS,
  TABLE_HEAD_CLASS,
  TABLE_ROW_CLASS,
  TABLE_STICKY_CELL_ALT_CLASS,
  TABLE_STICKY_CELL_CLASS,
  TABLE_STICKY_HEAD_CLASS,
  EmptyState,
  Section,
  TableScroll,
  TerminalBadge,
  cn,
  statusTone,
} from '../ui';
import { translateMarketStateLabel, translateStatusLabel, translateStrategyFamilyLabel } from '../formatters';

export function AuditView({ audit }: { audit: RuntimeData['audit'] }) {
  return (
    <div className="space-y-6">
      <div className={TABLE_CLASS}>
        <div className="grid gap-0 md:grid-cols-2 xl:grid-cols-4">
          <div className="px-4 py-4">
            <div className={LABEL_CLASS}>审计窗口</div>
            <div className="mt-2 font-mono text-2xl font-semibold text-white">{audit.lookbackCycles}</div>
            <div className="mt-2 text-sm text-slate-400">最近 cycle 数</div>
          </div>
          <div className="border-t border-white/[0.05] px-4 py-4 md:border-l md:border-t-0">
            <div className={LABEL_CLASS}>覆盖品种</div>
            <div className="mt-2 font-mono text-2xl font-semibold text-white">{audit.totalSymbolsObserved}</div>
            <div className="mt-2 text-sm text-slate-400">进入过监控摘要的品种</div>
          </div>
          <div className="border-t border-white/[0.05] px-4 py-4 xl:border-l xl:border-t-0">
            <div className={LABEL_CLASS}>候选准备</div>
            <div className="mt-2 font-mono text-2xl font-semibold text-white">{audit.totalReadySignals}</div>
            <div className="mt-2 text-sm text-slate-400">entry_ready / 候选单级别</div>
          </div>
          <div className="border-t border-white/[0.05] px-4 py-4 md:border-l xl:border-t-0">
            <div className={LABEL_CLASS}>可执行</div>
            <div className="mt-2 font-mono text-2xl font-semibold text-white">{audit.totalExecutableSignals}</div>
            <div className="mt-2 text-sm text-slate-400">达到 executable 级别</div>
          </div>
        </div>
      </div>

      <Section title="偏差指标" icon={BarChart3} subtitle="直接对齐 live 与回测链当前最关键的漂移点。">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <DriftMetric label="过期预信号" value={audit.preSignalExpiredSignals} sub="status 仍在 pre_signal，但 last_pass_reason 已过期。" />
          <DriftMetric label="过期仍激活" value={audit.expiredActivePreSignals} sub="PRE_SIGNAL_EXPIRED 同时 pre_signal.active = true。" tone="danger" />
          <DriftMetric label="模型超时缓存" value={audit.staleTimeoutSignals} sub="仍在用“本轮模型超时，保持上一轮观察结论”参与决策。" tone="warn" />
          <DriftMetric label="候选直接开单" value={audit.candidateOpenOrderAttempts} sub="OPEN_ORDER 里仍带 CANDIDATE_*。" tone="danger" />
          <DriftMetric label="同轮重复同策略" value={audit.duplicateInCycleActions} sub="同品种 + 同策略，在同一轮里重复放单。" tone="warn" />
          <DriftMetric label="同品种多策略" value={audit.multiStrategySameSymbolActions} sub="同品种存在多策略并行动作；这类现在允许保留。" tone="info" />
        </div>
      </Section>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Section title="品种审计榜" icon={Activity} subtitle="状态、策略、阶段。">
          {audit.symbols.length === 0 ? (
            <EmptyState text="最近窗口没有可审计的品种样本。" />
          ) : (
            <div className={TABLE_CLASS}>
              <TableScroll className="max-h-[720px]">
                  <div className={cn(TABLE_HEAD_CLASS, 'sticky top-0 z-10 hidden grid-cols-[0.75fr_0.52fr_0.48fr_0.55fr_0.55fr_1fr] gap-3 bg-[#091019]/95 px-4 py-3 lg:grid')}>
                    <div className={cn('lg:sticky lg:left-0', TABLE_STICKY_HEAD_CLASS)}>品种</div>
                    <div>市场 / 状态</div>
                    <div>策略族</div>
                    <div>阶段</div>
                    <div>观察轮次</div>
                    <div>规则 / 周期信号</div>
                  </div>
                {audit.symbols.slice(0, 12).map((item, index) => {
                  const signalSummary = Object.entries(item.latestSignals || {})
                    .map(([timeframe, signal]) => `${timeframe}:${signal}`)
                    .join(' / ');
                  return (
                    <article
                      key={`audit-${item.symbol}`}
                    className={cn(
                      'grid gap-3 px-4 py-4 lg:grid-cols-[0.75fr_0.52fr_0.48fr_0.55fr_0.55fr_1fr]',
                      TABLE_ROW_CLASS,
                      index > 0 && 'border-t',
                      index % 2 === 1 && 'bg-white/[0.015]',
                    )}
                  >
                    <div
                      className={cn(
                        'lg:sticky lg:left-0',
                        index % 2 === 1 ? TABLE_STICKY_CELL_ALT_CLASS : TABLE_STICKY_CELL_CLASS,
                      )}
                    >
                      <div className="font-medium text-white">{item.symbol}</div>
                      <div className={MUTED_CLASS}>{item.exchange} · {item.bucket}</div>
                    </div>
                      <div>
                        <TerminalBadge className={statusTone(item.latestStatus || 'watch')}>
                          {translateStatusLabel(item.latestStatus || '-')}
                        </TerminalBadge>
                        <div className={cn(MUTED_CLASS, 'mt-2')}>{translateMarketStateLabel(item.latestMarketState || '-')}</div>
                        {item.latestLastPassReason ? <div className="mt-2 text-[11px] text-amber-300/80">{item.latestLastPassReason}</div> : null}
                      </div>
                      <div className="text-sm text-slate-200">{translateStrategyFamilyLabel(item.latestStrategyFamily || '未识别')}</div>
                      <div className="text-sm text-slate-300">
                        {translateStatusLabel(item.latestCandidateStage || '-')}
                        <div className="mt-2 text-[11px] text-slate-500">
                          allow_executable:
                          <span className={cn('ml-1', item.latestAllowExecutable === true ? 'text-emerald-300' : item.latestAllowExecutable === false ? 'text-rose-300' : 'text-slate-500')}>
                            {item.latestAllowExecutable === null ? '-' : item.latestAllowExecutable ? 'true' : 'false'}
                          </span>
                        </div>
                      </div>
                      <div className="font-mono tabular-nums text-sm text-slate-300">{item.watchStreak} / {item.watchingCount}</div>
                      <div className="text-sm text-slate-400">
                        {(item.topRules.length ? item.topRules : [item.latestBrooksRule]).filter(Boolean).join(' / ') || '无规则'}
                        <div className="mt-2 text-slate-500">{signalSummary || '无周期信号'}</div>
                      </div>
                    </article>
                  );
                })}
              </TableScroll>
            </div>
          )}
        </Section>

        <div className="space-y-6">
          <Section title="执行态失衡" icon={Clock3} subtitle="为什么只有少数品种长期可执行。">
            <div className="grid gap-3 md:grid-cols-2">
              <DriftList
                title="长期 allow_executable = true"
                items={audit.alwaysExecutableSymbols}
                emptyText="最近窗口没有品种被长期固定在可执行态。"
              />
              <DriftList
                title="长期 allow_executable = false"
                items={audit.neverExecutableSymbols}
                emptyText="最近窗口没有品种被长期固定在不可执行态。"
              />
            </div>
          </Section>

          <Section title="策略族统计" icon={Layers3} subtitle="当前窗口活跃度。">
            <div className={TABLE_CLASS}>
              <TableScroll className="max-h-[260px]">
                {(audit.signalFamilies.length === 0 ? [{ label: '暂无', count: 0 }] : audit.signalFamilies.slice(0, 8)).map((item, index) => (
                  <article
                    key={`family-${item.label}`}
                    className={cn('flex items-center justify-between gap-4 px-4 py-3.5', TABLE_ROW_CLASS, index > 0 && 'border-t', index % 2 === 1 && 'bg-white/[0.015]')}
                  >
                    <div className="text-sm text-white">{translateStrategyFamilyLabel(item.label)}</div>
                    <div className="font-mono tabular-nums text-sm text-slate-300">{item.count}</div>
                  </article>
                ))}
              </TableScroll>
            </div>
          </Section>

          <Section title="规则与周期热度" icon={ShieldCheck} subtitle="规则与周期分布。">
            <div className="space-y-3">
              <div className={TABLE_CLASS}>
                <div className={cn(TABLE_HEAD_CLASS, 'grid grid-cols-[1fr_auto] gap-3 px-4 py-3')}>
                  <div>规则</div>
                  <div>次数</div>
                </div>
                <TableScroll className="max-h-[220px]">
                  {(audit.brooksRules.length === 0 ? [{ label: '暂无', count: 0 }] : audit.brooksRules.slice(0, 8)).map((item, index) => (
                    <article
                      key={`rule-${item.label}`}
                      className={cn('flex items-center justify-between gap-4 px-4 py-3.5', TABLE_ROW_CLASS, index > 0 && 'border-t', index % 2 === 1 && 'bg-white/[0.015]')}
                    >
                      <div className="text-sm text-white">{item.label}</div>
                      <div className="font-mono tabular-nums text-sm text-slate-300">{item.count}</div>
                    </article>
                  ))}
                </TableScroll>
              </div>

              <div className={TABLE_CLASS}>
                <div className={cn(TABLE_HEAD_CLASS, 'grid grid-cols-[1fr_auto] gap-3 px-4 py-3')}>
                  <div>周期</div>
                  <div>次数</div>
                </div>
                <TableScroll className="max-h-[220px]">
                  {(audit.timeframeSignals.length === 0 ? [{ label: '暂无', count: 0 }] : audit.timeframeSignals.slice(0, 8)).map((item, index) => (
                    <article
                      key={`tf-${item.label}`}
                      className={cn('flex items-center justify-between gap-4 px-4 py-3.5', TABLE_ROW_CLASS, index > 0 && 'border-t', index % 2 === 1 && 'bg-white/[0.015]')}
                    >
                      <div className="text-sm text-white">{item.label}</div>
                      <div className="font-mono tabular-nums text-sm text-slate-300">{item.count}</div>
                    </article>
                  ))}
                </TableScroll>
              </div>
            </div>
          </Section>

          <Section title="观察层卡住统计" icon={AlertTriangle} subtitle="长期停留在观察层的品种。">
            {audit.stuckWatchingSymbols.length === 0 ? (
              <EmptyState text="最近窗口里没有明显长期卡在观察区的品种。" />
            ) : (
              <div className={TABLE_CLASS}>
                <TableScroll className="max-h-[320px]">
                  <div className={cn(TABLE_HEAD_CLASS, 'sticky top-0 z-10 hidden grid-cols-[0.8fr_0.65fr_0.55fr_0.9fr] gap-3 bg-[#091019]/95 px-4 py-3 md:grid')}>
                    <div className={cn('md:sticky md:left-0', TABLE_STICKY_HEAD_CLASS)}>品种</div>
                    <div>连续观察</div>
                    <div>最近状态</div>
                    <div>周期信号</div>
                  </div>
                  {audit.stuckWatchingSymbols.map((item, index) => (
                    <article
                      key={`stuck-${item.symbol}`}
                      className={cn(
                        'grid gap-3 px-4 py-4 md:grid-cols-[0.8fr_0.65fr_0.55fr_0.9fr]',
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
                        <div className="font-medium text-white">{item.symbol}</div>
                        <div className={MUTED_CLASS}>{item.exchange} · {item.bucket}</div>
                      </div>
                      <div className="font-mono tabular-nums text-sm text-amber-200">{item.watchStreak} 轮</div>
                      <div>
                        <TerminalBadge className={statusTone(item.latestStatus || 'watch')}>
                          {translateStatusLabel(item.latestStatus || '-')}
                        </TerminalBadge>
                      </div>
                      <div className="text-sm text-slate-400">
                        {Object.entries(item.latestSignals || {})
                          .map(([timeframe, signal]) => `${timeframe}:${signal}`)
                          .join(' / ') || '无'}
                      </div>
                    </article>
                  ))}
                </TableScroll>
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

function DriftMetric({
  label,
  value,
  sub,
  tone = 'neutral',
}: {
  label: string;
  value: number;
  sub: string;
  tone?: 'neutral' | 'info' | 'warn' | 'danger';
}) {
  const toneClass =
    tone === 'danger'
      ? 'text-rose-200'
      : tone === 'warn'
        ? 'text-amber-200'
        : tone === 'info'
          ? 'text-cyan-100'
          : 'text-white';
  return (
    <article className={TABLE_CLASS}>
      <div className="px-4 py-4">
        <div className={LABEL_CLASS}>{label}</div>
        <div className={cn('mt-2 font-mono text-2xl font-semibold', toneClass)}>{value}</div>
        <div className="mt-2 text-sm text-slate-400">{sub}</div>
      </div>
    </article>
  );
}

function DriftList({
  title,
  items,
  emptyText,
}: {
  title: string;
  items: Array<{ symbol: string; exchange: string; count: number }>;
  emptyText: string;
}) {
  return (
    <div className={TABLE_CLASS}>
      <div className={cn(TABLE_HEAD_CLASS, 'grid grid-cols-[1fr_auto] gap-3 px-4 py-3')}>
        <div>{title}</div>
        <div>轮次</div>
      </div>
      <TableScroll className="max-h-[220px]">
        {items.length === 0 ? (
          <div className="px-4 py-5 text-sm text-slate-500">{emptyText}</div>
        ) : (
          items.map((item, index) => (
            <article
              key={`${title}-${item.symbol}`}
              className={cn('flex items-center justify-between gap-4 px-4 py-3.5', TABLE_ROW_CLASS, index > 0 && 'border-t', index % 2 === 1 && 'bg-white/[0.015]')}
            >
              <div>
                <div className="text-sm text-white">{item.symbol}</div>
                <div className={MUTED_CLASS}>{item.exchange}</div>
              </div>
              <div className="font-mono tabular-nums text-sm text-slate-300">{item.count}</div>
            </article>
          ))
        )}
      </TableScroll>
    </div>
  );
}
