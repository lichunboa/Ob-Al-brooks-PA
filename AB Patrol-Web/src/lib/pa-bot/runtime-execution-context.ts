import { canonicalStrategyLabel } from './runtime-schema';
import {
  fallbackStrategyLabel,
  inferOrderClass,
  inferProtectionKind,
  normalizeRuntimeExecutionEvent,
  normalizeRuntimeOrder,
  normalizeRuntimePosition,
  type RuntimeExecutionEventRecord,
  type RuntimeOrderRecord,
  type RuntimePositionRecord,
  type UnknownRecord,
} from './runtime-contract';
import {
  extractTimeframeSignalsFromPatch,
  normalizeSymbolKey,
} from './runtime-symbols';

export type RuntimeExecutionContext = {
  positions: RuntimePositionRecord[];
  orders: RuntimeOrderRecord[];
  recentExecutions: RuntimeExecutionEventRecord[];
  managementActions: RuntimeExecutionEventRecord[];
  historicalOrders: RuntimeExecutionEventRecord[];
};

type BuildRuntimeExecutionContextInput = {
  cycles: UnknownRecord[];
  executionRows: UnknownRecord[];
  openPositions: UnknownRecord[];
  openOrders: UnknownRecord[];
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

function sameTradeDirection(eventSide: string, positionSide: string): boolean {
  const normalizedEvent = String(eventSide || '').toUpperCase();
  const normalizedPosition = String(positionSide || '').toUpperCase();
  if (!normalizedEvent || !normalizedPosition) return true;
  if (normalizedEvent === 'BUY') return normalizedPosition === 'LONG';
  if (normalizedEvent === 'SELL') return normalizedPosition === 'SHORT';
  return normalizedEvent === normalizedPosition;
}

function sameExchange(left: string, right: string): boolean {
  const normalizedLeft = String(left || '').trim().toUpperCase();
  const normalizedRight = String(right || '').trim().toUpperCase();
  if (!normalizedLeft || !normalizedRight) return true;
  return normalizedLeft === normalizedRight;
}

function sameStrategy(left: string, right: string): boolean {
  const normalizedLeft = canonicalStrategyLabel({ strategy: left }) || String(left || '').trim();
  const normalizedRight = canonicalStrategyLabel({ strategy: right }) || String(right || '').trim();
  if (!normalizedLeft || !normalizedRight) return true;
  return normalizedLeft === normalizedRight;
}

function isActiveEntryLifecycle(status: string, type: string, orderClass: string): boolean {
  const upperStatus = String(status || '').trim().toUpperCase();
  const upperType = String(type || '').trim().toUpperCase();
  const upperClass = String(orderClass || '').trim().toUpperCase();
  if (upperType !== 'OPEN_ORDER' || upperClass !== 'ENTRY') return false;
  return ['OPEN', 'PLACED', 'NEW', 'MODIFIED'].includes(upperStatus);
}

function appendStatusMessage(message: string, suffix: string): string {
  const base = String(message || '').trim();
  if (!suffix) return base;
  if (!base) return suffix;
  if (base.includes(suffix)) return base;
  return `${base} | ${suffix}`;
}

function parseEventTime(value: unknown): number {
  const parsed = Date.parse(asString(value));
  return Number.isFinite(parsed) ? parsed : 0;
}

function balancedRecentEvents(
  events: RuntimeExecutionEventRecord[],
  limits: {
    perExchangeLimit: number;
    totalLimit: number;
  },
): RuntimeExecutionEventRecord[] {
  const { perExchangeLimit, totalLimit } = limits;
  const byExchange = new Map<string, RuntimeExecutionEventRecord[]>();
  const sorted = [...events].sort((left, right) => parseEventTime(right.loggedAt) - parseEventTime(left.loggedAt));
  for (const event of sorted) {
    const exchange = asString(event.exchange).trim().toLowerCase() || 'unknown';
    const bucket = byExchange.get(exchange) || [];
    if (bucket.length >= perExchangeLimit) {
      continue;
    }
    bucket.push(event);
    byExchange.set(exchange, bucket);
  }
  return Array.from(byExchange.values())
    .flat()
    .sort((left, right) => parseEventTime(right.loggedAt) - parseEventTime(left.loggedAt))
    .slice(0, totalLimit);
}

function summarizeValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map((item) => summarizeValue(item)).filter(Boolean).join(' / ');
  if (isRecord(value)) {
    return Object.values(value)
      .map((item) => summarizeValue(item))
      .filter(Boolean)
      .join(' / ');
  }
  return '';
}

function firstMeaningfulString(...values: unknown[]): string | null {
  for (const value of values) {
    const text = summarizeValue(value);
    if (text) return text;
  }
  return null;
}

function firstMeaningfulNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const numeric = asNumber(value);
    if (numeric !== null) return numeric;
  }
  return null;
}

function cycleSymbolPatch(cycle: UnknownRecord, symbol: string): UnknownRecord {
  const updates = asRecord(asRecord(cycle.decision).symbol_updates);
  const direct = asRecord(updates[symbol]);
  if (Object.keys(direct).length > 0) {
    return direct;
  }
  const symbolKey = normalizeSymbolKey(symbol);
  for (const [candidate, payload] of Object.entries(updates)) {
    if (normalizeSymbolKey(candidate) === symbolKey) {
      return asRecord(payload);
    }
  }
  return {};
}

export function emptyRuntimeExecutionContext(
  openPositions: UnknownRecord[] = [],
  openOrders: UnknownRecord[] = [],
): RuntimeExecutionContext {
  return {
    positions: openPositions as RuntimePositionRecord[],
    orders: openOrders as RuntimeOrderRecord[],
    recentExecutions: [],
    managementActions: [],
    historicalOrders: [],
  };
}

export function buildRuntimeExecutionContext({
  cycles,
  executionRows,
  openPositions,
  openOrders,
}: BuildRuntimeExecutionContextInput): RuntimeExecutionContext {
  const buildTemplate14 = ({
    actionSnapshot,
    orderPayload,
    marketState,
    stopLoss,
    takeProfit,
    cyclePatch,
  }: {
    actionSnapshot: UnknownRecord;
    orderPayload: UnknownRecord;
    marketState: string;
    stopLoss: number | null;
    takeProfit: number | null;
    cyclePatch: UnknownRecord;
  }): Record<string, string | number | boolean | null> => ({
    background:
      firstMeaningfulString(
        marketState,
        cyclePatch.market_state,
        cyclePatch.market_state_detail,
        cyclePatch.structure_summary,
      ) || null,
    keyArea:
      firstMeaningfulString(
        actionSnapshot.playbook_hint,
        actionSnapshot.playbook_id,
        asRecord(cyclePatch.planned_trade).playbook_hint,
        asRecord(cyclePatch.planned_trade).playbook_id,
        asRecord(cyclePatch.entry_idea).playbook_hint,
        cyclePatch.htf_key_area,
      ) || null,
    setupPremise:
      firstMeaningfulString(
        actionSnapshot.strategy,
        asRecord(cyclePatch.planned_trade).setup_premise,
        asRecord(cyclePatch.entry_idea).setup_premise,
        asRecord(cyclePatch.pre_signal).thesis,
      ) || null,
    signalBarType:
      firstMeaningfulString(
        actionSnapshot.signal_bar_type,
        cyclePatch.signal_bar_type,
        asRecord(cyclePatch.pre_signal).signal_bar_type,
      ) || null,
    entryTrigger:
      firstMeaningfulString(
        orderPayload.order_type,
        actionSnapshot.intent,
        asRecord(cyclePatch.planned_trade).entry_trigger,
        asRecord(cyclePatch.entry_idea).entry_trigger,
        asRecord(cyclePatch.pre_signal).type,
      ) || null,
    triggerInvalidation:
      firstMeaningfulString(
        actionSnapshot.trigger_invalidation,
        asRecord(cyclePatch.planned_trade).trigger_invalidation,
        asRecord(cyclePatch.entry_idea).trigger_invalidation,
      ) || null,
    initialStopType:
      firstMeaningfulString(
        actionSnapshot.initial_stop_type,
        asRecord(cyclePatch.planned_trade).initial_stop_type,
        asRecord(cyclePatch.entry_idea).initial_stop_type,
      ) || (stopLoss ? '价格止损' : null),
    actualRiskPct:
      firstMeaningfulNumber(
        actionSnapshot.risk_percent,
        asRecord(cyclePatch.planned_trade).risk_percent,
        asRecord(cyclePatch.entry_idea).risk_percent,
      ),
    positionLeverage:
      firstMeaningfulNumber(
        orderPayload.leverage,
        asRecord(cyclePatch.planned_trade).leverage,
        asRecord(cyclePatch.entry_idea).leverage,
      ),
    firstTarget:
      firstMeaningfulNumber(
        takeProfit,
        asRecord(cyclePatch.planned_trade).first_target,
        asRecord(cyclePatch.planned_trade).take_profit,
        asRecord(cyclePatch.entry_idea).first_target,
      ),
    managementMode:
      firstMeaningfulString(
        actionSnapshot.style,
        actionSnapshot.followup_profile,
        asRecord(cyclePatch.planned_trade).management_mode,
        asRecord(cyclePatch.entry_idea).management_mode,
        asRecord(cyclePatch.planned_trade).management_template,
      ) || null,
    beCondition:
      firstMeaningfulString(
        actionSnapshot.be_condition,
        asRecord(cyclePatch.planned_trade).be_condition,
        asRecord(cyclePatch.entry_idea).be_condition,
      ) || null,
    earlyExit:
      firstMeaningfulString(
        actionSnapshot.early_exit_rule,
        asRecord(cyclePatch.planned_trade).early_exit_rule,
        asRecord(cyclePatch.entry_idea).early_exit_rule,
      ) || null,
    reentryAddOn:
      firstMeaningfulString(
        actionSnapshot.intent,
        actionSnapshot.reentry_attempt,
        asRecord(cyclePatch.planned_trade).reentry_add_on,
        asRecord(cyclePatch.entry_idea).reentry_add_on,
      ) || null,
  });

  const cycleMap = new Map<string, UnknownRecord>();
  for (const cycle of cycles) {
    const cycleId = asString(cycle.cycle_id);
    if (cycleId) {
      cycleMap.set(cycleId, cycle);
    }
  }

  const orderContextMap = new Map<string, UnknownRecord>();
  const symbolEntryContext = new Map<string, UnknownRecord>();
  const symbolLatestContext = new Map<string, UnknownRecord>();
  const recentExecutions: UnknownRecord[] = [];
  const managementActions: UnknownRecord[] = [];
  const historicalOrders: UnknownRecord[] = [];

  for (const row of executionRows) {
    const status = asString(row.status);
    if (!status || ['LOG_ONLY', 'NO_ACTION'].includes(status.toUpperCase())) {
      continue;
    }

    const actionSnapshot = asRecord(row.action_snapshot);
    const orderPayload = asRecord(row.order_payload);
    const response = asRecord(row.response);
    const symbol = asString(row.symbol);
    const symbolKey = normalizeSymbolKey(symbol);
    const cycleId = asString(row.cycle_id);
    const cycle = cycleMap.get(cycleId) || {};
    const explicitStrategy = asString(actionSnapshot.strategy) || asString(orderPayload.strategy);
    const logMessage = summarizeValue(row.message) || summarizeValue(response.message);
    const logMessageStrategy = canonicalStrategyLabel({
      strategy: logMessage,
    });
    const strategyHint = explicitStrategy || logMessage;
    const marketState = asString(actionSnapshot.market_state);
    const orderType = asString(orderPayload.order_type);
    const side = asString(actionSnapshot.side) || asString(orderPayload.side) || asString(response.side);
    const quantity =
      asNumber(row.close_quantity) ??
      asNumber(row.position_quantity) ??
      asNumber(orderPayload.quantity) ??
      asNumber(response.quantity);
    const plannedEntryPrice =
      asNumber(actionSnapshot.entry_price) ??
      asNumber(actionSnapshot.entry) ??
      asNumber(orderPayload.price) ??
      asNumber(orderPayload.entry_price);
    const actualEntryPrice =
      asNumber(response.filled_price) ??
      asNumber(response.actual_entry_price);
    const plannedStopLoss =
      asNumber(actionSnapshot.stop_loss) ??
      asNumber(actionSnapshot.sl) ??
      asNumber(orderPayload.stop_loss) ??
      asNumber(response.planned_stop_loss);
    const actualStopLoss = asNumber(response.actual_stop_loss) ?? plannedStopLoss;
    const plannedTakeProfit =
      asNumber(actionSnapshot.take_profit) ??
      asNumber(actionSnapshot.tp) ??
      asNumber(orderPayload.take_profit) ??
      asNumber(response.planned_take_profit);
    const actualTakeProfit = asNumber(response.actual_take_profit) ?? plannedTakeProfit;
    const reduceOnly =
      asBoolean(orderPayload.reduce_only) ??
      asBoolean(response.reduce_only) ??
      asBoolean(orderPayload.closePosition) ??
      false;
    const cyclePatch = cycleSymbolPatch(cycle, symbol);
    const timeframeSignals = extractTimeframeSignalsFromPatch(cyclePatch);
    const cycleBackedStrategy = canonicalStrategyLabel({
      strategy: strategyHint,
      signalType:
        asString(cyclePatch.signal_type) ||
        asString(asRecord(cyclePatch.pre_signal).type) ||
        asString(asRecord(actionSnapshot.pre_signal).type),
      brooksLabel:
        asString(asRecord(cyclePatch.planned_trade).brooks_label) ||
        asString(cyclePatch.brooks_label),
      managementTemplate:
        asString(asRecord(cyclePatch.planned_trade).management_template) ||
        asString(asRecord(cyclePatch.entry_idea).management_template),
      playbookFamily:
        asString(asRecord(cyclePatch.planned_trade).playbook_family) ||
        asString(asRecord(cyclePatch.entry_idea).playbook_family) ||
        asString(cyclePatch.playbook_family),
      playbookId:
        asString(asRecord(cyclePatch.planned_trade).playbook_id) ||
        asString(asRecord(cyclePatch.entry_idea).playbook_id) ||
        asString(cyclePatch.playbook_id),
      rawSignals: [...timeframeSignals, logMessage],
    });
    const canonicalLabel = logMessageStrategy || cycleBackedStrategy;
    const effectiveStrategy = canonicalLabel || fallbackStrategyLabel(explicitStrategy);
    const protectionKind = inferProtectionKind(orderType, effectiveStrategy, reduceOnly);
    const orderClass = inferOrderClass(asString(row.type), orderType, effectiveStrategy, reduceOnly);

    const event = normalizeRuntimeExecutionEvent(
      {
        loggedAt: asString(row.logged_at) || asString(row.timestamp),
        cycleId,
        exchange: asString(row.exchange),
        symbol,
        type: asString(row.type),
        status,
        message: logMessage,
        success: asBoolean(row.success),
        orderId: asString(response.order_id),
      },
      {
        strategy: effectiveStrategy,
        marketState,
        timeframeSignals,
        side,
        entryPrice: actualEntryPrice ?? plannedEntryPrice,
        plannedEntryPrice,
        actualEntryPrice,
        eventPrice: asNumber(response.price) ?? actualEntryPrice ?? plannedEntryPrice,
        stopLoss: actualStopLoss,
        plannedStopLoss,
        actualStopLoss,
        takeProfit: actualTakeProfit,
        plannedTakeProfit,
        actualTakeProfit,
        quantity,
        orderClass,
        protectionKind,
        template14: buildTemplate14({
          actionSnapshot,
          orderPayload,
          marketState,
          stopLoss: actualStopLoss,
          takeProfit: actualTakeProfit,
          cyclePatch,
        }),
      },
    );
    const createdAt = asString(response.timestamp) || asString(row.logged_at);

    recentExecutions.push(event);
    historicalOrders.push(event);
    if (orderClass === 'MANAGEMENT') {
      managementActions.push(event);
    }
    if (symbolKey) {
      symbolLatestContext.set(symbolKey, event);
      if (asString(row.type).toUpperCase() === 'OPEN_ORDER' && orderClass === 'ENTRY') {
        symbolEntryContext.set(symbolKey, event);
      }
    }

    const orderId = asString(response.order_id);
    if (orderId) {
      orderContextMap.set(orderId, event);
    }
    const stopLossOrderId = asString(response.stop_loss_order_id);
    if (stopLossOrderId) {
      orderContextMap.set(stopLossOrderId, {
        ...event,
        orderId: stopLossOrderId,
        orderClass: 'PROTECTION',
        protectionKind: 'STOP_LOSS',
        loggedAt: createdAt,
      });
    }
    const takeProfitOrderId = asString(response.take_profit_order_id);
    if (takeProfitOrderId) {
      orderContextMap.set(takeProfitOrderId, {
        ...event,
        orderId: takeProfitOrderId,
        orderClass: 'PROTECTION',
        protectionKind: 'TAKE_PROFIT',
        loggedAt: createdAt,
      });
    }
  }

  const positions = openPositions.map((position) => {
    const symbolKey = normalizeSymbolKey(asString(position.symbol));
    const context = asRecord(symbolEntryContext.get(symbolKey) || symbolLatestContext.get(symbolKey));
    return normalizeRuntimePosition(position, {
      entryPrice: asNumber(position.entryPrice) ?? asNumber(context.entryPrice) ?? null,
      stopLoss: asNumber(position.stopLoss) ?? asNumber(context.stopLoss) ?? null,
      takeProfit: asNumber(position.takeProfit) ?? asNumber(context.takeProfit) ?? null,
      strategy:
        canonicalStrategyLabel({
          strategy: asString(context.strategy),
          rawSignals: asArray(context.timeframeSignals).map((item) => asString(item)).filter(Boolean),
        }) || fallbackStrategyLabel(asString(context.strategy)),
      marketState: asString(context.marketState),
      timeframeSignals: asArray(context.timeframeSignals).map((item) => asString(item)).filter(Boolean),
      cycleId: asString(context.cycleId) || null,
      openedAt: asString(context.createdAt) || asString(context.loggedAt) || null,
      botIds: asArray(position.botIds).map((item) => asString(item)).filter(Boolean),
    });
  });

  const positionContextMap = new Map<string, UnknownRecord>();
  for (const position of positions) {
    positionContextMap.set(normalizeSymbolKey(asString(position.symbol)), position as unknown as UnknownRecord);
  }

  function findMatchingLivePosition(event: UnknownRecord): RuntimePositionRecord | null {
    const symbolKey = normalizeSymbolKey(asString(event.symbol));
    const eventExchange = asString(event.exchange);
    const eventSide = asString(event.side);
    const eventStrategy = asString(event.strategy);
    return (
      positions.find((position) => {
        if (normalizeSymbolKey(asString(position.symbol)) !== symbolKey) return false;
        if (!sameExchange(eventExchange, asString(position.exchange))) return false;
        if (!sameTradeDirection(eventSide, asString(position.side))) return false;
        if (!sameStrategy(eventStrategy, asString(position.strategy))) return false;
        return true;
      }) || null
    );
  }

  const enrichEvent = (event: UnknownRecord): RuntimeExecutionEventRecord => {
    const symbolKey = normalizeSymbolKey(asString(event.symbol));
    const baseContext = asRecord(
      positionContextMap.get(symbolKey) ||
        symbolEntryContext.get(symbolKey) ||
        symbolLatestContext.get(symbolKey),
    );
    const eventSignals = asArray(event.timeframeSignals).map((item) => asString(item)).filter(Boolean);
    const baseSignals = asArray(baseContext.timeframeSignals).map((item) => asString(item)).filter(Boolean);
    const livePositionEntryPrice = asNumber(baseContext.entryPrice);
    const eventActualEntryPrice = asNumber(event.actualEntryPrice);
    const eventPlannedEntryPrice = asNumber(event.plannedEntryPrice);
    const liveEntryOrder = orders.find((order) => {
      if (String(order.orderClass || '').toUpperCase() !== 'ENTRY') return false;
      const eventOrderId = asString(event.orderId);
      if (eventOrderId && eventOrderId === asString(order.orderId)) return true;
      if (normalizeSymbolKey(asString(order.symbol)) !== symbolKey) return false;
      if (!sameExchange(asString(event.exchange), asString(order.exchange))) return false;
      if (!sameTradeDirection(asString(event.side), asString(order.side))) return false;
      if (!sameStrategy(asString(event.strategy), asString(order.strategy))) return false;
      return true;
    }) || null;
    const livePosition = findMatchingLivePosition(event);
    let reconciledStatus = asString(event.status);
    let reconciledMessage = asString(event.message);
    if (isActiveEntryLifecycle(reconciledStatus, asString(event.type), asString(event.orderClass))) {
      if (liveEntryOrder) {
        reconciledStatus = asString(liveEntryOrder.status) || reconciledStatus;
      } else if (livePosition) {
        reconciledStatus = 'FILLED_TO_POSITION';
        reconciledMessage = appendStatusMessage(reconciledMessage, '已成交成仓，当前不再是交易所活动挂单');
      } else {
        reconciledStatus = 'HISTORICAL_ENTRY';
        reconciledMessage = appendStatusMessage(reconciledMessage, '当前不在交易所活动订单或持仓中');
      }
    }
    const shouldHydrateActualEntryFromLivePosition =
      asString(event.orderClass).toUpperCase() === 'ENTRY' &&
      eventActualEntryPrice === null &&
      livePositionEntryPrice !== null &&
      sameTradeDirection(asString(event.side), asString(baseContext.side));
    return normalizeRuntimeExecutionEvent(
      {
        ...event,
        status: reconciledStatus,
        message: reconciledMessage,
      },
      {
      strategy:
        canonicalStrategyLabel({
          strategy: asString(event.strategy) || asString(baseContext.strategy),
          rawSignals: eventSignals.length > 0 ? eventSignals : baseSignals,
        }) ||
        fallbackStrategyLabel(asString(event.strategy)) ||
        fallbackStrategyLabel(asString(baseContext.strategy)),
      marketState: asString(event.marketState) || asString(baseContext.marketState),
      timeframeSignals: eventSignals.length > 0 ? eventSignals : baseSignals,
      entryPrice: asNumber(event.entryPrice) ?? asNumber(baseContext.entryPrice) ?? null,
      plannedEntryPrice: eventPlannedEntryPrice,
      actualEntryPrice: shouldHydrateActualEntryFromLivePosition ? livePositionEntryPrice : eventActualEntryPrice,
      eventPrice:
        shouldHydrateActualEntryFromLivePosition
          ? livePositionEntryPrice
          : (asNumber(event.eventPrice) ?? null),
      stopLoss: asNumber(event.stopLoss) ?? asNumber(baseContext.stopLoss) ?? null,
      actualStopLoss: asNumber(event.actualStopLoss) ?? asNumber(baseContext.stopLoss) ?? null,
      takeProfit: asNumber(event.takeProfit) ?? asNumber(baseContext.takeProfit) ?? null,
      actualTakeProfit: asNumber(event.actualTakeProfit) ?? asNumber(baseContext.takeProfit) ?? null,
      quantity: asNumber(event.quantity) ?? asNumber(baseContext.quantity) ?? null,
      orderClass: asString(event.orderClass),
      protectionKind: asString(event.protectionKind),
      template14: isRecord(event.template14) ? (event.template14 as Record<string, string | number | boolean | null>) : undefined,
      },
    );
  };

  const orders = openOrders.map((order) => {
    const orderId = asString(order.orderId);
    const symbolKey = normalizeSymbolKey(asString(order.symbol));
    const context = asRecord(orderContextMap.get(orderId) || symbolEntryContext.get(symbolKey) || symbolLatestContext.get(symbolKey));
    const reduceOnly = asBoolean(order.reduceOnly) ?? false;
    const effectiveStrategy =
      canonicalStrategyLabel({
        strategy: asString(context.strategy),
        rawSignals: asArray(context.timeframeSignals).map((item) => asString(item)).filter(Boolean),
      }) || fallbackStrategyLabel(asString(context.strategy));
    const protectionKind = inferProtectionKind(asString(order.orderType), effectiveStrategy, reduceOnly);
    const orderClass = inferOrderClass('OPEN_ORDER', asString(order.orderType), effectiveStrategy, reduceOnly);
    return normalizeRuntimeOrder(order, {
      reduceOnly,
      orderClass,
      protectionKind,
      strategy: effectiveStrategy,
      marketState: asString(context.marketState),
      timeframeSignals: asArray(context.timeframeSignals).map((item) => asString(item)).filter(Boolean),
      entryPrice: asNumber(context.entryPrice) ?? asNumber(order.price) ?? null,
      stopLoss: protectionKind === 'STOP_LOSS' ? asNumber(order.stopPrice) : asNumber(context.stopLoss),
      takeProfit: protectionKind === 'TAKE_PROFIT' ? asNumber(order.stopPrice) : asNumber(context.takeProfit),
      cycleId: asString(context.cycleId) || null,
      loggedAt: asString(context.loggedAt) || asString(order.createdAt) || null,
      message: asString(context.message),
    });
  });

  return {
    positions,
    orders,
    recentExecutions: balancedRecentEvents(
      recentExecutions.map((event) => enrichEvent(event)),
      { perExchangeLimit: 60, totalLimit: 120 },
    ),
    managementActions: balancedRecentEvents(
      managementActions.map((event) => enrichEvent(event)),
      { perExchangeLimit: 60, totalLimit: 120 },
    ),
    historicalOrders: balancedRecentEvents(
      historicalOrders.map((event) => enrichEvent(event)),
      { perExchangeLimit: 160, totalLimit: 320 },
    ),
  };
}
