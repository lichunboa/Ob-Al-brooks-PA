'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Blocks, History, Image as ImageIcon, Layers3, ShieldCheck, TriangleAlert } from 'lucide-react';
import type { RuntimeData } from '../types';
import { isRealExecutionStatus } from '../derived';
import { LIVE_CHART_DEFAULT_TIMEFRAME, listLiveChartTimeframes } from '../../../../lib/pa-bot/live-chart-timeframe';
import { normalizeStrategyLabel } from '../../../../lib/pa-bot/runtime-schema';
import { normalizeChartSymbol, normalizeSymbolKey } from '../../../../lib/pa-bot/runtime-symbols';
import { TradeChartPanel, type TradeChartPayload } from '../../trade-chart-panel';
import {
  BUTTON_GHOST_CLASS,
  CARD_CLASS,
  DATA_VALUE_CLASS,
  EmptyState,
  INPUT_CLASS,
  LABEL_CLASS,
  MetricCard,
  TABLE_CLASS,
  TABLE_HEAD_CLASS,
  TABLE_ROW_CLASS,
  TABLE_STICKY_CELL_CLASS,
  TABLE_STICKY_HEAD_CLASS,
  Section,
  TableScroll,
  TerminalBadge,
  cn,
  statusTone,
} from '../ui';
import { formatNumber, formatTime, translateMarketStateLabel, translateSide, translateSourceLabel, translateStatusLabel } from '../formatters';

type OrdersViewProps = {
  runtimeData: RuntimeData;
  realExecutionEvents: RuntimeData['recentExecutions'];
  hiddenLogOnlyEvents: number;
  defaultPanel?: OrderPanelKey;
};

type OrderPanelKey =
  | 'positions'
  | 'entry'
  | 'protection'
  | 'management'
  | 'occupancy'
  | 'history'
  | 'rejections';

function protectionKindLabel(value: string): string {
  if (value === 'STOP_LOSS') return '止损';
  if (value === 'TAKE_PROFIT') return '止盈';
  return '-';
}

function orderClassLabel(value: string): string {
  if (value === 'ENTRY') return '首仓';
  if (value === 'PROTECTION') return '保护';
  if (value === 'MANAGEMENT') return '管理';
  return '-';
}

function timeframeText(values: string[]): string {
  return values.length > 0 ? values.join(' / ') : '无';
}

function uniqueOptions(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((left, right) => left.localeCompare(right));
}

function normalizeStrategyText(value: string): string {
  return normalizeStrategyLabel(value);
}

function chartSymbol(value: string): string {
  return normalizeChartSymbol(value);
}

function sameSymbol(left: string, right: string): boolean {
  return normalizeSymbolKey(left) === normalizeSymbolKey(right);
}

function historyRowKey(item: RuntimeData['historicalOrders'][number]): string {
  return `${item.loggedAt}-${item.symbol}-${item.type}-${item.orderId || ''}`;
}

function positionRowKey(item: RuntimeData['positions'][number]): string {
  return `${item.exchange}-${item.symbol}-${normalizeStrategyText(item.strategy || '')}-${item.openedAt || ''}`;
}

type DisplayExecutionItem = RuntimeData['historicalOrders'][number] & {
  plannedEntryPrice: number | null;
  actualEntryPrice: number | null;
  plannedStopLoss: number | null;
  actualStopLoss: number | null;
  plannedTakeProfit: number | null;
  actualTakeProfit: number | null;
};

function pricesDiffer(left: number | null, right: number | null): boolean {
  if (left === null || right === null) return false;
  const tolerance = Math.max(1e-6, Math.abs(left) * 1e-5, Math.abs(right) * 1e-5);
  return Math.abs(left - right) > tolerance;
}

function sameTradeDirection(eventSide: string, positionSide: string): boolean {
  const normalizedEvent = String(eventSide || '').toUpperCase();
  const normalizedPosition = String(positionSide || '').toUpperCase();
  if (!normalizedEvent || !normalizedPosition) return true;
  if (normalizedEvent === 'BUY') return normalizedPosition === 'LONG';
  if (normalizedEvent === 'SELL') return normalizedPosition === 'SHORT';
  return normalizedEvent === normalizedPosition;
}

function renderPrimaryWithPlan(primary: number | null, planned: number | null) {
  return (
    <div className="flex flex-col">
      <div className="font-mono tabular-nums text-sm text-foreground">{formatNumber(primary, 5)}</div>
      {pricesDiffer(primary, planned) ? (
        <div className="mt-1 font-mono tabular-nums text-[11px] text-foreground-faint">计划 {formatNumber(planned, 5)}</div>
      ) : null}
    </div>
  );
}

function isPrimaryReviewEvent(item: RuntimeData['historicalOrders'][number]): boolean {
  const type = String(item.type || '').toUpperCase();
  const orderClass = String(item.orderClass || '').toUpperCase();
  if (!isRealExecutionStatus(item.status)) return false;
  if (orderClass === 'MANAGEMENT') return false;
  return ['OPEN_ORDER', 'CLOSE_POSITION', 'PARTIAL_CLOSE', 'REDUCE_POSITION'].includes(type) || orderClass === 'ENTRY';
}

function bucketTone(label: string): 'neutral' | 'info' | 'success' | 'warn' | 'danger' {
  const text = label.toLowerCase();
  if (text.includes('阻塞') || text.includes('拒绝') || text.includes('失败') || text.includes('不可达')) return 'danger';
  if (text.includes('持仓') || text.includes('挂单') || text.includes('冲突')) return 'warn';
  if (text.includes('保护')) return 'info';
  return 'neutral';
}

function compactActionReason(reason: string, message: string): string {
  const source = `${reason || ''}\n${message || ''}`.trim();
  if (!source) return '-';
  const lines = source
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const preferred = lines.filter(
    (line) =>
      line.includes('[TRADE_GATE_PRECHECK]') ||
      line.includes('R:R=') ||
      line.includes('下单被拒绝') ||
      line.includes('规则引擎升级') ||
      line.includes('规则引擎:'),
  );
  const picked = preferred.length > 0 ? preferred : lines.slice(0, 3);
  return picked.join(' / ');
}

function compactFinalStatus(status: string, message: string): string {
  const normalizedStatus = String(status || '').trim();
  const text = `${message || ''}`.trim();
  if (!normalizedStatus && !text) return '-';
  const headline = normalizedStatus || '未落库';
  if (!text) return headline;
  const picked = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line.includes('immediately trigger') || line.includes('下单被拒绝') || line.includes('未确认') || line.includes('缺少同源止损止盈') || line.includes('R:R='));
  const brief = (picked.length > 0 ? picked : text.split('\n').filter(Boolean).slice(0, 2)).join(' / ');
  return `${headline} / ${brief}`;
}

function panelTone(panel: OrderPanelKey): 'neutral' | 'info' | 'success' | 'warn' | 'danger' {
  if (panel === 'positions' || panel === 'management') return 'success';
  if (panel === 'entry' || panel === 'protection') return 'info';
  if (panel === 'occupancy') return 'warn';
  if (panel === 'rejections') return 'danger';
  return 'neutral';
}

export function OrdersView({
  runtimeData,
  realExecutionEvents,
  hiddenLogOnlyEvents,
  defaultPanel = 'positions',
}: OrdersViewProps) {
  const [symbolQuery, setSymbolQuery] = useState('');
  const [exchangeFilter, setExchangeFilter] = useState('ALL');
  const [strategyFilter, setStrategyFilter] = useState('ALL');
  const [timeframeFilter, setTimeframeFilter] = useState('ALL');
  const [activePanel, setActivePanel] = useState<OrderPanelKey>(defaultPanel);
  const [selectedRejectionLabel, setSelectedRejectionLabel] = useState('');
  const [selectedHistoryKey, setSelectedHistoryKey] = useState('');
  const [selectedHistorySymbol, setSelectedHistorySymbol] = useState('');
  const [liveChart, setLiveChart] = useState<TradeChartPayload | null>(null);
  const [liveChartFocusKey, setLiveChartFocusKey] = useState('');
  const [liveChartLoading, setLiveChartLoading] = useState(false);
  const [liveChartError, setLiveChartError] = useState('');
  const [liveChartTimeframe, setLiveChartTimeframe] = useState(LIVE_CHART_DEFAULT_TIMEFRAME);
  const [selectedPositionKey, setSelectedPositionKey] = useState('');
  const [selectedPositionSymbol, setSelectedPositionSymbol] = useState('');
  const [positionChart, setPositionChart] = useState<TradeChartPayload | null>(null);
  const [positionChartFocusKey, setPositionChartFocusKey] = useState('');
  const [positionChartLoading, setPositionChartLoading] = useState(false);
  const [positionChartError, setPositionChartError] = useState('');
  const [positionChartTimeframe, setPositionChartTimeframe] = useState(LIVE_CHART_DEFAULT_TIMEFRAME);

  const entryOrders = runtimeData.orders.filter((order) => order.orderClass === 'ENTRY');
  const protectionOrders = runtimeData.orders.filter((order) => order.orderClass === 'PROTECTION');
  const managementActions = runtimeData.managementActions;
  const historicalOrders = runtimeData.historicalOrders;
  const liveStrategyCatalog = runtimeData.summary.strategyCatalog.filter((item) => item.liveEnabled);
  const stagedStrategyCatalog = runtimeData.summary.strategyCatalog.filter((item) => !item.liveEnabled);
  const blockedAccounts = runtimeData.system.accounts.filter((item) => item.exchangeBlocked);
  const hiddenText =
    hiddenLogOnlyEvents > 0 ? `已隐藏 ${hiddenLogOnlyEvents} 条 LOG_ONLY 记录` : '仅显示真实执行链动作';

  const optionSeed = [
    ...runtimeData.positions,
    ...entryOrders,
    ...protectionOrders,
    ...managementActions,
    ...historicalOrders,
  ];

  const exchangeOptions = useMemo(
    () => uniqueOptions(optionSeed.map((item) => item.exchange || '')),
    [runtimeData.positions, entryOrders, protectionOrders, managementActions, historicalOrders],
  );
  const strategyOptions = useMemo(
    () =>
      uniqueOptions([
        ...liveStrategyCatalog.map((item) => item.label),
        ...optionSeed.map((item) => normalizeStrategyText(item.strategy || '')),
      ]).filter((option) => liveStrategyCatalog.some((item) => item.label === option)),
    [liveStrategyCatalog, runtimeData.positions, entryOrders, protectionOrders, managementActions, historicalOrders],
  );
  const timeframeOptions = useMemo(
    () =>
      uniqueOptions(
        optionSeed.flatMap((item) => {
          const values = Array.isArray(item.timeframeSignals) ? item.timeframeSignals : [];
          return values.length > 0 ? values : [];
        }),
      ),
    [runtimeData.positions, entryOrders, protectionOrders, managementActions, historicalOrders],
  );

  function matchesFilter(item: {
    symbol?: string;
    exchange?: string;
    strategy?: string;
    timeframeSignals?: string[];
  }) {
    const symbol = (item.symbol || '').toUpperCase();
    const exchange = (item.exchange || '').toUpperCase();
    const strategy = normalizeStrategyText(item.strategy || '');
    const timeframeSignals = Array.isArray(item.timeframeSignals) ? item.timeframeSignals : [];
    const query = symbolQuery.trim().toUpperCase();
    if (query && !symbol.includes(query)) return false;
    if (exchangeFilter !== 'ALL' && exchange !== exchangeFilter.toUpperCase()) return false;
    if (strategyFilter !== 'ALL' && strategy !== strategyFilter) return false;
    if (timeframeFilter !== 'ALL' && !timeframeSignals.includes(timeframeFilter)) return false;
    return true;
  }

  function matchesSymbolExchange(item: { symbol?: string; exchange?: string }) {
    const symbol = (item.symbol || '').toUpperCase();
    const exchange = (item.exchange || '').toUpperCase();
    const query = symbolQuery.trim().toUpperCase();
    if (query && !symbol.includes(query)) return false;
    if (exchangeFilter !== 'ALL' && exchange !== exchangeFilter.toUpperCase()) return false;
    return true;
  }

  function matchesCurrentAction(item: {
    symbol?: string;
    exchange?: string;
    strategy?: string;
    timeframe?: string;
  }) {
    const symbol = (item.symbol || '').toUpperCase();
    const exchange = (item.exchange || '').toUpperCase();
    const strategy = normalizeStrategyText(item.strategy || '');
    const timeframe = String(item.timeframe || '').trim();
    const query = symbolQuery.trim().toUpperCase();
    if (query && !symbol.includes(query)) return false;
    if (exchangeFilter !== 'ALL' && exchange !== exchangeFilter.toUpperCase()) return false;
    if (strategyFilter !== 'ALL' && strategy !== strategyFilter) return false;
    if (timeframeFilter !== 'ALL' && timeframe !== timeframeFilter) return false;
    return true;
  }

  const filteredPositions = runtimeData.positions.filter(matchesFilter);
  const filteredEntryOrders = entryOrders.filter(matchesFilter);
  const filteredProtectionOrders = protectionOrders.filter(matchesFilter);
  const filteredManagementActions = managementActions.filter(matchesFilter);
  const filteredHistoricalOrders = historicalOrders.filter(matchesFilter);
  const focusableHistoricalOrders = filteredHistoricalOrders.filter(isPrimaryReviewEvent);
  const filteredCurrentActions = runtimeData.currentActions.filter(matchesCurrentAction).filter((item) => {
    const reason = `${item.reason || ''} ${item.message || ''}`;
    return item.type === 'OPEN_ORDER' || Boolean(item.candidateStage) || reason.includes('[TRADE_GATE_PRECHECK]');
  });
  const archivedHistoricalOrdersCount = filteredHistoricalOrders.filter(
    (item) => String(item.status || '').toUpperCase() === 'HISTORICAL_ENTRY',
  ).length;
  const filteredOccupiedSymbols = runtimeData.capacity.occupiedSymbols
    .filter(matchesSymbolExchange)
    .filter((item) => item.hasPosition || item.hasEntryOrder || item.hasProtectionOrder);
  const filteredRejectionDetails = runtimeData.capacity.rejectionDetails
    .map((bucket) => ({
      ...bucket,
      entries: bucket.entries.filter(matchesSymbolExchange),
    }))
    .filter((bucket) => bucket.entries.length > 0 || (!symbolQuery.trim() && exchangeFilter === 'ALL'));

  const activeRejectionBucket =
    filteredRejectionDetails.find((item) => item.label === selectedRejectionLabel) || filteredRejectionDetails[0] || null;

  const totalRejected = filteredRejectionDetails.reduce((sum, item) => sum + item.count, 0);
  const topRejectionBucket = [...filteredRejectionDetails].sort((left, right) => right.count - left.count)[0] || null;
  const topRejectionBuckets = [...filteredRejectionDetails].sort((left, right) => right.count - left.count).slice(0, 4);
  const totalConflictBlocks = filteredOccupiedSymbols.reduce((sum, item) => sum + item.blockedConflictCount, 0);
  const topOccupiedSymbol =
    [...filteredOccupiedSymbols].sort((left, right) => right.blockedConflictCount - left.blockedConflictCount)[0] || null;
  const topOccupiedSymbols = [...filteredOccupiedSymbols].sort((left, right) => right.blockedConflictCount - left.blockedConflictCount).slice(0, 5);
  const maxBlockedConflictCount = Math.max(1, ...filteredOccupiedSymbols.map((item) => item.blockedConflictCount));
  const maxRejectedCount = Math.max(1, ...filteredRejectionDetails.map((item) => item.count));
  const selectedRejectionTopSymbol =
    activeRejectionBucket?.entries.reduce<Record<string, number>>((counter, entry) => {
      const key = `${entry.exchange || '-'}:${entry.symbol || '系统事件'}`;
      counter[key] = (counter[key] || 0) + 1;
      return counter;
    }, {}) || {};
  const selectedRejectionLeader = Object.entries(selectedRejectionTopSymbol).sort((left, right) => right[1] - left[1])[0] || null;
  const performance = runtimeData.performance;
  const cleanupTotal =
    (performance.total.cleanup.partialClosed || 0) +
    (performance.total.cleanup.closeSuccess || 0) +
    (performance.total.cleanup.sizeFailed || 0) +
    (performance.total.cleanup.notFound || 0) +
    (performance.total.cleanup.modifyFailed || 0) +
    (performance.total.cleanup.modifySkipped || 0);
  const selectedHistoryItem = selectedHistoryKey
    ? focusableHistoricalOrders.find((item) => historyRowKey(item) === selectedHistoryKey) || null
    : null;
  const selectedPositionItem =
    filteredPositions.find(
      (item) => positionRowKey(item) === selectedPositionKey,
    ) ||
    filteredPositions[0] ||
    null;
  const positionSymbolOptions = useMemo(
    () =>
      uniqueOptions([
        ...filteredPositions.map((item) => chartSymbol(item.symbol || '')),
        ...runtimeData.currentActions.map((item) => chartSymbol(item.symbol || '')),
        ...runtimeData.system.accounts.flatMap((item) => item.configuredSymbols || []),
      ]),
    [filteredPositions, runtimeData.currentActions, runtimeData.system.accounts],
  );
  const historySymbolOptions = useMemo(
    () =>
      uniqueOptions([
        ...focusableHistoricalOrders.map((item) => chartSymbol(item.symbol || '')),
        ...runtimeData.currentActions.map((item) => chartSymbol(item.symbol || '')),
        ...runtimeData.system.accounts.flatMap((item) => item.configuredSymbols || []),
      ]),
    [focusableHistoricalOrders, runtimeData.currentActions, runtimeData.system.accounts],
  );

  function findMatchingLivePosition(item: RuntimeData['historicalOrders'][number]) {
    const eventType = String(item.type || '').toUpperCase();
    if (['CLOSE_POSITION', 'PARTIAL_CLOSE', 'REDUCE_POSITION'].includes(eventType)) {
      return null;
    }
    const itemSymbol = (item.symbol || '').toUpperCase();
    const itemExchange = (item.exchange || '').toUpperCase();
    const itemStrategy = normalizeStrategyText(item.strategy || '');
    return runtimeData.positions.find((position) => {
      if ((position.symbol || '').toUpperCase() !== itemSymbol) return false;
      if (itemExchange && (position.exchange || '').toUpperCase() !== itemExchange) return false;
      if (!sameTradeDirection(item.side || '', position.side || '')) return false;
      const positionStrategy = normalizeStrategyText(position.strategy || '');
      if (itemStrategy && positionStrategy && itemStrategy !== positionStrategy) return false;
      if (position.openedAt && item.loggedAt) {
        const positionOpenedAt = Date.parse(position.openedAt);
        const eventLoggedAt = Date.parse(item.loggedAt);
        if (Number.isFinite(positionOpenedAt) && Number.isFinite(eventLoggedAt) && eventLoggedAt < positionOpenedAt - 5 * 60 * 1000) {
          return false;
        }
      }
      return true;
    }) || null;
  }

  function buildDisplayExecutionItem(item: RuntimeData['historicalOrders'][number]): DisplayExecutionItem {
    const livePosition = findMatchingLivePosition(item);
    const plannedEntryPrice = item.plannedEntryPrice ?? item.entryPrice ?? null;
    const actualEntryPrice = item.actualEntryPrice ?? livePosition?.entryPrice ?? null;
    const plannedStopLoss = item.plannedStopLoss ?? item.stopLoss ?? null;
    const actualStopLoss = item.actualStopLoss ?? livePosition?.stopLoss ?? null;
    const plannedTakeProfit = item.plannedTakeProfit ?? item.takeProfit ?? null;
    const actualTakeProfit = item.actualTakeProfit ?? livePosition?.takeProfit ?? null;
    return {
      ...item,
      entryPrice: actualEntryPrice ?? plannedEntryPrice,
      plannedEntryPrice,
      actualEntryPrice,
      stopLoss: actualStopLoss ?? plannedStopLoss,
      plannedStopLoss,
      actualStopLoss,
      takeProfit: actualTakeProfit ?? plannedTakeProfit,
      plannedTakeProfit,
      actualTakeProfit,
    };
  }

  const panelItems: Array<{ key: OrderPanelKey; label: string; count: number }> = [
    { key: 'positions', label: '当前持仓', count: filteredPositions.length },
    { key: 'entry', label: '首仓挂单', count: filteredEntryOrders.length },
    { key: 'protection', label: '保护单', count: filteredProtectionOrders.length },
    { key: 'management', label: '管理动作', count: filteredManagementActions.length },
    { key: 'occupancy', label: '同品种占用', count: filteredOccupiedSymbols.length },
    { key: 'history', label: '历史订单', count: focusableHistoricalOrders.length },
    { key: 'rejections', label: '拒单原因', count: filteredRejectionDetails.reduce((sum, item) => sum + item.count, 0) },
  ];

  const activeFilters = [
    symbolQuery.trim() ? { key: 'symbol', label: `Symbol: ${symbolQuery.trim().toUpperCase()}` } : null,
    exchangeFilter !== 'ALL' ? { key: 'exchange', label: `交易所: ${exchangeFilter}` } : null,
    strategyFilter !== 'ALL' ? { key: 'strategy', label: `策略: ${strategyFilter}` } : null,
    timeframeFilter !== 'ALL' ? { key: 'timeframe', label: `周期: ${timeframeFilter}` } : null,
  ].filter((item): item is { key: string; label: string } => Boolean(item));

  useEffect(() => {
    if (filteredRejectionDetails.length === 0) {
      if (selectedRejectionLabel) {
        setSelectedRejectionLabel('');
      }
      return;
    }
    const stillExists = filteredRejectionDetails.some((item) => item.label === selectedRejectionLabel);
    if (!stillExists) {
      setSelectedRejectionLabel(filteredRejectionDetails[0].label);
    }
  }, [filteredRejectionDetails, selectedRejectionLabel]);

  useEffect(() => {
    if (focusableHistoricalOrders.length === 0) {
      setSelectedHistoryKey('');
      setLiveChart(null);
      setLiveChartFocusKey('');
      setLiveChartError('');
      return;
    }
    if (!selectedHistoryKey) {
      setLiveChart(null);
      setLiveChartFocusKey('');
      setLiveChartError('');
      return;
    }
    const exists = focusableHistoricalOrders.some(
      (item) => historyRowKey(item) === selectedHistoryKey,
    );
    if (!exists) {
      setSelectedHistoryKey('');
      setLiveChart(null);
      setLiveChartFocusKey('');
      setLiveChartError('');
    }
  }, [focusableHistoricalOrders, selectedHistoryKey]);

  useEffect(() => {
    if (selectedHistoryItem?.symbol) {
      const nextSymbol = chartSymbol(selectedHistoryItem.symbol);
      setSelectedHistorySymbol((current) => (current === nextSymbol ? current : nextSymbol));
      return;
    }
    if (historySymbolOptions.length === 0) {
      setSelectedHistorySymbol('');
      return;
    }
    setSelectedHistorySymbol((current) => (current && historySymbolOptions.includes(current) ? current : historySymbolOptions[0]));
  }, [historySymbolOptions, selectedHistoryItem]);

  useEffect(() => {
    if (filteredPositions.length === 0) {
      setSelectedPositionKey('');
      if (!selectedPositionSymbol) {
        setPositionChart(null);
        setPositionChartError('');
      }
      return;
    }
    const exists = filteredPositions.some(
      (item) => positionRowKey(item) === selectedPositionKey,
    );
    if (!exists) {
      const fallback = filteredPositions[0];
      setSelectedPositionKey(positionRowKey(fallback));
    }
  }, [filteredPositions.length, filteredPositions[0]?.symbol, filteredPositions[0]?.openedAt, selectedPositionKey, selectedPositionSymbol]);

  useEffect(() => {
    if (selectedPositionItem?.symbol) {
      const nextSymbol = chartSymbol(selectedPositionItem.symbol);
      setSelectedPositionSymbol((current) => (current === nextSymbol ? current : nextSymbol));
      return;
    }
    if (positionSymbolOptions.length === 0) {
      setSelectedPositionSymbol('');
      return;
    }
    setSelectedPositionSymbol((current) => (current && positionSymbolOptions.includes(current) ? current : positionSymbolOptions[0]));
  }, [positionSymbolOptions, selectedPositionItem]);

  const summaryCards = [
    {
      label: '当前持仓',
      value: String(filteredPositions.length),
      sub: filteredPositions.length > 0 ? '过滤后实仓' : '空仓',
    },
    {
      label: '首仓挂单',
      value: String(filteredEntryOrders.length),
      sub: filteredEntryOrders.length > 0 ? '等待成交' : '无首仓挂单',
    },
    {
      label: '保护单',
      value: String(filteredProtectionOrders.length),
      sub: filteredProtectionOrders.length > 0 ? '止损 / 止盈' : '无保护单',
    },
    {
      label: '管理动作',
      value: String(filteredManagementActions.length),
      sub: filteredManagementActions.length > 0 ? '最近管理链动作' : '暂无管理动作',
    },
    {
      label: '执行事件',
      value: String(realExecutionEvents.length),
      sub: hiddenText,
    },
  ];

  function renderCurrentActionSection() {
    const actionFailureCounts = filteredCurrentActions.reduce<Record<string, number>>(
      (counter, item) => {
        const bucket = item.failureBucket || 'other';
        counter[bucket] = (counter[bucket] || 0) + 1;
        return counter;
      },
      {},
    );
    return (
      <Section title="当前轮次动作" icon={Activity} subtitle="实时展示本轮候选、可执行与被 trade gate 拒绝的动作，不再只看历史执行链。">
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 md:grid-cols-4 xl:grid-cols-10">
            <MetricCard label="当前周期" value={runtimeData.summary.cycleId || '-'} sub={`数据源：${translateSourceLabel(runtimeData.system.sourceLabel || '-')}`} />
            <MetricCard label="周期年龄" value={runtimeData.health.cycleAgeSeconds !== null ? `${runtimeData.health.cycleAgeSeconds}s` : '-'} sub={runtimeData.summary.marketSummary || '暂无市场摘要'} />
            <MetricCard label="下轮扫描" value={runtimeData.nextScan.inSeconds !== null ? `${runtimeData.nextScan.inSeconds}s` : '-'} sub={runtimeData.nextScan.reasonText || '等待下一轮'} />
            <MetricCard label="实时动作" value={String(filteredCurrentActions.length)} sub={filteredCurrentActions.length > 0 ? '含候选 / gate 拒绝 / 可执行动作' : '当前轮次没有可展示动作'} />
            <MetricCard label="Trade Gate 拒绝" value={String(actionFailureCounts.trade_gate || 0)} sub="门禁通过前被拒绝" />
            <MetricCard label="语义预检拦截" value={String(actionFailureCounts.semantic_precheck || 0)} sub="候选态或语义串线" />
            <MetricCard label="立即触发失败" value={String(actionFailureCounts.immediate_trigger || 0)} sub="交易所判定会立刻触发" />
            <MetricCard label="模板缺保护" value={String(actionFailureCounts.missing_protection || 0)} sub="缺少同源止损止盈" />
            <MetricCard label="交易所未确认" value={String(actionFailureCounts.exchange_not_confirmed || 0)} sub="回执成功但交易所未确认" />
            <MetricCard label="交易所阻断" value={String(actionFailureCounts.exchange_blocked || 0)} sub="账户或区域硬阻断" />
          </div>
          {filteredCurrentActions.length === 0 ? (
            <EmptyState text="当前轮次没有候选、可执行或被 trade gate 拒绝的动作。页面顶部的刷新时间会继续证明运行态仍在更新。" />
          ) : (
            <div className={TABLE_CLASS}>
              <TableScroll className="max-h-[360px]">
                <div className={cn(TABLE_HEAD_CLASS, 'sticky top-0 z-10 hidden grid-cols-[0.68fr_0.42fr_0.74fr_0.4fr_0.48fr_0.48fr_0.58fr_0.52fr_0.52fr_0.52fr_0.5fr_1fr] gap-3 bg-surface px-4 py-3 md:grid')}>
                  <div className={cn('md:sticky md:left-0', TABLE_STICKY_HEAD_CLASS)}>合约</div>
                  <div>市场</div>
                  <div>策略</div>
                  <div>背景</div>
                  <div>候选阶段</div>
                  <div>最终结果</div>
                  <div>失败分类</div>
                  <div>入场</div>
                  <div>止损</div>
                  <div>止盈</div>
                  <div>执行模式</div>
                  <div>结果</div>
                </div>
                {filteredCurrentActions.map((item, index) => (
                  <article
                    key={`${item.symbol}-${item.strategy}-${item.candidateStage}-${index}`}
                    className={cn(
                      'grid gap-3 px-4 py-3.5 md:grid-cols-[0.68fr_0.42fr_0.74fr_0.4fr_0.48fr_0.48fr_0.58fr_0.52fr_0.52fr_0.52fr_0.5fr_1fr]',
                      TABLE_ROW_CLASS,
                      index > 0 && 'border-t',
                      index % 2 === 1 && 'bg-white/[0.015]',
                    )}
                  >
                    <div className={cn('md:sticky md:left-0', TABLE_STICKY_CELL_CLASS)}>
                      <div className="text-sm font-semibold text-foreground">{item.symbol}</div>
                      <div className="mt-1 text-xs text-foreground-faint">{item.timeframe || '未标注周期'}</div>
                    </div>
                    <div className="text-sm text-foreground">{item.exchange || '-'}</div>
                    <div className="text-sm text-foreground">{normalizeStrategyText(item.strategy || '') || '-'}</div>
                    <div className="text-sm text-foreground">{translateMarketStateLabel(item.marketState || '-')}</div>
                    <div>
                      <TerminalBadge className={statusTone(item.candidateStage || item.type || '-')}>
                        {translateStatusLabel(item.candidateStage || item.type || '-')}
                      </TerminalBadge>
                    </div>
                    <div>
                      <TerminalBadge className={statusTone(item.finalStatus || (item.liveOrder || item.livePosition ? 'OPEN' : 'WAIT'))}>
                        {translateStatusLabel(item.finalStatus || (item.liveOrder || item.livePosition ? 'OPEN' : 'WAIT'))}
                      </TerminalBadge>
                    </div>
                    <div>
                      {item.failureLabel ? (
                        <TerminalBadge kind={item.failureBucket === 'exchange_blocked' || item.failureBucket === 'exchange_not_confirmed' ? 'danger' : item.failureBucket === 'trade_gate' || item.failureBucket === 'semantic_precheck' ? 'warn' : 'info'}>
                          {item.failureLabel}
                        </TerminalBadge>
                      ) : (
                        <span className="text-xs text-foreground-faint">-</span>
                      )}
                    </div>
                    <div className="font-mono tabular-nums text-sm text-foreground">{formatNumber(item.entryPrice, 5)}</div>
                    <div className="font-mono tabular-nums text-sm text-foreground">{formatNumber(item.stopLoss, 5)}</div>
                    <div className="font-mono tabular-nums text-sm text-foreground">{formatNumber(item.takeProfit, 5)}</div>
                    <div className="text-sm text-foreground">{item.executionMode || '-'}</div>
                    <div className="space-y-1 text-sm leading-6 text-foreground-muted">
                      <div>{compactActionReason(item.reason, item.message)}</div>
                      <div className="text-[11px] text-foreground-faint">{compactFinalStatus(item.finalStatus, item.finalMessage)}</div>
                    </div>
                  </article>
                ))}
              </TableScroll>
            </div>
          )}
        </div>
      </Section>
    );
  }

  function resetFilters() {
    setSymbolQuery('');
    setExchangeFilter('ALL');
    setStrategyFilter('ALL');
    setTimeframeFilter('ALL');
  }

  function clearSingleFilter(filterKey: string) {
    if (filterKey === 'symbol') setSymbolQuery('');
    if (filterKey === 'exchange') setExchangeFilter('ALL');
    if (filterKey === 'strategy') setStrategyFilter('ALL');
    if (filterKey === 'timeframe') setTimeframeFilter('ALL');
  }

  function jumpToRejectionBucket(label: string) {
    setActivePanel('rejections');
    setSelectedRejectionLabel(label);
  }

  function jumpToOccupiedSymbol(symbol: string, exchange: string) {
    setActivePanel('occupancy');
    setSymbolQuery(symbol);
    if (exchange) {
      setExchangeFilter(exchange.toUpperCase());
    }
  }

  function baseUrlForSymbol(symbol: string): string {
    const symbolKey = normalizeSymbolKey(symbol);
    const matched = runtimeData.system.accounts.find((account) =>
      (account.configuredSymbols || []).some((item) => normalizeSymbolKey(item) === symbolKey),
    );
    if (matched?.baseUrl) {
      return matched.baseUrl;
    }
    const preferredExchange = chartSymbol(symbol).endsWith('USDT') ? 'binance' : 'ctrader';
    return (
      runtimeData.system.accounts.find((account) => String(account.exchange || '').trim().toLowerCase() === preferredExchange)?.baseUrl ||
      runtimeData.system.accounts[0]?.baseUrl ||
      (preferredExchange === 'binance' ? 'http://127.0.0.1:8093' : 'http://127.0.0.1:8092')
    );
  }

  function collectFocusedHistoryEvents(target: RuntimeData['historicalOrders'][number]) {
    const decoratedTarget = buildDisplayExecutionItem(target);
    const focusKey = `${decoratedTarget.loggedAt}-${decoratedTarget.symbol}-${decoratedTarget.type}-${decoratedTarget.orderId || ''}`;
    const targetOrderId = String(decoratedTarget.orderId || '').trim();
    const events = (
      targetOrderId
        ? filteredHistoricalOrders.filter((item) => String(item.orderId || '').trim() === targetOrderId)
        : [target]
    ).map((item) => buildDisplayExecutionItem(item));
    const eventIndex = Math.max(
      0,
      events.findIndex(
        (item) =>
          item.loggedAt === decoratedTarget.loggedAt &&
          item.type === decoratedTarget.type &&
          String(item.orderId || '') === String(decoratedTarget.orderId || ''),
      ),
    );
    return {
      focusKey,
      eventIndex,
      events,
    };
  }

  function collectFocusedPositionEvents(target: RuntimeData['positions'][number]) {
    const strategyLabel = normalizeStrategyText(target.strategy || '');
    const openedAt = target.openedAt || target.cycleId || '';
    const focusKey = `${target.exchange}-${target.symbol}-${strategyLabel}-${openedAt}`;
    const syntheticOrderId = `POSITION:${target.symbol}:${strategyLabel || 'UNKNOWN'}:${openedAt || 'NA'}`;
    const openedAtMs = openedAt ? Date.parse(openedAt) : Number.NaN;
    const hasOpenedAt = Number.isFinite(openedAtMs);
    const matchesPositionChain = (item: {
      symbol?: string | null;
      strategy?: string | null;
      loggedAt?: string | null;
      createdAt?: string | null;
    }) => {
      if ((item.symbol || '').toUpperCase() !== (target.symbol || '').toUpperCase()) {
        return false;
      }
      if (normalizeStrategyText(item.strategy || '') !== strategyLabel) {
        return false;
      }
      const rawTime = item.loggedAt || item.createdAt || '';
      if (!hasOpenedAt || !rawTime) {
        return true;
      }
      const itemMs = Date.parse(rawTime);
      if (!Number.isFinite(itemMs)) {
        return true;
      }
      return itemMs >= openedAtMs - 5 * 60 * 1000;
    };

    const relatedHistory = historicalOrders
      .filter(matchesPositionChain)
      .map((item) => buildDisplayExecutionItem({ ...item, orderId: item.orderId || syntheticOrderId }));
    const relatedManagement = managementActions
      .filter(matchesPositionChain)
      .map((item) =>
        buildDisplayExecutionItem({
          ...item,
          orderId: item.orderId || syntheticOrderId,
        }),
      );
    const relatedProtection = protectionOrders
      .filter(matchesPositionChain)
      .map((item) => ({
        loggedAt: item.loggedAt || item.createdAt || target.openedAt || new Date().toISOString(),
        cycleId: item.cycleId || target.cycleId || '',
        symbol: item.symbol,
        exchange: item.exchange,
        side: item.side,
        type: item.orderType || item.protectionKind || 'PROTECTION_ORDER',
        status: item.status,
        message: item.message,
        success: item.exchangeConfirmed ?? null,
        strategy: item.strategy,
        marketState: item.marketState,
        timeframeSignals: item.timeframeSignals,
        entryPrice: item.entryPrice,
        plannedEntryPrice: item.entryPrice,
        actualEntryPrice: target.entryPrice,
        eventPrice: item.stopPrice || item.price || item.entryPrice,
        stopLoss: item.stopLoss,
        plannedStopLoss: item.stopLoss,
        actualStopLoss: target.stopLoss,
        takeProfit: item.takeProfit,
        plannedTakeProfit: item.takeProfit,
        actualTakeProfit: target.takeProfit,
        quantity: item.quantity,
        orderId: item.orderId || syntheticOrderId,
        orderClass: item.orderClass,
        protectionKind: item.protectionKind,
      }));
    const inheritedTemplate14 =
      relatedHistory.find((item) => item.template14 && Object.keys(item.template14 || {}).length > 0)?.template14 || undefined;
    const syntheticOpenEvent: RuntimeData['historicalOrders'][number] = {
      loggedAt: target.openedAt || new Date().toISOString(),
      cycleId: target.cycleId || '',
      symbol: target.symbol,
      exchange: target.exchange,
      side: target.side,
      type: 'OPEN_ORDER',
      status: 'OPEN_POSITION',
      message: '当前持仓快照',
      success: true,
      strategy: target.strategy,
      marketState: target.marketState,
      timeframeSignals: target.timeframeSignals,
      entryPrice: target.entryPrice,
      plannedEntryPrice: target.entryPrice,
      actualEntryPrice: target.entryPrice,
      eventPrice: target.markPrice || target.entryPrice,
      stopLoss: target.stopLoss,
      plannedStopLoss: target.stopLoss,
      actualStopLoss: target.stopLoss,
      takeProfit: target.takeProfit,
      plannedTakeProfit: target.takeProfit,
      actualTakeProfit: target.takeProfit,
      quantity: target.quantity,
      orderId: syntheticOrderId,
      orderClass: 'ENTRY',
      protectionKind: '',
      template14: inheritedTemplate14,
    };

    const events = [syntheticOpenEvent, ...relatedHistory, ...relatedManagement, ...relatedProtection].sort((left, right) =>
      String(left.loggedAt || '').localeCompare(String(right.loggedAt || '')),
    );

    return {
      focusKey,
      eventIndex: 0,
      events,
    };
  }

  async function generateLiveChart(target: RuntimeData['historicalOrders'][number], timeframe: string = liveChartTimeframe) {
    const { focusKey, eventIndex, events } = collectFocusedHistoryEvents(target);
    const requestSymbol = chartSymbol(target.symbol);
    setSelectedHistoryKey(focusKey);
    setSelectedHistorySymbol(requestSymbol);
    setLiveChartLoading(true);
    setLiveChartError('');
    try {
      const response = await fetch('/api/pa-bot/live-chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: requestSymbol,
          timeframe,
          baseUrl: baseUrlForSymbol(requestSymbol),
          events,
          eventIndex,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      setLiveChart(payload.chart as TradeChartPayload);
      setLiveChartFocusKey(`${focusKey}|${timeframe}`);
    } catch (chartError) {
      setLiveChart(null);
      setLiveChartFocusKey('');
      setLiveChartError(chartError instanceof Error ? chartError.message : '实盘图表生成失败');
    } finally {
      setLiveChartLoading(false);
    }
  }

  async function generateHistorySymbolOverview(symbol: string, timeframe: string = liveChartTimeframe) {
    const normalizedSymbol = chartSymbol(symbol);
    setSelectedHistorySymbol(normalizedSymbol);
    setSelectedHistoryKey('');
    setLiveChartLoading(true);
    setLiveChartError('');
    try {
      const response = await fetch('/api/pa-bot/live-chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: normalizedSymbol,
          timeframe,
          baseUrl: baseUrlForSymbol(normalizedSymbol),
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      setLiveChart(payload.chart as TradeChartPayload);
      setLiveChartFocusKey(`symbol:${normalizedSymbol}|${timeframe}`);
    } catch (chartError) {
      setLiveChart(null);
      setLiveChartFocusKey('');
      setLiveChartError(chartError instanceof Error ? chartError.message : '实时信号总览生成失败');
    } finally {
      setLiveChartLoading(false);
    }
  }

  async function generatePositionChart(target: RuntimeData['positions'][number], timeframe: string = positionChartTimeframe) {
    const { focusKey, eventIndex, events } = collectFocusedPositionEvents(target);
    const requestSymbol = chartSymbol(target.symbol);
    setSelectedPositionKey(focusKey);
    setSelectedPositionSymbol(requestSymbol);
    setPositionChartLoading(true);
    setPositionChartError('');
    try {
      const response = await fetch('/api/pa-bot/live-chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: requestSymbol,
          timeframe,
          baseUrl: baseUrlForSymbol(requestSymbol),
          events,
          eventIndex,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      setPositionChart(payload.chart as TradeChartPayload);
      setPositionChartFocusKey(`${focusKey}|${timeframe}`);
    } catch (chartError) {
      setPositionChart(null);
      setPositionChartFocusKey('');
      setPositionChartError(chartError instanceof Error ? chartError.message : '当前持仓图表生成失败');
    } finally {
      setPositionChartLoading(false);
    }
  }

  async function generatePositionSymbolOverview(symbol: string, timeframe: string = positionChartTimeframe) {
    const normalizedSymbol = chartSymbol(symbol);
    setSelectedPositionSymbol(normalizedSymbol);
    setSelectedPositionKey('');
    setPositionChartLoading(true);
    setPositionChartError('');
    try {
      const response = await fetch('/api/pa-bot/live-chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: normalizedSymbol,
          timeframe,
          baseUrl: baseUrlForSymbol(normalizedSymbol),
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      setPositionChart(payload.chart as TradeChartPayload);
      setPositionChartFocusKey(`symbol:${normalizedSymbol}|${timeframe}`);
    } catch (chartError) {
      setPositionChart(null);
      setPositionChartFocusKey('');
      setPositionChartError(chartError instanceof Error ? chartError.message : '实时信号总览生成失败');
    } finally {
      setPositionChartLoading(false);
    }
  }

  useEffect(() => {
    if (!selectedHistoryItem || !selectedHistoryKey) {
      if (!selectedHistorySymbol) {
        return;
      }
      const focusKey = `symbol:${selectedHistorySymbol}|${liveChartTimeframe}`;
      if (liveChartLoading || liveChartFocusKey === focusKey) {
        return;
      }
      void generateHistorySymbolOverview(selectedHistorySymbol, liveChartTimeframe);
      return;
    }
    if (liveChartLoading || liveChartFocusKey === `${selectedHistoryKey}|${liveChartTimeframe}`) {
      return;
    }
    void generateLiveChart(buildDisplayExecutionItem(selectedHistoryItem), liveChartTimeframe);
  }, [selectedHistoryKey, selectedHistoryItem, selectedHistorySymbol, liveChartFocusKey, liveChartLoading, liveChartTimeframe]);

  useEffect(() => {
    if (!selectedPositionItem || !selectedPositionKey) {
      if (!selectedPositionSymbol) {
        return;
      }
      const focusKey = `symbol:${selectedPositionSymbol}|${positionChartTimeframe}`;
      if (positionChartLoading || positionChartFocusKey === focusKey) {
        return;
      }
      void generatePositionSymbolOverview(selectedPositionSymbol, positionChartTimeframe);
      return;
    }
    if (positionChartLoading || positionChartFocusKey === `${selectedPositionKey}|${positionChartTimeframe}`) {
      return;
    }
    void generatePositionChart(selectedPositionItem, positionChartTimeframe);
  }, [selectedPositionItem, selectedPositionKey, selectedPositionSymbol, positionChartFocusKey, positionChartLoading, positionChartTimeframe]);

  useEffect(() => {
    if (filteredPositions.length > 0) {
      return;
    }
    if (!selectedPositionSymbol || positionChartLoading || positionChart || positionChartError) {
      return;
    }
    void generatePositionSymbolOverview(selectedPositionSymbol, positionChartTimeframe);
  }, [filteredPositions.length, positionChart, positionChartError, positionChartLoading, positionChartTimeframe, selectedPositionSymbol]);

  function renderPositionsPanel() {
    return (
      <Section title="当前持仓" icon={Layers3} subtitle="实仓 + 保护位 + 策略上下文。">
        <div className="flex flex-col gap-5">
          <TradeChartPanel
            eyebrow="当前持仓图"
            title={selectedPositionItem ? `${chartSymbol(selectedPositionItem.symbol)} · ${normalizeStrategyText(selectedPositionItem.strategy || '') || selectedPositionItem.side}` : selectedPositionSymbol ? `${selectedPositionSymbol} · 实时信号总览` : '未选择持仓'}
            badgeText={selectedPositionItem ? `${chartSymbol(selectedPositionItem.symbol)} · ${positionChartTimeframe}` : selectedPositionSymbol ? `${selectedPositionSymbol} · ${positionChartTimeframe}` : undefined}
            helperText={selectedPositionItem ? `当前聚焦单一持仓链，按持仓快照 + 同策略管理/保护动作聚合，不再把所有订单挤在一张图里。` : `当前没有持仓时，也可以直接切换到交易池品种，生成实时信号总览图。`}
            chart={positionChart}
            loading={positionChartLoading}
            error={positionChartError}
            emptyText="选择一笔当前持仓，或直接切换交易品种，这里会生成对应的 K 线与实时信号图。"
            imageAlt={positionChart?.focusTitle || '当前持仓图表'}
            onRefresh={selectedPositionItem ? () => void generatePositionChart(selectedPositionItem, positionChartTimeframe) : selectedPositionSymbol ? () => void generatePositionSymbolOverview(selectedPositionSymbol, positionChartTimeframe) : undefined}
            refreshDisabled={(!selectedPositionItem && !selectedPositionSymbol) || positionChartLoading}
            refreshLabel="生成图表"
            chartHeight={1040}
            timeframeOptions={[...listLiveChartTimeframes()]}
            selectedTimeframe={positionChartTimeframe}
            onSelectTimeframe={(value) => setPositionChartTimeframe(value as typeof positionChartTimeframe)}
            symbolOptions={positionSymbolOptions}
            selectedSymbol={selectedPositionSymbol}
            onSelectSymbol={(symbol) => {
              setSelectedPositionSymbol(symbol);
              const fallback =
                filteredPositions.find((item) => sameSymbol(item.symbol || '', symbol) && positionRowKey(item) === selectedPositionKey) ||
                filteredPositions.find((item) => sameSymbol(item.symbol || '', symbol)) ||
                null;
              if (fallback) {
                setSelectedPositionKey(positionRowKey(fallback));
                return;
              }
              setSelectedPositionKey('');
              void generatePositionSymbolOverview(symbol, positionChartTimeframe);
            }}
          />
          {filteredPositions.length === 0 ? (
            <EmptyState text="当前没有持仓，已切换为交易品种实时信号视角。" />
          ) : (
            <div className={TABLE_CLASS}>
            <TableScroll className="max-h-[420px]">
              <div
                className={cn(
                  TABLE_HEAD_CLASS,
                  'sticky top-0 z-10 hidden grid-cols-[0.86fr_0.4fr_0.4fr_0.82fr_0.78fr_0.62fr_0.62fr_0.62fr_0.42fr_0.5fr_0.42fr] gap-3 bg-surface px-4 py-3 md:grid',
                )}
              >
                <div className={cn('md:sticky md:left-0', TABLE_STICKY_HEAD_CLASS)}>合约</div>
                <div>方向</div>
                <div>数量</div>
                <div>策略</div>
                <div>周期</div>
                <div>入场</div>
                <div>止损</div>
                <div>止盈</div>
                <div>杠杆</div>
                <div>浮盈亏</div>
                <div>图表</div>
              </div>
              {filteredPositions.map((position, index) => (
                <article
                  key={`${position.exchange}-${position.symbol}-${position.side}-${index}`}
                  className={cn(
                    'grid gap-3 px-4 py-3.5 md:grid-cols-[0.86fr_0.4fr_0.4fr_0.82fr_0.78fr_0.62fr_0.62fr_0.62fr_0.42fr_0.5fr_0.42fr]',
                    TABLE_ROW_CLASS,
                    index > 0 && 'border-t',
                    index % 2 === 1 && 'bg-white/[0.015]',
                    positionRowKey(position) === selectedPositionKey &&
                      'bg-cyan-400/[0.04]',
                  )}
                  onClick={() => void generatePositionChart(position)}
                >
                  <div className={cn('md:sticky md:left-0', index % 2 === 1 ? TABLE_STICKY_CELL_CLASS : TABLE_STICKY_CELL_CLASS)}>
                    <div className="text-sm font-semibold text-foreground">{position.symbol}</div>
                    <div className="mt-1 text-xs text-foreground-faint">
                      {position.exchange || '-'} · {formatTime(position.openedAt)}
                    </div>
                  </div>
                  <div className="text-sm text-foreground">{translateSide(position.side)}</div>
                  <div className="font-mono tabular-nums text-sm text-foreground">{formatNumber(position.quantity, 6)}</div>
                  <div className="text-sm text-foreground">{normalizeStrategyText(position.strategy || '') || '-'}</div>
                  <div className="text-sm text-foreground-muted">{timeframeText(position.timeframeSignals)}</div>
                  <div className="font-mono tabular-nums text-sm text-foreground">{formatNumber(position.entryPrice, 5)}</div>
                  <div className="font-mono tabular-nums text-sm text-foreground">{formatNumber(position.stopLoss, 5)}</div>
                  <div className="font-mono tabular-nums text-sm text-foreground">{formatNumber(position.takeProfit, 5)}</div>
                  <div className="font-mono tabular-nums text-sm text-foreground">{formatNumber(position.leverage, 0)}x</div>
                  <div className={cn('font-mono tabular-nums text-sm font-medium', (position.unrealizedPnl || 0) >= 0 ? 'text-success' : 'text-danger')}>
                    {formatNumber(position.unrealizedPnl, 2)}
                  </div>
                  <div>
                    <button type="button" className={BUTTON_GHOST_CLASS} onClick={() => void generatePositionChart(position)}>
                      <ImageIcon className="size-4" />
                      看图
                    </button>
                  </div>
                </article>
              ))}
            </TableScroll>
          </div>
          )}
        </div>
      </Section>
    );
  }

  function renderEntryPanel() {
    return (
      <Section title="首仓挂单" icon={Blocks} subtitle="等待成交的首次入场委托。">
        {filteredEntryOrders.length === 0 ? (
          <EmptyState text="当前没有首仓挂单。" />
        ) : (
          <div className={TABLE_CLASS}>
            <TableScroll className="max-h-[440px]">
              <div className={cn(TABLE_HEAD_CLASS, 'sticky top-0 z-10 hidden grid-cols-[0.82fr_0.38fr_0.38fr_0.48fr_0.62fr_0.62fr_0.62fr_0.82fr_0.8fr_0.44fr] gap-3 bg-surface px-4 py-3 md:grid')}>
                <div className={cn('md:sticky md:left-0', TABLE_STICKY_HEAD_CLASS)}>挂单</div>
                <div>方向</div>
                <div>数量</div>
                <div>类型</div>
                <div>委托价</div>
                <div>止损</div>
                <div>止盈</div>
                <div>策略</div>
                <div>周期</div>
                <div>状态</div>
              </div>
              {filteredEntryOrders.map((order, index) => (
                <article
                  key={`${order.orderId}-${index}`}
                  className={cn(
                    'grid gap-3 px-4 py-3.5 md:grid-cols-[0.82fr_0.38fr_0.38fr_0.48fr_0.62fr_0.62fr_0.62fr_0.82fr_0.8fr_0.44fr]',
                    TABLE_ROW_CLASS,
                    index > 0 && 'border-t',
                    index % 2 === 1 && 'bg-white/[0.015]',
                  )}
                >
                  <div className={cn('md:sticky md:left-0', index % 2 === 1 ? TABLE_STICKY_CELL_CLASS : TABLE_STICKY_CELL_CLASS)}>
                    <div className="text-sm font-semibold text-foreground">{order.symbol}</div>
                    <div className="mt-1 text-xs text-foreground-faint">{formatTime(order.createdAt || order.loggedAt)}</div>
                  </div>
                  <div className="text-sm text-foreground">{translateSide(order.side)}</div>
                  <div className="font-mono tabular-nums text-sm text-foreground">{formatNumber(order.quantity, 6)}</div>
                  <div className="text-sm text-foreground">{order.orderType || '-'}</div>
                  <div className="font-mono tabular-nums text-sm text-foreground">{formatNumber(order.price, 5)}</div>
                  <div className="font-mono tabular-nums text-sm text-foreground">{formatNumber(order.stopLoss, 5)}</div>
                  <div className="font-mono tabular-nums text-sm text-foreground">{formatNumber(order.takeProfit, 5)}</div>
                  <div className="text-sm text-foreground">{normalizeStrategyText(order.strategy || '') || '-'}</div>
                  <div className="text-sm text-foreground-muted">{timeframeText(order.timeframeSignals)}</div>
                  <div>
                    <TerminalBadge className={statusTone(order.status || '-')}>{translateStatusLabel(order.status || '-')}</TerminalBadge>
                  </div>
                </article>
              ))}
            </TableScroll>
          </div>
        )}
      </Section>
    );
  }

  function renderProtectionPanel() {
    return (
      <Section title="保护单" icon={ShieldCheck} subtitle="止损 / 止盈条件委托。">
        {filteredProtectionOrders.length === 0 ? (
          <EmptyState text="当前没有保护单。" />
        ) : (
          <div className={TABLE_CLASS}>
            <TableScroll className="max-h-[440px]">
              <div className={cn(TABLE_HEAD_CLASS, 'sticky top-0 z-10 hidden grid-cols-[0.82fr_0.44fr_0.36fr_0.38fr_0.62fr_0.62fr_0.66fr_0.82fr_0.44fr] gap-3 bg-surface px-4 py-3 md:grid')}>
                <div className={cn('md:sticky md:left-0', TABLE_STICKY_HEAD_CLASS)}>保护单</div>
                <div>类别</div>
                <div>方向</div>
                <div>数量</div>
                <div>触发价</div>
                <div>入场</div>
                <div>关联止损/止盈</div>
                <div>策略</div>
                <div>状态</div>
              </div>
              {filteredProtectionOrders.map((order, index) => (
                <article
                  key={`${order.orderId}-${index}`}
                  className={cn(
                    'grid gap-3 px-4 py-3.5 md:grid-cols-[0.82fr_0.44fr_0.36fr_0.38fr_0.62fr_0.62fr_0.66fr_0.82fr_0.44fr]',
                    TABLE_ROW_CLASS,
                    index > 0 && 'border-t',
                    index % 2 === 1 && 'bg-white/[0.015]',
                  )}
                >
                  <div className={cn('md:sticky md:left-0', index % 2 === 1 ? TABLE_STICKY_CELL_CLASS : TABLE_STICKY_CELL_CLASS)}>
                    <div className="text-sm font-semibold text-foreground">{order.symbol}</div>
                    <div className="mt-1 text-xs text-foreground-faint">{formatTime(order.createdAt || order.loggedAt)}</div>
                  </div>
                  <div>
                    <TerminalBadge kind={order.protectionKind === 'TAKE_PROFIT' ? 'success' : 'warn'}>
                      {protectionKindLabel(order.protectionKind)}
                    </TerminalBadge>
                  </div>
                  <div className="text-sm text-foreground">{translateSide(order.side)}</div>
                  <div className="font-mono tabular-nums text-sm text-foreground">{formatNumber(order.quantity, 6)}</div>
                  <div className="font-mono tabular-nums text-sm text-foreground">{formatNumber(order.stopPrice, 5)}</div>
                  <div className="font-mono tabular-nums text-sm text-foreground">{formatNumber(order.entryPrice, 5)}</div>
                  <div className="font-mono tabular-nums text-sm text-foreground">{formatNumber(order.stopLoss, 5)} / {formatNumber(order.takeProfit, 5)}</div>
                  <div className="text-sm text-foreground">{normalizeStrategyText(order.strategy || '') || '-'}</div>
                  <div>
                    <TerminalBadge className={statusTone(order.status || '-')}>{translateStatusLabel(order.status || '-')}</TerminalBadge>
                  </div>
                </article>
              ))}
            </TableScroll>
          </div>
        )}
      </Section>
    );
  }

  function renderManagementPanel() {
    return (
      <Section title="管理动作" icon={Activity} subtitle="止损止盈调整、部分平仓与管理链动作。">
        {filteredManagementActions.length === 0 ? (
          <EmptyState text="当前没有管理动作。" />
        ) : (
          <div className={TABLE_CLASS}>
            <TableScroll className="max-h-[440px]">
              <div className={cn(TABLE_HEAD_CLASS, 'sticky top-0 z-10 hidden grid-cols-[0.7fr_0.42fr_0.42fr_0.82fr_0.72fr_0.62fr_0.62fr_0.62fr_0.9fr_0.44fr] gap-3 bg-surface px-4 py-3 md:grid')}>
                <div className={cn('md:sticky md:left-0', TABLE_STICKY_HEAD_CLASS)}>时间 / 合约</div>
                <div>动作</div>
                <div>数量</div>
                <div>策略</div>
                <div>周期</div>
                <div>止损</div>
                <div>止盈</div>
                <div>入场</div>
                <div>说明</div>
                <div>状态</div>
              </div>
              {filteredManagementActions.map((item, index) => (
                (() => {
                  const displayItem = buildDisplayExecutionItem(item);
                  return (
                <article
                  key={`${displayItem.loggedAt}-${displayItem.symbol}-${displayItem.type}-${index}`}
                  className={cn(
                    'grid gap-3 px-4 py-3.5 md:grid-cols-[0.7fr_0.42fr_0.42fr_0.82fr_0.72fr_0.62fr_0.62fr_0.62fr_0.9fr_0.44fr]',
                    TABLE_ROW_CLASS,
                    index > 0 && 'border-t',
                    index % 2 === 1 && 'bg-white/[0.015]',
                  )}
                >
                  <div className={cn('md:sticky md:left-0', index % 2 === 1 ? TABLE_STICKY_CELL_CLASS : TABLE_STICKY_CELL_CLASS)}>
                    <div className="text-sm font-semibold text-foreground">{displayItem.symbol || '系统事件'}</div>
                    <div className="mt-1 text-xs text-foreground-faint">{formatTime(displayItem.loggedAt)}</div>
                  </div>
                  <div className="text-sm text-foreground">{displayItem.type || '-'}</div>
                  <div className="font-mono tabular-nums text-sm text-foreground">{formatNumber(displayItem.quantity, 6)}</div>
                  <div className="text-sm text-foreground">{normalizeStrategyText(displayItem.strategy || '') || '-'}</div>
                  <div className="text-sm text-foreground-muted">{timeframeText(displayItem.timeframeSignals)}</div>
                  {renderPrimaryWithPlan(displayItem.stopLoss, displayItem.plannedStopLoss)}
                  {renderPrimaryWithPlan(displayItem.takeProfit, displayItem.plannedTakeProfit)}
                  {renderPrimaryWithPlan(displayItem.entryPrice, displayItem.plannedEntryPrice)}
                  <div className="text-sm leading-6 text-foreground-muted">{displayItem.message || '-'}</div>
                  <div>
                    <TerminalBadge className={statusTone(displayItem.status || '-')}>{translateStatusLabel(displayItem.status || '-')}</TerminalBadge>
                  </div>
                </article>
                  );
                })()
              ))}
            </TableScroll>
          </div>
        )}
      </Section>
    );
  }

  function renderOccupancyPanel() {
    return (
      <Section title="同品种占用" icon={Blocks} subtitle="哪些合约正在被持仓、首仓挂单或保护单占用，并因此拦掉了新的首仓。">
        {filteredOccupiedSymbols.length === 0 ? (
          <EmptyState text="当前没有同品种占用记录。" />
        ) : (
          <div className={TABLE_CLASS}>
            <TableScroll className="max-h-[360px]">
              <div className={cn(TABLE_HEAD_CLASS, 'sticky top-0 z-10 hidden grid-cols-[0.78fr_0.42fr_0.78fr_0.42fr_0.66fr_0.5fr] gap-3 bg-surface px-4 py-3 md:grid')}>
                <div className={cn('md:sticky md:left-0', TABLE_STICKY_HEAD_CLASS)}>合约</div>
                <div>交易所</div>
                <div>占用来源</div>
                <div>冲突拦截</div>
                <div>热度</div>
                <div>说明</div>
              </div>
              {filteredOccupiedSymbols.map((item, index) => (
                <article
                  key={`${item.exchange}-${item.symbol}-${index}`}
                  className={cn(
                    'grid gap-3 px-4 py-3.5 md:grid-cols-[0.78fr_0.42fr_0.78fr_0.42fr_0.66fr_0.5fr]',
                    TABLE_ROW_CLASS,
                    index > 0 && 'border-t',
                    index % 2 === 1 && 'bg-white/[0.015]',
                  )}
                >
                  <div className={cn('md:sticky md:left-0', index % 2 === 1 ? TABLE_STICKY_CELL_CLASS : TABLE_STICKY_CELL_CLASS)}>
                    <div className="text-sm font-semibold text-foreground">{item.symbol}</div>
                    <div className="mt-1 text-xs text-foreground-faint">
                      {item.hasPosition ? '已有持仓' : '空仓'} · {item.hasEntryOrder ? '有首仓挂单' : '无首仓挂单'}
                    </div>
                  </div>
                  <div className="text-sm text-foreground">{item.exchange || '-'}</div>
                  <div className="flex flex-wrap gap-2">
                    {item.occupiedBy.length > 0 ? item.occupiedBy.map((label) => <TerminalBadge key={`${item.symbol}-${label}`} kind={label === '保护单' ? 'info' : 'warn'}>{label}</TerminalBadge>) : <span className="text-sm text-foreground-faint">无</span>}
                  </div>
                  <div className="font-mono tabular-nums text-sm font-semibold text-amber-200">{formatNumber(item.blockedConflictCount, 0)}</div>
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,rgba(184,156,98,0.35),rgba(124,201,179,0.7))]"
                        style={{ width: `${Math.max(8, (item.blockedConflictCount / maxBlockedConflictCount) * 100)}%` }}
                      />
                    </div>
                    <div className="font-mono tabular-nums text-xs text-foreground-faint">
                      {Math.round((item.blockedConflictCount / maxBlockedConflictCount) * 100)}%
                    </div>
                  </div>
                  <div className="text-sm text-foreground-muted">
                    {item.blockedConflictCount > 0 ? `最近因此拦掉 ${formatNumber(item.blockedConflictCount, 0)} 次新机会` : '当前未形成新冲突'}
                  </div>
                </article>
              ))}
            </TableScroll>
          </div>
        )}
      </Section>
    );
  }

  function renderHistoryPanel() {
    return (
      <Section title="历史订单" icon={History} subtitle={hiddenText}>
        <div className="flex flex-col gap-5">
          <TradeChartPanel
            eyebrow="实盘复盘图"
            title={selectedHistoryItem ? `${chartSymbol(selectedHistoryItem.symbol)} · ${normalizeStrategyText(selectedHistoryItem.strategy || '') || selectedHistoryItem.type}` : selectedHistorySymbol ? `${selectedHistorySymbol} · 实时信号总览` : '未选择事件'}
            badgeText={selectedHistoryItem ? `${chartSymbol(selectedHistoryItem.symbol)} · ${liveChartTimeframe}` : selectedHistorySymbol ? `${selectedHistorySymbol} · ${liveChartTimeframe}` : undefined}
            helperText={
              selectedHistoryItem
                ? `当前仅聚焦单笔主事件，图表围绕事件时间 ${formatTime(selectedHistoryItem.loggedAt)} 展开，用于复盘而不是表示当前实时信号。历史表格优先显示交易所实值，次行显示当时计划价。已从 ${filteredHistoricalOrders.length} 条历史事件中过滤出 ${focusableHistoricalOrders.length} 条主事件，并剔除了 ${archivedHistoricalOrdersCount} 条已不在交易所活动中的旧挂单事件。`
                : `当前没有选中历史主事件时，会直接按交易品种生成实时信号总览图。已从 ${filteredHistoricalOrders.length} 条历史事件中过滤出 ${focusableHistoricalOrders.length} 条主事件，并剔除了 ${archivedHistoricalOrdersCount} 条已不在交易所活动中的旧挂单事件。`
            }
            chart={liveChart}
            loading={liveChartLoading}
            error={liveChartError}
            emptyText="点击下方历史主事件，或直接切换交易品种，这里会生成对应的实盘图。"
            imageAlt={liveChart?.focusTitle || '实盘复盘图表'}
            onRefresh={selectedHistoryItem ? () => void generateLiveChart(buildDisplayExecutionItem(selectedHistoryItem), liveChartTimeframe) : selectedHistorySymbol ? () => void generateHistorySymbolOverview(selectedHistorySymbol, liveChartTimeframe) : undefined}
            refreshDisabled={(!selectedHistoryItem && !selectedHistorySymbol) || liveChartLoading}
            refreshLabel="生成图表"
            chartHeight={1040}
            timeframeOptions={[...listLiveChartTimeframes()]}
            selectedTimeframe={liveChartTimeframe}
            onSelectTimeframe={(value) => setLiveChartTimeframe(value as typeof liveChartTimeframe)}
            symbolOptions={historySymbolOptions}
            selectedSymbol={selectedHistorySymbol}
            onSelectSymbol={(symbol) => {
              setSelectedHistorySymbol(symbol);
              const fallback =
                focusableHistoricalOrders.find((item) => sameSymbol(item.symbol || '', symbol) && historyRowKey(item) === selectedHistoryKey) ||
                focusableHistoricalOrders.find((item) => sameSymbol(item.symbol || '', symbol)) ||
                null;
              if (fallback) {
                setSelectedHistoryKey(historyRowKey(fallback));
                return;
              }
              setSelectedHistoryKey('');
              void generateHistorySymbolOverview(symbol, liveChartTimeframe);
            }}
          />
          {focusableHistoricalOrders.length === 0 ? (
            <EmptyState text="当前没有历史订单，已切换为交易品种实时信号视角。" />
          ) : (
            <div className={TABLE_CLASS}>
              <TableScroll className="max-h-[520px]">
                <div className={cn(TABLE_HEAD_CLASS, 'sticky top-0 z-10 hidden grid-cols-[0.72fr_0.42fr_0.42fr_0.82fr_0.78fr_0.56fr_0.56fr_0.56fr_0.44fr_0.9fr_0.42fr] gap-3 bg-surface px-4 py-3 md:grid')}>
                  <div className={cn('md:sticky md:left-0', TABLE_STICKY_HEAD_CLASS)}>时间 / 合约</div>
                  <div>分类</div>
                  <div>动作</div>
                  <div>策略</div>
                  <div>周期</div>
                  <div>入场</div>
                  <div>止损</div>
                  <div>止盈</div>
                  <div>状态</div>
                  <div>说明</div>
                  <div>图表</div>
                </div>
                {focusableHistoricalOrders.map((item, index) => {
                  const displayItem = buildDisplayExecutionItem(item);
                  const rowKey = historyRowKey(displayItem);
                  const active = rowKey === selectedHistoryKey;
                  return (
                    <article
                      key={rowKey}
                      className={cn(
                        'grid gap-3 px-4 py-3.5 md:grid-cols-[0.72fr_0.42fr_0.42fr_0.82fr_0.78fr_0.56fr_0.56fr_0.56fr_0.44fr_0.9fr_0.42fr]',
                        TABLE_ROW_CLASS,
                        index > 0 && 'border-t',
                        index % 2 === 1 && 'bg-white/[0.015]',
                        active && 'bg-cyan-400/[0.04]',
                      )}
                      onClick={() => void generateLiveChart(displayItem)}
                    >
                      <div className={cn('md:sticky md:left-0', index % 2 === 1 ? TABLE_STICKY_CELL_CLASS : TABLE_STICKY_CELL_CLASS)}>
                        <div className="text-sm font-semibold text-foreground">{displayItem.symbol || '系统事件'}</div>
                        <div className="mt-1 text-xs text-foreground-faint">{formatTime(displayItem.loggedAt)}</div>
                      </div>
                      <div>
                        <TerminalBadge kind={displayItem.orderClass === 'PROTECTION' ? 'info' : displayItem.orderClass === 'MANAGEMENT' ? 'success' : 'neutral'}>
                          {orderClassLabel(displayItem.orderClass)}
                        </TerminalBadge>
                      </div>
                      <div className="text-sm text-foreground">{displayItem.type || '-'}</div>
                      <div className="text-sm text-foreground">{normalizeStrategyText(displayItem.strategy || '') || '-'}</div>
                      <div className="text-sm text-foreground-muted">{timeframeText(displayItem.timeframeSignals)}</div>
                      {renderPrimaryWithPlan(displayItem.entryPrice, displayItem.plannedEntryPrice)}
                      {renderPrimaryWithPlan(displayItem.stopLoss, displayItem.plannedStopLoss)}
                      {renderPrimaryWithPlan(displayItem.takeProfit, displayItem.plannedTakeProfit)}
                      <div>
                        <TerminalBadge className={statusTone(displayItem.status || '-')}>{translateStatusLabel(displayItem.status || '-')}</TerminalBadge>
                      </div>
                      <div className="text-sm leading-6 text-foreground-muted">{displayItem.message || '-'}</div>
                      <div>
                        <button
                          type="button"
                          className={BUTTON_GHOST_CLASS}
                          onClick={() => void generateLiveChart(displayItem)}
                        >
                          <ImageIcon className="size-4" />
                          看图
                        </button>
                      </div>
                    </article>
                  );
                })}
              </TableScroll>
            </div>
          )}
        </div>
      </Section>
    );
  }

  function renderRejectionPanel() {
    return (
      <Section title="拒单原因" icon={TriangleAlert} subtitle="按原因聚合最近被拦下的订单，点开可以直接看是哪一笔、为什么被拦。">
        {filteredRejectionDetails.length === 0 ? (
          <EmptyState text="当前没有拒单记录。" />
        ) : (
          <div className="flex flex-col gap-5">
            <div className="grid gap-4 md:grid-cols-3">
              <MetricCard label="拒单总数" value={String(totalRejected)} sub={topRejectionBucket ? `最高频：${topRejectionBucket.label}` : '当前无拒单'} />
              <MetricCard label="当前桶" value={activeRejectionBucket ? String(activeRejectionBucket.count) : '0'} sub={activeRejectionBucket?.label || '未选择原因'} />
              <MetricCard label="最高频合约" value={selectedRejectionLeader ? selectedRejectionLeader[0].split(':')[1] : '-'} sub={selectedRejectionLeader ? `${selectedRejectionLeader[0].split(':')[0]} · ${selectedRejectionLeader[1]} 次` : '当前桶内无样本'} />
            </div>
            <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
            <div className={TABLE_CLASS}>
              <div className="border-b border-[#17212b] px-4 py-3 text-[10px] uppercase tracking-[0.22em] text-foreground-faint">拒单汇总</div>
              <div className="flex flex-col gap-1 p-2">
                {filteredRejectionDetails.map((bucket) => {
                  const active = activeRejectionBucket?.label === bucket.label;
                  return (
                    <button
                      key={bucket.label}
                      type="button"
                      onClick={() => setSelectedRejectionLabel(bucket.label)}
                      className={cn(
                        'flex w-full items-center justify-between rounded-lg px-3 py-3 text-left transition',
                        active ? 'bg-white/[0.06] shadow-[inset_0_0_0_1px_rgba(124,201,179,0.14)]' : 'hover:bg-white/[0.035]',
                      )}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground">{bucket.label}</div>
                        <div className="mt-1 text-xs text-foreground-faint">{bucket.entries.length} 条最近样本</div>
                      </div>
                      <TerminalBadge kind={bucketTone(bucket.label)}>{bucket.count}</TerminalBadge>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className={TABLE_CLASS}>
              <div className="border-b border-[#17212b] px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.22em] text-foreground-faint">拒单明细</div>
                    <div className="mt-1 text-sm text-foreground-muted">{activeRejectionBucket?.label || '未选择原因'}</div>
                  </div>
                  <TerminalBadge kind={bucketTone(activeRejectionBucket?.label || '')}>{activeRejectionBucket?.count || 0}</TerminalBadge>
                </div>
              </div>
              <TableScroll className="max-h-[420px]">
                <div className={cn(TABLE_HEAD_CLASS, 'sticky top-0 z-10 hidden grid-cols-[0.7fr_0.5fr_0.4fr_0.42fr_0.42fr_1fr] gap-3 bg-surface px-4 py-3 md:grid')}>
                  <div className={cn('md:sticky md:left-0', TABLE_STICKY_HEAD_CLASS)}>时间 / 合约</div>
                  <div>交易所</div>
                  <div>状态</div>
                  <div>动作</div>
                  <div>原因</div>
                  <div>说明</div>
                </div>
                {(activeRejectionBucket?.entries || []).map((entry, index) => (
                  <article
                    key={`${entry.loggedAt}-${entry.symbol}-${entry.status}-${index}`}
                    className={cn(
                      'grid gap-3 px-4 py-3.5 md:grid-cols-[0.7fr_0.5fr_0.4fr_0.42fr_0.42fr_1fr]',
                      TABLE_ROW_CLASS,
                      index > 0 && 'border-t',
                      index % 2 === 1 && 'bg-white/[0.015]',
                    )}
                  >
                    <div className={cn('md:sticky md:left-0', index % 2 === 1 ? TABLE_STICKY_CELL_CLASS : TABLE_STICKY_CELL_CLASS)}>
                      <div className="text-sm font-semibold text-foreground">{entry.symbol || '系统事件'}</div>
                      <div className="mt-1 text-xs text-foreground-faint">{formatTime(entry.loggedAt)}</div>
                    </div>
                    <div className="text-sm text-foreground">{entry.exchange || '-'}</div>
                    <div>
                      <TerminalBadge className={statusTone(entry.status || '-')}>{translateStatusLabel(entry.status || '-')}</TerminalBadge>
                    </div>
                    <div className="text-sm text-foreground">{entry.type || '-'}</div>
                    <div>
                      <TerminalBadge kind={bucketTone(activeRejectionBucket?.label || '')}>{activeRejectionBucket?.label || '-'}</TerminalBadge>
                    </div>
                    <div className="text-sm leading-6 text-foreground-muted">{entry.message || '-'}</div>
                  </article>
                ))}
              </TableScroll>
            </div>
          </div>
          </div>
        )}
      </Section>
    );
  }

  function renderActivePanel() {
    if (activePanel === 'positions') return renderPositionsPanel();
    if (activePanel === 'entry') return renderEntryPanel();
    if (activePanel === 'protection') return renderProtectionPanel();
    if (activePanel === 'management') return renderManagementPanel();
    if (activePanel === 'occupancy') return renderOccupancyPanel();
    if (activePanel === 'history') return renderHistoryPanel();
    return renderRejectionPanel();
  }

  return (
    <div className="flex flex-col gap-5">
      <div className={cn(CARD_CLASS, 'grid gap-3 px-4 py-3 md:grid-cols-[1.1fr_repeat(3,minmax(0,0.7fr))_auto]')}>
        <label className="flex min-w-0 flex-col gap-2">
          <span className={LABEL_CLASS}>搜索 Symbol</span>
          <input
            value={symbolQuery}
            onChange={(event) => setSymbolQuery(event.target.value)}
            placeholder="例如 BTC / EURUSD"
            className={INPUT_CLASS}
          />
        </label>
        <label className="flex flex-col gap-2">
          <span className={LABEL_CLASS}>交易所</span>
          <select
            value={exchangeFilter}
            onChange={(event) => setExchangeFilter(event.target.value)}
            className={INPUT_CLASS}
          >
            <option value="ALL">全部</option>
            {exchangeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className={LABEL_CLASS}>策略</span>
          <select
            value={strategyFilter}
            onChange={(event) => setStrategyFilter(event.target.value)}
            className={INPUT_CLASS}
          >
            <option value="ALL">全部</option>
            {strategyOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2">
          <span className={LABEL_CLASS}>周期</span>
          <select
            value={timeframeFilter}
            onChange={(event) => setTimeframeFilter(event.target.value)}
            className={INPUT_CLASS}
          >
            <option value="ALL">全部</option>
            {timeframeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-end">
          <button type="button" onClick={resetFilters} className={cn(BUTTON_GHOST_CLASS, 'h-[46px] w-full justify-center md:w-auto')}>
            重置过滤
          </button>
        </div>
      </div>

      <div className="flex min-h-8 flex-wrap items-center gap-2">
        {activeFilters.length === 0 ? (
          <span className="text-xs text-foreground-faint">当前未启用过滤，显示全部订单视图。</span>
        ) : (
          activeFilters.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => clearSingleFilter(item.key)}
              className="inline-flex items-center gap-2 rounded-full bg-white/[0.04] px-3 py-1.5 text-xs text-foreground-muted transition hover:bg-white/[0.07]"
            >
              <span>{item.label}</span>
              <span className="text-foreground-faint">清除</span>
            </button>
          ))
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-foreground-faint">
        <span>正式 live 策略：</span>
        {liveStrategyCatalog.map((item) => (
          <TerminalBadge key={item.key} kind="info">
            {item.label}
          </TerminalBadge>
        ))}
        {stagedStrategyCatalog.length > 0 ? (
          <>
            <span className="ml-2">已注册未正式部署：</span>
            {stagedStrategyCatalog.map((item) => (
              <TerminalBadge key={item.key} kind="warn">
                {item.label}
              </TerminalBadge>
            ))}
          </>
        ) : null}
      </div>

      {(runtimeData.execution.exchangeBlocked || blockedAccounts.length > 0) ? (
        <div className="rounded-[24px] border border-[rgba(229,111,92,0.28)] bg-[linear-gradient(180deg,rgba(44,20,16,0.92),rgba(18,15,16,0.94))] px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <TerminalBadge kind="danger">交易所阻断</TerminalBadge>
            <span className="text-sm font-medium text-[#f6d2c8]">
              {runtimeData.execution.exchangeBlockReason || blockedAccounts[0]?.exchangeBlockReason || '执行链已识别到账户级交易所阻断'}
            </span>
          </div>
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-foreground-muted">
            {blockedAccounts.map((account) => (
              <span key={`${account.exchange}-${account.accountId || account.label || 'unknown'}`}>
                {account.label || account.exchange} · {account.exchangeBlockCode || 'EXCHANGE_BLOCKED'}
              </span>
            ))}
            {!blockedAccounts.length && runtimeData.execution.exchangeBlockCode ? (
              <span>{runtimeData.execution.exchange} · {runtimeData.execution.exchangeBlockCode}</span>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-4">
        <MetricCard label="拒单总数" value={String(totalRejected)} sub={topRejectionBucket ? `高频原因：${topRejectionBucket.label}` : '当前无拒单'} />
        <MetricCard label="同品种冲突" value={String(totalConflictBlocks)} sub={topOccupiedSymbol ? `最拥挤：${topOccupiedSymbol.symbol}` : '当前无占用冲突'} />
        <MetricCard label="过滤后策略" value={strategyFilter === 'ALL' ? '全部' : strategyFilter} sub={timeframeFilter === 'ALL' ? '全部周期' : timeframeFilter} />
        <MetricCard label="过滤后交易所" value={exchangeFilter === 'ALL' ? '全部' : exchangeFilter} sub={symbolQuery.trim() ? `搜索：${symbolQuery.trim().toUpperCase()}` : '未限定 symbol'} />
      </div>

      <div className={TABLE_CLASS}>
        <div className="grid gap-0 md:grid-cols-5">
          {summaryCards.map((item, index) => (
            <article key={item.label} className={cn('px-4 py-3.5', index > 0 && 'border-t border-[#17212b] md:border-l md:border-t-0')}>
              <div className={LABEL_CLASS}>{item.label}</div>
              <div className={cn(DATA_VALUE_CLASS, 'mt-2 text-[24px] font-semibold tracking-[-0.04em]')}>{item.value}</div>
              <div className="mt-1 text-xs text-foreground-faint">{item.sub}</div>
            </article>
          ))}
        </div>
      </div>

      <Section title="近两天统计" icon={History} subtitle={performance.rangeLabel || '近两天真实成交与清理统计'}>
        <div className="grid gap-4 md:grid-cols-4 xl:grid-cols-6">
          <MetricCard label="已实现成交" value={String(performance.total.realizedTradeCount)} sub="只统计有 realized_pnl 的真实成交" />
          <MetricCard label="胜率" value={`${formatNumber(performance.total.winRatePct, 2)}%`} sub={`${performance.total.wins} 胜 / ${performance.total.losses} 负`} />
          <MetricCard label="盈利因子" value={performance.total.profitFactor === null ? '-' : formatNumber(performance.total.profitFactor, 2)} sub={`毛利 ${formatNumber(performance.total.grossProfit, 2)} / 毛亏 ${formatNumber(performance.total.grossLoss, 2)}`} />
          <MetricCard label="净已实现" value={formatNumber(performance.total.netRealized, 2)} sub={`手续费 ${formatNumber(performance.total.commission, 2)}`} />
          <MetricCard label="清理动作" value={String(cleanupTotal)} sub={`成功 ${performance.total.cleanup.closeSuccess + performance.total.cleanup.partialClosed} / 异常 ${performance.total.cleanup.sizeFailed + performance.total.cleanup.notFound + performance.total.cleanup.modifyFailed}`} />
          <MetricCard label="交易明细行" value={String(performance.total.tradeRows)} sub="两交易所 trade history 合计行数" />
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {performance.exchanges.map((item) => (
            <div key={item.exchange} className={CARD_CLASS}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-foreground">{item.label || item.exchange.toUpperCase()}</div>
                  <div className="mt-1 text-xs text-foreground-faint">{item.startAt ? `${formatTime(item.startAt)} 起` : '近两天窗口'}</div>
                </div>
                <TerminalBadge kind={item.realizedTradeCount > 0 ? 'info' : 'neutral'}>
                  {item.realizedTradeCount > 0 ? '有成交' : '无已实现成交'}
                </TerminalBadge>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div>
                  <div className={LABEL_CLASS}>胜率</div>
                  <div className="mt-1 font-mono tabular-nums text-lg text-foreground">{formatNumber(item.winRatePct, 2)}%</div>
                </div>
                <div>
                  <div className={LABEL_CLASS}>盈利因子</div>
                  <div className="mt-1 font-mono tabular-nums text-lg text-foreground">{item.profitFactor === null ? '-' : formatNumber(item.profitFactor, 2)}</div>
                </div>
                <div>
                  <div className={LABEL_CLASS}>净已实现</div>
                  <div className="mt-1 font-mono tabular-nums text-lg text-foreground">{formatNumber(item.netRealized, 2)}</div>
                </div>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <div className="rounded-lg border border-border bg-black/10 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-foreground-faint">成交</div>
                  <div className="mt-1 text-sm text-foreground">{item.wins} 胜 / {item.losses} 负 / {item.tradeRows} 行</div>
                </div>
                <div className="rounded-lg border border-border bg-black/10 px-3 py-2">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-foreground-faint">清理</div>
                  <div className="mt-1 text-sm text-foreground">
                    成功 {item.cleanup.closeSuccess + item.cleanup.partialClosed} / 过小失败 {item.cleanup.sizeFailed} / 未找到 {item.cleanup.notFound}
                  </div>
                </div>
              </div>
              <div className="mt-2 text-xs text-foreground-faint">
                改单失败 {item.cleanup.modifyFailed}，改单跳过 {item.cleanup.modifySkipped}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {renderCurrentActionSection()}

      <div className="grid gap-4 xl:grid-cols-[0.96fr_1.04fr]">
        <Section title="拒单原因统计卡" icon={TriangleAlert} subtitle="最近窗口里最常拦下订单的原因。">
          {topRejectionBuckets.length === 0 ? (
            <EmptyState text="当前没有拒单样本。" />
          ) : (
            <div className={TABLE_CLASS}>
              <div className={cn(TABLE_HEAD_CLASS, 'grid grid-cols-[0.82fr_1fr_auto] gap-3 px-4 py-3')}>
                <div>原因</div>
                <div>强度</div>
                <div>次数</div>
              </div>
              {topRejectionBuckets.map((bucket, index) => (
                <button
                  key={`reject-highlight-${bucket.label}`}
                  type="button"
                  onClick={() => jumpToRejectionBucket(bucket.label)}
                  className={cn(
                    'grid grid-cols-[0.82fr_1fr_auto] gap-3 px-4 py-3.5',
                    TABLE_ROW_CLASS,
                    index > 0 && 'border-t',
                    index % 2 === 1 && 'bg-white/[0.015]',
                    'w-full text-left transition hover:bg-white/[0.03]',
                  )}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-foreground">{bucket.label}</div>
                    <div className="mt-1 text-xs text-foreground-faint">{bucket.entries.length} 条最近样本</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,rgba(224,112,112,0.32),rgba(219,194,108,0.74))]"
                        style={{ width: `${Math.max(10, (bucket.count / maxRejectedCount) * 100)}%` }}
                      />
                    </div>
                    <TerminalBadge kind={bucketTone(bucket.label)} className="shrink-0">
                      {Math.round((bucket.count / maxRejectedCount) * 100)}%
                    </TerminalBadge>
                  </div>
                  <div className="font-mono tabular-nums text-sm text-foreground-muted">{bucket.count}</div>
                </button>
              ))}
            </div>
          )}
        </Section>

        <Section title="占用冲突趋势" icon={Blocks} subtitle="当前真的在占用中的合约，以及它们拦掉新首仓的热度。">
          {topOccupiedSymbols.length === 0 ? (
            <EmptyState text="当前没有同品种占用冲突。" />
          ) : (
            <div className={TABLE_CLASS}>
              <div className={cn(TABLE_HEAD_CLASS, 'grid grid-cols-[0.72fr_0.9fr_1fr_auto] gap-3 px-4 py-3')}>
                <div>合约</div>
                <div>占用来源</div>
                <div>冲突热度</div>
                <div>次数</div>
              </div>
              {topOccupiedSymbols.map((item, index) => (
                <button
                  key={`occupied-highlight-${item.exchange}-${item.symbol}`}
                  type="button"
                  onClick={() => jumpToOccupiedSymbol(item.symbol, item.exchange)}
                  className={cn(
                    'grid grid-cols-[0.72fr_0.9fr_1fr_auto] gap-3 px-4 py-3.5',
                    TABLE_ROW_CLASS,
                    index > 0 && 'border-t',
                    index % 2 === 1 && 'bg-white/[0.015]',
                    'w-full text-left transition hover:bg-white/[0.03]',
                  )}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-foreground">{item.symbol}</div>
                    <div className="mt-1 text-xs text-foreground-faint">{item.exchange || '-'}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {item.occupiedBy.map((label) => (
                      <TerminalBadge key={`${item.symbol}-${label}`} kind={label === '保护单' ? 'info' : 'warn'}>
                        {label}
                      </TerminalBadge>
                    ))}
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,rgba(108,130,174,0.32),rgba(100,212,185,0.74))]"
                        style={{ width: `${Math.max(10, (item.blockedConflictCount / maxBlockedConflictCount) * 100)}%` }}
                      />
                    </div>
                    <span className="font-mono tabular-nums text-xs text-foreground-faint">
                      {Math.round((item.blockedConflictCount / maxBlockedConflictCount) * 100)}%
                    </span>
                  </div>
                  <div className="font-mono tabular-nums text-sm text-foreground-muted">{item.blockedConflictCount}</div>
                </button>
              ))}
            </div>
          )}
        </Section>
      </div>

      <div className={cn(CARD_CLASS, 'flex flex-wrap gap-2 px-3 py-3')}>
        {panelItems.map((item) => {
          const active = activePanel === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setActivePanel(item.key)}
              className={cn(
                'inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm transition',
                active ? 'bg-white/[0.08] text-foreground shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]' : 'bg-white/[0.028] text-foreground-muted hover:bg-white/[0.05]',
              )}
            >
              <span>{item.label}</span>
              <TerminalBadge kind={panelTone(item.key)} className="px-2 py-[0.24rem]">
                {item.count}
              </TerminalBadge>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-foreground-faint">
        <TerminalBadge kind={panelTone(activePanel)}>{panelItems.find((item) => item.key === activePanel)?.label || '当前分组'}</TerminalBadge>
        <span>过滤后：</span>
        <span className="font-mono tabular-nums text-foreground-muted">
          {panelItems.find((item) => item.key === activePanel)?.count || 0}
        </span>
        <span>条记录</span>
      </div>

      {renderActivePanel()}
    </div>
  );
}
