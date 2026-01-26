import * as React from "react";
import { Activity, TrendingUp, TrendingDown, AlertTriangle, RefreshCw } from "lucide-react";
import { MiniChart } from "./MiniChart";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { StrategyIndicatorPanel } from "./StrategyIndicatorPanel";

interface ScannerProps {
    apiHost: string;
}

interface SymbolCard {
    id: string; // 显示名称 (例如 ES)
    ticker: string; // 后端 Ticker (例如 ES=F)
    name: string;
    price: number;
    change: number;
    changePercent: number;
    signals: string[];
    trend: "bullish" | "bearish" | "neutral";
    loading: boolean;
}

// 默认关注的品种列表
// id用于显示，ticker用于请求后端API
// 后端支持：美股期货 (ES=F, NQ=F)、科技股 (NVDA, AAPL)、加密货币 (BTCUSDT, ETHUSDT 等)
const DEFAULT_SYMBOLS: SymbolCard[] = [
    // 🇺🇸 股票期货
    { id: "ES", ticker: "ES=F", name: "E-mini S&P 500", price: 0, change: 0, changePercent: 0, signals: [], trend: "neutral", loading: true },
    { id: "NQ", ticker: "NQ=F", name: "E-mini Nasdaq", price: 0, change: 0, changePercent: 0, signals: [], trend: "neutral", loading: true },
    // 💰 加密货币
    { id: "BTC", ticker: "BTCUSDT", name: "Bitcoin", price: 0, change: 0, changePercent: 0, signals: [], trend: "neutral", loading: true },
    { id: "ETH", ticker: "ETHUSDT", name: "Ethereum", price: 0, change: 0, changePercent: 0, signals: [], trend: "neutral", loading: true },
    // 📈 科技股
    { id: "NVDA", ticker: "NVDA", name: "NVIDIA", price: 0, change: 0, changePercent: 0, signals: [], trend: "neutral", loading: true },
    { id: "AAPL", ticker: "AAPL", name: "Apple", price: 0, change: 0, changePercent: 0, signals: [], trend: "neutral", loading: true },
];

export const MarketScannerComponent: React.FC<ScannerProps> = ({ apiHost }) => {
    const [symbols, setSymbols] = React.useState<SymbolCard[]>(DEFAULT_SYMBOLS);
    const [lastUpdate, setLastUpdate] = React.useState<Date | null>(null);
    const [isRefreshing, setIsRefreshing] = React.useState(false);

    // 获取单个品种的数据
    const fetchSymbolData = async (symbol: SymbolCard): Promise<Partial<SymbolCard>> => {
        try {
            const res = await fetch(`${apiHost}/api/v1/candles/${symbol.ticker}?limit=2&interval=5m`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();

            if (data && data.length >= 2) {
                const current = data[data.length - 1];
                const prev = data[data.length - 2];
                const change = current.close - prev.close;
                const changePercent = (change / prev.close) * 100;
                return {
                    price: current.close,
                    change,
                    changePercent,
                    trend: change > 0 ? "bullish" : change < 0 ? "bearish" : "neutral",
                    loading: false,
                };
            } else if (data && data.length === 1) {
                return {
                    price: data[0].close,
                    change: 0,
                    changePercent: 0,
                    trend: "neutral",
                    loading: false,
                };
            }
        } catch (e) {
            console.error(`[MarketScanner] Failed to fetch ${symbol.id}:`, e);
        }
        return { loading: false };
    };

    // 刷新所有品种数据
    const refreshAll = React.useCallback(async () => {
        setIsRefreshing(true);
        const updates = await Promise.all(
            symbols.map(async (sym) => {
                const update = await fetchSymbolData(sym);
                return { ...sym, ...update };
            })
        );
        setSymbols(updates);
        setLastUpdate(new Date());
        setIsRefreshing(false);
    }, [symbols, apiHost]);

    // 初始加载和定时刷新
    React.useEffect(() => {
        refreshAll();
        const interval = setInterval(refreshAll, 5000); // 5秒刷新一次（HTTP轮询最佳平衡）
        return () => clearInterval(interval);
    }, []);

    return (
        <div style={{ padding: 16, height: "100%", overflowY: "auto" }}>
            {/* 标题栏 */}
            <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 16
            }}>
                <h2 style={{ margin: 0 }}>🦁 市场扫描仪</h2>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {lastUpdate && (
                        <span style={{ fontSize: "0.8em", color: "var(--text-muted)" }}>
                            更新于 {lastUpdate.toLocaleTimeString()}
                        </span>
                    )}
                    <button
                        onClick={refreshAll}
                        disabled={isRefreshing}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "6px 12px",
                            background: "var(--interactive-accent)",
                            color: "var(--text-on-accent)",
                            border: "none",
                            borderRadius: 6,
                            cursor: isRefreshing ? "not-allowed" : "pointer",
                            opacity: isRefreshing ? 0.6 : 1
                        }}
                    >
                        <RefreshCw size={14} className={isRefreshing ? "spinning" : ""} />
                        刷新
                    </button>
                </div>
            </div>

            {/* 卡片网格 - 使用 CSS Grid */}
            <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                gap: 16
            }}>
                {symbols.map((sym) => (
                    <div
                        key={sym.id}
                        style={{
                            background: "var(--background-secondary)",
                            border: "1px solid var(--background-modifier-border)",
                            borderRadius: 12,
                            overflow: "hidden",
                            transition: "transform 0.2s, box-shadow 0.2s",
                        }}
                        onMouseEnter={(e) => {
                            e.currentTarget.style.transform = "translateY(-2px)";
                            e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
                        }}
                        onMouseLeave={(e) => {
                            e.currentTarget.style.transform = "translateY(0)";
                            e.currentTarget.style.boxShadow = "none";
                        }}
                    >
                        {/* 卡片头部 */}
                        <div style={{
                            padding: "12px 16px",
                            background: "var(--background-secondary-alt)",
                            borderBottom: "1px solid var(--background-modifier-border)",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center"
                        }}>
                            <div>
                                <div style={{ fontWeight: 700, fontSize: "1.1em" }}>{sym.id}</div>
                                <div style={{ fontSize: "0.8em", color: "var(--text-muted)" }}>{sym.name}</div>
                            </div>
                            <div style={{ textAlign: "right" }}>
                                {sym.loading ? (
                                    <div style={{ color: "var(--text-muted)" }}>加载中...</div>
                                ) : (
                                    <>
                                        <div style={{
                                            fontWeight: 700,
                                            fontSize: "1.2em",
                                            fontFamily: "var(--font-monospace)"
                                        }}>
                                            ${sym.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </div>
                                        <div style={{
                                            fontSize: "0.85em",
                                            color: sym.trend === "bullish" ? "#10B981" : sym.trend === "bearish" ? "#EF4444" : "var(--text-muted)"
                                        }}>
                                            {sym.trend === "bullish" ? "▲" : sym.trend === "bearish" ? "▼" : "—"}
                                            {sym.changePercent >= 0 ? "+" : ""}{sym.changePercent.toFixed(2)}%
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* 卡片内容 */}
                        <div style={{ padding: 16 }}>
                            {/* 迷你 K 线图表 */}
                            <div style={{ marginBottom: 12, borderRadius: 8, overflow: "hidden" }}>
                                <ErrorBoundary>
                                    <MiniChart
                                        symbol={sym.ticker}
                                        apiHost={apiHost}
                                        interval="5m"
                                        height={100}
                                    />
                                </ErrorBoundary>
                            </div>

                            {/* 趋势指示 */}
                            <div style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                marginBottom: 12,
                                padding: "8px 12px",
                                background: sym.trend === "bullish" ? "rgba(16, 185, 129, 0.1)" :
                                    sym.trend === "bearish" ? "rgba(239, 68, 68, 0.1)" :
                                        "rgba(107, 114, 128, 0.1)",
                                borderRadius: 8,
                                border: `1px solid ${sym.trend === "bullish" ? "#10B981" :
                                    sym.trend === "bearish" ? "#EF4444" :
                                        "var(--background-modifier-border)"}`
                            }}>
                                {sym.trend === "bullish" ? (
                                    <TrendingUp size={18} color="#10B981" />
                                ) : sym.trend === "bearish" ? (
                                    <TrendingDown size={18} color="#EF4444" />
                                ) : (
                                    <Activity size={18} color="var(--text-muted)" />
                                )}
                                <span style={{
                                    fontWeight: 600,
                                    color: sym.trend === "bullish" ? "#10B981" :
                                        sym.trend === "bearish" ? "#EF4444" :
                                            "var(--text-muted)"
                                }}>
                                    {sym.trend === "bullish" ? "看涨" :
                                        sym.trend === "bearish" ? "看跌" : "震荡"}
                                </span>
                            </div>

                            {/* 策略指标监控面板 */}
                            <ErrorBoundary>
                                <StrategyIndicatorPanel
                                    apiHost={apiHost}
                                    symbol={sym.ticker}
                                    symbolName={sym.id}
                                />
                            </ErrorBoundary>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
