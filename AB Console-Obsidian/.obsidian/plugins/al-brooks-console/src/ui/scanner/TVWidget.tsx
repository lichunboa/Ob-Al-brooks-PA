import * as React from "react";

interface TVMiniChartProps {
    symbol: string;
    height?: number;
    width?: string;
    colorTheme?: "dark" | "light";
    isTransparent?: boolean;
    dateRange?: "1D" | "1M" | "3M" | "12M" | "60M" | "ALL";
    trendLineColor?: string;
    underLineColor?: string;
    underLineBottomColor?: string;
    locale?: string;
}

/**
 * TradingView MiniChart Widget
 * 
 * 使用 TradingView 官方 Widget，数据由 TradingView 提供。
 * Premium 会员可以在 TradingView 设置中去除水印。
 * 
 * @see https://www.tradingview.com/widget-docs/widgets/charts/mini-chart/
 */
export const TVMiniChart: React.FC<TVMiniChartProps> = ({
    symbol,
    height = 120,
    width = "100%",
    colorTheme = "dark",
    isTransparent = true,
    dateRange = "1D",
    trendLineColor = "rgba(16, 185, 129, 1)",
    underLineColor = "rgba(16, 185, 129, 0.3)",
    underLineBottomColor = "rgba(16, 185, 129, 0)",
    locale = "zh_CN",
}) => {
    const containerRef = React.useRef<HTMLDivElement>(null);
    const scriptId = React.useRef(`tv-mini-chart-${symbol}-${Date.now()}`);

    React.useEffect(() => {
        if (!containerRef.current) return;

        // 清空容器
        containerRef.current.innerHTML = "";

        // 创建 widget 容器
        const widgetContainer = document.createElement("div");
        widgetContainer.className = "tradingview-widget-container";
        widgetContainer.style.height = `${height}px`;
        widgetContainer.style.width = width;

        const widgetDiv = document.createElement("div");
        widgetDiv.className = "tradingview-widget-container__widget";
        widgetDiv.style.height = "100%";
        widgetDiv.style.width = "100%";

        widgetContainer.appendChild(widgetDiv);
        containerRef.current.appendChild(widgetContainer);

        // 创建并加载 TradingView 脚本
        const script = document.createElement("script");
        script.type = "text/javascript";
        script.async = true;
        script.src = "https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js";

        // Widget 配置
        script.innerHTML = JSON.stringify({
            symbol: symbol,
            width: "100%",
            height: height,
            locale: locale,
            dateRange: dateRange,
            colorTheme: colorTheme,
            isTransparent: isTransparent,
            autosize: false,
            largeChartUrl: "", // 可以设置为您自己的图表页面
            trendLineColor: trendLineColor,
            underLineColor: underLineColor,
            underLineBottomColor: underLineBottomColor,
            noTimeScale: true,
        });

        widgetContainer.appendChild(script);

        return () => {
            if (containerRef.current) {
                containerRef.current.innerHTML = "";
            }
        };
    }, [symbol, height, width, colorTheme, isTransparent, dateRange, trendLineColor, underLineColor, underLineBottomColor, locale]);

    return (
        <div
            ref={containerRef}
            style={{
                width: "100%",
                height,
                overflow: "hidden",
                borderRadius: 8,
            }}
        />
    );
};

/**
 * TradingView Advanced Chart Widget
 * 
 * 完整功能的 TradingView 图表，适合全屏或大尺寸显示。
 * 
 * @see https://www.tradingview.com/widget-docs/widgets/charts/advanced-chart/
 */
interface TVAdvancedChartProps {
    symbol: string;
    height?: number;
    width?: string;
    interval?: string;
    timezone?: string;
    theme?: "dark" | "light";
    style?: string;
    locale?: string;
    allowSymbolChange?: boolean;
    showDetails?: boolean;
    showDrawingsToolbar?: boolean;
}

export const TVAdvancedChart: React.FC<TVAdvancedChartProps> = ({
    symbol,
    height = 400,
    width = "100%",
    interval = "60",
    timezone = "Asia/Shanghai",
    theme = "dark",
    style = "1",
    locale = "zh_CN",
    allowSymbolChange = true,
    showDetails = false,
    showDrawingsToolbar = false,
}) => {
    const containerRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        if (!containerRef.current) return;

        // 清空容器
        containerRef.current.innerHTML = "";

        // 创建 widget 容器
        const widgetContainer = document.createElement("div");
        widgetContainer.className = "tradingview-widget-container";
        widgetContainer.style.height = `${height}px`;
        widgetContainer.style.width = width;

        const widgetDiv = document.createElement("div");
        widgetDiv.id = `tradingview_${symbol.replace(/[^a-zA-Z0-9]/g, "_")}`;
        widgetDiv.style.height = "100%";
        widgetDiv.style.width = "100%";

        widgetContainer.appendChild(widgetDiv);
        containerRef.current.appendChild(widgetContainer);

        // 创建并加载 TradingView 脚本
        const script = document.createElement("script");
        script.type = "text/javascript";
        script.async = true;
        script.src = "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";

        // Widget 配置
        script.innerHTML = JSON.stringify({
            autosize: true,
            symbol: symbol,
            interval: interval,
            timezone: timezone,
            theme: theme,
            style: style,
            locale: locale,
            allow_symbol_change: allowSymbolChange,
            hide_top_toolbar: true,
            hide_legend: true,
            save_image: false,
            calendar: false,
            support_host: "https://www.tradingview.com",
            container_id: widgetDiv.id,
        });

        widgetContainer.appendChild(script);

        return () => {
            if (containerRef.current) {
                containerRef.current.innerHTML = "";
            }
        };
    }, [symbol, height, width, interval, timezone, theme, style, locale, allowSymbolChange]);

    return (
        <div
            ref={containerRef}
            style={{
                width: "100%",
                height,
                overflow: "hidden",
                borderRadius: 8,
            }}
        />
    );
};
