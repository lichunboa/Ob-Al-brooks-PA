import type { RuntimeView } from './runtime-execution-fallback';

export type CapacityDetailLevel = 'summary' | 'full';

export function normalizeRuntimeView(value: string | null): RuntimeView {
  if (
    value === 'overview' ||
    value === 'accounts' ||
    value === 'orders' ||
    value === 'audit' ||
    value === 'review' ||
    value === 'system' ||
    value === 'settings' ||
    value === 'full'
  ) {
    return value;
  }
  return 'overview';
}

export function shouldIncludeAudit(view: RuntimeView): boolean {
  return view === 'audit' || view === 'full';
}

export function shouldIncludeSymbols(view: RuntimeView): boolean {
  return view === 'overview' || view === 'accounts' || view === 'audit' || view === 'review' || view === 'full';
}

export function shouldIncludeExposure(view: RuntimeView): boolean {
  return view === 'overview' || view === 'orders' || view === 'review' || view === 'full';
}

export function shouldIncludeExecutionHistory(view: RuntimeView): boolean {
  return view === 'orders' || view === 'review' || view === 'full';
}

export function shouldIncludeCapacity(view: RuntimeView): boolean {
  return view === 'overview' || view === 'orders' || view === 'review' || view === 'full';
}

export function capacityDetailLevel(view: RuntimeView): CapacityDetailLevel {
  return view === 'orders' || view === 'review' || view === 'full' ? 'full' : 'summary';
}

export function shouldIncludeSystemHistory(view: RuntimeView): boolean {
  return view === 'system' || view === 'full';
}

export function runtimeViewCacheTtlMs(view: RuntimeView): number {
  if (view === 'orders' || view === 'review') return 3000;
  if (view === 'overview') return 8000;
  if (view === 'accounts' || view === 'system') return 8000;
  if (view === 'settings') return 12000;
  if (view === 'audit') return 15000;
  return 5000;
}
