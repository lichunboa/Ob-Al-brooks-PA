'use client';

import React from 'react';
import { Activity, Clock3, Cpu, RefreshCw, ShieldCheck } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { RuntimeData } from './types';
import { formatDuration, formatNumber, formatTime, translateHealthLabel, translateSourceLabel } from './formatters';

/* ── cn: proper tailwind-merge utility ── */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/* ── Design Tokens as class constants ── */
export const CARD_CLASS =
  'rounded-xl border border-border bg-surface';
export const SECTION_CLASS = CARD_CLASS;
export const TERMINAL_STRIP_CLASS = CARD_CLASS;
export const SUBCARD_CLASS =
  'rounded-lg border border-border bg-surface-raised/50';
export const TABLE_CLASS =
  'overflow-hidden rounded-xl border border-border bg-surface';
export const TABLE_HEAD_CLASS =
  'border-b border-border text-xs font-medium uppercase tracking-wider text-foreground-faint';
export const TABLE_ROW_CLASS =
  'border-border text-sm transition-colors hover:bg-white/[0.03]';
export const LABEL_CLASS =
  'text-xs font-medium uppercase tracking-wider text-foreground-faint';
export const MUTED_CLASS =
  'text-xs text-foreground-muted';
export const BADGE_BASE_CLASS =
  'inline-flex items-center whitespace-nowrap rounded-md px-2 py-1 text-xs font-medium';
export const BUTTON_GHOST_CLASS =
  'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-white/5 active:bg-white/[0.08] disabled:pointer-events-none disabled:opacity-50';
export const BUTTON_ACCENT_CLASS =
  'inline-flex items-center gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm font-medium text-accent transition-colors hover:bg-accent/20 active:bg-accent/25 disabled:pointer-events-none disabled:opacity-50';
export const INPUT_CLASS =
  'w-full rounded-lg border border-border-strong bg-surface px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-foreground-faint focus:border-accent focus:ring-2 focus:ring-ring';
export const SKELETON_BLOCK_CLASS =
  'animate-pulse rounded-lg bg-white/[0.06]';
export const DATA_VALUE_CLASS =
  'font-mono tabular-nums text-foreground';
export const TABLE_STICKY_HEAD_CLASS =
  'sticky left-0 z-[3] bg-surface';
export const TABLE_STICKY_CELL_CLASS =
  'sticky left-0 z-[2] bg-surface';
export const TABLE_STICKY_CELL_ALT_CLASS = TABLE_STICKY_CELL_CLASS;

/* ── Tone helpers ── */
export function statusTone(value: string): string {
  const n = value.toLowerCase();
  if (n.includes('fail') || n.includes('reject') || n.includes('blocked') || n.includes('unsupported'))
    return 'bg-danger/10 text-danger';
  if (n.includes('placed') || n.includes('open') || n.includes('new') || n.includes('modified') || n.includes('closed'))
    return 'bg-success/10 text-success';
  if (n.includes('entry') || n.includes('candidate') || n.includes('executable'))
    return 'bg-info/10 text-info';
  if (n.includes('trade') || n.includes('manage'))
    return 'bg-success/10 text-success';
  if (n.includes('watch') || n.includes('pre'))
    return 'bg-warning/10 text-warning';
  return 'bg-white/5 text-foreground-muted';
}

export function healthTone(value: string): string {
  const n = value.toUpperCase();
  if (n === 'HEALTHY') return 'text-success';
  if (n === 'DEGRADED') return 'text-warning';
  return 'text-danger';
}

export function badgeTone(kind: 'neutral' | 'info' | 'success' | 'warn' | 'danger' = 'neutral'): string {
  if (kind === 'info') return 'bg-info/10 text-info';
  if (kind === 'success') return 'bg-success/10 text-success';
  if (kind === 'warn') return 'bg-warning/10 text-warning';
  if (kind === 'danger') return 'bg-danger/10 text-danger';
  return 'bg-white/5 text-foreground-muted';
}

/* ── Components ── */

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
    <article className={cn(CARD_CLASS, 'px-4 py-4')}>
      <div className="text-xs font-medium text-foreground-faint">{label}</div>
      <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-foreground">{value}</div>
      {sub ? <div className="mt-2 text-xs text-foreground-muted">{sub}</div> : null}
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
    <section className={cn(CARD_CLASS, 'px-5 py-5')}>
      <div className="mb-4 flex items-center gap-2 border-b border-border pb-3">
        <Icon className="size-4 text-foreground-muted" />
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {subtitle ? <span className="ml-2 text-xs text-foreground-faint">{subtitle}</span> : null}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center">
      <div className="text-xs font-medium text-foreground-faint">暂无数据</div>
      <div className="mt-2 text-sm text-foreground-muted">{text}</div>
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
    <div className="flex flex-col gap-5 animate-fade-in">
      <section className={cn(CARD_CLASS, 'px-5 py-5')}>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.7fr)_320px]">
          <div className="flex flex-col gap-4">
            <div className={cn(SKELETON_BLOCK_CLASS, 'h-5 w-32')} />
            <div className={cn(SKELETON_BLOCK_CLASS, 'h-10 w-56')} />
            <div className={cn(SKELETON_BLOCK_CLASS, 'h-20 w-full')} />
            <div className="grid gap-3 md:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={`ls-${i}`} className={cn(SKELETON_BLOCK_CLASS, 'h-[92px]')} />
              ))}
            </div>
          </div>
          <div className="grid gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={`rs-${i}`} className={cn(SKELETON_BLOCK_CLASS, 'h-[84px]')} />
            ))}
          </div>
        </div>
      </section>
      <div className="grid gap-5 xl:grid-cols-[1.65fr_320px]">
        <div className="flex flex-col gap-5">
          <div className={cn(CARD_CLASS, 'h-[300px]')} />
          <div className="grid gap-5 xl:grid-cols-2">
            <div className={cn(CARD_CLASS, 'h-[420px]')} />
            <div className={cn(CARD_CLASS, 'h-[420px]')} />
          </div>
        </div>
        <div className="flex flex-col gap-5">
          <div className={cn(CARD_CLASS, 'h-[320px]')} />
          <div className={cn(CARD_CLASS, 'h-[280px]')} />
        </div>
      </div>
    </div>
  );
}

export function PageIntro({
  title,
  subtitle,
  runtimeData,
  updatedAt,
  sourceLabel,
}: {
  title: string;
  subtitle: string;
  runtimeData: RuntimeData;
  updatedAt?: string;
  sourceLabel?: string;
}) {
  return (
    <section className={cn(CARD_CLASS, 'px-5 py-4')}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">{title}</h1>
          <p className="mt-1 text-sm text-foreground-muted">{subtitle}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:min-w-[720px] lg:grid-cols-6">
          <StatusChip icon={ShieldCheck} label="健康" value={translateHealthLabel(runtimeData.health.overall)} tone={healthTone(runtimeData.health.overall)} />
          <StatusChip icon={Clock3} label="下轮" value={`${runtimeData.nextScan.inSeconds ?? '-'}s`} />
          <StatusChip icon={Activity} label="运行" value={formatDuration(runtimeData.monitoring.uptimeSeconds ?? runtimeData.monitoring.sessionAgeSeconds)} />
          <StatusChip icon={Cpu} label="耗时" value={runtimeData.profiling.totalMs ? `${formatNumber(runtimeData.profiling.totalMs)}ms` : '-'} />
          <StatusChip icon={RefreshCw} label="刷新" value={formatTime(updatedAt || null)} />
          <StatusChip icon={RefreshCw} label="来源" value={translateSourceLabel(sourceLabel || runtimeData.system.sourceLabel || '-')} />
        </div>
      </div>
    </section>
  );
}

function StatusChip({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface-raised/40 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-xs text-foreground-faint">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className={cn('mt-1 font-mono text-sm font-semibold tabular-nums', tone || 'text-foreground')}>
        {value}
      </div>
    </div>
  );
}

export function ProgressBar({
  value,
  max,
  label,
  className,
}: {
  value: number;
  max: number;
  label?: string;
  className?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {label ? (
        <div className="flex items-center justify-between text-xs">
          <span className="text-foreground-muted">{label}</span>
          <span className="font-mono tabular-nums text-foreground-faint">{pct}%</span>
        </div>
      ) : null}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            pct > 80 ? 'bg-danger' : pct > 50 ? 'bg-warning' : 'bg-accent',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function DotIndicator({ active, className }: { active: boolean; className?: string }) {
  return (
    <span className={cn('inline-block size-2 rounded-full', active ? 'bg-success' : 'bg-foreground-faint/40', className)} />
  );
}

export function ErrorCard({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-danger/20 bg-danger/5 p-8 text-center">
      <RefreshCw className="mx-auto size-10 text-danger/60" />
      <div className="mt-4 text-lg font-semibold text-foreground">数据不可用</div>
      <div className="mt-2 text-sm text-foreground-muted">{text}</div>
    </div>
  );
}
