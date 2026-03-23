'use client';

import React, { useEffect, useMemo, useRef } from 'react';
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
import { BUTTON_ACCENT_CLASS, TABLE_CLASS, TerminalBadge } from './console/ui';

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
};

export type TradeChartPriceLine = {
  price: number;
  color: string;
  title: string;
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
  focusMeta?: Record<string, unknown>;
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
};

function labelForMeta(key: string): string {
  const mapping: Record<string, string> = {
    strategy: '策略',
    playbookId: 'Playbook',
    playbookFamily: '策略族',
    direction: '方向',
    entryTime: '开仓时间',
    exitTime: '平仓时间',
    entryPrice: '开仓价',
    exitPrice: '平仓价',
    stopLoss: '止损',
    takeProfit: '止盈',
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

function InteractiveTradeChart({ chart }: { chart: TradeChartPayload }) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!containerRef.current || !chart.candles.length) {
      return;
    }

    const container = containerRef.current;
    const chartApi = createChart(container, {
      width: container.clientWidth || 960,
      height: 420,
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
      upColor: '#22c55e',
      downColor: '#f97316',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#f97316',
    });
    candleSeries.setData(chart.candles.map((item) => ({ ...item, time: item.time as Time })));

    const emaSeries = chartApi.addSeries(LineSeries, {
      color: '#2dd4bf',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    emaSeries.setData(chart.ema20.map((item) => ({ ...item, time: item.time as Time })));

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

    if (chart.markers?.length) {
      createSeriesMarkers(
        candleSeries,
        chart.markers.map((marker) => ({
          ...marker,
          time: marker.time as Time,
          size: 1,
        })),
      );
    }

    for (const line of chart.priceLines || []) {
      candleSeries.createPriceLine({
        price: line.price,
        color: line.color,
        title: line.title,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
      });
    }

    chartApi.timeScale().fitContent();

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const width = Math.max(320, Math.floor(entry.contentRect.width));
      chartApi.applyOptions({ width });
      chartApi.timeScale().fitContent();
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chartApi.remove();
    };
  }, [chart]);

  return <div ref={containerRef} className="h-[420px] w-full overflow-hidden rounded-[14px] border border-white/[0.08] bg-black/20" />;
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
}: TradeChartPanelProps) {
  const metaEntries = useMemo(
    () =>
      Object.entries(chart?.focusMeta || {}).filter(([, value]) => value !== null && value !== undefined && value !== ''),
    [chart],
  );

  return (
    <div className={TABLE_CLASS}>
      <div className="border-b border-[#17212b] px-4 py-3">
        <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{eyebrow}</div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm text-white">{title}</div>
            {helperText ? <div className="mt-1 text-xs text-slate-500">{helperText}</div> : null}
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
                {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
                {refreshLabel}
              </button>
            ) : null}
          </div>
        </div>
      </div>
      <div className="space-y-3 p-4">
        {error ? (
          <div className="rounded-[14px] border border-rose-400/18 bg-rose-400/8 px-4 py-3 text-sm text-rose-100">{error}</div>
        ) : null}
        {chart?.candles?.length ? (
          <>
            <InteractiveTradeChart chart={chart} />
            <div className="text-xs text-slate-500">{chart.focusTitle}</div>
            {metaEntries.length ? (
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {metaEntries.map(([key, value]) => (
                  <div key={key} className="rounded-[12px] border border-white/[0.08] bg-white/[0.02] px-3 py-2">
                    <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">{labelForMeta(key)}</div>
                    <div className="mt-1 break-all text-sm text-slate-200">{formatMetaValue(value)}</div>
                  </div>
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div className="rounded-[14px] border border-dashed border-white/[0.08] px-4 py-10 text-center text-sm text-slate-500">
            {emptyText}
          </div>
        )}
      </div>
    </div>
  );
}
