import fs from 'fs';
import path from 'path';

import { AGENT_ROOT } from './live-monitoring';
import {
  hasRuntimeData,
  latestCycle,
  readJson,
  readJsonlRecent,
  readJsonlTail,
  readText,
  recentCycles,
  runtimeFiles,
  safeStatMtimeMs,
} from './runtime-files';
import {
  buildExecutionFallbackCached,
  fetchJson,
  type RuntimeConfigInput,
  type RuntimeView,
} from './runtime-execution-fallback';
import { buildAuditSummary } from './runtime-route-audit';
import { normalizePayload } from './runtime-route-normalizer';
import {
  buildCapacitySummaryCached,
  buildExecutionContextCached,
} from './runtime-route-cache';
import {
  capacityDetailLevel,
  shouldIncludeAudit,
  shouldIncludeCapacity,
  shouldIncludeExecutionHistory,
  shouldIncludeExposure,
  shouldIncludeSymbols,
  shouldIncludeSystemHistory,
} from './runtime-route-policy';
import {
  asArray,
  asNumber,
  asRecord,
  asString,
  isRecord,
  type UnknownRecord,
} from './runtime-route-shared';

const PATROL_PID_FILE = path.join(AGENT_ROOT, 'data', 'run', 'service.pid');
const EXECUTION_HISTORY_RESET_FILE = path.join(AGENT_ROOT, 'data', 'run', 'web_execution_history_reset.json');

export type RuntimeConfig = RuntimeConfigInput & { label: string };
export type RuntimeRoutePayload = {
  generatedAt: string;
  primary: UnknownRecord | null;
  secondary: null;
  runtimes: UnknownRecord[];
};

const performanceSnapshotCache = new Map<string, { expiresAt: number; payload: UnknownRecord }>();

function performanceCacheTtlMs() {
  return 15000;
}

export function parseElapsedToSeconds(value: string): number | null {
  const text = value.trim();
  if (!text) return null;
  const daySplit = text.split('-');
  let days = 0;
  let clockText = text;
  if (daySplit.length === 2) {
    days = Number(daySplit[0]);
    clockText = daySplit[1];
  }
  const parts = clockText.split(':').map((item) => Number(item));
  if (parts.some((item) => Number.isNaN(item))) return null;
  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return days * 86400 + minutes * 60 + seconds;
  }
  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return days * 86400 + hours * 3600 + minutes * 60 + seconds;
  }
  return null;
}

export function readProcessUptimeSeconds(pidFilePath: string): number | null {
  try {
    if (!fs.existsSync(pidFilePath)) return null;
    const pid = fs.readFileSync(pidFilePath, 'utf-8').trim();
    if (!pid) return null;
    return null;
  } catch {
    return null;
  }
}

function shanghaiRangeStartIso(days = 2) {
  const offsetMs = 8 * 60 * 60 * 1000;
  const shiftedNow = new Date(Date.now() + offsetMs);
  const year = shiftedNow.getUTCFullYear();
  const month = shiftedNow.getUTCMonth();
  const day = shiftedNow.getUTCDate();
  const startUtcMs = Date.UTC(year, month, day - days, 0, 0, 0) - offsetMs;
  return new Date(startUtcMs).toISOString();
}

function summarizeTradingRange(rows: unknown[], startMs: number, endMs: number) {
  const filtered = asArray(rows).filter((item) => {
    const record = asRecord(item);
    const timestamp = asString(record.timestamp);
    if (!timestamp) return false;
    const parsed = Date.parse(timestamp);
    if (!Number.isFinite(parsed)) return false;
    return parsed >= startMs && parsed < endMs;
  });
  const realizedRows = filtered.filter((item) => Math.abs(asNumber(asRecord(item).realized_pnl) ?? 0) > 1e-9);
  const wins = realizedRows.filter((item) => (asNumber(asRecord(item).realized_pnl) ?? 0) > 0);
  const losses = realizedRows.filter((item) => (asNumber(asRecord(item).realized_pnl) ?? 0) < 0);
  const grossProfit = wins.reduce<number>((sum, item) => sum + (asNumber(asRecord(item).realized_pnl) ?? 0), 0);
  const grossLoss = losses.reduce<number>((sum, item) => sum + Math.abs(asNumber(asRecord(item).realized_pnl) ?? 0), 0);
  const commission = realizedRows.reduce<number>((sum, item) => sum + (asNumber(asRecord(item).commission) ?? 0), 0);
  const netRealized = realizedRows.reduce<number>((sum, item) => sum + (asNumber(asRecord(item).realized_pnl) ?? 0), 0);
  const realizedTradeCount = realizedRows.length;
  const winRatePct = realizedTradeCount > 0 ? (wins.length / realizedTradeCount) * 100 : 0;
  return {
    tradeRows: filtered.length,
    realizedTradeCount,
    wins: wins.length,
    losses: losses.length,
    winRatePct,
    grossProfit,
    grossLoss,
    profitFactor: grossLoss > 0 ? grossProfit / grossLoss : null,
    commission,
    netRealized,
    bySymbol: Object.entries(
      realizedRows.reduce<Record<string, number>>((acc, item) => {
        const record = asRecord(item);
        const symbol = asString(record.symbol);
        if (!symbol) return acc;
        acc[symbol] = (acc[symbol] || 0) + (asNumber(record.realized_pnl) ?? 0);
        return acc;
      }, {}),
    ).map(([symbol, netPnl]) => ({ symbol, netPnl })).sort((left, right) => right.netPnl - left.netPnl),
  };
}

function summarizeCleanupStats(rows: UnknownRecord[], exchange: string, startMs: number, endMs: number) {
  const stats = {
    partialClosed: 0,
    closeSuccess: 0,
    sizeFailed: 0,
    notFound: 0,
    modifyFailed: 0,
    modifySkipped: 0,
  };
  for (const row of rows) {
    const rowExchange = asString(row.exchange).trim().toLowerCase();
    if (rowExchange !== exchange) continue;
    const loggedAt = asString(row.logged_at) || asString(row.timestamp);
    const parsed = Date.parse(loggedAt);
    if (!Number.isFinite(parsed) || parsed < startMs || parsed >= endMs) continue;
    const type = asString(row.type).trim().toUpperCase();
    const status = asString(row.status).trim().toUpperCase();
    const message = asString(row.message);
    if (type === 'PARTIAL_CLOSE' || type === 'REDUCE_POSITION') {
      if (status === 'PARTIAL_CLOSED') stats.partialClosed += 1;
      if (status === 'SIZE_FAILED') stats.sizeFailed += 1;
      if (status === 'NOT_FOUND') stats.notFound += 1;
      if (message.includes('保护单已按剩余仓位重建')) stats.closeSuccess += 1;
    }
    if (type === 'CLOSE_POSITION' && status === 'CLOSED') {
      stats.closeSuccess += 1;
    }
    if ((type === 'MODIFY_STOP_LOSS' || type === 'MODIFY_TAKE_PROFIT') && status === 'FAILED') {
      stats.modifyFailed += 1;
    }
    if ((type === 'MODIFY_STOP_LOSS' || type === 'MODIFY_TAKE_PROFIT') && status === 'SKIPPED') {
      stats.modifySkipped += 1;
    }
  }
  return stats;
}

async function buildRecentTradingPerformance(files: ReturnType<typeof runtimeFiles>, execution: UnknownRecord, view: RuntimeView): Promise<UnknownRecord> {
  if (!(view === 'orders' || view === 'overview' || view === 'full')) {
    return {};
  }
  const services = asRecord(execution.services);
  const serviceEntries = Object.entries(services)
    .map(([exchange, payload]) => ({ exchange: asString(exchange).trim().toLowerCase(), payload: asRecord(payload) }))
    .filter((item) => item.exchange);
  const cacheKey = [
    safeStatMtimeMs(files.executionLog),
    ...serviceEntries.map((item) => `${item.exchange}:${asString(item.payload.base_url)}`),
  ].join('||');
  const now = Date.now();
  const cached = performanceSnapshotCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.payload;
  }

  const startIso = shanghaiRangeStartIso(2);
  const startMs = Date.parse(startIso);
  const endMs = now;
  const executionRows = readJsonlRecent(files.executionLog, 50000);

  const exchanges = await Promise.all(
    serviceEntries.map(async ({ exchange, payload }) => {
      const baseUrl = asString(payload.base_url).replace(/\/$/, '');
      const label = asString(payload.account_label) || exchange.toUpperCase();
      const tradeRowsRaw = baseUrl ? await fetchJson(`${baseUrl}/trades/history?limit=500`, exchange === 'ctrader' ? 5000 : 6000) : null;
      const tradeRows = asArray(tradeRowsRaw);
      const trading = summarizeTradingRange(tradeRows, startMs, endMs);
      const cleanup = summarizeCleanupStats(executionRows, exchange, startMs, endMs);
      return {
        exchange,
        label,
        startAt: startIso,
        endAt: new Date(endMs).toISOString(),
        ...trading,
        cleanup,
      };
    }),
  );

  const total = exchanges.reduce(
    (acc, item) => {
      acc.tradeRows += asNumber(item.tradeRows) ?? 0;
      acc.realizedTradeCount += asNumber(item.realizedTradeCount) ?? 0;
      acc.wins += asNumber(item.wins) ?? 0;
      acc.losses += asNumber(item.losses) ?? 0;
      acc.grossProfit += asNumber(item.grossProfit) ?? 0;
      acc.grossLoss += asNumber(item.grossLoss) ?? 0;
      acc.commission += asNumber(item.commission) ?? 0;
      acc.netRealized += asNumber(item.netRealized) ?? 0;
      acc.cleanup.partialClosed += asNumber(asRecord(item.cleanup).partialClosed) ?? 0;
      acc.cleanup.closeSuccess += asNumber(asRecord(item.cleanup).closeSuccess) ?? 0;
      acc.cleanup.sizeFailed += asNumber(asRecord(item.cleanup).sizeFailed) ?? 0;
      acc.cleanup.notFound += asNumber(asRecord(item.cleanup).notFound) ?? 0;
      acc.cleanup.modifyFailed += asNumber(asRecord(item.cleanup).modifyFailed) ?? 0;
      acc.cleanup.modifySkipped += asNumber(asRecord(item.cleanup).modifySkipped) ?? 0;
      return acc;
    },
    {
      tradeRows: 0,
      realizedTradeCount: 0,
      wins: 0,
      losses: 0,
      grossProfit: 0,
      grossLoss: 0,
      commission: 0,
      netRealized: 0,
      cleanup: {
        partialClosed: 0,
        closeSuccess: 0,
        sizeFailed: 0,
        notFound: 0,
        modifyFailed: 0,
        modifySkipped: 0,
      },
    },
  );

  const payload = {
    rangeLabel: `近两天（自 ${startIso} 起）`,
    startAt: startIso,
    endAt: new Date(endMs).toISOString(),
    total: {
      ...total,
      winRatePct: total.realizedTradeCount > 0 ? (total.wins / total.realizedTradeCount) * 100 : 0,
      profitFactor: total.grossLoss > 0 ? total.grossProfit / total.grossLoss : null,
    },
    exchanges,
  };
  performanceSnapshotCache.set(cacheKey, {
    expiresAt: Date.now() + performanceCacheTtlMs(),
    payload,
  });
  return payload;
}

export async function buildFallbackPayload(
  runtimeConfig: RuntimeConfig,
  queryBase: string | null,
  view: RuntimeView,
): Promise<UnknownRecord> {
  const files = runtimeFiles(runtimeConfig.dataRoot);
  const runtime = readJson(files.runtimeState);
  const nextScan = readJson(files.nextScan);
  const latest = latestCycle(files, {
    preferredCycleId: asString(runtime.last_cycle_id) || null,
  });
  const requestText = readText(files.requestFile);
  const session = readJson(files.sessionFile);
  const recent = recentCycles(files, 5);
  const audit = shouldIncludeAudit(view)
    ? buildAuditSummary(files, runtimeConfig, runtime, view === 'overview' ? 40 : 120)
    : {};
  const lightweightQueryHealth = view === 'overview' || view === 'orders';
  const [queryHealth, execution] = await Promise.all([
    queryBase && !lightweightQueryHealth
      ? fetchJson(`${queryBase.replace(/\/$/, '')}/health`, 1500)
      : Promise.resolve(null),
    buildExecutionFallbackCached(runtimeConfig, runtime, view),
  ]);
  const tradingPerformance = await buildRecentTradingPerformance(files, execution, view);
  const executionHealth = asRecord(execution.health);
  const positions = asArray(execution.positions);
  const orders = asArray(execution.orders);
  const canTrade = asRecord(execution.can_trade);
  const sessionBootstrappedAt = asNumber(session.bootstrapped_at);
  const runtimeStatAgeSeconds = (() => {
    try {
      const stat = fs.statSync(files.runtimeState);
      return Math.max(0, Math.floor((Date.now() - stat.mtimeMs) / 1000));
    } catch {
      return null;
    }
  })();
  const cycleFresh = latest.cycleAgeSeconds === null ? null : latest.cycleAgeSeconds <= 900;
  const patrolLive = runtimeStatAgeSeconds !== null ? runtimeStatAgeSeconds <= 600 : false;
  const queryLive = isRecord(queryHealth) && Object.keys(queryHealth).length > 0;
  const executionPortOpen = isRecord(executionHealth);
  return {
    snapshot: {
      runtime,
      next_scan: Object.keys(nextScan).length > 0 ? nextScan : runtime.next_scan,
      latest_cycle_path: latest.cyclePath,
      latest_cycle: latest.cycle,
      recent_cycles: recent,
      decision_tail: readJsonlTail(files.decisionLog, 5),
      execution_tail: readJsonlTail(files.executionLog, 5),
      monitoring: {
        knowledge_chars: asNumber(asRecord(runtime.knowledge_loading).knowledge_chars),
        refs_count: asNumber(asRecord(runtime.knowledge_loading).refs_count) ?? 0,
        full_refs_count: asNumber(asRecord(runtime.knowledge_loading).full_reference_count) ?? 0,
        brief_refs_count: asNumber(asRecord(runtime.knowledge_loading).brief_reference_count) ?? 0,
        request_chars: requestText.length,
        request_size_bytes: Buffer.byteLength(requestText),
        session_age_seconds:
          sessionBootstrappedAt === null ? null : Math.max(0, Math.floor(Date.now() / 1000 - sessionBootstrappedAt)),
        uptime_seconds: null,
        session_turn_count: asNumber(session.turn_count),
      },
      audit,
      execution,
      trading_performance: tradingPerformance,
      overall_health:
        patrolLive && executionPortOpen && cycleFresh !== false ? 'HEALTHY' : patrolLive || executionPortOpen ? 'DEGRADED' : 'DOWN',
      cycle_fresh: cycleFresh,
      latest_cycle_age_seconds: latest.cycleAgeSeconds,
      last_success_at: runtime.last_success_at,
      last_failure_at: runtime.last_failure_at,
      last_failure_reason: runtime.last_failure_reason,
      patrol_live: patrolLive,
      query_live: queryLive,
      execution_port_open: executionPortOpen,
    },
    recent: { items: recent },
    decision: {
      cycle_path: latest.cyclePath,
      decision: asRecord(latest.cycle.decision),
    },
    account: {
      positions_count: positions.length,
      orders_count: orders.length,
      can_trade: canTrade,
    },
    funnel: {
      data: {},
    },
    query_base: queryBase,
  };
}

export async function buildRuntimeRoutePayload(
  view: RuntimeView,
  runtimeConfigs: RuntimeConfig[],
): Promise<RuntimeRoutePayload> {
  const buildExecutionContext = (
    files: ReturnType<typeof runtimeFiles>,
    openPositions: UnknownRecord[],
    openOrders: UnknownRecord[],
  ) => buildExecutionContextCached(files, openPositions, openOrders, EXECUTION_HISTORY_RESET_FILE);

  const runtimeResults = await Promise.all(
    runtimeConfigs.map(async (runtimeConfig) => {
      const files = runtimeFiles(runtimeConfig.dataRoot);
      if (!hasRuntimeData(files)) {
        return null;
      }
      const runtime = readJson(files.runtimeState);
      const configuredQueryBase = runtimeConfig.allowQuery
        ? asString(runtime.query_service_base) || process.env.AB_PATROL_QUERY_BASE || runtimeConfig.defaultQueryBase
        : null;
      const queryUrl = configuredQueryBase
        ? `${configuredQueryBase.replace(/\/$/, '')}/api/v1/runtime/full?view=${encodeURIComponent(view)}`
        : null;
      const preferQuery = runtimeConfig.allowQuery && Boolean(queryUrl);
      if (preferQuery && queryUrl) {
        const remote = await fetchJson(queryUrl, 5000);
        if (isRecord(remote) && isRecord(remote.snapshot)) {
          // query-service 可能没有实时持仓、账户余额或可交易状态，
          // 这里统一用 execution-service 的实时快照覆盖 execution 节点，
          // 避免 Web 继续展示旧账户口径或空余额。
          const execData = await buildExecutionFallbackCached(runtimeConfig, readJson(files.runtimeState), view);
          const patchedRemote = {
            ...remote,
            snapshot: {
              ...asRecord(remote.snapshot),
              execution: execData,
            },
          };
          const qsPayload = normalizePayload(patchedRemote, 'query-service', queryUrl, runtimeConfig, view, {
            readProcessUptimeSeconds,
            buildExecutionContextCached: buildExecutionContext,
            buildCapacitySummaryCached,
            shouldIncludeAudit,
            shouldIncludeSymbols,
            shouldIncludeExposure,
            shouldIncludeExecutionHistory,
            shouldIncludeCapacity,
            shouldIncludeSystemHistory,
            capacityDetailLevel,
            patrolPidFile: PATROL_PID_FILE,
          });
          return qsPayload;
        }
      }
      const fallback = await buildFallbackPayload(runtimeConfig, configuredQueryBase, view);
      return normalizePayload(fallback, 'fallback', queryUrl, runtimeConfig, view, {
        readProcessUptimeSeconds,
        buildExecutionContextCached: buildExecutionContext,
        buildCapacitySummaryCached,
        shouldIncludeAudit,
        shouldIncludeSymbols,
        shouldIncludeExposure,
        shouldIncludeExecutionHistory,
        shouldIncludeCapacity,
        shouldIncludeSystemHistory,
        capacityDetailLevel,
        patrolPidFile: PATROL_PID_FILE,
      });
    }),
  );
  const runtimes = runtimeResults.filter((item): item is NonNullable<(typeof runtimeResults)[number]> => item !== null);
  return {
    generatedAt: new Date().toISOString(),
    primary: runtimes.find((item) => asString(item.runtimeKey) === 'primary') ?? null,
    secondary: null,
    runtimes,
  };
}
