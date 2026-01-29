'use client';

import React, { useEffect, useRef, useState } from 'react';
import { 
  createChart, 
  IChartApi, 
  ISeriesApi, 
  CandlestickSeries, 
  Time,
  createSeriesMarkers,
  ISeriesMarkersPluginApi,
} from 'lightweight-charts';
import { Candle, ChartSignal, TimeFrame } from '@/types';

interface TradingViewChartProps {
  symbol: string;
  interval: TimeFrame;
  candles: Candle[];
  signals?: ChartSignal[];
  onTimeFrameChange?: (tf: TimeFrame) => void;
  className?: string;
}

// 时间框架配置
const TIMEFRAME_CONFIG: Record<TimeFrame, { label: string; seconds: number }> = {
  '1m': { label: '1分', seconds: 60 },
  '5m': { label: '5分', seconds: 300 },
  '15m': { label: '15分', seconds: 900 },
  '30m': { label: '30分', seconds: 1800 },
  '1h': { label: '1小时', seconds: 3600 },
  '4h': { label: '4小时', seconds: 14400 },
  '1d': { label: '日线', seconds: 86400 },
  '1w': { label: '周线', seconds: 604800 },
  '1M': { label: '月线', seconds: 2592000 },
};

export const TradingViewChart: React.FC<TradingViewChartProps> = ({
  symbol,
  interval,
  candles,
  signals = [],
  onTimeFrameChange,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const markersPluginRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const [isReady, setIsReady] = useState(false);

  // 初始化图表
  useEffect(() => {
    if (!containerRef.current || chartRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: '#0f172a' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: '#1e293b' },
        horzLines: { color: '#1e293b' },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: '#475569',
          width: 1,
          style: 2,
          labelBackgroundColor: '#475569',
        },
        horzLine: {
          color: '#475569',
          width: 1,
          style: 2,
          labelBackgroundColor: '#475569',
        },
      },
      rightPriceScale: {
        borderColor: '#1e293b',
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
      },
      timeScale: {
        borderColor: '#1e293b',
        timeVisible: true,
        secondsVisible: interval === '1m' || interval === '5m',
      },
      handleScroll: {
        vertTouchDrag: false,
      },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#ef4444',
    });

    // 初始化 markers 插件
    const markersPlugin = createSeriesMarkers(series, []);
    markersPluginRef.current = markersPlugin;

    chartRef.current = chart;
    seriesRef.current = series;
    setIsReady(true);

    // 响应式调整
    const handleResize = () => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      markersPlugin.detach();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      markersPluginRef.current = null;
      setIsReady(false);
    };
  }, [interval]);

  // 更新 K 线数据
  useEffect(() => {
    if (!seriesRef.current || !candles || candles.length === 0) return;

    const chartData = candles.map(c => ({
      time: Math.floor(c.time) as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    seriesRef.current.setData(chartData);
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  // 更新信号标记 - Lightweight Charts v5 使用 createSeriesMarkers
  useEffect(() => {
    if (!markersPluginRef.current || !isReady || !signals) return;

    const chartSignals = signals.map(signal => ({
      time: Math.floor(signal.time) as Time,
      position: signal.position as 'aboveBar' | 'belowBar' | 'inBar',
      color: signal.color,
      shape: signal.shape as 'arrowUp' | 'arrowDown' | 'circle' | 'square',
      text: signal.text,
      size: signal.size || 2,
    }));

    markersPluginRef.current.setMarkers(chartSignals);
    console.log('[Chart] Markers updated:', chartSignals.length);
  }, [signals, isReady]);

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* 工具栏 */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold text-white">{symbol}</h2>
          <span className="text-sm text-slate-400">{TIMEFRAME_CONFIG[interval]?.label || interval}</span>
        </div>
        
        {/* 时间框架选择器 */}
        <div className="flex items-center gap-1">
          {(Object.keys(TIMEFRAME_CONFIG) as TimeFrame[]).map((tf) => (
            <button
              key={tf}
              onClick={() => onTimeFrameChange?.(tf)}
              className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
                interval === tf
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {TIMEFRAME_CONFIG[tf].label}
            </button>
          ))}
        </div>
      </div>

      {/* 图表容器 */}
      <div ref={containerRef} className="flex-1 min-h-0" />
    </div>
  );
};

export default TradingViewChart;
