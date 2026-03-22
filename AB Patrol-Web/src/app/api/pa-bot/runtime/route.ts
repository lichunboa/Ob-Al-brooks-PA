import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { NextResponse } from 'next/server';
import { AGENT_ROOT, loadMonitoringConfig, normalizeExchange as normalizeMonitoringExchange } from '../../../../lib/pa-bot/live-monitoring';
import {
  canonicalStrategyLabel as canonicalStrategyLabelFromSchema,
  detectStrategyFamily as detectStrategyFamilyFromSchema,
  familyLabelFromText as familyLabelFromTextFromSchema,
  inferFamilyFromSignals as inferFamilyFromSignalsFromSchema,
  looksLikeStrategyText as looksLikeStrategyTextFromSchema,
} from '../../../../lib/pa-bot/runtime-schema';
import {
  buildStrategyCatalog,
  fallbackStrategyLabel as fallbackStrategyLabelFromContract,
  inferOrderClass,
  inferProtectionKind,
} from '../../../../lib/pa-bot/runtime-contract';
import {
  buildRuntimeExecutionContext,
  emptyRuntimeExecutionContext,
} from '../../../../lib/pa-bot/runtime-execution-context';
import {
  buildCapacitySummary as buildRuntimeCapacitySummary,
  emptyCapacitySummary as emptyRuntimeCapacitySummary,
} from '../../../../lib/pa-bot/runtime-capacity';
import {
  aggregateExecutionEntries,
  normalizeExecutionAccounts,
  normalizeOpenOrders,
  normalizeOpenPositions,
} from '../../../../lib/pa-bot/runtime-accounts';
import {
  buildLightStrategyFamilies,
  looksLikeTrackedSymbol,
  normalizeSymbolCard,
  normalizeSymbolKey,
} from '../../../../lib/pa-bot/runtime-symbols';
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
import { normalizeProfiling } from '../../../../lib/pa-bot/runtime-profiling';

export const dynamic = 'force-dynamic';

const DEFAULT_QUERY_BASE = 'http://127.0.0.1:8086';
const DEFAULT_EXECUTION_BASE = 'http://127.0.0.1:8092';
const PATROL_PID_FILE = path.join(AGENT_ROOT, 'data', 'run', 'service.pid');
const EXECUTION_HISTORY_RESET_FILE = path.join(AGENT_ROOT, 'data', 'run', 'web_execution_history_reset.json');

type RuntimeConfig = {
  key: 'primary';
  label: string;
  botId: string;
  dataRoot: string;
  defaultQueryBase: string;
  defaultExecutionBase: string;
  allowQuery: boolean;
};

type RuntimeRoutePayload = {
  generatedAt: string;
  primary: UnknownRecord | null;
  secondary: null;
  runtimes: UnknownRecord[];
};

type RuntimeView = 'overview' | 'accounts' | 'orders' | 'audit' | 'system' | 'settings' | 'full';
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

type UnknownRecord = Record<string, unknown>;

const runtimeRouteCache = new Map<string, { expiresAt: number; payload: RuntimeRoutePayload }>();
const runtimeRouteInFlight = new Map<string, Promise<RuntimeRoutePayload>>();
const executionServiceCache = new Map<string, UnknownRecord>();
const executionFallbackCache = new Map<string, { expiresAt: number; payload: UnknownRecord }>();
const executionFallbackInFlight = new Map<string, Promise<UnknownRecord>>();
const executionContextCache = new Map<string, { expiresAt: number; payload: ReturnType<typeof buildRuntimeExecutionContext> }>();
const capacitySummaryCache = new Map<string, { expiresAt: number; payload: UnknownRecord }>();

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(value: unknown): UnknownRecord {
  return isRecord(value) ? value : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function asStringArray(value: unknown): string[] {
  return asArray(value).map((item) => asString(item)).filter(Boolean);
}

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

function hasContent(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== null && value !== undefined;
}

function normalizeRuntimeView(value: string | null): RuntimeView {
  if (value === 'overview' || value === 'accounts' || value === 'orders' || value === 'audit' || value === 'system' || value === 'settings' || value === 'full') {
    return value;
  }
  return 'overview';
}

function shouldIncludeAudit(view: RuntimeView): boolean {
  return view === 'audit' || view === 'full';
}

function shouldIncludeSymbols(view: RuntimeView): boolean {
  return view === 'overview' || view === 'accounts' || view === 'audit' || view === 'full';
}

function shouldIncludeExposure(view: RuntimeView): boolean {
  return view === 'overview' || view === 'orders' || view === 'full';
}

function shouldIncludeExecutionHistory(view: RuntimeView): boolean {
  return view === 'orders' || view === 'full';
}

function shouldIncludeCapacity(view: RuntimeView): boolean {
  return view === 'overview' || view === 'orders' || view === 'full';
}

function capacityDetailLevel(view: RuntimeView): CapacityDetailLevel {
  return view === 'orders' || view === 'full' ? 'full' : 'summary';
}

function shouldIncludeSystemHistory(view: RuntimeView): boolean {
  return view === 'system' || view === 'full';
}

function runtimeViewCacheTtlMs(view: RuntimeView): number {
  if (view === 'orders') return 3000;
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

function executionFallbackCacheTtlMs() {
  return 5000;
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

function buildExecutionFallbackCacheKey(runtimeConfig: RuntimeConfig, runtime: UnknownRecord, view: RuntimeView): string {
  const primaryExchange = normalizeMonitoringExchange(runtime.exchange || 'ctrader');
  const primaryBase = asString(runtime.execution_base) || runtimeConfig.defaultExecutionBase;
  const monitoringConfig = loadMonitoringConfig(primaryExchange, primaryBase);
  const accountSeed = monitoringConfig.accounts
    .filter((item) => item.enabled)
    .map((item) =>
      [
        item.id,
        normalizeMonitoringExchange(item.exchange),
        item.role,
        item.base_url,
        item.symbols.join(','),
      ].join(':'),
    )
    .join('|');
  return [runtimeConfig.key, view, primaryExchange, primaryBase, accountSeed].join('||');
}

type ExecutionFallbackProfile = {
  includeBotSummary: boolean;
  includeCanTrade: boolean;
  includeBalance: boolean;
  includeLiveContext: boolean;
  allowSlowRetry: boolean;
};

function executionFallbackProfile(view: RuntimeView): ExecutionFallbackProfile {
  if (view === 'orders') {
    return {
      includeBotSummary: false,
      includeCanTrade: false,
      includeBalance: false,
      includeLiveContext: false,
      allowSlowRetry: false,
    };
  }

  if (view === 'overview') {
    return {
      includeBotSummary: false,
      includeCanTrade: false,
      includeBalance: false,
      includeLiveContext: false,
      allowSlowRetry: false,
    };
  }

  if (view === 'audit' || view === 'system') {
    return {
      includeBotSummary: false,
      includeCanTrade: true,
      includeBalance: false,
      includeLiveContext: false,
      allowSlowRetry: false,
    };
  }

  return {
    includeBotSummary: true,
    includeCanTrade: true,
    includeBalance: true,
    includeLiveContext: true,
    allowSlowRetry: true,
  };
}

function primaryBalanceEntry(balanceRows: unknown[]): UnknownRecord {
  for (const item of balanceRows) {
    if (isRecord(item)) {
      return item;
    }
  }
  return {};
}

function repairExecutionBundle(exchange: string, bundle: UnknownRecord): UnknownRecord {
  const botSummary = asRecord(bundle.bot_summary);
  const canTrade = asRecord(bundle.can_trade);
  const liveContext = asRecord(bundle.live_context);
  const balanceRows = asArray(bundle.balance);
  const positions = asArray(bundle.positions);
  const orders = asArray(bundle.orders);

  if ((!hasContent(canTrade) || hasContent(canTrade._error)) && 'can_trade' in botSummary) {
    bundle.can_trade = {
      can_trade: Boolean(botSummary.can_trade),
      reason: asString(botSummary.can_trade_reason) || 'OK',
      source: 'bot_summary_fallback',
    };
  }

  if (exchange === 'ctrader' && (!hasContent(liveContext) || hasContent(liveContext._error))) {
    const balanceEntry = primaryBalanceEntry(balanceRows);
    const allocation = asRecord(botSummary.config);
    bundle.live_context = {
      exchange,
      requested_symbols: asStringArray(bundle.configured_symbols),
      account_balance: balanceEntry.balance,
      account_available: balanceEntry.available,
      allocation,
      account_summary: {
        total_balance: balanceEntry.balance,
        available_balance: balanceEntry.available,
        total_unrealized_pnl: balanceEntry.unrealized_pnl,
        total_margin_balance: balanceEntry.total_margin_balance ?? balanceEntry.balance,
        position_count: positions.length,
        open_order_count: orders.length,
        margin_ratio: balanceEntry.margin_ratio,
        can_trade: asBoolean(asRecord(bundle.can_trade).can_trade),
      },
      source: 'runtime_fallback',
    };
  }

  return bundle;
}

async function buildExecutionFallback(
  runtimeConfig: RuntimeConfig,
  runtime: UnknownRecord,
  view: RuntimeView,
): Promise<UnknownRecord> {
  const primaryExchange = normalizeMonitoringExchange(runtime.exchange || 'ctrader');
  const primaryBase = asString(runtime.execution_base) || runtimeConfig.defaultExecutionBase;
  const monitoringConfig = loadMonitoringConfig(primaryExchange, primaryBase);
  const profile = executionFallbackProfile(view);
  const configuredPrimary =
    monitoringConfig.accounts.find((account) => account.enabled && account.role === 'primary')?.exchange || primaryExchange;
  const services: UnknownRecord = {};
  const combinedPositions: UnknownRecord[] = [];
  const combinedOrders: UnknownRecord[] = [];
  const combinedStatusChanges: UnknownRecord[] = [];
  let primaryBundle: UnknownRecord = {};

  const accountBundles = await Promise.all(monitoringConfig.accounts.filter((item) => item.enabled).map(async (account) => {
    const exchange = normalizeMonitoringExchange(account.exchange);
    const isCtrader = exchange === 'ctrader';
    const isOverview = view === 'overview';
    const envKey = `AB_PATROL_${exchange.toUpperCase()}_EXECUTION_BASE`;
    const baseUrl = (process.env[envKey] || account.base_url || runtimeConfig.defaultExecutionBase).replace(/\/$/, '');
    const symbols = account.symbols;
    const cacheKey = `${account.id}::${baseUrl}`;
    const cachedBundle = asRecord(executionServiceCache.get(cacheKey));
    const hasCachedBundle = Object.keys(cachedBundle).length > 0;
    const healthTimeoutMs = isOverview ? (isCtrader ? 1000 : 900) : isCtrader ? 2500 : 2000;
    const positionsTimeoutMs = isOverview ? (isCtrader ? 1500 : 1000) : isCtrader ? 3500 : 2500;
    const ordersTimeoutMs = isOverview ? (isCtrader ? 1500 : 1000) : isCtrader ? 3500 : 2500;
    const botSummaryTimeoutMs = isCtrader ? 4500 : 3500;
    const canTradeTimeoutMs = isCtrader ? 4500 : 3500;
    const balanceTimeoutMs = isCtrader ? 4500 : 3500;
    const liveContextTimeoutMs = isCtrader ? 5500 : 4500;

    let [healthRaw, positionsRaw, ordersRaw, botSummaryRaw, canTradeRaw, balanceRaw, liveContextRaw] = await Promise.all([
      fetchJson(`${baseUrl}/health`, healthTimeoutMs),
      fetchJson(`${baseUrl}/positions`, positionsTimeoutMs),
      fetchJson(`${baseUrl}/orders/open`, ordersTimeoutMs),
      profile.includeBotSummary
        ? fetchJson(`${baseUrl}/trading/bot-summary/${runtimeConfig.botId}`, botSummaryTimeoutMs)
        : Promise.resolve(null),
      profile.includeCanTrade
        ? fetchJson(`${baseUrl}/trading/can-trade/${runtimeConfig.botId}`, canTradeTimeoutMs)
        : Promise.resolve(null),
      profile.includeBalance ? fetchJson(`${baseUrl}/balance`, balanceTimeoutMs) : Promise.resolve(null),
      profile.includeLiveContext
        ? fetchJson(
            `${baseUrl}/trading/live-context/${runtimeConfig.botId}?symbols=${encodeURIComponent(symbols.join(','))}`,
            liveContextTimeoutMs,
          )
        : Promise.resolve(null),
    ]);

    if (isCtrader && profile.allowSlowRetry && !hasCachedBundle) {
      if (profile.includeBotSummary && !hasContent(botSummaryRaw)) {
        botSummaryRaw = await fetchJson(`${baseUrl}/trading/bot-summary/${runtimeConfig.botId}`, 6000);
      }
      if (profile.includeCanTrade && !hasContent(canTradeRaw)) {
        canTradeRaw = await fetchJson(`${baseUrl}/trading/can-trade/${runtimeConfig.botId}`, 6000);
      }
      if (profile.includeBalance && !hasContent(balanceRaw)) {
        balanceRaw = await fetchJson(`${baseUrl}/balance`, 6000);
      }
      if (profile.includeLiveContext && !hasContent(liveContextRaw)) {
        liveContextRaw = await fetchJson(
          `${baseUrl}/trading/live-context/${runtimeConfig.botId}?symbols=${encodeURIComponent(symbols.join(','))}`,
          7000,
        );
      }
    }

    const health = asRecord(healthRaw);
    const positions = asArray(positionsRaw);
    const orders = asArray(ordersRaw);
    const botSummary = profile.includeBotSummary ? asRecord(botSummaryRaw) : asRecord(cachedBundle.bot_summary);
    const canTrade = profile.includeCanTrade ? asRecord(canTradeRaw) : asRecord(cachedBundle.can_trade);
    const balance = profile.includeBalance ? asArray(balanceRaw) : asArray(cachedBundle.balance);
    const liveContext = profile.includeLiveContext ? asRecord(liveContextRaw) : asRecord(cachedBundle.live_context);
    const unavailable =
      !hasContent(health) &&
      !hasContent(positions) &&
      !hasContent(orders);

    const currentBundle: UnknownRecord = {
      account_id: account.id,
      account_label: account.label,
      account_role: account.role,
      exchange,
      base_url: baseUrl,
      configured_symbols: symbols,
      stale: false,
      health: unavailable ? { _error: 'service_unavailable' } : health,
      positions: unavailable ? [] : positions,
      orders: unavailable ? [] : orders,
      tracked_orders: { status_changes: [] },
      bot_summary: unavailable ? {} : botSummary,
      can_trade: unavailable ? { can_trade: false, reason: 'service_unavailable' } : canTrade,
      balance: unavailable ? [] : balance,
      live_context:
        unavailable
          ? { exchange, requested_symbols: symbols, _error: 'service_unavailable' }
          : liveContext,
    };

    if (!unavailable) {
      const repairedBundle = repairExecutionBundle(exchange, currentBundle);
      executionServiceCache.set(cacheKey, repairedBundle);
      return repairedBundle;
    }

    if (Object.keys(cachedBundle).length > 0) {
      return repairExecutionBundle(exchange, {
        ...cachedBundle,
        account_id: account.id,
        account_label: account.label,
        account_role: account.role,
        exchange,
        base_url: baseUrl,
        configured_symbols: symbols,
        stale: true,
        tracked_orders: hasContent(asRecord(cachedBundle.tracked_orders).status_changes)
          ? asRecord(cachedBundle.tracked_orders)
          : { status_changes: [] },
        health: hasContent(health) ? health : asRecord(cachedBundle.health),
        positions: positions.length > 0 ? positions : asArray(cachedBundle.positions),
        orders: orders.length > 0 ? orders : asArray(cachedBundle.orders),
        bot_summary: hasContent(botSummary) ? botSummary : asRecord(cachedBundle.bot_summary),
        can_trade: hasContent(canTrade)
          ? canTrade
          : { ...asRecord(cachedBundle.can_trade), reason: 'cached_snapshot' },
        balance: balance.length > 0 ? balance : asArray(cachedBundle.balance),
        live_context: hasContent(liveContext) ? liveContext : asRecord(cachedBundle.live_context),
      });
    }

    return repairExecutionBundle(exchange, currentBundle);
  }));

  for (const bundle of accountBundles) {
    const exchange = asString(bundle.exchange);
    const baseUrl = asString(bundle.base_url);
    services[exchange] = bundle;
    if (exchange === configuredPrimary) {
      primaryBundle = bundle;
    }

    for (const position of asArray(bundle.positions)) {
      if (isRecord(position)) {
        combinedPositions.push({ ...position, exchange, execution_base: baseUrl });
      }
    }

    for (const order of asArray(bundle.orders)) {
      if (isRecord(order)) {
        combinedOrders.push({ ...order, exchange, execution_base: baseUrl });
      }
    }

    const trackedOrders = asRecord(bundle.tracked_orders);
    for (const item of asArray(trackedOrders.status_changes)) {
      if (isRecord(item)) {
        combinedStatusChanges.push({ ...item, exchange, execution_base: baseUrl });
      }
    }
  }

  return {
    health: asRecord(primaryBundle.health),
    positions: combinedPositions,
    orders: combinedOrders,
    tracked_orders: { status_changes: combinedStatusChanges },
    bot_summary: asRecord(primaryBundle.bot_summary),
    can_trade: asRecord(primaryBundle.can_trade),
    balance: asArray(primaryBundle.balance),
    live_context: asRecord(primaryBundle.live_context),
    services,
  };
}

async function buildExecutionFallbackCached(
  runtimeConfig: RuntimeConfig,
  runtime: UnknownRecord,
  view: RuntimeView,
): Promise<UnknownRecord> {
  const cacheKey = buildExecutionFallbackCacheKey(runtimeConfig, runtime, view);
  const cached = executionFallbackCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.payload;
  }

  if (!executionFallbackInFlight.has(cacheKey)) {
    executionFallbackInFlight.set(
      cacheKey,
      buildExecutionFallback(runtimeConfig, runtime, view)
        .then((payload) => {
          executionFallbackCache.set(cacheKey, {
            expiresAt: Date.now() + executionFallbackCacheTtlMs(),
            payload,
          });
          return payload;
        })
        .finally(() => {
          executionFallbackInFlight.delete(cacheKey);
        }),
    );
  }

  return executionFallbackInFlight.get(cacheKey)!;
}

async function fetchJson(url: string, timeoutMs = 5000): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function summarizeValue(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (Array.isArray(value)) {
    return value.map((item) => summarizeValue(item)).filter(Boolean).join(' / ');
  }

  if (!isRecord(value)) {
    return '';
  }

  const preferredKeys = ['summary', 'decision', 'daily_context', 'intraday_context', 'risk', 'reason'];
  const preferredParts = preferredKeys.map((key) => summarizeValue(value[key])).filter(Boolean);
  if (preferredParts.length > 0) {
    return preferredParts.join(' ');
  }

  const genericParts = Object.values(value).map((item) => summarizeValue(item)).filter(Boolean);
  return genericParts.slice(0, 4).join(' ');
}

function marketBucketForSymbol(symbol: string): string {
  const normalized = asString(symbol).toUpperCase();
  if (normalized.endsWith('USDT')) return '加密';
  if (normalized.includes('US 500') || normalized.includes('US TECH')) return '指数';
  if (normalized === 'XAUUSD' || normalized === 'XAGUSD') return '贵金属';
  return '外汇';
}

function incrementCounter(counter: Map<string, number>, key: string, step = 1) {
  const normalized = asString(key).trim();
  if (!normalized) return;
  counter.set(normalized, (counter.get(normalized) || 0) + step);
}

function counterToList(counter: Map<string, number>, limit = 12) {
  return Array.from(counter.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, limit);
}

function normalizeSignalLabel(value: unknown): string {
  const raw = asString(value).trim().toUpperCase();
  if (!raw) return '';
  const pairedMatch = raw.match(/(?:^|[^A-Z0-9])(H1\/L1|H2\/L2|MAG)(?=$|[^A-Z0-9])/);
  if (pairedMatch?.[1]) return pairedMatch[1];
  const singleMatch = raw.match(/(?:^|[^A-Z0-9])(H1|H2|L1|L2|MAG)(?=$|[^A-Z0-9])/);
  if (singleMatch?.[1]) return singleMatch[1];
  return '';
}

function familyLabelFromText(value: unknown): string {
  return familyLabelFromTextFromSchema(value) || normalizeSignalLabel(value);
}

function detectAuditSignalFamily(input: {
  signalType?: unknown;
  brooksLabel?: unknown;
  managementTemplate?: unknown;
  playbookFamily?: unknown;
  playbookId?: unknown;
  strategyHint?: unknown;
  rawSignals?: string[];
}): string {
  return detectStrategyFamilyFromSchema(input);
}

function isExecutionSemanticText(value: unknown): boolean {
  const raw = asString(value).trim();
  if (!raw) return false;
  const upper = raw.toUpperCase();
  return (
    upper === 'WAIT' ||
    upper === 'WATCH' ||
    upper === 'HOLD' ||
    raw.includes('反转试探') ||
    raw.includes('观察') ||
    raw.includes('等待') ||
    raw.includes('候选')
  );
}

function looksLikeStrategyText(value: unknown): boolean {
  return looksLikeStrategyTextFromSchema(value);
}

function fallbackStrategyLabel(value: unknown): string {
  return fallbackStrategyLabelFromContract(value);
}

function canonicalStrategyLabel(input: {
  strategy?: unknown;
  signalType?: unknown;
  brooksLabel?: unknown;
  managementTemplate?: unknown;
  playbookFamily?: unknown;
  playbookId?: unknown;
  rawSignals?: string[];
}): string {
  return canonicalStrategyLabelFromSchema(input);
}

function inferFamilyFromSignals(values: unknown[]): string {
  return inferFamilyFromSignalsFromSchema(values);
}

function auditFlagText(status: string, candidateStage: string, executionMode: string): string {
  return [status, candidateStage, executionMode].filter(Boolean).join(' ').toLowerCase();
}

function buildAuditSummary(
  files: RuntimeFiles,
  runtimeConfig: RuntimeConfig,
  runtime: UnknownRecord,
  cycleLimit = 120,
): UnknownRecord {
  try {
    if (!fs.existsSync(files.cyclesDir)) {
      return {};
    }

    const primaryExchange = normalizeMonitoringExchange(runtime.exchange || 'ctrader');
    const primaryBase = asString(runtime.execution_base) || runtimeConfig.defaultExecutionBase;
    const monitoringConfig = loadMonitoringConfig(primaryExchange, primaryBase);
    const symbolRoutes = new Map<string, string>();
    for (const account of monitoringConfig.accounts.filter((item) => item.enabled)) {
      const exchange = normalizeMonitoringExchange(account.exchange);
      for (const symbol of account.symbols || []) {
        const normalized = asString(symbol).trim().toUpperCase();
        if (normalized) {
          symbolRoutes.set(normalized, exchange);
        }
      }
    }

    const cycleFiles = fs
      .readdirSync(files.cyclesDir)
      .filter((file) => file.startsWith('cycle_') && file.endsWith('.json'))
      .sort()
      .slice(-cycleLimit);

    const marketBuckets = new Map<string, number>();
    const statusCounts = new Map<string, number>();
    const candidateStages = new Map<string, number>();
    const brooksRules = new Map<string, number>();
    const signalFamilies = new Map<string, number>();
    const timeframeSignals = new Map<string, number>();
    const exchangeCounts = new Map<string, number>();
    const symbolStats = new Map<string, UnknownRecord>();
    const timelineLimit = 8;
    const longWatchingThreshold = 24;

    let totalReadySignals = 0;
    let totalExecutableSignals = 0;
    let totalOpenOrderActions = 0;
    let totalExecutionEvents = 0;
    let preSignalExpiredSignals = 0;
    let expiredActivePreSignals = 0;
    let staleTimeoutSignals = 0;
    let candidateOpenOrderAttempts = 0;
    let duplicateInCycleActions = 0;
    let multiStrategySameSymbolActions = 0;

    for (const file of cycleFiles) {
      const cycle = readJson(path.join(files.cyclesDir, file));
      const decision = asRecord(cycle.decision);
      const symbolUpdates = asRecord(decision.symbol_updates);
      const actions = asArray(decision.actions);
      const executionResults = asArray(cycle.execution_results);
      const openActionsBySymbolStrategy = new Map<string, number>();
      const openActionCountBySymbol = new Map<string, number>();
      const strategiesBySymbol = new Map<string, Set<string>>();

      for (const action of actions) {
        const item = asRecord(action);
        const actionType = asString(item.action_type || item.type).toUpperCase();
        const symbol = asString(item.symbol).trim().toUpperCase();
        if (actionType !== 'OPEN_ORDER') {
          continue;
        }
        totalOpenOrderActions += 1;
        const candidateStage = asString(item.candidate_stage).toUpperCase();
        if (candidateStage.startsWith('CANDIDATE_')) {
          candidateOpenOrderAttempts += 1;
        }
        if (!symbol) continue;
        const strategyKey =
          asString(item.strategy) ||
          asString(item.playbook_id) ||
          asString(item.playbook_family) ||
          asString(item.source_chain) ||
          'UNKNOWN';
        const symbolStrategyKey = `${symbol}::${strategyKey}`;
        openActionsBySymbolStrategy.set(symbolStrategyKey, (openActionsBySymbolStrategy.get(symbolStrategyKey) || 0) + 1);
        openActionCountBySymbol.set(symbol, (openActionCountBySymbol.get(symbol) || 0) + 1);
        if (!strategiesBySymbol.has(symbol)) {
          strategiesBySymbol.set(symbol, new Set<string>());
        }
        strategiesBySymbol.get(symbol)?.add(strategyKey);
        const current = asRecord(symbolStats.get(symbol));
        symbolStats.set(symbol, {
          ...current,
          symbol,
          openOrderCount: (asNumber(current.openOrderCount) || 0) + 1,
        });
      }

      for (const count of Array.from(openActionsBySymbolStrategy.values())) {
        if (count > 1) {
          duplicateInCycleActions += count - 1;
        }
      }
      for (const [symbol, strategySet] of Array.from(strategiesBySymbol.entries())) {
        if (strategySet.size > 1) {
          multiStrategySameSymbolActions += Math.max(0, (openActionCountBySymbol.get(symbol) || 0) - 1);
        }
      }

      for (const result of executionResults) {
        const item = asRecord(result);
        const status = asString(item.status).toUpperCase();
        if (!status || ['LOG_ONLY', 'NO_ACTION', 'SKIPPED', 'PASS'].includes(status)) {
          continue;
        }
        totalExecutionEvents += 1;
        const symbol = asString(item.symbol).trim().toUpperCase();
        if (!symbol) continue;
        const current = asRecord(symbolStats.get(symbol));
        symbolStats.set(symbol, {
          ...current,
          symbol,
          executionEventCount: (asNumber(current.executionEventCount) || 0) + 1,
        });
      }

      for (const [rawSymbol, rawPatch] of Object.entries(symbolUpdates)) {
        const symbol = asString(rawSymbol).trim().toUpperCase();
        if (!symbol) continue;
        const patch = asRecord(rawPatch);
        const entryIdea = asRecord(patch.entry_idea);
        const plannedTrade = asRecord(patch.planned_trade);
        const preSignal = asRecord(patch.pre_signal);
        const timeframes = asRecord(patch.timeframes);
        const status = asString(patch.status) || asString(patch.stage) || 'watching';
        const lastPassReason = asString(patch.last_pass_reason).toUpperCase();
        const candidateStage =
          asString(plannedTrade.candidate_stage_cn) ||
          asString(entryIdea.candidate_stage_cn) ||
          asString(entryIdea.candidate_stage);
        const executionMode =
          asString(plannedTrade.execution_mode_cn) ||
          asString(entryIdea.execution_mode_cn) ||
          asString(entryIdea.execution_mode);
        const brooksRule =
          asString(entryIdea.brooks_rule) ||
          asString(plannedTrade.brooks_rule) ||
          asString(patch.brooks_label);
        const signalType =
          asString(patch.signal_type) ||
          asString(patch.signal) ||
          asString(preSignal.type) ||
          asString(plannedTrade.signal_type) ||
          asString(entryIdea.signal_type);
        const brooksLabel =
          asString(plannedTrade.brooks_label) ||
          asString(entryIdea.brooks_label) ||
          asString(patch.brooks_label);
        const managementTemplate =
          asString(plannedTrade.management_template) ||
          asString(entryIdea.management_template);
        const playbookFamily =
          asString(plannedTrade.playbook_family) ||
          asString(entryIdea.playbook_family);
        const playbookId =
          asString(plannedTrade.playbook_id) ||
          asString(entryIdea.playbook_id);
        const strategyHint =
          asString(plannedTrade.strategy) ||
          asString(patch.strategy) ||
          asString(patch.latest_strategy_family) ||
          asString(entryIdea.style) ||
          asString(entryIdea.filter_summary);
        const staleNarrativeText = [
          asString(patch.structure_summary),
          asString(patch.thesis),
          asString(patch.running_narrative),
        ].join(' ');
        const staleModelTimeout =
          staleNarrativeText.includes('本轮模型超时') ||
          staleNarrativeText.toLowerCase().includes('stale_model_timeout');
        const allowExecutable = asBoolean(plannedTrade.allow_executable);

        if (lastPassReason === 'PRE_SIGNAL_EXPIRED') {
          preSignalExpiredSignals += 1;
          if (asBoolean(preSignal.active) === true) {
            expiredActivePreSignals += 1;
          }
        }
        if (staleModelTimeout) {
          staleTimeoutSignals += 1;
        }

        const exchange = symbolRoutes.get(symbol) || normalizeMonitoringExchange(runtime.exchange || 'binance');
        const bucket = marketBucketForSymbol(symbol);
        incrementCounter(exchangeCounts, exchange);
        incrementCounter(marketBuckets, bucket);
        incrementCounter(statusCounts, status);
        incrementCounter(candidateStages, candidateStage);
        incrementCounter(brooksRules, brooksRule);

        const flagText = auditFlagText(status, candidateStage, executionMode);
        const readyLike = ['entry_ready', 'entry ready', '可挂单', '候选单', '准备挂单'].some((token) => flagText.includes(token));
        const executableLike = ['executable', '可执行'].some((token) => flagText.includes(token));
        if (readyLike) totalReadySignals += 1;
        if (executableLike) totalExecutableSignals += 1;

        const current = asRecord(symbolStats.get(symbol));
        const latestSignals = asRecord(current.latestSignals);
        const timeline = asArray(current.timeline).map((item) => asRecord(item));
        const signalSnapshot: UnknownRecord = {};
        const rawSignals: string[] = [];
        if (asString(patch.signal)) rawSignals.push(asString(patch.signal));
        if (asString(preSignal.type)) rawSignals.push(asString(preSignal.type));
        for (const [timeframe, timeframeRaw] of Object.entries(timeframes)) {
          const timeframeRecord = asRecord(timeframeRaw);
          const rawSignal = asString(timeframeRecord.signal);
          if (rawSignal) rawSignals.push(rawSignal);
          const signalLabel = normalizeSignalLabel(rawSignal);
          if (signalLabel) incrementCounter(timeframeSignals, `${timeframe} · ${signalLabel}`);
          if (rawSignal && ['5m', '15m', '1h'].includes(timeframe)) {
            latestSignals[timeframe] = rawSignal;
            signalSnapshot[timeframe] = rawSignal;
          }
        }
        const strategyFamily =
          detectAuditSignalFamily({
            signalType,
            brooksLabel,
            managementTemplate,
            playbookFamily,
            playbookId,
            strategyHint,
            rawSignals,
          }) ||
          inferFamilyFromSignals([
            patch.latest_strategy_family,
            patch.strategy_family,
            patch.playbook_family,
            patch.signal,
            preSignal.type,
            ...Object.values(signalSnapshot),
            ...Object.values(latestSignals),
          ]);
        if (strategyFamily) incrementCounter(signalFamilies, strategyFamily);

        timeline.push({
          cycleId: asString(cycle.cycle_id) || file.replace(/\.json$/, ''),
          time: asString(cycle.time_utc),
          status,
          candidateStage,
          signals: signalSnapshot,
        });
        while (timeline.length > timelineLimit) {
          timeline.shift();
        }

        const ruleCounts = new Map<string, number>(
          Array.from(Object.entries(asRecord(current.ruleCounts))).map(([label, count]) => [label, asNumber(count) || 0]),
        );
        incrementCounter(ruleCounts, brooksRule);

        symbolStats.set(symbol, {
          ...current,
          symbol,
          exchange,
          bucket,
          appearances: (asNumber(current.appearances) || 0) + 1,
          watchingCount: (asNumber(current.watchingCount) || 0) + (status.toLowerCase().includes('watch') ? 1 : 0),
          nonWatchingCount: (asNumber(current.nonWatchingCount) || 0) + (status.toLowerCase().includes('watch') ? 0 : 1),
          candidateSeenCount: (asNumber(current.candidateSeenCount) || 0) + (candidateStage ? 1 : 0),
          readyCount: (asNumber(current.readyCount) || 0) + (readyLike ? 1 : 0),
          executableCount: (asNumber(current.executableCount) || 0) + (executableLike ? 1 : 0),
          latestStatus: status,
          latestCandidateStage: candidateStage,
          latestMarketState: asString(patch.market_state),
          latestBrooksRule: brooksRule,
          latestStrategyFamily: strategyFamily,
          latestLastPassReason: lastPassReason,
          latestAllowExecutable: allowExecutable,
          allowExecutableTrueCount: (asNumber(current.allowExecutableTrueCount) || 0) + (allowExecutable === true ? 1 : 0),
          allowExecutableFalseCount: (asNumber(current.allowExecutableFalseCount) || 0) + (allowExecutable === false ? 1 : 0),
          latestSignals,
          timeline,
          ruleCounts: Object.fromEntries(ruleCounts),
        });
      }
    }

    const symbols = Array.from(symbolStats.values())
      .map((raw) => {
        const item = asRecord(raw);
        const ruleCounts = new Map<string, number>(
          Array.from(Object.entries(asRecord(item.ruleCounts))).map(([label, count]) => [label, asNumber(count) || 0]),
        );
        return {
          symbol: asString(item.symbol),
          exchange: asString(item.exchange),
          bucket: asString(item.bucket),
          appearances: asNumber(item.appearances) || 0,
          watchingCount: asNumber(item.watchingCount) || 0,
          nonWatchingCount: asNumber(item.nonWatchingCount) || 0,
          candidateSeenCount: asNumber(item.candidateSeenCount) || 0,
          readyCount: asNumber(item.readyCount) || 0,
          executableCount: asNumber(item.executableCount) || 0,
          openOrderCount: asNumber(item.openOrderCount) || 0,
          executionEventCount: asNumber(item.executionEventCount) || 0,
          latestStatus: asString(item.latestStatus),
          latestCandidateStage: asString(item.latestCandidateStage),
          latestMarketState: asString(item.latestMarketState),
          latestBrooksRule: asString(item.latestBrooksRule),
          latestStrategyFamily: asString(item.latestStrategyFamily),
          latestLastPassReason: asString(item.latestLastPassReason),
          latestAllowExecutable: asBoolean(item.latestAllowExecutable),
          allowExecutableTrueCount: asNumber(item.allowExecutableTrueCount) || 0,
          allowExecutableFalseCount: asNumber(item.allowExecutableFalseCount) || 0,
          latestSignals: asRecord(item.latestSignals),
          timeline: asArray(item.timeline).map((point) => {
            const entry = asRecord(point);
            return {
              cycleId: asString(entry.cycleId),
              time: asString(entry.time),
              status: asString(entry.status),
              candidateStage: asString(entry.candidateStage),
              signals: asRecord(entry.signals),
            };
          }),
          topRules: counterToList(ruleCounts, 3).map((entry) => entry.label),
        };
      })
      .map((item) => {
        const timeline = item.timeline || [];
        let watchStreak = 0;
        for (let index = timeline.length - 1; index >= 0; index -= 1) {
          const point = timeline[index];
          const isWatching = (point.status || '').toLowerCase().includes('watch');
          const hasUpgrade = Boolean(point.candidateStage);
          if (!isWatching || hasUpgrade) {
            break;
          }
          watchStreak += 1;
        }
        const longWatching =
          item.appearances >= longWatchingThreshold &&
          item.readyCount === 0 &&
          item.executableCount === 0 &&
          item.openOrderCount === 0 &&
          item.executionEventCount === 0 &&
          item.nonWatchingCount === 0 &&
          item.candidateSeenCount === 0;
        return {
          ...item,
          watchStreak,
          longWatching,
        };
      })
      .sort((left, right) => {
        const leftScore = left.readyCount * 10 + left.executableCount * 20 + left.openOrderCount * 30 + left.appearances;
        const rightScore = right.readyCount * 10 + right.executableCount * 20 + right.openOrderCount * 30 + right.appearances;
        return rightScore - leftScore || left.symbol.localeCompare(right.symbol);
      });

    const alwaysExecutableSymbols = symbols
      .filter((item) => item.appearances > 0 && item.allowExecutableTrueCount === item.appearances)
      .sort((left, right) => right.appearances - left.appearances || left.symbol.localeCompare(right.symbol))
      .slice(0, 12)
      .map((item) => ({
        symbol: item.symbol,
        exchange: item.exchange,
        count: item.appearances,
      }));

    const neverExecutableSymbols = symbols
      .filter((item) => item.appearances > 0 && item.allowExecutableFalseCount === item.appearances)
      .sort((left, right) => right.appearances - left.appearances || left.symbol.localeCompare(right.symbol))
      .slice(0, 12)
      .map((item) => ({
        symbol: item.symbol,
        exchange: item.exchange,
        count: item.appearances,
      }));

    return {
      lookbackCycles: cycleFiles.length,
      totalSymbolsObserved: symbols.length,
      totalReadySignals,
      totalExecutableSignals,
      totalOpenOrderActions,
      totalExecutionEvents,
      preSignalExpiredSignals,
      expiredActivePreSignals,
      staleTimeoutSignals,
      candidateOpenOrderAttempts,
      duplicateInCycleActions,
      multiStrategySameSymbolActions,
      exchanges: counterToList(exchangeCounts, 8),
      marketBuckets: counterToList(marketBuckets, 8),
      statuses: counterToList(statusCounts, 8),
      candidateStages: counterToList(candidateStages, 12),
      brooksRules: counterToList(brooksRules, 12),
      signalFamilies: counterToList(signalFamilies, 12),
      timeframeSignals: counterToList(timeframeSignals, 16),
      alwaysExecutableSymbols,
      neverExecutableSymbols,
      stuckWatchingSymbols: symbols
        .filter((item) => item.longWatching)
        .sort((left, right) => right.watchStreak - left.watchStreak || right.appearances - left.appearances)
        .slice(0, 12),
      symbols,
    };
  } catch {
    return {};
  }
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

function normalizeAudit(value: UnknownRecord) {
  return {
    lookbackCycles: asNumber(value.lookbackCycles) ?? 0,
    totalSymbolsObserved: asNumber(value.totalSymbolsObserved) ?? 0,
    totalReadySignals: asNumber(value.totalReadySignals) ?? 0,
    totalExecutableSignals: asNumber(value.totalExecutableSignals) ?? 0,
    totalOpenOrderActions: asNumber(value.totalOpenOrderActions) ?? 0,
    totalExecutionEvents: asNumber(value.totalExecutionEvents) ?? 0,
    preSignalExpiredSignals: asNumber(value.preSignalExpiredSignals) ?? 0,
    expiredActivePreSignals: asNumber(value.expiredActivePreSignals) ?? 0,
    staleTimeoutSignals: asNumber(value.staleTimeoutSignals) ?? 0,
    candidateOpenOrderAttempts: asNumber(value.candidateOpenOrderAttempts) ?? 0,
    duplicateInCycleActions: asNumber(value.duplicateInCycleActions) ?? 0,
    multiStrategySameSymbolActions: asNumber(value.multiStrategySameSymbolActions) ?? 0,
    exchanges: asArray(value.exchanges).map((item) => {
      const entry = asRecord(item);
      return { label: asString(entry.label), count: asNumber(entry.count) ?? 0 };
    }),
    marketBuckets: asArray(value.marketBuckets).map((item) => {
      const entry = asRecord(item);
      return { label: asString(entry.label), count: asNumber(entry.count) ?? 0 };
    }),
    statuses: asArray(value.statuses).map((item) => {
      const entry = asRecord(item);
      return { label: asString(entry.label), count: asNumber(entry.count) ?? 0 };
    }),
    candidateStages: asArray(value.candidateStages).map((item) => {
      const entry = asRecord(item);
      return { label: asString(entry.label), count: asNumber(entry.count) ?? 0 };
    }),
    brooksRules: asArray(value.brooksRules).map((item) => {
      const entry = asRecord(item);
      return { label: asString(entry.label), count: asNumber(entry.count) ?? 0 };
    }),
    signalFamilies: asArray(value.signalFamilies).map((item) => {
      const entry = asRecord(item);
      return { label: asString(entry.label), count: asNumber(entry.count) ?? 0 };
    }),
    timeframeSignals: asArray(value.timeframeSignals).map((item) => {
      const entry = asRecord(item);
      return { label: asString(entry.label), count: asNumber(entry.count) ?? 0 };
    }),
    alwaysExecutableSymbols: asArray(value.alwaysExecutableSymbols).map((item) => {
      const entry = asRecord(item);
      return {
        symbol: asString(entry.symbol),
        exchange: asString(entry.exchange),
        count: asNumber(entry.count) ?? 0,
      };
    }),
    neverExecutableSymbols: asArray(value.neverExecutableSymbols).map((item) => {
      const entry = asRecord(item);
      return {
        symbol: asString(entry.symbol),
        exchange: asString(entry.exchange),
        count: asNumber(entry.count) ?? 0,
      };
    }),
    symbols: asArray(value.symbols).map((item) => {
      const entry = asRecord(item);
      return {
        symbol: asString(entry.symbol),
        exchange: asString(entry.exchange),
        bucket: asString(entry.bucket),
        appearances: asNumber(entry.appearances) ?? 0,
        watchingCount: asNumber(entry.watchingCount) ?? 0,
        nonWatchingCount: asNumber(entry.nonWatchingCount) ?? 0,
        candidateSeenCount: asNumber(entry.candidateSeenCount) ?? 0,
        readyCount: asNumber(entry.readyCount) ?? 0,
        executableCount: asNumber(entry.executableCount) ?? 0,
        openOrderCount: asNumber(entry.openOrderCount) ?? 0,
        executionEventCount: asNumber(entry.executionEventCount) ?? 0,
        latestStatus: asString(entry.latestStatus),
        latestCandidateStage: asString(entry.latestCandidateStage),
        latestMarketState: asString(entry.latestMarketState),
        latestBrooksRule: asString(entry.latestBrooksRule),
        latestStrategyFamily: asString(entry.latestStrategyFamily),
        latestLastPassReason: asString(entry.latestLastPassReason),
        latestAllowExecutable: asBoolean(entry.latestAllowExecutable),
        allowExecutableTrueCount: asNumber(entry.allowExecutableTrueCount) ?? 0,
        allowExecutableFalseCount: asNumber(entry.allowExecutableFalseCount) ?? 0,
        latestSignals: asRecord(entry.latestSignals),
        timeline: asArray(entry.timeline).map((point) => {
          const pointEntry = asRecord(point);
          return {
            cycleId: asString(pointEntry.cycleId),
            time: asString(pointEntry.time),
            status: asString(pointEntry.status),
            candidateStage: asString(pointEntry.candidateStage),
            signals: asRecord(pointEntry.signals),
          };
        }),
        watchStreak: asNumber(entry.watchStreak) ?? 0,
        longWatching: asBoolean(entry.longWatching) ?? false,
        topRules: asStringArray(entry.topRules),
      };
    }),
    stuckWatchingSymbols: asArray(value.stuckWatchingSymbols).map((item) => {
      const entry = asRecord(item);
      return {
        symbol: asString(entry.symbol),
        exchange: asString(entry.exchange),
        bucket: asString(entry.bucket),
        appearances: asNumber(entry.appearances) ?? 0,
        watchingCount: asNumber(entry.watchingCount) ?? 0,
        nonWatchingCount: asNumber(entry.nonWatchingCount) ?? 0,
        candidateSeenCount: asNumber(entry.candidateSeenCount) ?? 0,
        readyCount: asNumber(entry.readyCount) ?? 0,
        executableCount: asNumber(entry.executableCount) ?? 0,
        openOrderCount: asNumber(entry.openOrderCount) ?? 0,
        executionEventCount: asNumber(entry.executionEventCount) ?? 0,
        latestStatus: asString(entry.latestStatus),
        latestCandidateStage: asString(entry.latestCandidateStage),
        latestMarketState: asString(entry.latestMarketState),
        latestBrooksRule: asString(entry.latestBrooksRule),
        latestStrategyFamily: asString(entry.latestStrategyFamily),
        latestLastPassReason: asString(entry.latestLastPassReason),
        latestAllowExecutable: asBoolean(entry.latestAllowExecutable),
        allowExecutableTrueCount: asNumber(entry.allowExecutableTrueCount) ?? 0,
        allowExecutableFalseCount: asNumber(entry.allowExecutableFalseCount) ?? 0,
        latestSignals: asRecord(entry.latestSignals),
        timeline: asArray(entry.timeline).map((point) => {
          const pointEntry = asRecord(point);
          return {
            cycleId: asString(pointEntry.cycleId),
            time: asString(pointEntry.time),
            status: asString(pointEntry.status),
            candidateStage: asString(pointEntry.candidateStage),
            signals: asRecord(pointEntry.signals),
          };
        }),
        watchStreak: asNumber(entry.watchStreak) ?? 0,
        longWatching: asBoolean(entry.longWatching) ?? false,
        topRules: asStringArray(entry.topRules),
      };
    }),
  };
}

function topThemes(value: unknown): Array<{ label: string; count: number }> {
  const entries = Object.entries(asRecord(value))
    .map(([label, count]) => ({ label, count: asNumber(count) ?? 0 }))
    .filter((item) => item.count > 0)
    .sort((left, right) => right.count - left.count)
    .slice(0, 4);
  return entries;
}

function normalizePayload(
  raw: UnknownRecord,
  source: 'query-service' | 'fallback',
  queryUrl: string | null,
  runtimeConfig: RuntimeConfig,
  view: RuntimeView,
) {
  const files = runtimeFiles(runtimeConfig.dataRoot);
  const snapshot = asRecord(raw.snapshot);
  const runtime = asRecord(snapshot.runtime);
  const nextScan = asRecord(snapshot.next_scan);
  const monitoring = asRecord(snapshot.monitoring);
  const patrolUptimeSeconds = readProcessUptimeSeconds(PATROL_PID_FILE);
  const execution = asRecord(snapshot.execution);
  const decisionBlock = asRecord(raw.decision);
  const decision = asRecord(decisionBlock.decision);
  const latestCycleSnapshot = asRecord(snapshot.latest_cycle);
  const latestCycleDisk = latestCycle(files, {
    preferredCycleId: asString(runtime.last_cycle_id) || null,
  });
  const latestCycleDiskPayload = asRecord(latestCycleDisk.cycle);
  const effectiveLatestCycle = hasContent(latestCycleSnapshot) ? latestCycleSnapshot : latestCycleDiskPayload;
  const latestCycleDecision =
    Object.keys(decision).length > 0
      ? decision
      : hasContent(latestCycleSnapshot.decision)
        ? asRecord(latestCycleSnapshot.decision)
        : asRecord(latestCycleDiskPayload.decision);
  const latestCycleAnalysisBoard = hasContent(latestCycleSnapshot.analysis_board)
    ? asRecord(latestCycleSnapshot.analysis_board)
    : asRecord(latestCycleDiskPayload.analysis_board);
  const includeAudit = shouldIncludeAudit(view);
  const includeSymbols = shouldIncludeSymbols(view);
  const includeExposure = shouldIncludeExposure(view);
  const includeExecutionHistory = shouldIncludeExecutionHistory(view);
  const includeCapacity = shouldIncludeCapacity(view);
  const includeSystemHistory = shouldIncludeSystemHistory(view);
  const capacityLevel = capacityDetailLevel(view);

  const focusSymbols = asStringArray(runtime.focus_symbols);
  const actionMap = new Map<string, UnknownRecord>();
  const symbolUpdates = asRecord(latestCycleDecision.symbol_updates);
  const runtimeSymbols = asRecord(runtime.symbols);
  const symbols = includeSymbols
    ? (() => {
        asArray(latestCycleDecision.actions).forEach((action) => {
          const item = asRecord(action);
          const symbol = asString(item.symbol);
          if (symbol) {
            actionMap.set(symbol, item);
          }
        });

        const symbolKeys = Array.from(
          new Set([
            ...focusSymbols,
            ...Object.keys(symbolUpdates).filter((key) => looksLikeTrackedSymbol(key)),
            ...Object.keys(runtimeSymbols).filter((key) => looksLikeTrackedSymbol(key)),
          ]),
        );

        return symbolKeys.map((symbol) =>
          normalizeSymbolCard({
            symbol,
            patchValue: {
              ...asRecord(symbolUpdates[symbol]),
              chart_context: asRecord(asRecord(latestCycleAnalysisBoard[symbol]).chart_context),
              ...asRecord(asRecord(latestCycleAnalysisBoard[symbol]).chart_context),
            },
            actionMap,
            fallbackValue: runtimeSymbols[symbol],
          }),
        );
      })()
    : [];
  const summaryStrategyFamilies = buildLightStrategyFamilies(symbols);

  const primaryReadingTargetSymbol =
    focusSymbols.find((symbol) => isRecord(latestCycleAnalysisBoard[symbol])) ||
    Object.keys(latestCycleAnalysisBoard).find((symbol) => isRecord(latestCycleAnalysisBoard[symbol])) ||
    '';
  const primaryReadingBoard = asRecord(latestCycleAnalysisBoard[primaryReadingTargetSymbol]);
  const readingTargets = asRecord(primaryReadingBoard.reading_targets);

  const positions = aggregateExecutionEntries(execution, 'positions');
  const orders = aggregateExecutionEntries(execution, 'orders');
  const canTrade = asRecord(execution.can_trade);
  const health = asRecord(execution.health);
  const funnel = asRecord(asRecord(raw.funnel).data);
  const accounts = normalizeExecutionAccounts({
    execution,
    runtime,
    defaultExecutionBase: runtimeConfig.defaultExecutionBase,
  });
  const openPositions = includeExposure || includeCapacity ? normalizeOpenPositions(execution) : [];
  const openOrders = includeExposure || includeCapacity ? normalizeOpenOrders(execution) : [];
  const executionContext = includeExecutionHistory
    ? buildExecutionContextCached(files, openPositions, openOrders)
    : emptyRuntimeExecutionContext(includeExposure ? openPositions : [], includeExposure ? openOrders : []);
  const profiling = normalizeProfiling(
    hasContent(latestCycleSnapshot) ? latestCycleSnapshot : latestCycleDiskPayload,
    runtime,
  );
  const trackedSymbols = Array.from(
    new Set([
      ...focusSymbols,
      ...asStringArray(runtime.active_symbols),
      ...accounts.flatMap((item) => item.configuredSymbols || []),
    ].filter(Boolean).map((item) => asString(item).trim().toUpperCase())),
  );
  const capacity = includeCapacity
    ? buildCapacitySummaryCached(
        files,
        execution,
        executionContext.positions,
        executionContext.orders,
        trackedSymbols,
        capacityLevel,
      )
    : emptyRuntimeCapacitySummary(trackedSymbols.length);
  const audit = includeAudit ? normalizeAudit(asRecord(snapshot.audit)) : normalizeAudit({});
  const recentCycles = includeSystemHistory
    ? (asArray(asRecord(raw.recent).items).length > 0
        ? asArray(asRecord(raw.recent).items)
        : asArray(snapshot.recent_cycles)
      ).map((item) => {
        const cycle = asRecord(item);
        return {
          cycleId: asString(cycle.cycle_id),
          phase: asString(cycle.phase),
          nextScanSeconds: asNumber(cycle.next_scan_seconds),
          focusSymbols: asStringArray(cycle.focus_symbols),
          summary: summarizeValue(cycle.market_summary),
        };
      })
    : [];

  return {
    runtimeKey: runtimeConfig.key,
    runtimeLabel: runtimeConfig.label,
    source,
    queryUrl,
    health: {
      overall: asString(snapshot.overall_health) || 'UNKNOWN',
      cycleFresh: snapshot.cycle_fresh ?? null,
      freshnessLabel:
        snapshot.cycle_fresh === true ? '新鲜' : snapshot.cycle_fresh === false ? '陈旧' : '待确认',
      cycleAgeSeconds: asNumber(snapshot.latest_cycle_age_seconds),
      patrolLive: asBoolean(snapshot.patrol_live) ?? false,
      queryLive: asBoolean(snapshot.query_live) ?? false,
      executionPortOpen: asBoolean(snapshot.execution_port_open) ?? false,
    },
    runtime: {
      botId: asString(runtime.bot_id) || runtimeConfig.botId,
      exchange: asString(runtime.exchange) || asString(health.exchange),
      marketProfile: asString(runtime.market_profile),
      phase: asString(runtime.current_phase) || asString(latestCycleDecision.phase) || asString(effectiveLatestCycle.phase),
      focusSymbols,
      activeSymbols: asStringArray(runtime.active_symbols),
      dryRun: asBoolean(runtime.dry_run) ?? true,
      bestCandidate: asString(runtime.best_candidate),
      bestCandidateStatus: asString(runtime.best_candidate_status),
      tradeReadiness: asString(runtime.trade_readiness),
      lastScanDecision: summarizeValue(runtime.last_scan_decision),
      llmProvider: asString(runtime.llm_provider),
      decisionModel: asString(runtime.decision_model),
      decisionSessionId: asString(runtime.decision_session_id),
      riskMode: asString(runtime.risk_mode),
    },
    summary: {
      cycleId: asString(effectiveLatestCycle.cycle_id) || asString(runtime.last_cycle_id) || null,
      marketSummary: summarizeValue(latestCycleDecision.market_summary) || summarizeValue(runtime.last_scan_decision),
      explanation: summarizeValue(latestCycleDecision.explanation),
      actionsCount: asArray(latestCycleDecision.actions).length,
      positionManagementCount: asArray(latestCycleDecision.position_management).length,
      strategyFamilies: summaryStrategyFamilies,
      strategyCatalog: buildStrategyCatalog(),
      readingTargets: {
        barCountTotal: asNumber(readingTargets.bar_count_total),
        browseTargetBars: asNumber(readingTargets.browse_target_bars),
        closeReadTargetBars: asNumber(readingTargets.close_read_target_bars),
      },
      promptReferences: asStringArray(asRecord(latestCycleDecision.state_patch).prompt_references),
    },
    execution: {
      exchange: asString(health.exchange),
      accountAsset: asString(health.account_asset),
      canTrade: asBoolean(canTrade.can_trade),
      canTradeReason: asString(canTrade.reason),
      exchangeBlocked:
        asBoolean(asRecord(canTrade.exchange_block).blocked) ?? asBoolean(health.exchange_blocked) ?? false,
      exchangeBlockCode: asString(asRecord(canTrade.exchange_block).code) || asString(health.exchange_block_code),
      exchangeBlockReason:
        asString(asRecord(canTrade.exchange_block).reason) || asString(health.exchange_block_reason),
      exchangeBlockUpdatedAt:
        asString(asRecord(canTrade.exchange_block).updated_at) || asString(health.exchange_block_updated_at),
      positionsCount: positions.length,
      ordersCount: orders.length,
      healthStatus: asString(health.status),
    },
    system: {
      latestCyclePath: asString(snapshot.latest_cycle_path) || null,
      sourceLabel: source,
      accounts,
    },
    positions: executionContext.positions,
    orders: executionContext.orders,
    profiling,
    timestamps: {
      latestCycleAt: asString(effectiveLatestCycle.time_utc) || null,
      lastSuccessAt: asString(snapshot.last_success_at) || null,
      lastFailureAt: asString(snapshot.last_failure_at) || null,
      lastFailureReason: asString(snapshot.last_failure_reason) || null,
    },
    monitoring: {
      knowledgeChars: asNumber(monitoring.knowledge_chars),
      refsCount: asNumber(monitoring.refs_count) ?? 0,
      fullRefsCount: asNumber(monitoring.full_refs_count) ?? 0,
      briefRefsCount: asNumber(monitoring.brief_refs_count) ?? 0,
      requestChars: asNumber(monitoring.request_chars),
      requestSizeBytes: asNumber(monitoring.request_size_bytes),
      sessionAgeSeconds: asNumber(monitoring.session_age_seconds),
      uptimeSeconds: asNumber(monitoring.uptime_seconds) ?? patrolUptimeSeconds,
      sessionTurnCount: asNumber(monitoring.session_turn_count),
      sessionModel: asString(monitoring.session_model) || null,
    },
    audit,
    nextScan: {
      inSeconds: asNumber(nextScan.in_seconds),
      requestedSeconds: asNumber(nextScan.requested_seconds),
      modelSuggestedSeconds: asNumber(nextScan.model_suggested_seconds),
      modelSuggestedReason: summarizeValue(nextScan.model_suggested_reason),
      reasonCode: asString(nextScan.reason_code),
      reasonText: summarizeValue(nextScan.reason_text),
      bucketRule: summarizeValue(nextScan.bucket_rule),
      bucketSourceRefs: asStringArray(nextScan.bucket_source_refs),
    },
    capacity,
    symbols,
    recentCycles,
    recentDecisions: includeSystemHistory ? asArray(snapshot.decision_tail).map((item) => {
      const decisionItem = asRecord(item);
      return {
        loggedAt: asString(decisionItem.logged_at) || asString(decisionItem.timestamp),
        cycleId: asString(decisionItem.cycle_id),
        summary: summarizeValue(decisionItem.decision_summary) || summarizeValue(decisionItem.reason),
        actionsCount: asArray(decisionItem.actions).length,
        focusSymbols: asStringArray(decisionItem.focus_symbols),
      };
    }) : [],
    recentExecutions: includeExecutionHistory ? executionContext.recentExecutions : [],
    managementActions: includeExecutionHistory ? executionContext.managementActions : [],
    historicalOrders: includeExecutionHistory ? executionContext.historicalOrders : [],
    funnel: includeSystemHistory ? {
      counts: {
        filled: asNumber(asRecord(funnel.counts).filled) ?? 0,
        candidateExecutionFailed: asNumber(asRecord(funnel.counts).candidate_execution_failed) ?? 0,
        candidateGateRejected: asNumber(asRecord(funnel.counts).candidate_gate_rejected) ?? 0,
        preSignalOnly: asNumber(asRecord(funnel.counts).pre_signal_only) ?? 0,
      },
      topThemes: topThemes(asRecord(funnel.themes)),
    } : {
      counts: {
        filled: 0,
        candidateExecutionFailed: 0,
        candidateGateRejected: 0,
        preSignalOnly: 0,
      },
      topThemes: [],
    },
  };
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
        ? `${configuredQueryBase.replace(/\/$/, '')}/api/v1/runtime/full`
        : null;

      const preferQuery = runtimeConfig.allowQuery && process.env.AB_PATROL_WEB_PREFER_QUERY === '1';
      if (preferQuery && queryUrl) {
        const remote = await fetchJson(queryUrl, 2000);
        if (isRecord(remote) && isRecord(remote.snapshot)) {
          return normalizePayload(remote, 'query-service', queryUrl, runtimeConfig, view);
        }
      }

      const fallback = await buildFallbackPayload(runtimeConfig, configuredQueryBase, view);
      return normalizePayload(fallback, 'fallback', queryUrl, runtimeConfig, view);
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
