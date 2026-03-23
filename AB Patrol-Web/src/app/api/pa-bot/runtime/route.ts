import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { AGENT_ROOT } from '../../../../lib/pa-bot/live-monitoring';
import {
  buildRuntimeExecutionContext,
} from '../../../../lib/pa-bot/runtime-execution-context';
import {
  buildCapacitySummary as buildRuntimeCapacitySummary,
} from '../../../../lib/pa-bot/runtime-capacity';
import { normalizeSymbolKey } from '../../../../lib/pa-bot/runtime-symbols';
import {
  hasRuntimeData,
  latestCycle,
  latestCycleFileStamp,
  readJson,
  readJsonlRecent,
  readJsonlTail,
  readText,
  recentCyclePayloads,
  recentCycles,
  runtimeFiles,
  safeStatMtimeMs,
  type RuntimeFiles,
} from '../../../../lib/pa-bot/runtime-files';
import {
  buildExecutionFallbackCached,
  fetchJson,
  type RuntimeConfigInput,
  type RuntimeView,
} from '../../../../lib/pa-bot/runtime-execution-fallback';
import { buildAuditSummary } from '../../../../lib/pa-bot/runtime-route-audit';
import { normalizePayload } from '../../../../lib/pa-bot/runtime-route-normalizer';
import {
  asArray,
  asBoolean,
  asNumber,
  asRecord,
  asString,
  asStringArray,
  hasContent,
  isRecord,
  summarizeValue,
  type UnknownRecord,
} from '../../../../lib/pa-bot/runtime-route-shared';

export const dynamic = 'force-dynamic';

const DEFAULT_QUERY_BASE = 'http://127.0.0.1:8086';
const DEFAULT_EXECUTION_BASE = 'http://127.0.0.1:8092';
const PATROL_PID_FILE = path.join(AGENT_ROOT, 'data', 'run', 'service.pid');
const EXECUTION_HISTORY_RESET_FILE = path.join(AGENT_ROOT, 'data', 'run', 'web_execution_history_reset.json');

type RuntimeConfig = RuntimeConfigInput & {
  label: string;
};

type RuntimeRoutePayload = {
  generatedAt: string;
  primary: UnknownRecord | null;
  secondary: null;
  runtimes: UnknownRecord[];
};

type CapacityDetailLevel = 'summary' | 'full';

const RUNTIME_CONFIGS: RuntimeConfig[] = [
  {
    key: 'primary',
    label: '统一实盘链',
    botId: 'claude-pa',
    dataRoot: path.join(AGENT_ROOT, 'data', 'pa_trader'),
    defaultQueryBase: DEFAULT_QUERY_BASE,
    defaultExecutionBase: DEFAULT_EXECUTION_BASE,
    allowQuery: true,
  },
];

const runtimeRouteCache = new Map<string, { expiresAt: number; payload: RuntimeRoutePayload }>();
const runtimeRouteInFlight = new Map<string, Promise<RuntimeRoutePayload>>();
const executionContextCache = new Map<string, { expiresAt: number; payload: ReturnType<typeof buildRuntimeExecutionContext> }>();
const capacitySummaryCache = new Map<string, { expiresAt: number; payload: UnknownRecord }>();

function parseElapsedToSeconds(value: string): number | null {
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

function readProcessUptimeSeconds(pidFilePath: string): number | null {
  try {
    if (!fs.existsSync(pidFilePath)) return null;
    const pid = fs.readFileSync(pidFilePath, 'utf-8').trim();
    if (!pid) return null;
    const elapsed = execFileSync('ps', ['-o', 'etime=', '-p', pid], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return parseElapsedToSeconds(elapsed);
  } catch {
    return null;
  }
}

function normalizeRuntimeView(value: string | null): RuntimeView {
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

function shouldIncludeAudit(view: RuntimeView): boolean {
  return view === 'audit' || view === 'full';
}

function shouldIncludeSymbols(view: RuntimeView): boolean {
  return view === 'overview' || view === 'accounts' || view === 'audit' || view === 'review' || view === 'full';
}

function shouldIncludeExposure(view: RuntimeView): boolean {
  return view === 'overview' || view === 'orders' || view === 'review' || view === 'full';
}

function shouldIncludeExecutionHistory(view: RuntimeView): boolean {
  return view === 'orders' || view === 'review' || view === 'full';
}

function shouldIncludeCapacity(view: RuntimeView): boolean {
  return view === 'overview' || view === 'orders' || view === 'review' || view === 'full';
}

function capacityDetailLevel(view: RuntimeView): CapacityDetailLevel {
  return view === 'orders' || view === 'review' || view === 'full' ? 'full' : 'summary';
}

function shouldIncludeSystemHistory(view: RuntimeView): boolean {
  return view === 'system' || view === 'full';
}

function runtimeViewCacheTtlMs(view: RuntimeView): number {
  if (view === 'orders' || view === 'review') return 3000;
  if (view === 'overview') return 8000;
  if (view === 'accounts' || view === 'system') return 8000;
  if (view === 'settings') return 12000;
  if (view === 'audit') return 15000;
  return 5000;
}

function runtimeViewCacheStamp(view: RuntimeView): string {
  return RUNTIME_CONFIGS.map((runtimeConfig) => {
    const files = runtimeFiles(runtimeConfig.dataRoot);
    return [
      runtimeConfig.key,
      view,
      safeStatMtimeMs(files.runtimeState),
      safeStatMtimeMs(files.nextScan),
      latestCycleFileStamp(files),
      safeStatMtimeMs(files.decisionLog),
      safeStatMtimeMs(files.executionLog),
      safeStatMtimeMs(EXECUTION_HISTORY_RESET_FILE),
    ].join('::');
  }).join('||');
}

function executionContextCacheTtlMs() {
  return 6000;
}

function readExecutionHistoryResetMs(): number {
  try {
    if (!fs.existsSync(EXECUTION_HISTORY_RESET_FILE)) return 0;
    const payload = JSON.parse(fs.readFileSync(EXECUTION_HISTORY_RESET_FILE, 'utf-8')) as UnknownRecord;
    const text = asString(payload.reset_at || payload.resetAt || payload.cutoff_at || payload.cutoffAt);
    if (!text) return 0;
    const parsed = Date.parse(text);
    return Number.isFinite(parsed) ? parsed : 0;
  } catch {
    return 0;
  }
}

function filterExecutionRowsAfterReset(rows: UnknownRecord[]): UnknownRecord[] {
  const cutoffMs = readExecutionHistoryResetMs();
  if (!cutoffMs) return rows;
  return rows.filter((row) => {
    const loggedAt = asString(row.logged_at) || asString(row.timestamp);
    if (!loggedAt) return false;
    const parsed = Date.parse(loggedAt);
    if (!Number.isFinite(parsed)) return false;
    return parsed >= cutoffMs;
  });
}

function capacitySummaryCacheTtlMs() {
  return 6000;
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

function buildExecutionContextCached(
  files: RuntimeFiles,
  openPositions: UnknownRecord[],
  openOrders: UnknownRecord[],
): ReturnType<typeof buildRuntimeExecutionContext> {
  const cacheKey = [
    files.executionLog,
    safeStatMtimeMs(files.executionLog),
    latestCycleFileStamp(files),
    positionsFingerprint(openPositions),
    ordersFingerprint(openOrders),
    safeStatMtimeMs(EXECUTION_HISTORY_RESET_FILE),
  ].join('||');
  const cached = executionContextCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.payload;
  }

  const payload = buildRuntimeExecutionContext({
    cycles: recentCyclePayloads(files, 160),
    executionRows: filterExecutionRowsAfterReset(readJsonlRecent(files.executionLog, 5000)),
    openPositions,
    openOrders,
  });
  executionContextCache.set(cacheKey, {
    expiresAt: Date.now() + executionContextCacheTtlMs(),
    payload,
  });
  return payload;
}

function buildCapacitySummaryCached(
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


async function buildFallbackPayload(
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
  const executionHealth = asRecord(execution.health);
  const positions = asArray(execution.positions);
  const orders = asArray(execution.orders);
  const canTrade = asRecord(execution.can_trade);
  const sessionBootstrappedAt = asNumber(session.bootstrapped_at);
  const patrolUptimeSeconds = readProcessUptimeSeconds(PATROL_PID_FILE);

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
        uptime_seconds: patrolUptimeSeconds,
        session_turn_count: asNumber(session.turn_count),
        session_model: asString(session.model),
      },
      audit,
      execution,
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
    funnel: {
      data: {},
    },
    query_base: queryBase,
  };
}

async function buildRuntimeRoutePayload(view: RuntimeView): Promise<RuntimeRoutePayload> {
  const runtimeResults = await Promise.all(
    RUNTIME_CONFIGS.map(async (runtimeConfig) => {
      const files = runtimeFiles(runtimeConfig.dataRoot);
      if (!hasRuntimeData(files)) {
        return null;
      }

      const runtime = readJson(files.runtimeState);
      const configuredQueryBase =
        runtimeConfig.allowQuery
          ? asString(runtime.query_service_base) || process.env.AB_PATROL_QUERY_BASE || runtimeConfig.defaultQueryBase
          : null;
      const queryUrl = configuredQueryBase
        ? `${configuredQueryBase.replace(/\/$/, '')}/api/v1/runtime/full?view=${encodeURIComponent(view)}`
        : null;

      const preferQuery = runtimeConfig.allowQuery && Boolean(queryUrl);
      if (preferQuery && queryUrl) {
        const remote = await fetchJson(queryUrl, 5000);
        if (isRecord(remote) && isRecord(remote.snapshot)) {
          return normalizePayload(remote, 'query-service', queryUrl, runtimeConfig, view, {
            readProcessUptimeSeconds,
            buildExecutionContextCached,
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
        }
      }

      const fallback = await buildFallbackPayload(runtimeConfig, configuredQueryBase, view);
      return normalizePayload(fallback, 'fallback', queryUrl, runtimeConfig, view, {
        readProcessUptimeSeconds,
        buildExecutionContextCached,
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

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const view = normalizeRuntimeView(requestUrl.searchParams.get('view'));
  const now = Date.now();
  const cacheKey = `${view}::${runtimeViewCacheStamp(view)}`;
  const cached = runtimeRouteCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return NextResponse.json(cached.payload);
  }

  if (!runtimeRouteInFlight.has(cacheKey)) {
    runtimeRouteInFlight.set(cacheKey, buildRuntimeRoutePayload(view)
      .then((payload) => {
        runtimeRouteCache.set(cacheKey, {
          expiresAt: Date.now() + runtimeViewCacheTtlMs(view),
          payload,
        });
        return payload;
      })
      .finally(() => {
        runtimeRouteInFlight.delete(cacheKey);
      }));
  }

  const payload = await runtimeRouteInFlight.get(cacheKey)!;
  return NextResponse.json(payload);
}
