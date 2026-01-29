/**
 * 图表策略标记组件
 * 在 K 线图上标记出匹配的策略信号
 */

import * as React from "react";
import { createSeriesMarkers, ISeriesMarkersPluginApi, Time } from "lightweight-charts";
import type { IChartApi, ISeriesApi } from "lightweight-charts";

export interface StrategyMarker {
  time: number;  // 秒级时间戳
  position: "aboveBar" | "belowBar";
  color: string;
  shape: "arrowUp" | "arrowDown" | "circle";
  text: string;
  size?: number;
}

interface ChartStrategyMarkersProps {
  chart: IChartApi | null;
  series: ISeriesApi<"Candlestick"> | null;
  markers: StrategyMarker[];
}

export const ChartStrategyMarkers: React.FC<ChartStrategyMarkersProps> = ({
  chart,
  series,
  markers,
}) => {
  const markersPluginRef = React.useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  React.useEffect(() => {
    if (!series || !chart) return;

    // 创建标记插件
    const markersPlugin = createSeriesMarkers(series, []);
    markersPluginRef.current = markersPlugin;

    return () => {
      // 清理
      markersPluginRef.current = null;
    };
  }, [series, chart]);

  React.useEffect(() => {
    if (!markersPluginRef.current) return;

    // 转换并设置标记
    const chartMarkers = markers.map(m => ({
      time: m.time as Time,
      position: m.position,
      color: m.color,
      shape: m.shape,
      text: m.text,
      size: m.size || 2,
    }));

    markersPluginRef.current.setMarkers(chartMarkers);
  }, [markers]);

  return null; // 这是一个逻辑组件，不渲染 DOM
};

/**
 * 根据策略生成标记
 */
export function generateStrategyMarkers(
  strategies: Array<{
    name: string;
    confidence: number;
    direction: "BUY" | "SELL" | "NEUTRAL";
    timestamp?: number;
  }>,
  currentPrice: number,
  chartTimeRange: { start: number; end: number }
): StrategyMarker[] {
  const markers: StrategyMarker[] = [];

  for (const strategy of strategies) {
    // 如果没有时间戳，使用当前时间
    const time = strategy.timestamp || Math.floor(Date.now() / 1000);
    
    // 确保时间在图表范围内
    if (time < chartTimeRange.start || time > chartTimeRange.end) {
      continue;
    }

    const isBuy = strategy.direction === "BUY";
    
    markers.push({
      time,
      position: isBuy ? "belowBar" : "aboveBar",
      color: isBuy ? "#10B981" : "#EF4444",
      shape: isBuy ? "arrowUp" : "arrowDown",
      text: strategy.name,
      size: Math.min(Math.max(strategy.confidence / 20, 1), 3), // 根据置信度调整大小
    });
  }

  return markers;
}

/**
 * 从后端信号生成标记
 */
export function generateSignalMarkers(
  signals: Array<{
    timestamp: number;
    direction: "BUY" | "SELL" | "ALERT";
    signal_name: string;
    symbol: string;
  }>
): StrategyMarker[] {
  return signals.map(s => ({
    time: Math.floor(s.timestamp / 1000),
    position: s.direction === "BUY" ? "belowBar" : "aboveBar",
    color: s.direction === "BUY" ? "#10B981" : s.direction === "SELL" ? "#EF4444" : "#F59E0B",
    shape: s.direction === "BUY" ? "arrowUp" : s.direction === "SELL" ? "arrowDown" : "circle",
    text: s.signal_name,
    size: 2,
  }));
}
