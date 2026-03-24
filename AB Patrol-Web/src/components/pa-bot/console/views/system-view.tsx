'use client';

import React from 'react';
import { Activity, Clock3, Cpu, ShieldCheck } from 'lucide-react';
import type { RuntimeData } from '../types';
import { formatDuration, formatNumber, formatTime, translatePhaseLabel, translateSourceLabel, translateTradeReadiness } from '../formatters';
import {
  EmptyState,
  Section,
  TABLE_CLASS,
  TABLE_HEAD_CLASS,
  TABLE_ROW_CLASS,
  TABLE_STICKY_CELL_ALT_CLASS,
  TABLE_STICKY_CELL_CLASS,
  TABLE_STICKY_HEAD_CLASS,
  TableScroll,
  cn,
} from '../ui';

export function SystemView({ runtimeData }: { runtimeData: RuntimeData }) {
  const topStages = runtimeData.profiling.stages.slice(0, 8);
  const systemRows = [
    {
      label: 'Patrol',
      value: runtimeData.health.patrolLive ? '在线 / UP' : '离线 / DOWN',
      detail: formatTime(runtimeData.timestamps.latestCycleAt),
      note: '巡逻主循环',
    },
    {
      label: 'Query',
      value: runtimeData.health.queryLive ? '在线 / UP' : '离线 / DOWN',
      detail: translateSourceLabel(runtimeData.system.sourceLabel || '-'),
      note: '查询聚合',
    },
    {
      label: '扫描状态',
      value: translatePhaseLabel(runtimeData.runtime.phase || '-'),
      detail: runtimeData.health.freshnessLabel || '-',
      note: `${runtimeData.nextScan.inSeconds ?? '-'} 秒 · ${translateTradeReadiness(runtimeData.runtime.tradeReadiness || '-')}`,
    },
    {
      label: '运行时间',
      value: formatDuration(runtimeData.monitoring.uptimeSeconds ?? runtimeData.monitoring.sessionAgeSeconds),
      detail: runtimeData.runtime.dryRun ? '演练 / dry-run' : '自动 / live',
      note: 'Patrol 主循环',
    },
  ];

  return (
    <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
      <div className="space-y-6">
        <Section title="链路状态总表" icon={ShieldCheck} subtitle="核心链路状态。">
          <div className={TABLE_CLASS}>
            <TableScroll className="max-h-[520px]">
                <div
                  className={cn(
                    TABLE_HEAD_CLASS,
                    'sticky top-0 z-10 hidden grid-cols-[0.78fr_0.68fr_0.92fr_1.15fr] gap-3 bg-[#091019]/95 px-4 py-3 md:grid',
                  )}
                >
                  <div className={cn('md:sticky md:left-0', TABLE_STICKY_HEAD_CLASS)}>组件</div>
                  <div>状态</div>
                  <div>最近值</div>
                  <div>说明</div>
              </div>
              {systemRows.map((row, index) => (
                <article
                  key={row.label}
                  className={cn(
                    'grid gap-3 px-4 py-4 md:grid-cols-[0.78fr_0.68fr_0.92fr_1.15fr]',
                    TABLE_ROW_CLASS,
                    index > 0 && 'border-t',
                    index % 2 === 1 && 'bg-white/[0.015]',
                  )}
                >
                  <div
                    className={cn(
                      'font-medium text-white md:sticky md:left-0',
                      index % 2 === 1 ? TABLE_STICKY_CELL_ALT_CLASS : TABLE_STICKY_CELL_CLASS,
                    )}
                  >
                    {row.label}
                  </div>
                  <div
                    className={cn(
                      'text-sm font-medium',
                      row.value.includes('DOWN')
                        ? 'text-rose-300'
                        : row.value.includes('UP')
                          ? 'text-emerald-300'
                          : 'text-slate-200',
                    )}
                  >
                    {row.value}
                  </div>
                  <div className="text-sm text-slate-300">{row.detail}</div>
                  <div className="text-sm text-slate-400">{row.note}</div>
                </article>
              ))}
            </TableScroll>
          </div>
        </Section>

        <Section title="单轮耗时排行" icon={Cpu} subtitle="最重阶段。">
          {topStages.length === 0 ? (
            <EmptyState text="当前还没有 profiling 明细。" />
          ) : (
            <div className={TABLE_CLASS}>
              <TableScroll className="max-h-[520px]">
                <div
                  className={cn(
                    TABLE_HEAD_CLASS,
                    'sticky top-0 z-10 hidden grid-cols-[1.3fr_0.7fr_0.8fr] gap-3 bg-[#091019]/95 px-4 py-3 md:grid',
                  )}
                >
                  <div className={cn('md:sticky md:left-0', TABLE_STICKY_HEAD_CLASS)}>阶段</div>
                  <div>耗时</div>
                  <div>占比</div>
                </div>
                {topStages.map((stage, index) => {
                  const share = Math.min(
                    100,
                    ((stage.ms || 0) / Math.max(runtimeData.profiling.totalMs || 1, 1)) * 100,
                  );
                  return (
                    <article
                      key={stage.key}
                      className={cn(
                        'grid gap-3 px-4 py-4 md:grid-cols-[1.3fr_0.7fr_0.8fr]',
                        TABLE_ROW_CLASS,
                        index > 0 && 'border-t',
                        index % 2 === 1 && 'bg-white/[0.015]',
                      )}
                    >
                      <div
                        className={cn(
                          'text-sm text-slate-200 md:sticky md:left-0',
                          index % 2 === 1 ? TABLE_STICKY_CELL_ALT_CLASS : TABLE_STICKY_CELL_CLASS,
                        )}
                      >
                        {stage.label}
                      </div>
                      <div className="font-mono tabular-nums text-sm text-white">
                        {formatNumber(stage.ms, 2)} ms
                      </div>
                      <div className="space-y-2">
                        <div className="font-mono tabular-nums text-sm text-slate-300">
                          {formatNumber(share, 1)}%
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                          <div
                            className="h-full rounded-full bg-[linear-gradient(90deg,#38bdf8,#14b8a6)]"
                            style={{ width: `${share}%` }}
                          />
                        </div>
                      </div>
                    </article>
                  );
                })}
              </TableScroll>
            </div>
          )}
        </Section>
      </div>

      <div className="space-y-6">
        <Section title="最近轮次" icon={Activity} subtitle="近 5 轮摘要。">
          {runtimeData.recentCycles.length === 0 ? (
            <EmptyState text="当前没有最近轮次。" />
          ) : (
            <div className={TABLE_CLASS}>
              <TableScroll className="max-h-[420px]">
                <div
                  className={cn(
                    TABLE_HEAD_CLASS,
                    'sticky top-0 z-10 hidden grid-cols-[0.95fr_0.55fr_0.45fr_1.2fr] gap-3 bg-[#091019]/95 px-4 py-3 md:grid',
                  )}
                >
                  <div className={cn('md:sticky md:left-0', TABLE_STICKY_HEAD_CLASS)}>轮次</div>
                  <div>阶段</div>
                  <div>下轮</div>
                  <div>结论</div>
                </div>
                {runtimeData.recentCycles.map((cycle, index) => (
                  <article
                    key={cycle.cycleId}
                  className={cn(
                    'grid gap-3 px-4 py-4 md:grid-cols-[0.95fr_0.55fr_0.45fr_1.2fr]',
                    TABLE_ROW_CLASS,
                    index > 0 && 'border-t',
                    index % 2 === 1 && 'bg-white/[0.015]',
                  )}
                >
                  <div
                    className={cn(
                      'font-mono text-sm text-white md:sticky md:left-0',
                      index % 2 === 1 ? TABLE_STICKY_CELL_ALT_CLASS : TABLE_STICKY_CELL_CLASS,
                    )}
                  >
                    {cycle.cycleId}
                  </div>
                  <div className="text-sm text-slate-300">{translatePhaseLabel(cycle.phase || '-')}</div>
                    <div className="font-mono tabular-nums text-sm text-slate-300">{cycle.nextScanSeconds ?? '-'} 秒</div>
                    <div className="text-sm text-slate-400">{cycle.summary || '-'}</div>
                  </article>
                ))}
              </TableScroll>
            </div>
          )}
        </Section>

        <Section title="失败与时间戳" icon={Clock3} subtitle="成功与失败记录。">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-[16px] border border-white/[0.06] bg-white/[0.02] px-4 py-4">
              <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">最新成功</div>
              <div className="mt-3 font-mono text-lg text-white">{runtimeData.summary.cycleId || '-'}</div>
              <div className="mt-2 text-sm text-slate-400">{formatTime(runtimeData.timestamps.latestCycleAt)}</div>
            </div>
            <div className="rounded-[16px] border border-white/[0.06] bg-white/[0.02] px-4 py-4">
              <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">最近失败</div>
              <div className="mt-3 text-lg font-semibold text-white">
                {runtimeData.timestamps.lastFailureAt ? '有记录' : '无'}
              </div>
              <div className="mt-2 text-sm leading-6 text-slate-400">
                {runtimeData.timestamps.lastFailureAt
                  ? `${formatTime(runtimeData.timestamps.lastFailureAt)} · ${
                      runtimeData.timestamps.lastFailureReason || '-'
                    }`
                  : '最近没有失败记录'}
              </div>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}
