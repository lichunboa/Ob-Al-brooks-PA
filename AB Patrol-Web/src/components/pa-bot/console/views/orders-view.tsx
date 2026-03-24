'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Activity, Blocks, History, Image as ImageIcon, Layers3, ShieldCheck, TriangleAlert } from 'lucide-react';
import type { RuntimeData } from '../types';
import { normalizeStrategyLabel } from '../../../../lib/pa-bot/runtime-schema';
import { TradeChartPanel, type TradeChartPayload } from '../../trade-chart-panel';
import {
  BUTTON_GHOST_CLASS,
  CompactEmptyState,
  DATA_VALUE_CLASS,
  INPUT_CLASS,
  LABEL_CLASS,
  MetricCard,
  TABLE_CLASS,
  TABLE_HEAD_CLASS,
  TABLE_ROW_CLASS,
  TABLE_STICKY_CELL_ALT_CLASS,
  TABLE_STICKY_CELL_CLASS,
  TABLE_STICKY_HEAD_CLASS,
  Section,
  TableScroll,
  TerminalBadge,
  TERMINAL_STRIP_CLASS,
  cn,
  statusTone,
} from '../ui';
import { formatNumber, formatTime, translateStatusLabel } from '../formatters';

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

function inferChartTimeframe(values: string[]): string {
  const text = values.find(Boolean) || '';
  const matched = text.match(/^(1m|5m|15m|1h|1d)/i);
  return matched?.[1]?.toLowerCase() || '15m';
}

function isPrimaryReviewEvent(item: RuntimeData['historicalOrders'][number]): boolean {
  const type = String(item.type || '').toUpperCase();
  const status = String(item.status || '').toUpperCase();
  const orderClass = String(item.orderClass || '').toUpperCase();
  if (status === 'LOG_ONLY') return false;
  if (status === 'LIVE_ENTRY_CONFLICT') return false;
  if (status === 'DUPLICATE_SKIPPED') return false;
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
  const [liveChart, setLiveChart] = useState<TradeChartPayload | null>(null);
  const [liveChartFocusKey, setLiveChartFocusKey] = useState('');
  const [liveChartLoading, setLiveChartLoading] = useState(false);
  const [liveChartError, setLiveChartError] = useState('');
  const [selectedPositionKey, setSelectedPositionKey] = useState('');
  const [positionChart, setPositionChart] = useState<TradeChartPayload | null>(null);
  const [positionChartFocusKey, setPositionChartFocusKey] = useState('');
  const [positionChartLoading, setPositionChartLoading] = useState(false);
  const [positionChartError, setPositionChartError] = useState('');

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

  const filteredPositions = runtimeData.positions.filter(matchesFilter);
  const filteredEntryOrders = entryOrders.filter(matchesFilter);
  const filteredProtectionOrders = protectionOrders.filter(matchesFilter);
  const filteredManagementActions = managementActions.filter(matchesFilter);
  const filteredHistoricalOrders = historicalOrders.filter(matchesFilter);
  const focusableHistoricalOrders = filteredHistoricalOrders.filter(isPrimaryReviewEvent);
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
  const selectedHistoryItem =
    focusableHistoricalOrders.find((item) => `${item.loggedAt}-${item.symbol}-${item.type}-${item.orderId || ''}` === selectedHistoryKey) ||
    focusableHistoricalOrders[0] ||
    null;
  const selectedPositionItem =
    filteredPositions.find(
      (item) => `${item.exchange}-${item.symbol}-${normalizeStrategyText(item.strategy || '')}-${item.openedAt || ''}` === selectedPositionKey,
    ) ||
    filteredPositions[0] ||
    null;

  const panelItems: Array<{ key: OrderPanelKey; label: string; count: number }> = [
    { key: 'positions', label: '当前持仓', count: filteredPositions.length },
    { key: 'entry', label: '首仓挂单', count: filteredEntryOrders.length },
    { key: 'protection', label: '保护单', count: filteredProtectionOrders.length },
    { key: 'management', label: '管理动作', count: filteredManagementActions.length },
    { key: 'occupancy', label: '同品种占用', count: filteredOccupiedSymbols.length },
    { key: 'history', label: '历史订单', count: filteredHistoricalOrders.length },
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
      setLiveChartError('');
      return;
    }
    const exists = focusableHistoricalOrders.some(
      (item) => `${item.loggedAt}-${item.symbol}-${item.type}-${item.orderId || ''}` === selectedHistoryKey,
    );
    if (!exists) {
      const fallback = focusableHistoricalOrders[0];
      setSelectedHistoryKey(`${fallback.loggedAt}-${fallback.symbol}-${fallback.type}-${fallback.orderId || ''}`);
    }
  }, [focusableHistoricalOrders, selectedHistoryKey]);

  useEffect(() => {
    if (filteredPositions.length === 0) {
      setSelectedPositionKey('');
      setPositionChart(null);
      setPositionChartError('');
      return;
    }
    const exists = filteredPositions.some(
      (item) => `${item.exchange}-${item.symbol}-${normalizeStrategyText(item.strategy || '')}-${item.openedAt || ''}` === selectedPositionKey,
    );
    if (!exists) {
      const fallback = filteredPositions[0];
      setSelectedPositionKey(
        `${fallback.exchange}-${fallback.symbol}-${normalizeStrategyText(fallback.strategy || '')}-${fallback.openedAt || ''}`,
      );
    }
  }, [filteredPositions, selectedPositionKey]);

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
    const matched = runtimeData.system.accounts.find((account) =>
      (account.configuredSymbols || []).map((item) => item.toUpperCase()).includes(symbol.toUpperCase()),
    );
    return matched?.baseUrl || runtimeData.system.accounts[0]?.baseUrl || 'http://127.0.0.1:8095';
  }

  function collectFocusedHistoryEvents(target: RuntimeData['historicalOrders'][number]) {
    const focusKey = `${target.loggedAt}-${target.symbol}-${target.type}-${target.orderId || ''}`;
    const targetOrderId = String(target.orderId || '').trim();
    const events = targetOrderId
      ? filteredHistoricalOrders.filter((item) => String(item.orderId || '').trim() === targetOrderId)
      : [target];
    const eventIndex = Math.max(
      0,
      events.findIndex(
        (item) =>
          item.loggedAt === target.loggedAt &&
          item.type === target.type &&
          String(item.orderId || '') === String(target.orderId || ''),
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
      .map((item) => ({ ...item, orderId: item.orderId || syntheticOrderId }));
    const relatedManagement = managementActions
      .filter(matchesPositionChain)
      .map((item) => ({
        ...item,
        orderId: item.orderId || syntheticOrderId,
      }));
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
        eventPrice: item.stopPrice || item.price || item.entryPrice,
        stopLoss: item.stopLoss,
        takeProfit: item.takeProfit,
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
      eventPrice: target.markPrice || target.entryPrice,
      stopLoss: target.stopLoss,
      takeProfit: target.takeProfit,
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

  async function generateLiveChart(target: RuntimeData['historicalOrders'][number]) {
    const { focusKey, eventIndex, events } = collectFocusedHistoryEvents(target);
    setSelectedHistoryKey(focusKey);
    setLiveChartLoading(true);
    setLiveChartError('');
    try {
      const response = await fetch('/api/pa-bot/live-chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: target.symbol,
          timeframe: inferChartTimeframe(target.timeframeSignals || []),
          baseUrl: baseUrlForSymbol(target.symbol),
          events,
          eventIndex,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      setLiveChart(payload.chart as TradeChartPayload);
      setLiveChartFocusKey(focusKey);
    } catch (chartError) {
      setLiveChart(null);
      setLiveChartFocusKey('');
      setLiveChartError(chartError instanceof Error ? chartError.message : '实盘图表生成失败');
    } finally {
      setLiveChartLoading(false);
    }
  }

  async function generatePositionChart(target: RuntimeData['positions'][number]) {
    const { focusKey, eventIndex, events } = collectFocusedPositionEvents(target);
    setSelectedPositionKey(focusKey);
    setPositionChartLoading(true);
    setPositionChartError('');
    try {
      const response = await fetch('/api/pa-bot/live-chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: target.symbol,
          timeframe: inferChartTimeframe(target.timeframeSignals || []),
          baseUrl: baseUrlForSymbol(target.symbol),
          events,
          eventIndex,
        }),
      });
      const payload = await response.json();
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error || `HTTP ${response.status}`);
      }
      setPositionChart(payload.chart as TradeChartPayload);
      setPositionChartFocusKey(focusKey);
    } catch (chartError) {
      setPositionChart(null);
      setPositionChartFocusKey('');
      setPositionChartError(chartError instanceof Error ? chartError.message : '当前持仓图表生成失败');
    } finally {
      setPositionChartLoading(false);
    }
  }

  useEffect(() => {
    if (!selectedHistoryItem || !selectedHistoryKey) {
      return;
    }
    if (liveChartLoading || liveChartFocusKey === selectedHistoryKey) {
      return;
    }
    void generateLiveChart(selectedHistoryItem);
  }, [selectedHistoryKey, selectedHistoryItem, liveChartFocusKey, liveChartLoading]);

  useEffect(() => {
    if (!selectedPositionItem || !selectedPositionKey) {
      return;
    }
    if (positionChartLoading || positionChartFocusKey === selectedPositionKey) {
      return;
    }
    void generatePositionChart(selectedPositionItem);
  }, [selectedPositionItem, selectedPositionKey, positionChartFocusKey, positionChartLoading]);

  function renderPositionsPanel() {
    return (
      <Section title="当前持仓" icon={Layers3} subtitle="实仓 + 保护位 + 策略上下文。">
        {filteredPositions.length === 0 ? (
          <CompactEmptyState text="当前没有持仓。" />
        ) : (
          <div className="space-y-5">
            <TradeChartPanel
              eyebrow="当前持仓图"
              title={selectedPositionItem ? `${selectedPositionItem.symbol} · ${normalizeStrategyText(selectedPositionItem.strategy || '') || selectedPositionItem.side}` : '未选择持仓'}
              badgeText={selectedPositionItem ? `${selectedPositionItem.symbol} · ${inferChartTimeframe(selectedPositionItem.timeframeSignals || [])}` : undefined}
              helperText={`当前聚焦单一持仓链，按持仓快照 + 同策略管理/保护动作聚合，不再把所有订单挤在一张图里。`}
              chart={positionChart}
              loading={positionChartLoading}
              error={positionChartError}
              emptyText="选择一笔当前持仓后，这里会生成对应的 K 线与入场/止损/止盈图。"
              imageAlt={positionChart?.focusTitle || '当前持仓图表'}
              onRefresh={selectedPositionItem ? () => void generatePositionChart(selectedPositionItem) : undefined}
              refreshDisabled={!selectedPositionItem || positionChartLoading}
              refreshLabel="生成图表"
              chartHeight={1040}
            />
            <div className={TABLE_CLASS}>
            <TableScroll className="max-h-[420px]">
              <div
                className={cn(
                  TABLE_HEAD_CLASS,
                  'sticky top-0 z-10 hidden grid-cols-[0.86fr_0.4fr_0.4fr_0.82fr_0.78fr_0.62fr_0.62fr_0.62fr_0.42fr_0.5fr_0.42fr] gap-3 bg-[#0a1016]/95 px-4 py-3 md:grid',
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
                    `${position.exchange}-${position.symbol}-${normalizeStrategyText(position.strategy || '')}-${position.openedAt || ''}` === selectedPositionKey &&
                      'bg-cyan-400/[0.04]',
                  )}
                  onClick={() => void generatePositionChart(position)}
                >
                  <div className={cn('md:sticky md:left-0', index % 2 === 1 ? TABLE_STICKY_CELL_ALT_CLASS : TABLE_STICKY_CELL_CLASS)}>
                    <div className="text-sm font-semibold text-white">{position.symbol}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {position.exchange || '-'} · {formatTime(position.openedAt)}
                    </div>
                  </div>
                  <div className="text-sm text-slate-200">{position.side || '-'}</div>
                  <div className="font-mono tabular-nums text-sm text-slate-200">{formatNumber(position.quantity, 6)}</div>
                  <div className="text-sm text-slate-200">{normalizeStrategyText(position.strategy || '') || '-'}</div>
                  <div className="text-sm text-slate-300">{timeframeText(position.timeframeSignals)}</div>
                  <div className="font-mono tabular-nums text-sm text-slate-200">{formatNumber(position.entryPrice, 5)}</div>
                  <div className="font-mono tabular-nums text-sm text-slate-200">{formatNumber(position.stopLoss, 5)}</div>
                  <div className="font-mono tabular-nums text-sm text-slate-200">{formatNumber(position.takeProfit, 5)}</div>
                  <div className="font-mono tabular-nums text-sm text-slate-200">{formatNumber(position.leverage, 0)}x</div>
                  <div className={cn('font-mono tabular-nums text-sm font-medium', (position.unrealizedPnl || 0) >= 0 ? 'text-emerald-300' : 'text-rose-300')}>
                    {formatNumber(position.unrealizedPnl, 2)}
                  </div>
                  <div>
                    <button type="button" className={BUTTON_GHOST_CLASS} onClick={() => void generatePositionChart(position)}>
                      <ImageIcon className="h-4 w-4" />
                      看图
                    </button>
                  </div>
                </article>
              ))}
            </TableScroll>
          </div>
          </div>
        )}
      </Section>
    );
  }

  function renderEntryPanel() {
    return (
      <Section title="首仓挂单" icon={Blocks} subtitle="等待成交的首次入场委托。">
        {filteredEntryOrders.length === 0 ? (
          <CompactEmptyState text="当前没有首仓挂单。" />
        ) : (
          <div className={TABLE_CLASS}>
            <TableScroll className="max-h-[440px]">
              <div className={cn(TABLE_HEAD_CLASS, 'sticky top-0 z-10 hidden grid-cols-[0.82fr_0.38fr_0.38fr_0.48fr_0.62fr_0.62fr_0.62fr_0.82fr_0.8fr_0.44fr] gap-3 bg-[#0a1016]/95 px-4 py-3 md:grid')}>
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
                  <div className={cn('md:sticky md:left-0', index % 2 === 1 ? TABLE_STICKY_CELL_ALT_CLASS : TABLE_STICKY_CELL_CLASS)}>
                    <div className="text-sm font-semibold text-white">{order.symbol}</div>
                    <div className="mt-1 text-xs text-slate-500">{formatTime(order.createdAt || order.loggedAt)}</div>
                  </div>
                  <div className="text-sm text-slate-200">{order.side || '-'}</div>
                  <div className="font-mono tabular-nums text-sm text-slate-200">{formatNumber(order.quantity, 6)}</div>
                  <div className="text-sm text-slate-200">{order.orderType || '-'}</div>
                  <div className="font-mono tabular-nums text-sm text-slate-200">{formatNumber(order.price, 5)}</div>
                  <div className="font-mono tabular-nums text-sm text-slate-200">{formatNumber(order.stopLoss, 5)}</div>
                  <div className="font-mono tabular-nums text-sm text-slate-200">{formatNumber(order.takeProfit, 5)}</div>
                  <div className="text-sm text-slate-200">{normalizeStrategyText(order.strategy || '') || '-'}</div>
                  <div className="text-sm text-slate-300">{timeframeText(order.timeframeSignals)}</div>
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
          <CompactEmptyState text="当前没有保护单。" />
        ) : (
          <div className={TABLE_CLASS}>
            <TableScroll className="max-h-[440px]">
              <div className={cn(TABLE_HEAD_CLASS, 'sticky top-0 z-10 hidden grid-cols-[0.82fr_0.44fr_0.36fr_0.38fr_0.62fr_0.62fr_0.66fr_0.82fr_0.44fr] gap-3 bg-[#0a1016]/95 px-4 py-3 md:grid')}>
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
                  <div className={cn('md:sticky md:left-0', index % 2 === 1 ? TABLE_STICKY_CELL_ALT_CLASS : TABLE_STICKY_CELL_CLASS)}>
                    <div className="text-sm font-semibold text-white">{order.symbol}</div>
                    <div className="mt-1 text-xs text-slate-500">{formatTime(order.createdAt || order.loggedAt)}</div>
                  </div>
                  <div>
                    <TerminalBadge kind={order.protectionKind === 'TAKE_PROFIT' ? 'success' : 'warn'}>
                      {protectionKindLabel(order.protectionKind)}
                    </TerminalBadge>
                  </div>
                  <div className="text-sm text-slate-200">{order.side || '-'}</div>
                  <div className="font-mono tabular-nums text-sm text-slate-200">{formatNumber(order.quantity, 6)}</div>
                  <div className="font-mono tabular-nums text-sm text-slate-200">{formatNumber(order.stopPrice, 5)}</div>
                  <div className="font-mono tabular-nums text-sm text-slate-200">{formatNumber(order.entryPrice, 5)}</div>
                  <div className="font-mono tabular-nums text-sm text-slate-200">{formatNumber(order.stopLoss, 5)} / {formatNumber(order.takeProfit, 5)}</div>
                  <div className="text-sm text-slate-200">{normalizeStrategyText(order.strategy || '') || '-'}</div>
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
          <CompactEmptyState text="当前没有管理动作。" />
        ) : (
          <div className={TABLE_CLASS}>
            <TableScroll className="max-h-[440px]">
              <div className={cn(TABLE_HEAD_CLASS, 'sticky top-0 z-10 hidden grid-cols-[0.7fr_0.42fr_0.42fr_0.82fr_0.72fr_0.62fr_0.62fr_0.62fr_0.9fr_0.44fr] gap-3 bg-[#0a1016]/95 px-4 py-3 md:grid')}>
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
                <article
                  key={`${item.loggedAt}-${item.symbol}-${item.type}-${index}`}
                  className={cn(
                    'grid gap-3 px-4 py-3.5 md:grid-cols-[0.7fr_0.42fr_0.42fr_0.82fr_0.72fr_0.62fr_0.62fr_0.62fr_0.9fr_0.44fr]',
                    TABLE_ROW_CLASS,
                    index > 0 && 'border-t',
                    index % 2 === 1 && 'bg-white/[0.015]',
                  )}
                >
                  <div className={cn('md:sticky md:left-0', index % 2 === 1 ? TABLE_STICKY_CELL_ALT_CLASS : TABLE_STICKY_CELL_CLASS)}>
                    <div className="text-sm font-semibold text-white">{item.symbol || '系统事件'}</div>
                    <div className="mt-1 text-xs text-slate-500">{formatTime(item.loggedAt)}</div>
                  </div>
                  <div className="text-sm text-slate-200">{item.type || '-'}</div>
                  <div className="font-mono tabular-nums text-sm text-slate-200">{formatNumber(item.quantity, 6)}</div>
                  <div className="text-sm text-slate-200">{normalizeStrategyText(item.strategy || '') || '-'}</div>
                  <div className="text-sm text-slate-300">{timeframeText(item.timeframeSignals)}</div>
                  <div className="font-mono tabular-nums text-sm text-slate-200">{formatNumber(item.stopLoss, 5)}</div>
                  <div className="font-mono tabular-nums text-sm text-slate-200">{formatNumber(item.takeProfit, 5)}</div>
                  <div className="font-mono tabular-nums text-sm text-slate-200">{formatNumber(item.entryPrice, 5)}</div>
                  <div className="text-sm leading-6 text-slate-300">{item.message || '-'}</div>
                  <div>
                    <TerminalBadge className={statusTone(item.status || '-')}>{translateStatusLabel(item.status || '-')}</TerminalBadge>
                  </div>
                </article>
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
          <CompactEmptyState text="当前没有同品种占用记录。" />
        ) : (
          <div className={TABLE_CLASS}>
            <TableScroll className="max-h-[360px]">
              <div className={cn(TABLE_HEAD_CLASS, 'sticky top-0 z-10 hidden grid-cols-[0.78fr_0.42fr_0.78fr_0.42fr_0.66fr_0.5fr] gap-3 bg-[#0a1016]/95 px-4 py-3 md:grid')}>
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
                  <div className={cn('md:sticky md:left-0', index % 2 === 1 ? TABLE_STICKY_CELL_ALT_CLASS : TABLE_STICKY_CELL_CLASS)}>
                    <div className="text-sm font-semibold text-white">{item.symbol}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      {item.hasPosition ? '已有持仓' : '空仓'} · {item.hasEntryOrder ? '有首仓挂单' : '无首仓挂单'}
                    </div>
                  </div>
                  <div className="text-sm text-slate-200">{item.exchange || '-'}</div>
                  <div className="flex flex-wrap gap-2">
                    {item.occupiedBy.length > 0 ? item.occupiedBy.map((label) => <TerminalBadge key={`${item.symbol}-${label}`} kind={label === '保护单' ? 'info' : 'warn'}>{label}</TerminalBadge>) : <span className="text-sm text-slate-500">无</span>}
                  </div>
                  <div className="font-mono tabular-nums text-sm font-semibold text-amber-200">{formatNumber(item.blockedConflictCount, 0)}</div>
                  <div className="flex items-center gap-2">
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,rgba(184,156,98,0.35),rgba(124,201,179,0.7))]"
                        style={{ width: `${Math.max(8, (item.blockedConflictCount / maxBlockedConflictCount) * 100)}%` }}
                      />
                    </div>
                    <div className="font-mono tabular-nums text-xs text-slate-500">
                      {Math.round((item.blockedConflictCount / maxBlockedConflictCount) * 100)}%
                    </div>
                  </div>
                  <div className="text-sm text-slate-400">
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
        {focusableHistoricalOrders.length === 0 ? (
          <CompactEmptyState text="当前没有历史订单。" />
        ) : (
          <div className="space-y-5">
            <TradeChartPanel
              eyebrow="实盘复盘图"
              title={selectedHistoryItem ? `${selectedHistoryItem.symbol} · ${normalizeStrategyText(selectedHistoryItem.strategy || '') || selectedHistoryItem.type}` : '未选择事件'}
              badgeText={selectedHistoryItem ? `${selectedHistoryItem.symbol} · ${inferChartTimeframe(selectedHistoryItem.timeframeSignals || [])}` : undefined}
              helperText={`当前仅聚焦单笔主事件，已从 ${filteredHistoricalOrders.length} 条历史事件中过滤出 ${focusableHistoricalOrders.length} 条主事件。`}
              chart={liveChart}
              loading={liveChartLoading}
              error={liveChartError}
              emptyText="选择一笔历史订单后，下方会生成聚焦该订单链的 K 线标注图。"
              imageAlt={liveChart?.focusTitle || '实盘复盘图表'}
              onRefresh={selectedHistoryItem ? () => void generateLiveChart(selectedHistoryItem) : undefined}
              refreshDisabled={!selectedHistoryItem || liveChartLoading}
              refreshLabel="生成图表"
              chartHeight={1040}
            />
            <div className={TABLE_CLASS}>
              <TableScroll className="max-h-[520px]">
                <div className={cn(TABLE_HEAD_CLASS, 'sticky top-0 z-10 hidden grid-cols-[0.72fr_0.42fr_0.42fr_0.82fr_0.78fr_0.56fr_0.56fr_0.56fr_0.44fr_0.9fr_0.42fr] gap-3 bg-[#0a1016]/95 px-4 py-3 md:grid')}>
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
                  const rowKey = `${item.loggedAt}-${item.symbol}-${item.type}-${item.orderId || index}`;
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
                      onClick={() => void generateLiveChart(item)}
                    >
                      <div className={cn('md:sticky md:left-0', index % 2 === 1 ? TABLE_STICKY_CELL_ALT_CLASS : TABLE_STICKY_CELL_CLASS)}>
                        <div className="text-sm font-semibold text-white">{item.symbol || '系统事件'}</div>
                        <div className="mt-1 text-xs text-slate-500">{formatTime(item.loggedAt)}</div>
                      </div>
                      <div>
                        <TerminalBadge kind={item.orderClass === 'PROTECTION' ? 'info' : item.orderClass === 'MANAGEMENT' ? 'success' : 'neutral'}>
                          {orderClassLabel(item.orderClass)}
                        </TerminalBadge>
                      </div>
                      <div className="text-sm text-slate-200">{item.type || '-'}</div>
                      <div className="text-sm text-slate-200">{normalizeStrategyText(item.strategy || '') || '-'}</div>
                      <div className="text-sm text-slate-300">{timeframeText(item.timeframeSignals)}</div>
                      <div className="font-mono tabular-nums text-sm text-slate-200">{formatNumber(item.entryPrice, 5)}</div>
                      <div className="font-mono tabular-nums text-sm text-slate-200">{formatNumber(item.stopLoss, 5)}</div>
                      <div className="font-mono tabular-nums text-sm text-slate-200">{formatNumber(item.takeProfit, 5)}</div>
                      <div>
                        <TerminalBadge className={statusTone(item.status || '-')}>{translateStatusLabel(item.status || '-')}</TerminalBadge>
                      </div>
                      <div className="text-sm leading-6 text-slate-300">{item.message || '-'}</div>
                      <div>
                        <button
                          type="button"
                          className={BUTTON_GHOST_CLASS}
                          onClick={() => void generateLiveChart(item)}
                        >
                          <ImageIcon className="h-4 w-4" />
                          看图
                        </button>
                      </div>
                    </article>
                  );
                })}
              </TableScroll>
            </div>
          </div>
        )}
      </Section>
    );
  }

  function renderRejectionPanel() {
    return (
      <Section title="拒单原因" icon={TriangleAlert} subtitle="按原因聚合最近被拦下的订单，点开可以直接看是哪一笔、为什么被拦。">
        {filteredRejectionDetails.length === 0 ? (
          <CompactEmptyState text="当前没有拒单记录。" />
        ) : (
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-3">
              <MetricCard label="拒单总数" value={String(totalRejected)} sub={topRejectionBucket ? `最高频：${topRejectionBucket.label}` : '当前无拒单'} />
              <MetricCard label="当前桶" value={activeRejectionBucket ? String(activeRejectionBucket.count) : '0'} sub={activeRejectionBucket?.label || '未选择原因'} />
              <MetricCard label="最高频合约" value={selectedRejectionLeader ? selectedRejectionLeader[0].split(':')[1] : '-'} sub={selectedRejectionLeader ? `${selectedRejectionLeader[0].split(':')[0]} · ${selectedRejectionLeader[1]} 次` : '当前桶内无样本'} />
            </div>
            <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
            <div className={TABLE_CLASS}>
              <div className="border-b border-[#17212b] px-4 py-3 text-[10px] uppercase tracking-[0.22em] text-slate-500">拒单汇总</div>
              <div className="space-y-1 p-2">
                {filteredRejectionDetails.map((bucket) => {
                  const active = activeRejectionBucket?.label === bucket.label;
                  return (
                    <button
                      key={bucket.label}
                      type="button"
                      onClick={() => setSelectedRejectionLabel(bucket.label)}
                      className={cn(
                        'flex w-full items-center justify-between rounded-[12px] px-3 py-3 text-left transition',
                        active ? 'bg-white/[0.06] shadow-[inset_0_0_0_1px_rgba(124,201,179,0.14)]' : 'hover:bg-white/[0.035]',
                      )}
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-white">{bucket.label}</div>
                        <div className="mt-1 text-xs text-slate-500">{bucket.entries.length} 条最近样本</div>
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
                    <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">拒单明细</div>
                    <div className="mt-1 text-sm text-slate-300">{activeRejectionBucket?.label || '未选择原因'}</div>
                  </div>
                  <TerminalBadge kind={bucketTone(activeRejectionBucket?.label || '')}>{activeRejectionBucket?.count || 0}</TerminalBadge>
                </div>
              </div>
              <TableScroll className="max-h-[420px]">
                <div className={cn(TABLE_HEAD_CLASS, 'sticky top-0 z-10 hidden grid-cols-[0.7fr_0.5fr_0.4fr_0.42fr_0.42fr_1fr] gap-3 bg-[#0a1016]/95 px-4 py-3 md:grid')}>
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
                    <div className={cn('md:sticky md:left-0', index % 2 === 1 ? TABLE_STICKY_CELL_ALT_CLASS : TABLE_STICKY_CELL_CLASS)}>
                      <div className="text-sm font-semibold text-white">{entry.symbol || '系统事件'}</div>
                      <div className="mt-1 text-xs text-slate-500">{formatTime(entry.loggedAt)}</div>
                    </div>
                    <div className="text-sm text-slate-200">{entry.exchange || '-'}</div>
                    <div>
                      <TerminalBadge className={statusTone(entry.status || '-')}>{translateStatusLabel(entry.status || '-')}</TerminalBadge>
                    </div>
                    <div className="text-sm text-slate-200">{entry.type || '-'}</div>
                    <div>
                      <TerminalBadge kind={bucketTone(activeRejectionBucket?.label || '')}>{activeRejectionBucket?.label || '-'}</TerminalBadge>
                    </div>
                    <div className="text-sm leading-6 text-slate-300">{entry.message || '-'}</div>
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
    <div className="space-y-5">
      <div className={cn(TERMINAL_STRIP_CLASS, 'grid gap-3 px-4 py-3 md:grid-cols-[1.1fr_repeat(3,minmax(0,0.7fr))_auto]')}>
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
          <span className="text-xs text-slate-500">当前未启用过滤，显示全部订单视图。</span>
        ) : (
          activeFilters.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => clearSingleFilter(item.key)}
              className="inline-flex items-center gap-2 rounded-full bg-white/[0.04] px-3 py-1.5 text-xs text-slate-300 transition hover:bg-white/[0.07]"
            >
              <span>{item.label}</span>
              <span className="text-slate-500">清除</span>
            </button>
          ))
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
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
          <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-400">
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
              <div className="mt-1 text-xs text-slate-500">{item.sub}</div>
            </article>
          ))}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.96fr_1.04fr]">
        <Section title="拒单原因统计卡" icon={TriangleAlert} subtitle="最近窗口里最常拦下订单的原因。">
          {topRejectionBuckets.length === 0 ? (
            <CompactEmptyState text="当前没有拒单样本。" />
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
                    <div className="truncate text-sm text-white">{bucket.label}</div>
                    <div className="mt-1 text-xs text-slate-500">{bucket.entries.length} 条最近样本</div>
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
                  <div className="font-mono tabular-nums text-sm text-slate-300">{bucket.count}</div>
                </button>
              ))}
            </div>
          )}
        </Section>

        <Section title="占用冲突趋势" icon={Blocks} subtitle="当前真的在占用中的合约，以及它们拦掉新首仓的热度。">
          {topOccupiedSymbols.length === 0 ? (
            <CompactEmptyState text="当前没有同品种占用冲突。" />
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
                    <div className="truncate text-sm text-white">{item.symbol}</div>
                    <div className="mt-1 text-xs text-slate-500">{item.exchange || '-'}</div>
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
                    <span className="font-mono tabular-nums text-xs text-slate-500">
                      {Math.round((item.blockedConflictCount / maxBlockedConflictCount) * 100)}%
                    </span>
                  </div>
                  <div className="font-mono tabular-nums text-sm text-slate-300">{item.blockedConflictCount}</div>
                </button>
              ))}
            </div>
          )}
        </Section>
      </div>

      <div className={cn(TERMINAL_STRIP_CLASS, 'flex flex-wrap gap-2 px-3 py-3')}>
        {panelItems.map((item) => {
          const active = activePanel === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setActivePanel(item.key)}
              className={cn(
                'inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-sm transition',
                active ? 'bg-white/[0.08] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]' : 'bg-white/[0.028] text-slate-300 hover:bg-white/[0.05]',
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

      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <TerminalBadge kind={panelTone(activePanel)}>{panelItems.find((item) => item.key === activePanel)?.label || '当前分组'}</TerminalBadge>
        <span>过滤后：</span>
        <span className="font-mono tabular-nums text-slate-300">
          {panelItems.find((item) => item.key === activePanel)?.count || 0}
        </span>
        <span>条记录</span>
      </div>

      {renderActivePanel()}
    </div>
  );
}
