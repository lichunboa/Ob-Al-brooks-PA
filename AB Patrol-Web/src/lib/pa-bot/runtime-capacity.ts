import { fallbackStrategyLabel, type UnknownRecord } from './runtime-contract';
import { canonicalStrategyLabel } from './runtime-schema';

type CapacityDetailLevel = 'summary' | 'full';

type CapacityFiles = {
  executionLog: string;
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

function summarizeValue(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map((item) => summarizeValue(item)).filter(Boolean).join(' / ');
  if (!isRecord(value)) return '';

  const preferredKeys = ['reason', 'summary', 'message', 'label', 'name', 'status', 'type'];
  const preferredParts = preferredKeys.map((key) => summarizeValue(value[key])).filter(Boolean);
  if (preferredParts.length > 0) return preferredParts.join(' / ');
  return Object.values(value).map((item) => summarizeValue(item)).filter(Boolean).join(' / ');
}

function incrementCounter(counter: Map<string, number>, key: string, step = 1) {
  if (!key) return;
  counter.set(key, (counter.get(key) || 0) + step);
}

function counterToList(counter: Map<string, number>, limit = 12) {
  return Array.from(counter.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((left, right) => {
      if (right.count !== left.count) return right.count - left.count;
      return left.label.localeCompare(right.label);
    })
    .slice(0, limit);
}

function readJsonlRecent(filePath: string, limit = 300): UnknownRecord[] {
  try {
    const fs = require('fs') as typeof import('fs');
    if (!fs.existsSync(filePath)) return [];
    const lines = fs.readFileSync(filePath, 'utf-8').split('\n').filter(Boolean);
    return lines
      .slice(-limit)
      .map((line) => {
        try {
          const parsed = JSON.parse(line);
          return isRecord(parsed) ? parsed : {};
        } catch {
          return {};
        }
      })
      .filter((item) => Object.keys(item).length > 0);
  } catch {
    return [];
  }
}

export function emptyCapacitySummary(trackedSymbols = 0): UnknownRecord {
  return {
    maxPositions: 0,
    currentPositions: 0,
    currentEntryOrders: 0,
    currentProtectionOrders: 0,
    uniqueActiveSymbols: 0,
    trackedSymbols,
    remainingPositionSlots: 0,
    remainingSymbolSlots: trackedSymbols,
    baseRiskPercent: 0.4,
    addOnRiskPercent: 0.3,
    pyramidRiskPercent: 0.3,
    perOrderCostLimitPct: 1.0,
    totalSymbolRiskCapPct: 1.0,
    rejectionSummary: [],
    rejectionDetails: [],
    occupiedSymbols: [],
  };
}

export function buildCapacitySummary(
  files: CapacityFiles,
  execution: UnknownRecord,
  positions: UnknownRecord[],
  orders: UnknownRecord[],
  trackedSymbols: string[],
  detailLevel: CapacityDetailLevel,
): UnknownRecord {
  const services = asRecord(execution.services);
  const serviceEntries = Object.values(services).map((item) => asRecord(item));
  const botSummary =
    serviceEntries
      .map((item) => asRecord(item.bot_summary))
      .find((item) => Object.keys(item).length > 0) || asRecord(execution.bot_summary);
  const config = asRecord(botSummary.config);

  const maxPositions = asNumber(config.max_positions) ?? 0;
  const baseRiskPercent = 0.4;
  const perOrderCostLimitPct = asNumber(config.max_cost_pct_per_order) ?? 1.0;
  const totalSymbolRiskCapPct = asNumber(config.max_symbol_risk_percent) ?? 1.0;

  const entryOrders = orders.filter((item) => asString(item.orderClass).toUpperCase() === 'ENTRY');
  const protectionOrders = orders.filter((item) => asString(item.orderClass).toUpperCase() === 'PROTECTION');
  const activeSymbols = new Set<string>();
  for (const position of positions) {
    const symbol = asString(position.symbol).trim().toUpperCase();
    if (symbol) activeSymbols.add(symbol);
  }
  for (const order of entryOrders) {
    const symbol = asString(order.symbol).trim().toUpperCase();
    if (symbol) activeSymbols.add(symbol);
  }

  const rejectionCounter = new Map<string, number>();
  const rejectionDetails = new Map<
    string,
    Array<{
      loggedAt: string;
      symbol: string;
      exchange: string;
      status: string;
      type: string;
      strategy: string;
      message: string;
    }>
  >();
  const occupiedSymbols = new Map<
    string,
    {
      symbol: string;
      exchange: string;
      hasPosition: boolean;
      hasEntryOrder: boolean;
      hasProtectionOrder: boolean;
      blockedConflictCount: number;
    }
  >();

  function recordRejectionDetail(label: string, row: UnknownRecord) {
    const key = asString(label).trim();
    if (!key) return;
    const details = rejectionDetails.get(key) || [];
    if (detailLevel === 'full' && details.length < 12) {
      const message = summarizeValue(row.message);
      const strategy =
        canonicalStrategyLabel({
          strategy: message || asString(row.strategy),
          signalType: asString(row.signal_type),
        }) || fallbackStrategyLabel(asString(row.strategy));
      details.push({
        loggedAt: asString(row.logged_at) || asString(row.timestamp),
        symbol: asString(row.symbol),
        exchange: asString(row.exchange),
        status: asString(row.status),
        type: asString(row.type),
        strategy,
        message,
      });
    }
    rejectionDetails.set(key, details);
  }

  function ensureOccupiedSymbol(symbolValue: string, exchangeValue = '') {
    const symbol = symbolValue.trim().toUpperCase();
    if (!symbol) return null;
    const existing = occupiedSymbols.get(symbol);
    if (existing) {
      if (!existing.exchange && exchangeValue) existing.exchange = exchangeValue;
      return existing;
    }
    const next = {
      symbol,
      exchange: exchangeValue,
      hasPosition: false,
      hasEntryOrder: false,
      hasProtectionOrder: false,
      blockedConflictCount: 0,
    };
    occupiedSymbols.set(symbol, next);
    return next;
  }

  for (const position of positions) {
    const item = ensureOccupiedSymbol(asString(position.symbol), asString(position.exchange));
    if (item) item.hasPosition = true;
  }
  for (const order of entryOrders) {
    const item = ensureOccupiedSymbol(asString(order.symbol), asString(order.exchange));
    if (item) item.hasEntryOrder = true;
  }
  for (const order of protectionOrders) {
    const item = ensureOccupiedSymbol(asString(order.symbol), asString(order.exchange));
    if (item) item.hasProtectionOrder = true;
  }

  const capacityLogWindow = detailLevel === 'full' ? 5000 : 240;

  for (const row of readJsonlRecent(files.executionLog, capacityLogWindow)) {
    const status = asString(row.status).toUpperCase() || asString(row.type).toUpperCase();
    const message = asString(row.message);
    if (!status && !message) continue;
    if (status === 'EXCHANGE_BLOCKED') {
      incrementCounter(rejectionCounter, 'Binance 地域限制');
      recordRejectionDetail('Binance 地域限制', row);
      continue;
    }
    if (status === 'BLOCKED') {
      if (message.includes('BINANCE_REGION_RESTRICTED') || message.toLowerCase().includes('restricted location')) {
        incrementCounter(rejectionCounter, 'Binance 地域限制');
        recordRejectionDetail('Binance 地域限制', row);
      } else if (message.includes('Connection refused')) {
        incrementCounter(rejectionCounter, '执行服务不可达');
        recordRejectionDetail('执行服务不可达', row);
      } else if (message.includes('交易开关未开启')) {
        incrementCounter(rejectionCounter, '交易开关关闭');
        recordRejectionDetail('交易开关关闭', row);
      } else {
        incrementCounter(rejectionCounter, '其他阻塞');
        recordRejectionDetail('其他阻塞', row);
      }
      continue;
    }
    if (status === 'SIZE_FAILED') {
      if (message.includes('无剩余风险预算')) {
        incrementCounter(rejectionCounter, '剩余风险预算不足');
        recordRejectionDetail('剩余风险预算不足', row);
      } else if (message.includes('最小下单单位')) {
        incrementCounter(rejectionCounter, '最小下单单位冲突');
        recordRejectionDetail('最小下单单位冲突', row);
      } else {
        incrementCounter(rejectionCounter, '仓位贴合失败');
        recordRejectionDetail('仓位贴合失败', row);
      }
      continue;
    }
    if (status === 'VALIDATION_REJECTED') {
      incrementCounter(rejectionCounter, '实盘校验拒绝');
      recordRejectionDetail('实盘校验拒绝', row);
      continue;
    }
    if (message.includes('LIVE_ENTRY_CONFLICT')) {
      const item = ensureOccupiedSymbol(asString(row.symbol), asString(row.exchange));
      if (item) item.blockedConflictCount += 1;
      if (message.includes('活动挂单')) {
        incrementCounter(rejectionCounter, '同品种已有首仓挂单');
        recordRejectionDetail('同品种已有首仓挂单', row);
      } else if (message.includes('持仓')) {
        incrementCounter(rejectionCounter, '同品种已有持仓');
        recordRejectionDetail('同品种已有持仓', row);
      } else {
        incrementCounter(rejectionCounter, '同品种冲突');
        recordRejectionDetail('同品种冲突', row);
      }
    }
  }

  const rejectionSummary = counterToList(rejectionCounter, 8);

  return {
    maxPositions,
    currentPositions: positions.length,
    currentEntryOrders: entryOrders.length,
    currentProtectionOrders: protectionOrders.length,
    uniqueActiveSymbols: activeSymbols.size,
    trackedSymbols: trackedSymbols.length,
    remainingPositionSlots: Math.max(0, maxPositions - positions.length - entryOrders.length),
    remainingSymbolSlots: Math.max(0, trackedSymbols.length - activeSymbols.size),
    baseRiskPercent,
    addOnRiskPercent: 0.3,
    pyramidRiskPercent: 0.3,
    perOrderCostLimitPct,
    totalSymbolRiskCapPct,
    rejectionSummary,
    rejectionDetails:
      detailLevel === 'full'
        ? rejectionSummary.map((item) => ({
            label: item.label,
            count: item.count,
            entries: rejectionDetails.get(item.label) || [],
          }))
        : [],
    occupiedSymbols: Array.from(occupiedSymbols.values())
      .map((item) => ({
        ...item,
        occupiedBy: [
          item.hasPosition ? '持仓' : '',
          item.hasEntryOrder ? '首仓挂单' : '',
          item.hasProtectionOrder ? '保护单' : '',
        ].filter(Boolean),
      }))
      .sort((left, right) => {
        if (right.blockedConflictCount !== left.blockedConflictCount) {
          return right.blockedConflictCount - left.blockedConflictCount;
        }
        return left.symbol.localeCompare(right.symbol);
      })
      .slice(0, detailLevel === 'full' ? 40 : 8),
  };
}
