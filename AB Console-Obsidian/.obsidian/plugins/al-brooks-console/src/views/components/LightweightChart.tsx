import * as React from "react";
import { createChart, IChartApi, ISeriesApi, CandlestickData, Time, CandlestickSeries } from "lightweight-charts";
import { useChartData } from "../../hooks/useChartData";
import type { BackendSettings } from "../../settings";

export interface ChartSignal {
  time: number;
  position: "aboveBar" | "belowBar";
  color: string;
  shape: "arrowUp" | "arrowDown" | "circle";
  text: string;
  size?: number;
}

interface LightweightChartProps {
  symbol: string;
  interval: string;
  height?: number;
  backend: BackendSettings;
  showSignals?: boolean;
  signals?: ChartSignal[];
  strategyMarkers?: ChartSignal[];
}

export const LightweightChart: React.FC<LightweightChartProps> = ({
  symbol,
  interval,
  height = 400,
  backend,
  showSignals = true,
  signals: externalSignals = [],
  strategyMarkers = [],
}) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<IChartApi | null>(null);
  const seriesRef = React.useRef<ISeriesApi<"Candlestick"> | null>(null);
  const markersPluginRef = React.useRef<any>(null);
  const lastDataHashRef = React.useRef<string>("");
  
  const { data: marketData, isLoading } = useChartData({
    backend,
    symbol,
    interval,
    autoRefresh: true,
  });

  // 初始化图表
  React.useEffect(() => {
    if (!containerRef.current || chartRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { color: "transparent" },
        textColor: "var(--text-muted)",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "var(--background-modifier-border)", style: 2 },
        horzLines: { color: "var(--background-modifier-border)", style: 2 },
      },
      crosshair: { 
        mode: 1, 
        horzLine: { visible: true, labelVisible: true }, 
        vertLine: { visible: true, labelVisible: true } 
      },
      rightPriceScale: { 
        borderColor: "var(--background-modifier-border)",
        autoScale: true,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      leftPriceScale: { visible: false },
      timeScale: { 
        borderColor: "var(--background-modifier-border)",
        timeVisible: interval === "1m" || interval === "5m" || interval === "15m",
        secondsVisible: false,
        rightOffset: 5,
        barSpacing: 6,
      },
      handleScroll: { 
        vertTouchDrag: false, 
        mouseWheel: true, 
        pressedMouseMove: true 
      },
      handleScale: { 
        mouseWheel: true, 
        pinch: true,
        axisPressedMouseMove: true,
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#10B981",
      downColor: "#EF4444",
      borderVisible: false,
      wickUpColor: "#10B981",
      wickDownColor: "#EF4444",
    });
    
    seriesRef.current = candleSeries;
    chartRef.current = chart;

    // 添加标记插件
    if (showSignals) {
      try {
        const { createSeriesMarkers } = require("lightweight-charts");
        markersPluginRef.current = createSeriesMarkers(candleSeries, []);
      } catch (e) {
        // 静默处理
      }
    }

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      markersPluginRef.current = null;
    };
  }, [symbol, interval, showSignals]);

  // 更新数据
  React.useEffect(() => {
    if (!seriesRef.current || !marketData?.candles?.length) return;

    const candles = marketData.candles;
    const lastCandle = candles[candles.length - 1];
    // 使用 lastUpdate 时间戳确保每次数据更新都能触发图表刷新
    const dataHash = `${candles.length}-${marketData.lastUpdate}-${lastCandle?.openTime}-${lastCandle?.close}`;

    if (dataHash === lastDataHashRef.current) return;

    const isFirstLoad = !lastDataHashRef.current;
    lastDataHashRef.current = dataHash;

    const chartData: CandlestickData<Time>[] = candles.map(c => ({
      time: Math.floor(c.openTime / 1000) as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    try {
      seriesRef.current.setData(chartData);
      // 只在首次加载时 fitContent，避免用户滚动后被重置
      if (isFirstLoad) {
        chartRef.current?.timeScale().fitContent();
      }
    } catch {
      // 静默处理
    }
  }, [marketData]);

  // 更新标记（信号 + 策略）
  React.useEffect(() => {
    if (!markersPluginRef.current) return;

    // 合并信号和策略标记
    const allMarkers = [
      ...(externalSignals || []),
      ...(strategyMarkers || []),
    ].map(m => ({
      time: m.time as Time,
      position: m.position,
      color: m.color,
      shape: m.shape,
      text: m.text,
      size: m.size || 2,
    }));

    try {
      markersPluginRef.current.setMarkers(allMarkers);
    } catch {
      // 静默处理
    }
  }, [externalSignals, strategyMarkers]);

  // Resize 防抖
  React.useEffect(() => {
    let timer: number;
    const handleResize = () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        if (chartRef.current && containerRef.current) {
          const rect = containerRef.current.getBoundingClientRect();
          chartRef.current.applyOptions({ width: rect.width, height: rect.height });
        }
      }, 100);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      clearTimeout(timer);
    };
  }, []);

  if (isLoading && !marketData) {
    return (
      <div style={{ 
        width: "100%", 
        height: "100%", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center",
        color: "var(--text-muted)"
      }}>
        加载中...
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", minHeight: 200 }} />
  );
};
