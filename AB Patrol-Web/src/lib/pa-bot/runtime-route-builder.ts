import fs from 'fs';
import path from 'path';

import { AGENT_ROOT } from './live-monitoring';
import {
  hasRuntimeData,
  latestCycle,
  readJson,
  readJsonlTail,
  readText,
  recentCycles,
  runtimeFiles,
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
          return normalizePayload(remote, 'query-service', queryUrl, runtimeConfig, view, {
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
