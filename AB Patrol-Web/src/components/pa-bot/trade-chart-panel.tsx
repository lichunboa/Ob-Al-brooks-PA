'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type Time,
} from 'lightweight-charts';
import { Image as ImageIcon, RefreshCw } from 'lucide-react';
import { BUTTON_ACCENT_CLASS, TABLE_CLASS, TerminalBadge, cn } from './console/ui';
import { TradingViewMarketChart } from './tradingview-market-chart';
import { normalizeChartSymbol } from '../../lib/pa-bot/runtime-symbols';

export type TradeChartCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

export type TradeChartLinePoint = {
  time: number;
  value: number;
};

export type TradeChartVolumePoint = {
  time: number;
  value: number;
  color?: string;
};

export type TradeChartMarker = {
  time: number;
  position: 'aboveBar' | 'belowBar' | 'inBar';
  shape: 'arrowUp' | 'arrowDown' | 'circle' | 'square';
  color: string;
  text: string;
  price?: number;
  size?: number;
  signalKey?: string;
};

export type TradeChartPriceLine = {
  price: number;
  color: string;
  title: string;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  lineWidth?: number;
  axisLabelVisible?: boolean;
  signalKey?: string;
};

export type TradeChartOverlayLine = {
  id: string;
  title: string;
  color: string;
  lineStyle?: 'solid' | 'dashed' | 'dotted';
  lineWidth?: number;
  points: TradeChartLinePoint[];
  signalKey?: string;
};

export type TradeChartSignalSummaryItem = {
  key?: string;
  label: string;
  color?: string;
  detailTitle?: string;
  detailLines?: string[];
  groupKey?: string;
  groupLabel?: string;
};

export type TradeChartPayload = {
  source: 'live' | 'backtest';
  symbol: string;
  timeframe: string;
  focusTitle: string;
  candles: TradeChartCandle[];
  ema20: TradeChartLinePoint[];
  volume?: TradeChartVolumePoint[];
  markers?: TradeChartMarker[];
  priceLines?: TradeChartPriceLine[];
  overlayLines?: TradeChartOverlayLine[];
  signalSummary?: TradeChartSignalSummaryItem[];
  focusMeta?: Record<string, unknown>;
};

function classifySymbolBucket(symbol: string): 'crypto' | 'forex' {
  const normalized = normalizeChartSymbol(symbol);
  return normalized.endsWith('USDT') ? 'crypto' : 'forex';
}

const DEFAULT_MONITORED_SYMBOLS: Record<'crypto' | 'forex', string[]> = {
  crypto: ['BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT', 'ADAUSDT'],
  forex: ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCHF', 'USDCAD', 'US 500', 'US TECH 100'],
};

type TradeChartPanelProps = {
  eyebrow: string;
  title: string;
  badgeText?: string;
  helperText?: string;
  chart: TradeChartPayload | null;
  loading: boolean;
  error?: string;
  emptyText: string;
  imageAlt?: string;
  imageClassName?: string;
  onRefresh?: () => void;
  refreshDisabled?: boolean;
  refreshLabel?: string;
  chartHeight?: number;
  timeframeOptions?: string[];
  selectedTimeframe?: string;
  onSelectTimeframe?: (timeframe: string) => void;
  symbolOptions?: string[];
  selectedSymbol?: string;
  onSelectSymbol?: (symbol: string) => void;
};

type TradeChartMetaEntry = {
  key: string;
  label: string;
  value: unknown;
};

type TradeChartMetaSection = {
  key: string;
  label: string;
  description?: string;
  entries: TradeChartMetaEntry[];
};

type TradeChartSignalGroup = {
  key: string;
  label: string;
  items: TradeChartSignalSummaryItem[];
};

const SIGNAL_GROUP_ORDER = [
  'runtime_gate',
  'trade_tf',
  'session_levels',
  'latest_h',
  'latest_l',
  'signal_quality',
  'breakout_mode',
  'micro_double',
  'reversal',
  'gap',
  'micro_channel',
  'pullback_ema',
  'pressure',
  'mag',
  'mm',
  'higher_tf',
  'other',
] as const;

const DEFAULT_ACTIVE_SIGNAL_GROUPS = new Set([
  'session_levels',
  'latest_h',
  'latest_l',
  'breakout_mode',
  'micro_double',
  'reversal',
  'gap',
  'mag',
  'mm',
]);

const TEMPLATE_META_ORDER = [
  'background',
  'keyArea',
  'setupPremise',
  'signalBarType',
  'entryTrigger',
  'triggerInvalidation',
  'initialStopType',
  'actualRiskPct',
  'positionLeverage',
  'firstTarget',
  'managementMode',
  'beCondition',
  'earlyExit',
  'reentryAddOn',
  'costFloor',
  'managementTemplate',
  'premiseStrength',
  'signalQuality',
] as const;

const META_SECTION_DEFINITIONS: Array<{ key: string; label: string; description?: string; fields: readonly string[] }> = [
  {
    key: 'template',
    label: '模板快照',
    description: '按 Brooks 模板字段收口，后面调策略时直接看这里。',
    fields: TEMPLATE_META_ORDER,
  },
  {
    key: 'execution',
    label: '执行与价格',
    description: '同一张卡同时展示计划价与交易所实际价，避免口径混淆。',
    fields: [
      'strategy',
      'playbookId',
      'playbookFamily',
      'direction',
      'type',
      'status',
      'entryTime',
      'entryPrice',
      'plannedEntryPrice',
      'actualEntryPrice',
      'eventPrice',
      'stopLoss',
      'plannedStopLoss',
      'actualStopLoss',
      'takeProfit',
      'plannedTakeProfit',
      'actualTakeProfit',
      'exitPrice',
      'exitReason',
      'pnlPct',
      'result',
    ],
  },
  {
    key: 'trade_tf',
    label: '交易周期',
    description: '真实 setup 和 trigger 只在交易周期内成立。',
    fields: [
      'tradeTimeframeBias',
      'tradeTimeframeBiasLabel',
      'tradeTimeframeStrength',
      'tradeTimeframeState',
      'tradeTimeframeStateLabel',
      'tradeTimeframeLatestH',
      'tradeTimeframeLatestL',
      'tradeTimeframeSignals',
      'tradeSignalQuality',
      'tradeMicroDouble',
      'tradeNearestSupport',
      'tradeNearestResistance',
      'tradeTrPosition',
      'tradeTrendPhase',
      'tradeGapPhase',
      'tradeOpenGaps',
      'tradeFilledGaps',
      'tradeMicroGaps',
      'tradePreferredMm',
      'tradePreferredMmLabel',
    ],
  },
  {
    key: 'runtime',
    label: '运行态',
    description: '这里看系统有没有把结构升级成真实候选或可执行单。',
    fields: [
      'runtimeStatus',
      'runtimeSignal',
      'runtimeCandidateStage',
      'runtimeExecutionMode',
      'runtimeStrategy',
      'runtimeHasPlannedTrade',
    ],
  },
  {
    key: 'higher_tf',
    label: '大周期背景',
    description: '大周期只给边界和顺逆势语义，不替代交易周期触发。',
    fields: [
      'higherTimeframe',
      'higherTimeframeBias',
      'higherTimeframeBiasLabel',
      'higherTimeframeStrength',
      'higherTimeframeState',
      'higherTimeframeStateLabel',
      'higherTimeframeBoundaries',
    ],
  },
  {
    key: 'market',
    label: '市场图',
    description: 'TradingView 市场图用来对照社区指标和原始行情。',
    fields: [
      'marketSymbol',
      'marketKind',
      'tradingViewDefaultExchange',
      'tradingViewFullSymbol',
      'candleSource',
    ],
  },
];

function labelForMeta(key: string): string {
  const mapping: Record<string, string> = {
    strategy: '策略',
    playbookId: 'Playbook',
    playbookFamily: '策略族',
    direction: '方向',
    entryTime: '开仓时间',
    exitTime: '平仓时间',
    entryPrice: '开仓价',
    plannedEntryPrice: 'Brooks计划入场/触发价',
    actualEntryPrice: '交易所实际成交价',
    exitPrice: '平仓价',
    stopLoss: '止损',
    plannedStopLoss: 'Brooks计划止损',
    actualStopLoss: '交易所实际止损',
    takeProfit: '止盈',
    plannedTakeProfit: 'Brooks计划止盈',
    actualTakeProfit: '交易所实际止盈',
    exitReason: '退出原因',
    pnlPct: '盈亏%',
    result: '结果',
    marketState: '市场状态',
    type: '事件类型',
    status: '状态',
    side: '买卖方向',
    loggedAt: '记录时间',
    eventPrice: '事件价格',
    orderClass: '订单类',
    protectionKind: '保护类型',
    candleSource: 'K线来源',
    background: '背景',
    keyArea: '关键位置',
    setupPremise: 'Setup 前提',
    signalBarType: 'Signal Bar',
    entryTrigger: '入场触发',
    triggerInvalidation: '触发失效',
    initialStopType: '初始止损类型',
    actualRiskPct: '实际风险%',
    positionLeverage: '仓位与杠杆',
    firstTarget: '第一目标',
    managementMode: 'Partial / Scalp / Swing',
    beCondition: 'BE 条件',
    earlyExit: '提前离场',
    reentryAddOn: 'Re-entry / Add-on',
    costFloor: '成本门槛',
    managementTemplate: '管理模板',
    premiseStrength: '前提强度',
    signalQuality: 'Signal Bar 质量',
    tradeTimeframeBias: '交易周期方向',
    tradeTimeframeStrength: '交易周期强弱',
    tradeTimeframeState: '交易周期状态',
    tradeTimeframeStateLabel: '交易周期状态说明',
    tradeTimeframeLatestH: '交易周期最新H',
    tradeTimeframeLatestL: '交易周期最新L',
    tradeTimeframeSignals: '交易周期信号',
    tradeSignalQuality: 'Signal Bar / 风险',
    tradeMicroDouble: '微双顶底',
    tradeNearestSupport: '交易周期近支撑',
    tradeNearestResistance: '交易周期近阻力',
    tradeTrPosition: '交易周期TR位置',
    tradeTrendPhase: '交易周期Gap阶段',
    tradeGapPhase: 'Gap 阶段',
    tradeOpenGaps: '未回补 Gap',
    tradeFilledGaps: '已回补 Gap',
    tradeMicroGaps: '微型 Gap',
    tradePreferredMm: '交易周期优先MM',
    tradePreferredMmLabel: '交易周期优先MM说明',
    runtimeStatus: 'Runtime状态',
    runtimeSignal: 'Runtime信号',
    runtimeCandidateStage: 'Runtime候选阶段',
    runtimeExecutionMode: 'Runtime执行模式',
    runtimeStrategy: 'Runtime策略',
    runtimeHasPlannedTrade: 'Runtime计划单',
    higherTimeframe: '大周期',
    higherTimeframeBias: '大周期方向',
    higherTimeframeBiasLabel: '大周期方向说明',
    higherTimeframeStrength: '大周期强弱',
    higherTimeframeState: '大周期状态',
    higherTimeframeStateLabel: '大周期状态说明',
    higherTimeframeBoundaries: '大周期边界',
    marketSymbol: '市场图品种',
    marketKind: '市场图类型',
    tradingViewDefaultExchange: '市场图默认交易所',
    tradingViewFullSymbol: '市场图完整符号',
  };
  return mapping[key] || key;
}

function formatMetaValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '-';
    if (Math.abs(value) >= 1000) return value.toFixed(2);
    if (Math.abs(value) >= 1) return value.toFixed(4);
    return value.toFixed(6);
  }
  if (typeof value === 'boolean') return value ? '是' : '否';
  return String(value);
}

function buildSignalGroups(signalButtons: TradeChartSignalSummaryItem[]): TradeChartSignalGroup[] {
  const groups = new Map<string, TradeChartSignalGroup>();
  signalButtons.forEach((item, index) => {
    const groupKey = String(item.groupKey || 'other');
    const groupLabel = String(item.groupLabel || '其他信号');
    const signalKey = item.key || item.label || String(index);
    const payload = { ...item, key: signalKey };
    const existing = groups.get(groupKey);
    if (existing) {
      existing.items.push(payload);
      return;
    }
    groups.set(groupKey, {
      key: groupKey,
      label: groupLabel,
      items: [payload],
    });
  });
  const order = new Map<string, number>(SIGNAL_GROUP_ORDER.map((key, index) => [key, index]));
  return Array.from(groups.values()).sort((left, right) => {
    const leftRank = order.get(left.key) ?? SIGNAL_GROUP_ORDER.length;
    const rightRank = order.get(right.key) ?? SIGNAL_GROUP_ORDER.length;
    if (leftRank !== rightRank) return leftRank - rightRank;
    return left.label.localeCompare(right.label, 'zh-CN');
  });
}

function buildDefaultSelectedSignalKeys(signalButtons: TradeChartSignalSummaryItem[]): string[] {
  const preferred = signalButtons
    .filter((item) => DEFAULT_ACTIVE_SIGNAL_GROUPS.has(String(item.groupKey || 'other')))
    .map((item, index) => item.key || item.label || String(index))
    .filter(Boolean);
  if (preferred.length > 0) {
    return Array.from(new Set(preferred)).slice(0, 18);
  }
  return signalButtons
    .slice(0, 10)
    .map((item, index) => item.key || item.label || String(index))
    .filter(Boolean);
}

function buildMetaSections(chart: TradeChartPayload | null): TradeChartMetaSection[] {
  const meta = chart?.focusMeta || {};
  const usedKeys = new Set<string>();
  const sections: TradeChartMetaSection[] = [];

  for (const definition of META_SECTION_DEFINITIONS) {
    const entries = definition.fields
      .filter((field) => meta[field] !== null && meta[field] !== undefined && meta[field] !== '')
      .map((field) => {
        usedKeys.add(field);
        return {
          key: field,
          label: labelForMeta(field),
          value: meta[field],
        };
      });
    if (entries.length === 0) continue;
    sections.push({
      key: definition.key,
      label: definition.label,
      description: definition.description,
      entries,
    });
  }

  const otherEntries = Object.entries(meta)
    .filter(([key, value]) => !usedKeys.has(key) && value !== null && value !== undefined && value !== '')
    .map(([key, value]) => ({
      key,
      label: labelForMeta(key),
      value,
    }));
  if (otherEntries.length) {
    sections.push({
      key: 'other',
      label: '其他上下文',
      description: '未归档到固定分区的补充上下文。',
      entries: otherEntries,
    });
  }

  return sections;
}

type SignalGuideCard = {
  title: string;
  toneClassName: string;
  points: string[];
};

function buildDefaultGuideCards(chart: TradeChartPayload | null): SignalGuideCard[] {
  const focusMeta = chart?.focusMeta || {};
  const tradeState = String(focusMeta.tradeTimeframeState || '').trim().toUpperCase() || 'TR';
  const higherBias = String(focusMeta.higherTimeframeBias || '').trim().toUpperCase() || '-';
  const latestH = String(focusMeta.tradeTimeframeLatestH || '').trim() || '无';
  const latestL = String(focusMeta.tradeTimeframeLatestL || '').trim() || '无';
  return [
    {
      title: `多头计数参考 · 最新 ${latestH}`,
      toneClassName: 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100',
      points: [
        '收盘在 EMA20 上方时，以多头偏置优先统计 H1、H2、H3。',
        '回调结束后向上恢复，才确认新的 H 计数，不在回调中途抢记。',
        '出现新的趋势高点后重置多头计数，避免把旧腿混进当前腿。',
        'H1/H2 先是结构计数；在顺势背景、signal bar 质量和 stop trigger 同时成立时，会升级成真实开仓机会。',
        '不是每个 H1/H2 都直接下单；主链还会继续检查背景、接受、盈亏比和保护位。',
        `当前交易周期状态：${tradeState}。1h 只做背景与边界，不单独触发开仓。`,
      ],
    },
    {
      title: `空头计数参考 · 最新 ${latestL}`,
      toneClassName: 'border-rose-400/25 bg-rose-500/10 text-rose-100',
      points: [
        '收盘在 EMA20 下方时，以空头偏置优先统计 L1、L2、L3。',
        '反弹结束后向下恢复，才确认新的 L 计数，不在反弹中途抢记。',
        '出现新的趋势低点后重置空头计数，避免旧腿延续污染当前 setup。',
        'L1/L2 先是结构计数；在 AIS/空头背景、bear signal bar 和 stop trigger 同时成立时，会升级成真实开仓机会。',
        '不是每个 L1/L2 都直接下单；主链还会继续检查背景、接受、盈亏比和保护位。',
        `当前大周期背景：${higherBias}。大周期只决定边界和顺逆势语义，不直接替代交易周期。`,
      ],
    },
  ];
}

function toneClassNameForSignal(item: TradeChartSignalSummaryItem | null | undefined): string {
  const label = String(item?.label || '').toUpperCase();
  if (label.includes('机会') && label.includes('等待')) return 'border-slate-400/25 bg-slate-500/10 text-slate-100';
  if (label.includes('机会')) return 'border-cyan-400/25 bg-cyan-500/10 text-cyan-100';
  if (label.includes('图表范围')) return 'border-indigo-400/25 bg-indigo-500/10 text-indigo-100';
  if (label.includes('H')) return 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100';
  if (label.includes('L')) return 'border-rose-400/25 bg-rose-500/10 text-rose-100';
  if (label.includes('MAG')) return 'border-amber-400/25 bg-amber-500/10 text-amber-100';
  if (label.includes('MM')) return 'border-cyan-400/25 bg-cyan-500/10 text-cyan-100';
  if (label.includes('1H') || label.includes('4H') || label.includes('1D')) return 'border-sky-400/25 bg-sky-500/10 text-sky-100';
  return 'border-indigo-400/25 bg-indigo-500/10 text-indigo-100';
}

function InteractiveTradeChart({
  chart,
  height,
  selectedSignalKeys,
  onRenderError,
}: {
  chart: TradeChartPayload;
  height: number;
  selectedSignalKeys: string[];
  onRenderError?: (message: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  function lineStyleFor(value: string | undefined) {
    if (value === 'solid') return LineStyle.Solid;
    if (value === 'dotted') return LineStyle.Dotted;
    return LineStyle.Dashed;
  }

  function lineWidthFor(value: number | undefined): 1 | 2 | 3 | 4 {
    if (value && value >= 4) return 4;
    if (value && value >= 3) return 3;
    if (value && value >= 2) return 2;
    return 1;
  }

  useEffect(() => {
    if (!containerRef.current || !chart.candles.length) {
      return;
    }

    const selectedKeys = new Set(selectedSignalKeys);
    const shouldRenderSignal = (signalKey: string | undefined) => {
      if (!signalKey) return true;
      if (selectedKeys.size === 0) return false;
      return selectedKeys.has(signalKey);
    };

    const visibleOverlayLines = (chart.overlayLines || []).filter((item) => shouldRenderSignal(item.signalKey));
    const visibleMarkers = (chart.markers || []).filter((item) => shouldRenderSignal(item.signalKey));
    const visiblePriceLines = (chart.priceLines || []).filter((item) => shouldRenderSignal(item.signalKey));

    const container = containerRef.current;
    let chartApi: ReturnType<typeof createChart> | null = null;
    let observer: ResizeObserver | null = null;

    try {
      chartApi = createChart(container, {
        width: container.clientWidth || 960,
        height,
        layout: {
          background: { type: ColorType.Solid, color: '#080d14' },
          textColor: '#cbd5e1',
          attributionLogo: false,
        },
        grid: {
          vertLines: { color: '#1f2937' },
          horzLines: { color: '#1f2937' },
        },
        crosshair: {
          mode: CrosshairMode.Magnet,
        },
        rightPriceScale: {
          borderColor: '#243040',
        },
        timeScale: {
          borderColor: '#243040',
          timeVisible: true,
          secondsVisible: false,
        },
      });

      const candleSeries = chartApi.addSeries(CandlestickSeries, {
        upColor: '#14b8a6',
        downColor: '#f43f5e',
        borderVisible: false,
        wickUpColor: '#14b8a6',
        wickDownColor: '#f43f5e',
      });
      candleSeries.setData(chart.candles.map((item) => ({ ...item, time: item.time as Time })));

      const emaSeries = chartApi.addSeries(LineSeries, {
        color: '#f59e0b',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
      });
      emaSeries.setData(chart.ema20.map((item) => ({ ...item, time: item.time as Time })));

      for (const overlay of visibleOverlayLines) {
        if (!overlay.points?.length) continue;
        const overlaySeries = chartApi.addSeries(LineSeries, {
          color: overlay.color,
          lineWidth: lineWidthFor(overlay.lineWidth),
          lineStyle: lineStyleFor(overlay.lineStyle),
          priceLineVisible: false,
          lastValueVisible: false,
          title: overlay.title,
        });
        overlaySeries.setData(overlay.points.map((item) => ({ ...item, time: item.time as Time })));
      }

      if (chart.volume?.length) {
        const volumeSeries = chartApi.addSeries(HistogramSeries, {
          priceFormat: { type: 'volume' },
          priceScaleId: 'volume',
          lastValueVisible: false,
          priceLineVisible: false,
        });
        volumeSeries.setData(chart.volume.map((item) => ({ ...item, time: item.time as Time })));
        chartApi.priceScale('volume').applyOptions({
          scaleMargins: {
            top: 0.78,
            bottom: 0,
          },
        });
      }

      if (visibleMarkers.length) {
        createSeriesMarkers(
          candleSeries,
          visibleMarkers.map((marker) => ({
            ...marker,
            time: marker.time as Time,
            size: marker.size ?? 1,
          })),
        );
      }

      for (const line of visiblePriceLines) {
        candleSeries.createPriceLine({
          price: line.price,
          color: line.color,
          title: line.title,
          lineWidth: lineWidthFor(line.lineWidth),
          lineStyle: lineStyleFor(line.lineStyle),
          axisLabelVisible: line.axisLabelVisible ?? true,
        });
      }

      chartApi.timeScale().fitContent();
      onRenderError?.('');

      observer = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry || !chartApi) return;
        const width = Math.max(320, Math.floor(entry.contentRect.width));
        chartApi.applyOptions({ width, height });
        chartApi.timeScale().fitContent();
      });
      observer.observe(container);
    } catch (error) {
      onRenderError?.(error instanceof Error ? error.message : '图表渲染失败');
    }

    return () => {
      observer?.disconnect();
      chartApi?.remove();
    };
  }, [chart, height, onRenderError, selectedSignalKeys]);

  return (
    <div
      ref={containerRef}
      className="w-full overflow-hidden rounded-lg border border-border bg-black/20"
      style={{ height }}
    />
  );
}

export function TradeChartPanel({
  eyebrow,
  title,
  badgeText,
  helperText,
  chart,
  loading,
  error,
  emptyText,
  onRefresh,
  refreshDisabled,
  refreshLabel = '生成图表',
  chartHeight = 820,
  timeframeOptions = [],
  selectedTimeframe,
  onSelectTimeframe,
  symbolOptions = [],
  selectedSymbol,
  onSelectSymbol,
}: TradeChartPanelProps) {
  const [renderError, setRenderError] = useState('');
  const [selectedSignalKeys, setSelectedSignalKeys] = useState<string[]>([]);
  const [chartMode, setChartMode] = useState<'strategy' | 'market'>('strategy');
  const signalGuideCards = useMemo(() => buildDefaultGuideCards(chart), [chart]);
  const signalButtons = chart?.signalSummary || [];
  const groupedSignalButtons = useMemo(() => buildSignalGroups(signalButtons), [signalButtons]);
  const metaSections = useMemo(() => buildMetaSections(chart), [chart]);

  useEffect(() => {
    if (!signalButtons.length) {
      setSelectedSignalKeys([]);
      return;
    }
    setSelectedSignalKeys((current) => current.filter((key) => signalButtons.some((item) => (item.key || item.label || '') === key)));
  }, [signalButtons]);

  useEffect(() => {
    setSelectedSignalKeys(buildDefaultSelectedSignalKeys(signalButtons));
  }, [chart?.symbol, chart?.timeframe, chart?.focusTitle]);

  useEffect(() => {
    setChartMode('strategy');
  }, [chart?.symbol, chart?.focusTitle]);

  const selectedSignalCards = useMemo(
    () =>
      signalButtons
        .filter((item) => selectedSignalKeys.includes(item.key || item.label || ''))
        .map((item) => ({
          key: item.key || item.label || '',
          title: item.detailTitle || item.label,
          toneClassName: toneClassNameForSignal(item),
          points: item.detailLines || [],
        })),
    [selectedSignalKeys, signalButtons],
  );

  const marketChartSymbol = useMemo(
    () => normalizeChartSymbol(String((chart?.focusMeta?.marketSymbol as string) || chart?.symbol || '')),
    [chart],
  );
  const marketChartExchangeHint = useMemo(
    () => String((chart?.focusMeta?.tradingViewDefaultExchange as string) || '').trim().toUpperCase(),
    [chart],
  );
  const canRenderStrategyChart = Boolean(chart?.candles?.length);
  const canRenderMarketChart = Boolean(marketChartSymbol);
  const normalizedSymbolOptions = useMemo(
    () =>
      Array.from(
        new Set(
          symbolOptions
            .map((item) => normalizeChartSymbol(String(item || '')))
            .filter(Boolean),
        ),
      ),
    [symbolOptions],
  );
  const activeSymbol = normalizeChartSymbol(selectedSymbol || normalizedSymbolOptions[0] || marketChartSymbol || chart?.symbol || '');
  const defaultSymbolPool = useMemo(() => {
    const preferredBucket = classifySymbolBucket(activeSymbol || marketChartSymbol || chart?.symbol || '');
    const secondaryBucket = preferredBucket === 'crypto' ? 'forex' : 'crypto';
    return [...DEFAULT_MONITORED_SYMBOLS[preferredBucket], ...DEFAULT_MONITORED_SYMBOLS[secondaryBucket]];
  }, [activeSymbol, chart?.symbol, marketChartSymbol]);
  const quickSymbolOptions = useMemo(
    () => Array.from(new Set([activeSymbol, marketChartSymbol, ...normalizedSymbolOptions, ...defaultSymbolPool].filter(Boolean))),
    [activeSymbol, defaultSymbolPool, marketChartSymbol, normalizedSymbolOptions],
  );
  const groupedQuickSymbols = useMemo(
    () => ({
      crypto: quickSymbolOptions.filter((symbol) => classifySymbolBucket(symbol) === 'crypto'),
      forex: quickSymbolOptions.filter((symbol) => classifySymbolBucket(symbol) === 'forex'),
    }),
    [quickSymbolOptions],
  );
  const hasSymbolSwitcher = quickSymbolOptions.length > 0 && typeof onSelectSymbol === 'function';

  function toggleSignalKey(signalKey: string) {
    setSelectedSignalKeys((current) =>
      current.includes(signalKey) ? current.filter((item) => item !== signalKey) : [...current, signalKey],
    );
  }

  return (
    <div className={TABLE_CLASS}>
      <div className="border-b border-[#17212b] px-3 py-2.5">
        <div className="text-[10px] uppercase tracking-[0.22em] text-foreground-faint">{eyebrow}</div>
        <div className="mt-1.5 flex items-center justify-between gap-2.5">
          <div className="min-w-0">
            <div className="truncate text-sm text-foreground">{title}</div>
            {helperText ? <div className="mt-1 text-xs text-foreground-faint">{helperText}</div> : null}
          </div>
          <div className="flex items-center gap-2">
            {badgeText ? <TerminalBadge>{badgeText}</TerminalBadge> : null}
            {onRefresh ? (
              <button
                type="button"
                className={BUTTON_ACCENT_CLASS}
                disabled={Boolean(refreshDisabled)}
                onClick={onRefresh}
              >
                {loading ? <RefreshCw className="size-4 animate-spin" /> : <ImageIcon className="size-4" />}
                {refreshLabel}
              </button>
            ) : null}
          </div>
        </div>
        <div className="mt-2.5 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {canRenderStrategyChart || canRenderMarketChart ? (
              <div className="flex items-center gap-1 rounded-full border border-border bg-white/[0.03] p-1">
                <button
                  type="button"
                  className={cn(
                    'rounded-full px-3 py-1 text-[11px] transition',
                    chartMode === 'strategy'
                      ? 'bg-cyan-400/12 text-cyan-100'
                      : 'text-foreground-faint hover:text-foreground',
                  )}
                  onClick={() => setChartMode('strategy')}
                >
                  策略图
                </button>
                <button
                  type="button"
                  className={cn(
                    'rounded-full px-3 py-1 text-[11px] transition',
                    chartMode === 'market'
                      ? 'bg-amber-400/12 text-amber-200'
                      : 'text-foreground-faint hover:text-foreground',
                  )}
                  onClick={() => setChartMode('market')}
                  disabled={!canRenderMarketChart}
                >
                  市场图
                </button>
              </div>
            ) : null}
            {hasSymbolSwitcher ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-white/[0.03] px-2 py-1">
                <div className="text-[10px] uppercase tracking-[0.18em] text-foreground-faint">实盘品种</div>
                <select
                  value={activeSymbol}
                  onChange={(event) => onSelectSymbol?.(event.target.value)}
                  className="rounded-full border border-border bg-black/20 px-2.5 py-0.5 text-[11px] text-foreground outline-none transition focus:border-cyan-400/35"
                >
                  {quickSymbolOptions.map((symbol) => (
                    <option key={symbol} value={symbol}>
                      {symbol}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {timeframeOptions.length > 0 && onSelectTimeframe ? (
              <div className="flex flex-wrap items-center gap-1">
                {timeframeOptions.map((timeframe) => {
                  const active = timeframe === selectedTimeframe;
                  return (
                    <button
                      key={timeframe}
                      type="button"
                      className={cn(
                        'rounded-full border px-2.5 py-0.5 text-[11px] transition',
                        active
                          ? 'border-cyan-400/45 bg-cyan-400/12 text-cyan-100'
                          : 'border-border bg-white/[0.03] text-foreground-faint hover:border-cyan-400/25 hover:text-foreground',
                      )}
                      onClick={() => onSelectTimeframe(timeframe)}
                    >
                      {timeframe}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
          {hasSymbolSwitcher ? (
            <div className="rounded-lg border border-border bg-white/[0.025] px-2.5 py-2">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-[10px] uppercase tracking-[0.18em] text-foreground-faint">
                <span>交易池快捷切换</span>
                <span>{quickSymbolOptions.length} 个可切换品种</span>
              </div>
              <div className="space-y-2">
                {(['crypto', 'forex'] as const).map((bucket) => (
                  <div key={bucket} className="rounded-lg border border-border bg-black/10 px-2 py-1.5">
                    <div className="mb-1 text-[10px] uppercase tracking-[0.16em] text-foreground-faint">
                      {bucket === 'crypto' ? '加密' : '外汇'}
                    </div>
                    <div className="flex max-h-[60px] flex-wrap gap-1 overflow-y-auto pr-1">
                      {groupedQuickSymbols[bucket].map((symbol) => {
                        const quickActive = symbol === activeSymbol;
                        return (
                          <button
                            key={`${bucket}_${symbol}`}
                            type="button"
                            className={cn(
                              'rounded-full border px-2 py-0.5 text-[10px] transition',
                              quickActive
                                ? 'border-cyan-400/40 bg-cyan-400/12 text-cyan-100'
                                : 'border-border bg-white/[0.04] text-foreground-faint hover:border-cyan-400/25 hover:text-foreground',
                            )}
                            onClick={() => onSelectSymbol?.(symbol)}
                          >
                            {symbol}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex flex-col gap-2 p-2.5">
        {error || renderError ? (
          <div className="rounded-lg border border-rose-400/18 bg-rose-400/8 px-4 py-3 text-sm text-rose-100">
            {error || renderError}
          </div>
        ) : null}
        {canRenderStrategyChart || canRenderMarketChart ? (
          <>
            {chartMode === 'market' && canRenderMarketChart ? (
              <TradingViewMarketChart
                symbol={selectedSymbol || marketChartSymbol}
                exchangeHint={marketChartExchangeHint}
                timeframe={selectedTimeframe || chart?.timeframe || '15m'}
                height={chartHeight}
                availableSymbols={normalizedSymbolOptions}
                onSymbolChange={onSelectSymbol}
              />
            ) : chart ? (
              <InteractiveTradeChart
                chart={chart}
                height={chartHeight}
                selectedSignalKeys={selectedSignalKeys}
                onRenderError={setRenderError}
              />
            ) : null}
            <div className="text-xs text-foreground-faint">
              {chartMode === 'market'
                ? `${chart?.focusTitle || ''} | 市场图用于叠加社区指标和原始行情对照；策略识别仍以策略图为准。`
                : chart?.focusTitle}
            </div>
            {chartMode === 'strategy' && groupedSignalButtons.length ? (
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-1 text-[10px] text-foreground-faint">
                  <button
                    type="button"
                    className="rounded-full border border-border px-1.5 py-0.5 transition hover:border-cyan-400/25 hover:text-foreground"
                    onClick={() => setSelectedSignalKeys(signalButtons.map((item, index) => item.key || item.label || String(index)))}
                  >
                    全选
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-border px-1.5 py-0.5 transition hover:border-cyan-400/25 hover:text-foreground"
                    onClick={() => setSelectedSignalKeys([])}
                  >
                    清空
                  </button>
                  <div>默认先展示关键 Brooks 信号，其他图层按组补开，便于逐个截图校准。</div>
                </div>
                <div className="grid gap-1 md:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
                  {groupedSignalButtons.map((group) => {
                    const groupKeys = group.items.map((item, index) => item.key || item.label || `${group.key}_${index}`);
                    const activeCount = groupKeys.filter((signalKey) => selectedSignalKeys.includes(signalKey)).length;
                    return (
                      <div key={group.key} className="rounded-lg border border-border bg-white/[0.02] px-2 py-1.5">
                        <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
                          <div className="flex items-center gap-2">
                            <div className="text-[10px] font-medium text-foreground">{group.label}</div>
                            <TerminalBadge kind={activeCount > 0 ? 'info' : 'neutral'}>
                              {activeCount}/{group.items.length}
                            </TerminalBadge>
                          </div>
                          <div className="flex flex-wrap items-center gap-1 text-[10px] text-foreground-faint">
                            <button
                              type="button"
                              className="rounded-full border border-border px-1.5 py-0.5 leading-none transition hover:border-cyan-400/25 hover:text-foreground"
                              onClick={() =>
                                setSelectedSignalKeys((current) => Array.from(new Set([...current, ...groupKeys])))
                              }
                            >
                              全选本组
                            </button>
                            <button
                              type="button"
                              className="rounded-full border border-border px-1.5 py-0.5 leading-none transition hover:border-cyan-400/25 hover:text-foreground"
                              onClick={() =>
                                setSelectedSignalKeys((current) => current.filter((item) => !groupKeys.includes(item)))
                              }
                            >
                              清空本组
                            </button>
                          </div>
                        </div>
                        <div className="flex max-h-[72px] flex-wrap gap-1 overflow-y-auto pr-1">
                          {group.items.map((item, index) => {
                            const signalKey = item.key || item.label || `${group.key}_${index}`;
                            const active = selectedSignalKeys.includes(signalKey);
                            return (
                              <button
                                key={`${signalKey}_${index}`}
                                type="button"
                                onClick={() => toggleSignalKey(signalKey)}
                                className={cn(
                                  'inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] leading-none transition',
                                  active
                                    ? 'border-cyan-400/40 bg-cyan-400/12 text-cyan-100'
                                    : 'border-border bg-white/[0.04] text-foreground-faint hover:border-cyan-400/25 hover:text-foreground',
                                )}
                              >
                                <span className="mr-1.5 size-1.5 rounded-full" style={{ backgroundColor: item.color || '#94a3b8' }} />
                                {item.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null}
            {chartMode === 'strategy' && selectedSignalCards.length ? (
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {selectedSignalCards.map((card) => (
                  <div key={card.key} className={`rounded-lg border px-3 py-3 ${card.toneClassName}`}>
                    <div className="text-xs font-medium">{card.title}</div>
                    <div className="mt-2 space-y-1 text-[11px] leading-5 opacity-90">
                      {card.points.map((point) => (
                        <div key={`${card.key}_${point}`}>{point}</div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : chartMode === 'strategy' && signalGuideCards.length ? (
              <div className="rounded-lg border border-border bg-white/[0.02] px-3 py-3 text-[11px] leading-5 text-foreground-faint">
                已默认打开一组关键 Brooks 信号。若要做精细比对，再按组补开其它图层。
              </div>
            ) : chartMode === 'market' ? (
              <div className="rounded-lg border border-border bg-white/[0.02] px-3 py-3 text-[11px] leading-5 text-foreground-faint">
                市场图保留 TradingView 的原始行情交互，适合对照社区指标、切换交易所符号和查看更长历史；计划入场、实际成交、回测事件与 Brooks 信号仍由策略图统一承载。
              </div>
            ) : null}
            {metaSections.length ? (
              <div className="space-y-3">
                {metaSections.map((section) => (
                  <div key={section.key} className="rounded-lg border border-border bg-white/[0.02] px-3 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-[11px] font-medium text-foreground">{section.label}</div>
                      <TerminalBadge>{section.entries.length} 项</TerminalBadge>
                    </div>
                    {section.description ? (
                      <div className="mt-2 text-[11px] leading-5 text-foreground-faint">{section.description}</div>
                    ) : null}
                    <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                      {section.entries.map((entry) => (
                        <div key={`${section.key}_${entry.key}`} className="rounded-lg border border-border bg-black/10 px-3 py-2">
                          <div className="text-[10px] uppercase tracking-[0.16em] text-foreground-faint">{entry.label}</div>
                          <div className="mt-1 break-all text-sm text-foreground">{formatMetaValue(entry.value)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-foreground-faint">
            {emptyText}
          </div>
        )}
      </div>
    </div>
  );
}
