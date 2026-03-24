'use client';

import React from 'react';
import { Activity, Clock3, Cpu, RefreshCw, ShieldCheck } from 'lucide-react';
import type { RuntimeData } from './types';
import { formatDuration, formatNumber, translateHealthLabel } from './formatters';

export const CARD_CLASS =
  'rounded-[16px] border border-[#16222c] bg-[linear-gradient(180deg,rgba(10,14,19,0.99),rgba(8,11,16,1))] shadow-[inset_0_1px_0_rgba(255,255,255,0.02),0_18px_36px_rgba(0,0,0,0.18)]';
export const SECTION_CLASS =
  'rounded-[18px] border border-[#18232d] bg-[linear-gradient(180deg,rgba(7,10,15,0.995),rgba(5,8,12,1))] shadow-[0_18px_38px_rgba(0,0,0,0.2)]';
export const TERMINAL_STRIP_CLASS =
  'rounded-[16px] border border-[#17232d] bg-[linear-gradient(180deg,rgba(8,12,17,0.985),rgba(7,10,14,0.99))] shadow-[0_14px_32px_rgba(0,0,0,0.18)]';
export const SUBCARD_CLASS =
  'rounded-[15px] border border-[#1a2630] bg-[linear-gradient(180deg,rgba(255,255,255,0.018),rgba(255,255,255,0.008))]';
export const TABLE_CLASS = 'overflow-hidden rounded-[15px] border border-[#17212b] bg-[#0a1016]/98 shadow-[inset_0_1px_0_rgba(255,255,255,0.018)]';
export const TABLE_HEAD_CLASS = 'border-b border-[#17212b] text-[10px] uppercase tracking-[0.22em] text-slate-500/90';
export const TABLE_ROW_CLASS =
  'border-[#17212b] text-sm transition-[background-color,border-color] duration-150 hover:bg-[#0f1821]';
export const LABEL_CLASS = 'text-[10px] uppercase tracking-[0.24em] text-slate-500';
export const MUTED_CLASS = 'text-xs text-slate-500';
export const VALUE_CLASS = 'text-sm font-medium text-slate-100';
export const BADGE_BASE_CLASS =
  'inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-[0.32rem] text-[10px] font-medium tracking-[0.15em] uppercase text-slate-200/95 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]';
export const BUTTON_GHOST_CLASS =
  'inline-flex items-center gap-2 rounded-full bg-white/[0.03] px-4 py-2 text-sm text-slate-100 transition duration-150 hover:bg-white/[0.06] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60';
export const BUTTON_ACCENT_CLASS =
  'inline-flex items-center gap-2 rounded-full bg-[#88bfb2]/14 px-4 py-2 text-sm text-[#d8f2e9] transition duration-150 hover:bg-[#88bfb2]/22 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60';
export const INPUT_CLASS =
  'w-full appearance-none rounded-[12px] border border-[#1a2732] !bg-[#0a1016] px-4 py-3 text-slate-100 [color-scheme:dark] shadow-[inset_0_1px_0_rgba(255,255,255,0.018)] outline-none transition placeholder:text-slate-600 focus:border-[#4f7c74] focus:!bg-[#0c131a]';
export const SKELETON_BLOCK_CLASS = 'animate-pulse rounded-[12px] bg-white/[0.05]';
export const DATA_VALUE_CLASS = 'font-mono tabular-nums text-white';
export const TABLE_STICKY_HEAD_CLASS =
  'sticky left-0 z-[3] bg-[#0a1016]/98 shadow-[10px_0_14px_rgba(2,6,12,0.28)]';
export const TABLE_STICKY_CELL_CLASS =
  'sticky left-0 z-[2] bg-[#0a1016]/98 shadow-[8px_0_12px_rgba(2,6,12,0.18)]';
export const TABLE_STICKY_CELL_ALT_CLASS =
  'sticky left-0 z-[2] bg-[#0e151d]/98 shadow-[8px_0_12px_rgba(2,6,12,0.18)]';

export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}

export function statusTone(value: string): string {
  const normalized = value.toLowerCase();
  if (
    normalized.includes('fail') ||
    normalized.includes('reject') ||
    normalized.includes('blocked') ||
    normalized.includes('unsupported')
  ) {
    return 'bg-rose-500/[0.12] text-rose-100';
  }
  if (
    normalized.includes('placed') ||
    normalized.includes('open') ||
    normalized.includes('new') ||
    normalized.includes('modified') ||
    normalized.includes('closed')
  ) {
    return 'bg-[#7cc9b3]/[0.12] text-[#d7fff0]';
  }
  if (normalized.includes('entry') || normalized.includes('candidate') || normalized.includes('executable')) {
    return 'bg-[#7aa8c8]/[0.12] text-[#d8efff]';
  }
  if (normalized.includes('trade') || normalized.includes('manage')) {
    return 'bg-[#7cc9b3]/[0.12] text-[#d7fff0]';
  }
  if (normalized.includes('watch') || normalized.includes('pre')) {
    return 'bg-[#b89c62]/[0.14] text-[#f2e1b8]';
  }
  return 'bg-white/[0.05] text-slate-200';
}

export function healthTone(value: string): string {
  const normalized = value.toUpperCase();
  if (normalized === 'HEALTHY') return 'text-emerald-300';
  if (normalized === 'DEGRADED') return 'text-amber-300';
  return 'text-rose-300';
}

export function badgeTone(kind: 'neutral' | 'info' | 'success' | 'warn' | 'danger' = 'neutral'): string {
  if (kind === 'info') return 'bg-[#7aa8c8]/[0.12] text-[#d8efff]';
  if (kind === 'success') return 'bg-[#7cc9b3]/[0.12] text-[#d7fff0]';
  if (kind === 'warn') return 'bg-[#b89c62]/[0.14] text-[#f2e1b8]';
  if (kind === 'danger') return 'bg-rose-500/[0.12] text-rose-100';
  return 'bg-white/[0.04] text-slate-200';
}

export function TerminalBadge({
  children,
  kind = 'neutral',
  className,
}: {
  children: React.ReactNode;
  kind?: 'neutral' | 'info' | 'success' | 'warn' | 'danger';
  className?: string;
}) {
  return <span className={cn(BADGE_BASE_CLASS, badgeTone(kind), className)}>{children}</span>;
}

export function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <article className={cn(CARD_CLASS, 'px-4 py-3.5')}>
      <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{label}</div>
      <div className="mt-2.5 font-mono tabular-nums text-[24px] leading-none font-semibold tracking-[-0.035em] text-white">{value}</div>
      {sub ? <div className="mt-2.5 text-[12px] leading-5 text-slate-400">{sub}</div> : null}
    </article>
  );
}

export function Section({
  title,
  icon: Icon,
  children,
  subtitle,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <section className={cn(SECTION_CLASS, 'px-4 py-4')}>
      <div className="mb-4 flex items-start justify-between gap-4 border-b border-white/6 pb-3">
        <div>
          <div className="flex items-center gap-2 text-slate-400">
            <Icon className="h-4 w-4" />
            <h2 className="text-[11px] uppercase tracking-[0.24em]">{title}</h2>
          </div>
          {subtitle ? <p className="mt-1.5 max-w-3xl text-[12px] leading-5 text-slate-500">{subtitle}</p> : null}
        </div>
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-[16px] border border-dashed border-white/[0.08] bg-black/18 px-4 py-7 text-center">
      <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">暂无数据</div>
      <div className="mt-2 text-sm leading-6 text-slate-400">{text}</div>
    </div>
  );
}

export function CompactEmptyState({ text }: { text: string }) {
  return (
    <div className="flex h-[76px] items-center justify-between rounded-[14px] border border-dashed border-white/[0.08] bg-black/18 px-4">
      <div>
        <div className="text-[10px] uppercase tracking-[0.24em] text-slate-500">暂无数据</div>
        <div className="mt-1.5 text-sm text-slate-400">{text}</div>
      </div>
      <div className="font-mono text-xs uppercase tracking-[0.22em] text-slate-600">EMPTY</div>
    </div>
  );
}

export function TableScroll({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn('max-h-[620px] overflow-auto overscroll-contain', className)}>{children}</div>;
}

export function LoadingShell() {
  return (
    <div className="space-y-6">
      <section className={cn(SECTION_CLASS, 'px-4 py-5')}>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_320px]">
          <div className="space-y-4">
            <div className={cn(SKELETON_BLOCK_CLASS, 'h-5 w-32')} />
            <div className={cn(SKELETON_BLOCK_CLASS, 'h-10 w-56')} />
            <div className={cn(SKELETON_BLOCK_CLASS, 'h-20 w-full')} />
            <div className="grid gap-3 md:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={`loading-strip-${index}`} className={cn(SKELETON_BLOCK_CLASS, 'h-[92px]')} />
              ))}
            </div>
          </div>
          <div className="grid gap-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={`loading-side-${index}`} className={cn(SKELETON_BLOCK_CLASS, 'h-[84px]')} />
            ))}
          </div>
        </div>
      </section>
      <div className="grid gap-6 xl:grid-cols-[1.65fr_320px]">
        <div className="space-y-6">
          <div className={cn(SECTION_CLASS, 'h-[300px]')} />
          <div className="grid gap-6 xl:grid-cols-2">
            <div className={cn(SECTION_CLASS, 'h-[420px]')} />
            <div className={cn(SECTION_CLASS, 'h-[420px]')} />
          </div>
        </div>
        <div className="space-y-6">
          <div className={cn(SECTION_CLASS, 'h-[320px]')} />
          <div className={cn(SECTION_CLASS, 'h-[280px]')} />
        </div>
      </div>
    </div>
  );
}

export function PageIntro({
  title,
  subtitle,
  runtimeData,
}: {
  title: string;
  subtitle: string;
  runtimeData: RuntimeData;
}) {
  return (
    <section className={cn(TERMINAL_STRIP_CLASS, 'px-4 py-3')}>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.28em] text-slate-500">当前页面</div>
          <div className="mt-1 text-xl font-semibold tracking-[-0.03em] text-white">{title}</div>
          <div className="mt-1 max-w-3xl text-[12px] leading-5 text-slate-500">{subtitle}</div>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[560px] lg:grid-cols-4">
          <div className="rounded-[13px] border border-white/7 bg-black/16 px-4 py-2.5">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5" />
              健康
            </div>
            <div className={cn('mt-1.5 text-[15px] font-semibold', healthTone(runtimeData.health.overall))}>
              {translateHealthLabel(runtimeData.health.overall)}
            </div>
          </div>
          <div className="rounded-[13px] border border-white/7 bg-black/16 px-4 py-2.5">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">
              <Clock3 className="h-3.5 w-3.5" />
              下轮
            </div>
            <div className="mt-1.5 font-mono tabular-nums text-[15px] font-semibold text-white">{runtimeData.nextScan.inSeconds ?? '-'} 秒</div>
          </div>
          <div className="rounded-[13px] border border-white/7 bg-black/16 px-4 py-2.5">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">
              <Activity className="h-3.5 w-3.5" />
              运行时间
            </div>
            <div className="mt-1.5 font-mono tabular-nums text-[15px] font-semibold text-white">
              {formatDuration(runtimeData.monitoring.uptimeSeconds ?? runtimeData.monitoring.sessionAgeSeconds)}
            </div>
          </div>
          <div className="rounded-[13px] border border-white/7 bg-black/16 px-4 py-2.5">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-slate-500">
              <Cpu className="h-3.5 w-3.5" />
              Profiling
            </div>
            <div className="mt-1.5 font-mono tabular-nums text-[15px] font-semibold text-white">
              {runtimeData.profiling.totalMs ? `${formatNumber(runtimeData.profiling.totalMs)} ms` : '-'}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function ErrorCard({ text }: { text: string }) {
  return (
    <div className="rounded-[32px] border border-rose-500/20 bg-rose-950/10 p-10 text-center">
      <RefreshCw className="mx-auto h-12 w-12 text-rose-300/70" />
      <div className="mt-4 text-2xl text-white">统一实盘链运行态不可用</div>
      <div className="mt-3 text-sm text-slate-400">{text}</div>
    </div>
  );
}
