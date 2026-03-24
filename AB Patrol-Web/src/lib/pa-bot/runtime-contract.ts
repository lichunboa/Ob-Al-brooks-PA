import {
  REGISTERED_RUNTIME_STRATEGIES,
  canonicalStrategyLabel,
  looksLikeStrategyText,
} from './runtime-schema';

export type UnknownRecord = Record<string, unknown>;

export type StrategyCatalogItem = {
  key: string;
  label: string;
  family: string;
  active: boolean;
  liveEnabled: boolean;
  stageStatus: string;
  deployedVersion: string;
  baselineVersion: string;
};

export type RuntimePositionRecord = {
  symbol: string;
  exchange: string;
  side: string;
  quantity: number | null;
  entryPrice: number | null;
  markPrice: number | null;
  unrealizedPnl: number | null;
  leverage: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  strategy: string;
  marketState: string;
  timeframeSignals: string[];
  cycleId: string | null;
  openedAt: string | null;
  botIds: string[];
};

export type RuntimeOrderRecord = {
  orderId: string;
  symbol: string;
  exchange: string;
  side: string;
  orderType: string;
  status: string;
  quantity: number | null;
  price: number | null;
  stopPrice: number | null;
  reduceOnly: boolean;
  createdAt: string | null;
  botId: string;
  exchangeConfirmed: boolean;
  orderClass: string;
  protectionKind: string;
  strategy: string;
  marketState: string;
  timeframeSignals: string[];
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  cycleId: string | null;
  loggedAt: string | null;
  message: string;
};

export type RuntimeExecutionEventRecord = {
  loggedAt: string;
  cycleId: string;
  exchange: string;
  symbol: string;
  side: string;
  type: string;
  status: string;
  message: string;
  success: boolean | null;
  strategy: string;
  marketState: string;
  timeframeSignals: string[];
  entryPrice: number | null;
  eventPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  quantity: number | null;
  orderId: string;
  orderClass: string;
  protectionKind: string;
  template14?: Record<string, string | number | boolean | null>;
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

export function fallbackStrategyLabel(value: unknown): string {
  const raw = asString(value).trim();
  if (!looksLikeStrategyText(raw)) return '';
  return raw;
}

export function buildStrategyCatalog(): StrategyCatalogItem[] {
  return REGISTERED_RUNTIME_STRATEGIES.map((item) => ({
    key: item.key,
    label: item.label,
    family: item.family,
    active: item.active,
    liveEnabled: item.liveEnabled,
    stageStatus: item.stageStatus,
    deployedVersion: item.deployedVersion,
    baselineVersion: item.baselineVersion,
  }));
}

export function inferProtectionKind(orderType: string, strategy: string, reduceOnly = false): string {
  const typeCode = asString(orderType).toUpperCase();
  const strategyCode = asString(strategy).toLowerCase();
  if (typeCode.includes('TAKE_PROFIT') || strategyCode.startsWith('tp_')) {
    return 'TAKE_PROFIT';
  }
  if (typeCode.includes('STOP') || strategyCode.startsWith('sl_')) {
    return 'STOP_LOSS';
  }
  if (reduceOnly && typeCode === 'LIMIT' && strategyCode.includes('take_profit')) {
    return 'TAKE_PROFIT';
  }
  return '';
}

export function inferOrderClass(type: string, orderType: string, strategy: string, reduceOnly = false): string {
  const actionType = asString(type).toUpperCase();
  if (['PARTIAL_CLOSE', 'CLOSE_POSITION', 'MODIFY_STOP_LOSS', 'MODIFY_TAKE_PROFIT'].includes(actionType)) {
    return 'MANAGEMENT';
  }
  if (reduceOnly || inferProtectionKind(orderType, strategy, reduceOnly)) {
    return 'PROTECTION';
  }
  return 'ENTRY';
}

export function normalizeRuntimePosition(
  position: UnknownRecord,
  context: Partial<RuntimePositionRecord> = {},
): RuntimePositionRecord {
  return {
    symbol: asString(position.symbol),
    exchange: asString(position.exchange),
    side: asString(position.side),
    quantity: asNumber(position.quantity) ?? asNumber(position.contracts) ?? asNumber(position.size),
    entryPrice: asNumber(position.entry_price) ?? context.entryPrice ?? null,
    markPrice: asNumber(position.mark_price),
    unrealizedPnl: asNumber(position.unrealized_pnl),
    leverage: asNumber(position.leverage),
    stopLoss: asNumber(position.stop_loss) ?? context.stopLoss ?? null,
    takeProfit: asNumber(position.take_profit) ?? context.takeProfit ?? null,
    strategy: context.strategy || '',
    marketState: context.marketState || '',
    timeframeSignals: context.timeframeSignals || [],
    cycleId: context.cycleId ?? null,
    openedAt: context.openedAt ?? null,
    botIds: asStringArray(position.bot_ids ?? position.botIds),
  };
}

export function normalizeRuntimeOrder(
  order: UnknownRecord,
  context: Partial<RuntimeOrderRecord> = {},
): RuntimeOrderRecord {
  return {
    orderId: asString(order.orderId) || asString(order.order_id) || asString(order.id),
    symbol: asString(order.symbol),
    exchange: asString(order.exchange),
    side: asString(order.side),
    orderType: asString(order.orderType) || asString(order.order_type),
    status: asString(order.status),
    quantity: asNumber(order.quantity),
    price: asNumber(order.price),
    stopPrice: asNumber(order.stopPrice) ?? asNumber(order.stop_price),
    reduceOnly: asBoolean(order.reduceOnly) ?? asBoolean(order.reduce_only) ?? false,
    createdAt: asString(order.createdAt) || asString(order.created_at) || null,
    botId: asString(order.botId) || asString(order.bot_id),
    exchangeConfirmed: asBoolean(order.exchangeConfirmed) ?? asBoolean(order.exchange_confirmed) ?? false,
    orderClass: context.orderClass || 'ENTRY',
    protectionKind: context.protectionKind || '',
    strategy: context.strategy || '',
    marketState: context.marketState || '',
    timeframeSignals: context.timeframeSignals || [],
    entryPrice: context.entryPrice ?? null,
    stopLoss: context.stopLoss ?? null,
    takeProfit: context.takeProfit ?? null,
    cycleId: context.cycleId ?? null,
    loggedAt: context.loggedAt ?? null,
    message: context.message || '',
  };
}

export function normalizeRuntimeExecutionEvent(
  event: UnknownRecord,
  context: Partial<RuntimeExecutionEventRecord> = {},
): RuntimeExecutionEventRecord {
  const strategyLabel =
    canonicalStrategyLabel({
      strategy: context.strategy || asString(event.strategy),
      rawSignals: context.timeframeSignals || [],
    }) ||
    fallbackStrategyLabel(context.strategy || asString(event.strategy));

  return {
    loggedAt: asString(event.loggedAt) || asString(event.logged_at) || asString(event.timestamp),
    cycleId: asString(event.cycleId) || asString(event.cycle_id),
    exchange: asString(event.exchange),
    symbol: asString(event.symbol),
    side: asString(event.side),
    type: asString(event.type),
    status: asString(event.status),
    message: asString(event.message),
    success: asBoolean(event.success),
    strategy: strategyLabel,
    marketState: context.marketState || asString(event.marketState) || asString(event.market_state),
    timeframeSignals: context.timeframeSignals || asStringArray(event.timeframeSignals),
    entryPrice: context.entryPrice ?? asNumber(event.entryPrice),
    eventPrice: context.eventPrice ?? asNumber(event.eventPrice) ?? asNumber(event.price),
    stopLoss: context.stopLoss ?? asNumber(event.stopLoss),
    takeProfit: context.takeProfit ?? asNumber(event.takeProfit),
    quantity: context.quantity ?? asNumber(event.quantity),
    orderId: asString(event.orderId) || asString(event.order_id),
    orderClass: context.orderClass || asString(event.orderClass) || asString(event.order_class),
    protectionKind: context.protectionKind || asString(event.protectionKind) || asString(event.protection_kind),
    template14:
      (isRecord(context.template14) ? (context.template14 as Record<string, string | number | boolean | null>) : null) ||
      (isRecord(event.template14) ? (event.template14 as Record<string, string | number | boolean | null>) : undefined),
  };
}

export function recordToContext(value: unknown): UnknownRecord {
  return asRecord(value);
}
