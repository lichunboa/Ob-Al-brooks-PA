'use client';

import type { AccountPanel, AuditSymbol, RuntimeData, SymbolCard } from './types';
import {
  accountRoleLabel,
  bucketCountsForSymbols,
  formatMoney,
  groupSymbolsByBucket,
  marketBucket,
} from './formatters';

export function normalizeSymbolText(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[\n,]/)
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean),
    ),
  );
}

export function buildTrackedSymbols(runtimeData: RuntimeData | null): string[] {
  if (!runtimeData) return [];
  return Array.from(new Set([...runtimeData.runtime.activeSymbols, ...runtimeData.runtime.focusSymbols]));
}

export function buildSymbolBuckets(symbols: string[]): Record<string, number> {
  return symbols.reduce<Record<string, number>>((acc, symbol) => {
    const bucket = marketBucket(symbol);
    acc[bucket] = (acc[bucket] || 0) + 1;
    return acc;
  }, {});
}

export function summarizeBalances(accounts: RuntimeData['system']['accounts']): string {
  return accounts
    .map((item) => `${item.label || item.exchange} ${formatMoney(item.balanceTotal, item.accountAsset || 'USD')}`)
    .join(' / ');
}

export function summarizeAvailable(accounts: RuntimeData['system']['accounts']): string {
  return accounts
    .map((item) => `${item.label || item.exchange} ${formatMoney(item.balanceAvailable, item.accountAsset || 'USD')}`)
    .join(' / ');
}

export function summarizeCoverage(accounts: RuntimeData['system']['accounts']): string {
  return accounts
    .map((item) => `${item.label || item.exchange} ${(item.configuredSymbols || []).length}`)
    .join(' / ');
}

export function buildAuditSymbolMap(auditSymbols: AuditSymbol[]): Map<string, AuditSymbol> {
  return new Map(auditSymbols.map((item) => [item.symbol, item]));
}

export function buildAccountPanels(
  accounts: RuntimeData['system']['accounts'],
  symbolCards: SymbolCard[],
  trackedSymbols: string[],
  auditSymbolMap: Map<string, AuditSymbol>,
): AccountPanel[] {
  return accounts.map((account) => {
    const configuredSymbols = account.configuredSymbols || [];
    const symbolSet = new Set(configuredSymbols);
    const scopedStates = symbolCards.filter((item) => symbolSet.has(item.symbol));
    const scopedFocus = trackedSymbols.filter((symbol) => symbolSet.has(symbol));
    const scopedCandidateCount = scopedStates.filter((item) =>
      /candidate|entry|ready|executable/i.test(`${item.status || ''} ${item.execution_summary || ''}`),
    ).length;
    const scopedWatchingCount = scopedStates.filter((item) =>
      (item.status || '').toLowerCase().includes('watch'),
    ).length;

    return {
      account,
      configuredSymbols,
      bucketCounts: bucketCountsForSymbols(configuredSymbols),
      groupedSymbols: groupSymbolsByBucket(configuredSymbols),
      scopedStates,
      scopedFocus,
      scopedCandidateCount,
      scopedWatchingCount,
      topStates: scopedStates.slice(0, 3).map((item) => ({
        ...item,
        audit: auditSymbolMap.get(item.symbol),
      })),
    };
  });
}

export function countCandidateLike(symbolCards: SymbolCard[]): number {
  return symbolCards.filter((item) =>
    /candidate|entry|ready|executable|manage|trade/i.test(`${item.status || ''} ${item.execution_summary || ''}`),
  ).length;
}

export function countWatching(symbolCards: SymbolCard[]): number {
  return symbolCards.filter((item) => (item.status || '').toLowerCase().includes('watch')).length;
}

export function pickBestCandidateCard(
  runtimeData: RuntimeData | null,
  symbolCards: SymbolCard[],
): SymbolCard | null {
  if (!symbolCards.length) return null;
  if (!runtimeData?.runtime.bestCandidate) return symbolCards[0] || null;
  return symbolCards.find((item) => item.symbol === runtimeData.runtime.bestCandidate) || symbolCards[0] || null;
}

export function buildStuckWatchRows(
  runtimeData: RuntimeData | null,
): RuntimeData['audit']['stuckWatchingSymbols'] {
  if (!runtimeData) return [];
  const explicit = runtimeData.audit.stuckWatchingSymbols || [];
  if (explicit.length > 0) return explicit.slice(0, 8);
  return [...(runtimeData.audit.symbols || [])]
    .filter((item) => item.watchingCount > 0)
    .sort((a, b) => {
      if (b.watchStreak !== a.watchStreak) return b.watchStreak - a.watchStreak;
      return b.watchingCount - a.watchingCount;
    })
    .slice(0, 8);
}

const NON_EXECUTION_STATUSES = new Set([
  'LOG_ONLY',
  'NO_ACTION',
  'SKIPPED',
  'PASS',
  'LIVE_ENTRY_CONFLICT',
  'DUPLICATE_SKIPPED',
  'VALIDATION_REJECTED',
  'HISTORICAL_ENTRY',
  'SKIPPED_MIN_NOTIONAL',
]);

export function isRealExecutionStatus(status: string | null | undefined): boolean {
  const upper = String(status || '').toUpperCase();
  if (!upper) return false;
  return !NON_EXECUTION_STATUSES.has(upper);
}

export function filterRealExecutionEvents(events: RuntimeData['recentExecutions']): RuntimeData['recentExecutions'] {
  return events.filter((item) => isRealExecutionStatus(item.status));
}

export function buildAccountRouteSummary(accountPanels: AccountPanel[]): Array<{
  label: string;
  role: string;
  snapshot: string;
  asset: string;
  state: string;
}> {
  return accountPanels.map((panel) => ({
    label: panel.account.label || panel.account.exchange,
    role: accountRoleLabel(panel.account.role),
    snapshot: panel.account.stale ? '回退快照' : '实时快照',
    asset: formatMoney(panel.account.balanceTotal, panel.account.accountAsset || 'USD'),
    state: panel.account.canTrade ? '可交易' : '阻塞',
  }));
}
