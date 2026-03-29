import { buildRuntimeExecutionContext } from './runtime-execution-context';
import { buildCapacitySummary as buildRuntimeCapacitySummary } from './runtime-capacity';
import { normalizeSymbolKey } from './runtime-symbols';
import {
  readJsonlRecent,
  readJsonlRecentMeaningful,
  safeStatMtimeMs,
  recentCyclePayloads,
  latestCycleFileStamp,
  type RuntimeFiles,
} from './runtime-files';
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  type UnknownRecord,
} from './runtime-route-shared';
import type { CapacityDetailLevel } from './runtime-route-policy';

const executionContextCache = new Map<string, { expiresAt: number; payload: ReturnType<typeof buildRuntimeExecutionContext> }>();
const capacitySummaryCache = new Map<string, { expiresAt: number; payload: UnknownRecord }>();

function executionContextCacheTtlMs() {
  return 6000;
}

function capacitySummaryCacheTtlMs() {
  return 6000;
}

export function readExecutionHistoryResetMs(resetFilePath: string): number {
  try {
    const fs = require('fs') as typeof import('fs');
    if (!fs.existsSync(resetFilePath)) return 0;
    const payload = JSON.parse(fs.readFileSync(resetFilePath, 'utf-8')) as UnknownRecord;
    const text = asString(payload.reset_at || payload.resetAt || payload.cutoff_at || payload.cutoffAt);
    if (!text) return 0;
    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

export function filterExecutionRowsAfterReset(rows: UnknownRecord[], resetFilePath: string): UnknownRecord[] {
  const cutoffMs = readExecutionHistoryResetMs(resetFilePath);
  if (!cutoffMs) return rows;
  return rows.filter((row) => {
    const loggedAt = asString(row.logged_at) || asString(row.timestamp);
    if (!loggedAt) return false;
    const parsed = Date.parse(loggedAt);
    if (!Number.isFinite(parsed)) return false;
    return parsed >= cutoffMs;
  });
}

function positionsFingerprint(positions: UnknownRecord[]): string {
  return positions
    .map((item) => {
      const record = asRecord(item);
      return [
        normalizeSymbolKey(asString(record.symbol)),
        asString(record.exchange).toUpperCase(),
        asString(record.side).toUpperCase(),
        asNumber(record.quantity) ?? asNumber(record.contracts) ?? asNumber(record.size) ?? 0,
      ].join(':');
    })
    .sort()
    .join('|');
}

function ordersFingerprint(orders: UnknownRecord[]): string {
  return orders
    .map((item) => {
      const record = asRecord(item);
      return [
        normalizeSymbolKey(asString(record.symbol)),
        asString(record.exchange).toUpperCase(),
        asString(record.orderId || record.order_id || record.id),
        asString(record.orderType || record.order_type).toUpperCase(),
        asNumber(record.quantity) ?? 0,
        asNumber(record.stopPrice || record.stop_price) ?? 0,
      ].join(':');
    })
    .sort()
    .join('|');
}

function trackedSymbolsFingerprint(symbols: string[]): string {
  return symbols.map((item) => asString(item).trim().toUpperCase()).filter(Boolean).sort().join('|');
}

export function buildExecutionContextCached(
  files: RuntimeFiles,
  openPositions: UnknownRecord[],
  openOrders: UnknownRecord[],
  resetFilePath: string,
): ReturnType<typeof buildRuntimeExecutionContext> {
  const cacheKey = [
    files.executionLog,
    safeStatMtimeMs(files.executionLog),
    latestCycleFileStamp(files),
    positionsFingerprint(openPositions),
    ordersFingerprint(openOrders),
    safeStatMtimeMs(resetFilePath),
  ].join('||');
  const cached = executionContextCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.payload;
  }

  const payload = buildRuntimeExecutionContext({
    cycles: recentCyclePayloads(files, 64),
    executionRows: filterExecutionRowsAfterReset(
      readJsonlRecentMeaningful(files.executionLog, 1400, 50000),
      resetFilePath,
    ),
    openPositions,
    openOrders,
  });
  executionContextCache.set(cacheKey, {
    expiresAt: Date.now() + executionContextCacheTtlMs(),
    payload,
  });
  return payload;
}

export function buildCapacitySummaryCached(
  files: RuntimeFiles,
  execution: UnknownRecord,
  positions: UnknownRecord[],
  orders: UnknownRecord[],
  trackedSymbols: string[],
  detailLevel: CapacityDetailLevel,
) {
  const cacheKey = [
    files.executionLog,
    safeStatMtimeMs(files.executionLog),
    positionsFingerprint(positions),
    ordersFingerprint(orders),
    trackedSymbolsFingerprint(trackedSymbols),
    asString(asRecord(asRecord(execution.bot_summary).config).max_positions),
    detailLevel,
  ].join('||');
  const cached = capacitySummaryCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.payload;
  }

  const payload = buildRuntimeCapacitySummary(files, execution, positions, orders, trackedSymbols, detailLevel);
  capacitySummaryCache.set(cacheKey, {
    expiresAt: Date.now() + capacitySummaryCacheTtlMs(),
    payload,
  });
  return payload;
}
