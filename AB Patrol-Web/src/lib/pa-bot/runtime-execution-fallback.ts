import { loadMonitoringConfig, normalizeExchange as normalizeMonitoringExchange } from './live-monitoring';

type UnknownRecord = Record<string, unknown>;

export type RuntimeView = 'overview' | 'accounts' | 'orders' | 'audit' | 'review' | 'system' | 'settings' | 'full';

export type RuntimeConfigInput = {
  key: 'primary';
  botId: string;
  dataRoot: string;
  defaultQueryBase: string;
  defaultExecutionBase: string;
  allowQuery: boolean;
};

const executionServiceCache = new Map<string, UnknownRecord>();
const executionFallbackCache = new Map<string, { expiresAt: number; payload: UnknownRecord }>();
const executionFallbackInFlight = new Map<string, Promise<UnknownRecord>>();

type ExecutionFallbackProfile = {
  includeBotSummary: boolean;
  includeCanTrade: boolean;
  includeBalance: boolean;
  includeLiveContext: boolean;
  allowSlowRetry: boolean;
};

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

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asStringArray(value: unknown): string[] {
  return asArray(value).map((item) => asString(item)).filter(Boolean);
}

function hasContent(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (isRecord(value)) return Object.keys(value).length > 0;
  if (typeof value === 'string') return value.trim().length > 0;
  return value !== null && value !== undefined;
}

function executionFallbackCacheTtlMs() {
  return 5000;
}

function buildExecutionFallbackCacheKey(runtimeConfig: RuntimeConfigInput, runtime: UnknownRecord, view: RuntimeView): string {
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

function executionFallbackProfile(view: RuntimeView): ExecutionFallbackProfile {
  if (view === 'review') {
    return {
      includeBotSummary: false,
      includeCanTrade: false,
      includeBalance: false,
      includeLiveContext: false,
      allowSlowRetry: false,
    };
  }

  if (view === 'orders') {
    return {
      includeBotSummary: false,
      includeCanTrade: true,
      includeBalance: true,
      includeLiveContext: false,
      allowSlowRetry: false,
    };
  }

  if (view === 'overview') {
    return {
      includeBotSummary: false,
      includeCanTrade: true,
      includeBalance: true,
      includeLiveContext: true,
      allowSlowRetry: true,
    };
  }

  if (view === 'audit' || view === 'system') {
    return {
      includeBotSummary: false,
      includeCanTrade: true,
      includeBalance: true,
      includeLiveContext: true,
      allowSlowRetry: true,
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

async function retryIfMissing(
  enabled: boolean,
  currentValue: unknown,
  url: string,
  timeoutMs: number,
): Promise<unknown> {
  if (!enabled) return currentValue;
  if (currentValue !== null) return currentValue;
  return fetchJson(url, timeoutMs);
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

export async function fetchJson(url: string, timeoutMs = 5000): Promise<unknown> {
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

async function buildExecutionFallback(
  runtimeConfig: RuntimeConfigInput,
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

  const accountBundles = await Promise.all(
    monitoringConfig.accounts.filter((item) => item.enabled).map(async (account) => {
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
      // cTrader 的 /positions 在真实运行中经常超过 1.5s，
      // 概览页如果超时就会把真实持仓误显示成 0。
      const positionsTimeoutMs = isOverview ? (isCtrader ? 7000 : 4000) : isCtrader ? 4500 : 2500;
      const ordersTimeoutMs = isOverview ? (isCtrader ? 5000 : 3000) : isCtrader ? 4500 : 2500;
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

      if (profile.allowSlowRetry) {
        healthRaw = await retryIfMissing(true, healthRaw, `${baseUrl}/health`, isCtrader ? 4500 : 3500);
        positionsRaw = await retryIfMissing(true, positionsRaw, `${baseUrl}/positions`, isCtrader ? 8000 : 5000);
        ordersRaw = await retryIfMissing(true, ordersRaw, `${baseUrl}/orders/open`, isCtrader ? 6500 : 4500);
        botSummaryRaw = await retryIfMissing(
          profile.includeBotSummary,
          botSummaryRaw,
          `${baseUrl}/trading/bot-summary/${runtimeConfig.botId}`,
          6000,
        );
        canTradeRaw = await retryIfMissing(
          profile.includeCanTrade,
          canTradeRaw,
          `${baseUrl}/trading/can-trade/${runtimeConfig.botId}`,
          6000,
        );
        balanceRaw = await retryIfMissing(
          profile.includeBalance,
          balanceRaw,
          `${baseUrl}/balance`,
          isCtrader ? 7000 : 5000,
        );
        liveContextRaw = await retryIfMissing(
          profile.includeLiveContext,
          liveContextRaw,
          `${baseUrl}/trading/live-context/${runtimeConfig.botId}?symbols=${encodeURIComponent(symbols.join(','))}`,
          isCtrader ? 8000 : 6000,
        );
      }

      const healthRequestFailed = healthRaw === null;
      const positionsRequestFailed = positionsRaw === null;
      const ordersRequestFailed = ordersRaw === null;
      const botSummaryRequestFailed = profile.includeBotSummary && botSummaryRaw === null;
      const canTradeRequestFailed = profile.includeCanTrade && canTradeRaw === null;
      const balanceRequestFailed = profile.includeBalance && balanceRaw === null;
      const liveContextRequestFailed = profile.includeLiveContext && liveContextRaw === null;
      const health = asRecord(healthRaw);
      const positions = asArray(positionsRaw);
      const orders = asArray(ordersRaw);
      const botSummary = profile.includeBotSummary ? asRecord(botSummaryRaw) : asRecord(cachedBundle.bot_summary);
      const canTrade = profile.includeCanTrade ? asRecord(canTradeRaw) : asRecord(cachedBundle.can_trade);
      const balance = profile.includeBalance ? asArray(balanceRaw) : asArray(cachedBundle.balance);
      const liveContext = profile.includeLiveContext ? asRecord(liveContextRaw) : asRecord(cachedBundle.live_context);
      const unavailable = healthRequestFailed && positionsRequestFailed && ordersRequestFailed;
      const partialFailure =
        healthRequestFailed ||
        positionsRequestFailed ||
        ordersRequestFailed ||
        botSummaryRequestFailed ||
        canTradeRequestFailed ||
        balanceRequestFailed ||
        liveContextRequestFailed;

      const currentBundle: UnknownRecord = {
        account_id: account.id,
        account_label: account.label,
        account_role: account.role,
        exchange,
        base_url: baseUrl,
        configured_symbols: symbols,
        stale: partialFailure,
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

      if (!unavailable && hasCachedBundle) {
        currentBundle.health = healthRequestFailed ? asRecord(cachedBundle.health) : currentBundle.health;
        currentBundle.positions = positionsRequestFailed ? asArray(cachedBundle.positions) : currentBundle.positions;
        currentBundle.orders = ordersRequestFailed ? asArray(cachedBundle.orders) : currentBundle.orders;
        currentBundle.bot_summary = botSummaryRequestFailed ? asRecord(cachedBundle.bot_summary) : currentBundle.bot_summary;
        currentBundle.can_trade = canTradeRequestFailed ? asRecord(cachedBundle.can_trade) : currentBundle.can_trade;
        currentBundle.balance = balanceRequestFailed ? asArray(cachedBundle.balance) : currentBundle.balance;
        currentBundle.live_context = liveContextRequestFailed ? asRecord(cachedBundle.live_context) : currentBundle.live_context;
      }

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
          health: healthRequestFailed ? asRecord(cachedBundle.health) : health,
          positions: positionsRequestFailed ? asArray(cachedBundle.positions) : positions,
          orders: ordersRequestFailed ? asArray(cachedBundle.orders) : orders,
          bot_summary: hasContent(botSummary) ? botSummary : asRecord(cachedBundle.bot_summary),
          can_trade: hasContent(canTrade)
            ? canTrade
            : { ...asRecord(cachedBundle.can_trade), reason: 'cached_snapshot' },
          balance: balance.length > 0 ? balance : asArray(cachedBundle.balance),
          live_context: hasContent(liveContext) ? liveContext : asRecord(cachedBundle.live_context),
        });
      }

      return repairExecutionBundle(exchange, currentBundle);
    }),
  );

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

export async function buildExecutionFallbackCached(
  runtimeConfig: RuntimeConfigInput,
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
