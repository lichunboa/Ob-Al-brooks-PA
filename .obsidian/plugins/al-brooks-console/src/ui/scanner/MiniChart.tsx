import * as React from "react";
import { createChart, ColorType, CandlestickSeries } from "lightweight-charts";
import type { IChartApi, CandlestickData, Time, ISeriesApi } from "lightweight-charts";

interface MiniChartProps {
    symbol: string;
    apiHost: string;
    interval?: string;
    height?: number;
}

interface CandleData {
    // 后端返回的实际字段名
    open_time: string; // ISO 字符串格式 "2026-01-26T17:28:00+00:00"
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
}

export const MiniChart: React.FC<MiniChartProps> = ({
    symbol,
    apiHost,
    interval = "1h",
    height = 120
}) => {
    const chartContainerRef = React.useRef<HTMLDivElement>(null);
    const chartRef = React.useRef<IChartApi | null>(null);
    const seriesRef = React.useRef<ISeriesApi<"Candlestick"> | null>(null);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState<string | null>(null);

    // 初始化图表
    React.useEffect(() => {
        if (!chartContainerRef.current) return;

        // 创建图表
        const chart = createChart(chartContainerRef.current, {
            width: chartContainerRef.current.clientWidth,
            height: height,
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: 'var(--text-muted)',
            },
            grid: {
                vertLines: { visible: false },
                horzLines: { color: 'rgba(128, 128, 128, 0.1)' },
            },
            rightPriceScale: {
                visible: false,
            },
            timeScale: {
                visible: false,
                borderVisible: false,
            },
            crosshair: {
                mode: 0, // Disabled
            },
            handleScroll: false,
            handleScale: false,
        });

        // Lightweight Charts v5 新 API: 使用 addSeries 替代 addCandlestickSeries
        const candleSeries = chart.addSeries(CandlestickSeries, {
            upColor: '#10B981',
            downColor: '#EF4444',
            borderDownColor: '#EF4444',
            borderUpColor: '#10B981',
            wickDownColor: '#EF4444',
            wickUpColor: '#10B981',
        });

        chartRef.current = chart;
        seriesRef.current = candleSeries;

        // 响应容器大小变化
        const resizeObserver = new ResizeObserver(() => {
            if (chartContainerRef.current && chartRef.current) {
                try {
                    chart.applyOptions({
                        width: chartContainerRef.current.clientWidth
                    });
                } catch (e) {
                    // Chart might be disposed
                }
            }
        });
        resizeObserver.observe(chartContainerRef.current);

        return () => {
            resizeObserver.disconnect();
            chartRef.current = null;
            seriesRef.current = null;
            chart.remove();
        };
    }, [height]);

    // 获取数据
    React.useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            setError(null);

            try {
                const res = await fetch(`${apiHost}/api/v1/candles/${symbol}?limit=50&interval=${interval}`);
                if (!res.ok) {
                    throw new Error(`HTTP ${res.status}`);
                }
                const data: CandleData[] = await res.json();

                if (data && data.length > 0 && seriesRef.current) {
                    // 后端返回的数据是降序的（最新在前），需要反转为升序
                    const sortedData = [...data].reverse();

                    // 转换为 Lightweight Charts 格式
                    const chartData: CandlestickData[] = sortedData.map(candle => {
                        // 将 ISO 字符串转换为 Unix 秒时间戳
                        const timestamp = Math.floor(new Date(candle.open_time).getTime() / 1000);
                        return {
                            time: timestamp as Time,
                            open: candle.open,
                            high: candle.high,
                            low: candle.low,
                            close: candle.close,
                        };
                    });

                    seriesRef.current.setData(chartData);
                    chartRef.current?.timeScale().fitContent();
                }
                setLoading(false);
            } catch (e: any) {
                console.error(`[MiniChart] Failed to fetch ${symbol}:`, e);
                setError(e.message || "获取数据失败");
                setLoading(false);
            }
        };

        fetchData();

        // 定时刷新
        const intervalId = setInterval(fetchData, 60000); // 每分钟刷新
        return () => clearInterval(intervalId);
    }, [symbol, apiHost, interval]);

    return (
        <div style={{ position: "relative", width: "100%", height }}>
            {loading && (
                <div style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(0,0,0,0.3)",
                    color: "var(--text-muted)",
                    fontSize: "0.8em",
                    borderRadius: 4
                }}>
                    加载中...
                </div>
            )}
            {error && (
                <div style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(239, 68, 68, 0.1)",
                    color: "#EF4444",
                    fontSize: "0.75em",
                    borderRadius: 4
                }}>
                    {error}
                </div>
            )}
            <div ref={chartContainerRef} style={{ width: "100%", height: "100%" }} />
        </div>
    );
};
