import { loadMonitoringConfig, normalizeExchange as normalizeMonitoringExchange } from './live-monitoring';
import {
  normalizeRuntimeOrder,
  normalizeRuntimePosition,
  type RuntimeOrderRecord,
  type RuntimePositionRecord,
  type UnknownRecord,
} from './runtime-contract';

export type RuntimeExecutionAccountRecord = {
  exchange: string;
  label?: string;
  accountId?: string;
  role?: string;
  baseUrl?: string;
  configuredSymbols?: string[];
  stale?: boolean;
  healthStatus: string;
  canTrade: boolean | null;
  canTradeReason: string;
  accountAsset: string;
  balanceTotal: number | null;
  balanceAvailable: number | null;
  positionsCount: number;
  ordersCount: number;
  exchangeBlocked?: boolean;
  exchangeBlockCode?: string;
  exchangeBlockReason?: string;
};

type RuntimeExecutionAccountOptions = {
  execution: UnknownRecord;
  runtime: UnknownRecord;
  defaultExecutionBase: string;
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

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function asStringArray(value: unknown): string[] {
  return asArray(value).map((item) => asString(item)).filter(Boolean);
}

export function aggregateExecutionEntries(execution: UnknownRecord, field: 'positions' | 'orders'): UnknownRecord[] {
  const directEntries = asArray(execution[field]).map((item) => asRecord(item));
  if (directEntries.length > 0) {
    return directEntries;
  }

  const services = asRecord(execution.services);
  return Object.values(services).flatMap((service) => asArray(asRecord(service)[field]).map((item) => asRecord(item)));
}

export function normalizeOpenPositions(execution: UnknownRecord): RuntimePositionRecord[] {
  return aggregateExecutionEntries(execution, 'positions').map((position) => normalizeRuntimePosition(position));
}

export function normalizeOpenOrders(execution: UnknownRecord): RuntimeOrderRecord[] {
  return aggregateExecutionEntries(execution, 'orders').map((order) => normalizeRuntimeOrder(order));
}

export function normalizeExecutionAccounts({
  execution,
  runtime,
  defaultExecutionBase,
}: RuntimeExecutionAccountOptions): RuntimeExecutionAccountRecord[] {
  const services = asRecord(execution.services);
  const primaryExchange = normalizeMonitoringExchange(runtime.exchange || 'ctrader');
  const primaryBase = asString(runtime.execution_base) || defaultExecutionBase;
  const monitoringConfig = loadMonitoringConfig(primaryExchange, primaryBase);
  const accounts = monitoringConfig.accounts
    .filter((account) => account.enabled)
    .map((account) => {
      const exchange = normalizeMonitoringExchange(account.exchange);
      const service = asRecord(services[exchange]);
      const health = asRecord(service.health);
      const canTrade = asRecord(service.can_trade);
      const exchangeBlock = asRecord(canTrade.exchange_block);
      const liveContext = asRecord(service.live_context);
      const balanceHead = asRecord(asArray(service.balance)[0]);
      const positions = asArray(service.positions);
      const orders = asArray(service.orders);
      const configuredSymbols = asStringArray(service.configured_symbols);
      return {
        exchange,
        label: asString(service.account_label) || account.label,
        accountId: asString(service.account_id) || account.id,
        role: asString(service.account_role) || account.role,
        baseUrl: asString(service.base_url) || account.base_url,
        configuredSymbols: configuredSymbols.length > 0 ? configuredSymbols : account.symbols,
        stale: asBoolean(service.stale) ?? false,
        healthStatus: asString(health.status) || asString(health._error),
        canTrade:
          asBoolean(canTrade.can_trade) ??
          (asString(health.status).toLowerCase() === 'healthy' ? true : null),
        canTradeReason:
          asString(canTrade.reason) ||
          (asString(health.status).toLowerCase() === 'healthy' ? 'health_fallback' : ''),
        accountAsset: asString(liveContext.account_asset) || asString(health.account_asset) || asString(balanceHead.asset),
        balanceTotal: asNumber(liveContext.account_balance) ?? asNumber(balanceHead.balance),
        balanceAvailable:
          asNumber(liveContext.account_available) ??
          asNumber(balanceHead.available_balance) ??
          asNumber(balanceHead.available),
        positionsCount: positions.length,
        ordersCount: orders.length,
        exchangeBlocked: asBoolean(exchangeBlock.blocked) ?? asBoolean(health.exchange_blocked) ?? false,
        exchangeBlockCode: asString(exchangeBlock.code) || asString(health.exchange_block_code),
        exchangeBlockReason: asString(exchangeBlock.reason) || asString(health.exchange_block_reason),
      };
    });

  if (accounts.length > 0) {
    return accounts;
  }

  const fallbackAccounts = Object.entries(services).map(([exchange, rawService]) => {
    const service = asRecord(rawService);
    const health = asRecord(service.health);
    const canTrade = asRecord(service.can_trade);
    const exchangeBlock = asRecord(canTrade.exchange_block);
    const liveContext = asRecord(service.live_context);
    const balanceHead = asRecord(asArray(service.balance)[0]);
    const positions = asArray(service.positions);
    const orders = asArray(service.orders);
    return {
      exchange,
      label: asString(service.account_label),
      accountId: asString(service.account_id),
      healthStatus: asString(health.status),
      canTrade:
        asBoolean(canTrade.can_trade) ??
        (asString(health.status).toLowerCase() === 'healthy' ? true : null),
      canTradeReason:
        asString(canTrade.reason) ||
        (asString(health.status).toLowerCase() === 'healthy' ? 'health_fallback' : ''),
      accountAsset: asString(liveContext.account_asset) || asString(health.account_asset) || asString(balanceHead.asset),
      balanceTotal: asNumber(liveContext.account_balance) ?? asNumber(balanceHead.balance),
      balanceAvailable:
        asNumber(liveContext.account_available) ??
        asNumber(balanceHead.available_balance) ??
        asNumber(balanceHead.available),
      positionsCount: positions.length,
      ordersCount: orders.length,
      exchangeBlocked: asBoolean(exchangeBlock.blocked) ?? asBoolean(health.exchange_blocked) ?? false,
      exchangeBlockCode: asString(exchangeBlock.code) || asString(health.exchange_block_code),
      exchangeBlockReason: asString(exchangeBlock.reason) || asString(health.exchange_block_reason),
    };
  });

  if (fallbackAccounts.length > 0) {
    return fallbackAccounts;
  }

  const health = asRecord(execution.health);
  const canTrade = asRecord(execution.can_trade);
  const exchangeBlock = asRecord(canTrade.exchange_block);
  const balanceHead = asRecord(asArray(execution.balance)[0]);
  return [
    {
      exchange: asString(health.exchange),
      healthStatus: asString(health.status),
      canTrade:
        asBoolean(canTrade.can_trade) ??
        (asString(health.status).toLowerCase() === 'healthy' ? true : null),
      canTradeReason:
        asString(canTrade.reason) ||
        (asString(health.status).toLowerCase() === 'healthy' ? 'health_fallback' : ''),
      accountAsset: asString(health.account_asset) || asString(balanceHead.asset),
      balanceTotal: asNumber(balanceHead.balance),
      balanceAvailable: asNumber(balanceHead.available_balance) ?? asNumber(balanceHead.available),
      positionsCount: asArray(execution.positions).length,
      ordersCount: asArray(execution.orders).length,
      exchangeBlocked: asBoolean(exchangeBlock.blocked) ?? asBoolean(health.exchange_blocked) ?? false,
      exchangeBlockCode: asString(exchangeBlock.code) || asString(health.exchange_block_code),
      exchangeBlockReason: asString(exchangeBlock.reason) || asString(health.exchange_block_reason),
    },
  ];
}
