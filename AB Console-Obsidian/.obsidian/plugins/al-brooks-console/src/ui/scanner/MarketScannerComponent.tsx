import * as React from "react";
import { Activity, TrendingUp, TrendingDown, RefreshCw, Bell, Filter, LayoutGrid, Maximize2 } from "lucide-react";
import { MiniChart } from "./MiniChart";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { StrategyIndicatorPanel } from "./StrategyIndicatorPanel";
import { useSignals, type TradingSignal } from "../../hooks/useSignals";
import { StrategyMatcher } from "./StrategyMatcher";
import { SingleChartView } from "./SingleChartView";
import type { BackendSettings } from "../../settings";

interface ScannerProps {
    apiHost: string;
    backend?: BackendSettings;
}

interface SymbolCard {
    id: string;
    ticker: string;
    name: string;
    category: "crypto" | "stock" | "forex" | "future" | "metal";
    price: number;
    change: number;
    changePercent: number;
    signals: string[];
    trend: "bullish" | "bearish" | "neutral";
    loading: boolean;
}

const CATEGORY_CONFIG: Record<string, { emoji: string; label: string; color: string }> = {
    crypto: { emoji: "💰", label: "加密货币", color: "#F59E0B" },
    stock: { emoji: "📈", label: "股票", color: "#3B82F6" },
    forex: { emoji: "💱", label: "外汇", color: "#8B5CF6" },
    future: { emoji: "📊", label: "期货", color: "#10B981" },
    metal: { emoji: "🥇", label: "贵金属", color: "#FBBF24" },
};

const DEFAULT_SYMBOLS: SymbolCard[] = [
    { id: "ES", ticker: "ES=F", name: "E-mini S&P 500", category: "future", price: 0, change: 0, changePercent: 0, signals: [], trend: "neutral", loading: true },
    { id: "NQ", ticker: "NQ=F", name: "E-mini Nasdaq", category: "future", price: 0, change: 0, changePercent: 0, signals: [], trend: "neutral", loading: true },
    { id: "BTC", ticker: "BTCUSDT", name: "Bitcoin", category: "crypto", price: 0, change: 0, changePercent: 0, signals: [], trend: "neutral", loading: true },
    { id: "ETH", ticker: "ETHUSDT", name: "Ethereum", category: "crypto", price: 0, change: 0, changePercent: 0, signals: [], trend: "neutral", loading: true },
    { id: "SOL", ticker: "SOLUSDT", name: "Solana", category: "crypto", price: 0, change: 0, changePercent: 0, signals: [], trend: "neutral", loading: true },
    { id: "NVDA", ticker: "NVDA", name: "NVIDIA", category: "stock", price: 0, change: 0, changePercent: 0, signals: [], trend: "neutral", loading: true },
    { id: "AAPL", ticker: "AAPL", name: "Apple", category: "stock", price: 0, change: 0, changePercent: 0, signals: [], trend: "neutral", loading: true },
    { id: "EURUSD", ticker: "EURUSD=X", name: "EUR/USD", category: "forex", price: 0, change: 0, changePercent: 0, signals: [], trend: "neutral", loading: true },
    { id: "GBPUSD", ticker: "GBPUSD=X", name: "GBP/USD", category: "forex", price: 0, change: 0, changePercent: 0, signals: [], trend: "neutral", loading: true },
    { id: "USDJPY", ticker: "USDJPY=X", name: "USD/JPY", category: "forex", price: 0, change: 0, changePercent: 0, signals: [], trend: "neutral", loading: true },
    { id: "XAUUSD", ticker: "GC=F", name: "Gold", category: "metal", price: 0, change: 0, changePercent: 0, signals: [], trend: "neutral", loading: true },
];

const SignalMiniCard: React.FC<{ signal: TradingSignal }> = ({ signal }) => {
    const directionConfig = {
        BUY: { emoji: "🟢", color: "#10B981", bg: "rgba(16, 185, 129, 0.1)" },
        SELL: { emoji: "🔴", color: "#EF4444", bg: "rgba(239, 68, 68, 0.1)" },
        ALERT: { emoji: "🟡", color: "#F59E0B", bg: "rgba(245, 158, 11, 0.1)" },
    }[signal.direction];

    const timeStr = new Date(signal.timestamp).toLocaleTimeString("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
    });

    return (
        <div
            style={{
                padding: "8px 10px",
                background: directionConfig.bg,
                borderRadius: "6px",
                border: `1px solid ${directionConfig.color}30`,
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                cursor: "pointer",
                minWidth: "140px",
                maxWidth: "200px",
            }}
        >
            <span>{directionConfig.emoji}</span>
            <span style={{ fontWeight: 600 }}>{signal.symbol}</span>
            <span style={{ color: "var(--text-muted)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {signal.signal_name}
            </span>
            <span style={{ color: "var(--text-faint)", fontSize: "10px" }}>{timeStr}</span>
        </div>
    );
};

export const MarketScannerComponent: React.FC<ScannerProps> = ({ apiHost, backend }) => {
    const [symbols, setSymbols] = React.useState<SymbolCard[]>(DEFAULT_SYMBOLS);
    const [lastUpdate, setLastUpdate] = React.useState<Date | null>(null);
    const [isRefreshing, setIsRefreshing] = React.useState(false);
    const [chartInterval, setChartInterval] = React.useState("5m");
    const [selectedCategory, setSelectedCategory] = React.useState<string | "all">("all");
    const [viewMode, setViewMode] = React.useState<"grid" | "single">("single");
    const [selectedSymbol, setSelectedSymbol] = React.useState<string>("BTC");

    const backendSettings: BackendSettings = backend || {
        enabled: true,
        baseUrl: apiHost,
        apiToken: "",
        timeout: 30000,
        autoRefreshInterval: 5,
        defaultSymbol: "BTCUSDT",
        defaultInterval: "5m",
    };

    const { signals, unreadCount } = useSignals({
        backend: backendSettings,
        autoRefresh: true,
        refreshInterval: 10,
    });

    const filteredSymbols = React.useMemo(() => {
        if (selectedCategory === "all") return symbols;
        return symbols.filter((s) => s.category === selectedCategory);
    }, [symbols, selectedCategory]);

    const fetchSymbolData = async (symbol: SymbolCard): Promise<Partial<SymbolCard>> => {
        try {
            const res = await fetch(`${apiHost}/api/v1/candles/${symbol.ticker}?limit=2&interval=${chartInterval}`);
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
    }, [symbols, apiHost, chartInterval]);

    React.useEffect(() => {
        refreshAll();
    }, [chartInterval]);

    React.useEffect(() => {
        refreshAll();
        const interval = setInterval(refreshAll, 5000);
        return () => clearInterval(interval);
    }, []);

    const getSymbolSignals = (symbolId: string) => {
        return signals.filter((s) => s.symbol.includes(symbolId) || symbolId.includes(s.symbol.replace("=X", "").replace("=F", ""))).slice(0, 2);
    };

    return (
        <div style={{ padding: 16, height: "100%", overflowY: "auto" }}>
            {/* 标题栏 */}
            <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12
            }}>
                <h2 style={{ margin: 0 }}>🦁 市场扫描仪</h2>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    {signals.length > 0 && (
                        <div style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "4px 10px",
                            background: unreadCount > 0 ? "rgba(16, 185, 129, 0.15)" : "var(--background-secondary)",
                            borderRadius: 20,
                            fontSize: "12px",
                        }}>
                            <Bell size={14} />
                            <span>{signals.length} 信号</span>
                            {unreadCount > 0 && (
                                <span style={{
                                    padding: "1px 6px",
                                    background: "#10B981",
                                    color: "white",
                                    borderRadius: 10,
                                    fontSize: "10px",
                                }}>
                                    {unreadCount}
                                </span>
                            )}
                        </div>
                    )}

                    <select
                        value={chartInterval}
                        onChange={(e) => setChartInterval(e.target.value)}
                        style={{
                            padding: "4px 8px",
                            borderRadius: "6px",
                            border: "1px solid var(--background-modifier-border)",
                            background: "var(--background-primary)",
                            color: "var(--text-normal)",
                            fontSize: "0.85em",
                            cursor: "pointer"
                        }}
                    >
                        <option value="1m">1m</option>
                        <option value="5m">5m</option>
                        <option value="15m">15m</option>
                        <option value="1h">1h</option>
                        <option value="4h">4h</option>
                    </select>

                    {lastUpdate && (
                        <span style={{ fontSize: "0.8em", color: "var(--text-muted)" }}>
                            更新 {lastUpdate.toLocaleTimeString()}
                        </span>
                    )}
                    
                    {/* 视图切换 */}
                    <div style={{ display: "flex", gap: 4, background: "var(--background-secondary)", borderRadius: 6, padding: 2 }}>
                        <button
                            onClick={() => setViewMode("single")}
                            style={{
                                padding: "4px 10px",
                                borderRadius: 4,
                                border: "none",
                                cursor: "pointer",
                                fontSize: "12px",
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                                background: viewMode === "single" ? "var(--interactive-accent)" : "transparent",
                                color: viewMode === "single" ? "var(--text-on-accent)" : "var(--text-normal)",
                            }}
                        >
                            <Maximize2 size={12} />
                            单一
                        </button>
                        <button
                            onClick={() => setViewMode("grid")}
                            style={{
                                padding: "4px 10px",
                                borderRadius: 4,
                                border: "none",
                                cursor: "pointer",
                                fontSize: "12px",
                                display: "flex",
                                alignItems: "center",
                                gap: 4,
                                background: viewMode === "grid" ? "var(--interactive-accent)" : "transparent",
                                color: viewMode === "grid" ? "var(--text-on-accent)" : "var(--text-normal)",
                            }}
                        >
                            <LayoutGrid size={12} />
                            网格
                        </button>
                    </div>

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

            {/* 最新信号滚动条 */}
            {signals.length > 0 && (
                <div style={{
                    marginBottom: 16,
                    padding: "10px 12px",
                    background: "var(--background-secondary)",
                    borderRadius: 8,
                    border: "1px solid var(--background-modifier-border)",
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                        <Bell size={14} color="#10B981" />
                        <span style={{ fontSize: "12px", fontWeight: 600 }}>最新信号</span>
                    </div>
                    <div style={{
                        display: "flex",
                        gap: 8,
                        overflowX: "auto",
                        paddingBottom: 8,
                        scrollbarWidth: "thin",
                        scrollbarColor: "var(--background-modifier-border) transparent",
                    }}>
                        {signals.slice(0, 10).map((signal) => (
                            <div key={signal.id} style={{ flexShrink: 0 }}>
                                <SignalMiniCard signal={signal} />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* 分类过滤器 */}
            <div style={{
                display: "flex",
                gap: 8,
                marginBottom: 16,
                flexWrap: "wrap",
            }}>
                <button
                    onClick={() => setSelectedCategory("all")}
                    style={{
                        padding: "6px 12px",
                        borderRadius: 20,
                        border: "none",
                        cursor: "pointer",
                        fontSize: "12px",
                        fontWeight: selectedCategory === "all" ? 600 : 400,
                        background: selectedCategory === "all" ? "var(--interactive-accent)" : "var(--background-secondary)",
                        color: selectedCategory === "all" ? "var(--text-on-accent)" : "var(--text-normal)",
                    }}
                >
                    全部 ({symbols.length})
                </button>
                {Object.entries(CATEGORY_CONFIG).map(([key, config]) => {
                    const count = symbols.filter((s) => s.category === key).length;
                    return (
                        <button
                            key={key}
                            onClick={() => setSelectedCategory(key)}
                            style={{
                                padding: "6px 12px",
                                borderRadius: 20,
                                border: "none",
                                cursor: "pointer",
                                fontSize: "12px",
                                fontWeight: selectedCategory === key ? 600 : 400,
                                background: selectedCategory === key ? config.color : "var(--background-secondary)",
                                color: selectedCategory === key ? "white" : "var(--text-normal)",
                            }}
                        >
                            {config.emoji} {config.label} ({count})
                        </button>
                    );
                })}
            </div>

            {/* === 单一图表视图 === */}
            {viewMode === "single" && (
                <div style={{ height: "calc(100vh - 220px)", minHeight: "500px" }}>
                    <SingleChartView
                        backend={backendSettings}
                        symbols={filteredSymbols}
                        selectedSymbol={selectedSymbol}
                        onSelectSymbol={setSelectedSymbol}
                        chartInterval={chartInterval}
                        onIntervalChange={setChartInterval}
                        signals={signals}
                    />
                </div>
            )}

            {/* === 网格视图 === */}
            {viewMode === "grid" && (
                <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                    gap: 16
                }}>
                    {filteredSymbols.map((sym) => {
                        const symbolSignals = getSymbolSignals(sym.id);
                        const category = CATEGORY_CONFIG[sym.category];

                        return (
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
                                <div style={{
                                    padding: "12px 16px",
                                    background: "var(--background-secondary-alt)",
                                    borderBottom: "1px solid var(--background-modifier-border)",
                                    display: "flex",
                                    justifyContent: "space-between",
                                    alignItems: "center"
                                }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                        <span style={{ fontSize: "16px" }}>{category.emoji}</span>
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: "1.1em" }}>{sym.id}</div>
                                            <div style={{ fontSize: "0.75em", color: "var(--text-muted)" }}>{sym.name}</div>
                                        </div>
                                    </div>
                                    <div style={{ textAlign: "right" }}>
                                        {sym.loading ? (
                                            <div style={{ color: "var(--text-muted)", fontSize: "12px" }}>加载中...</div>
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

                                <div style={{ padding: 16 }}>
                                    <div style={{ marginBottom: 12, borderRadius: 8, overflow: "hidden" }}>
                                        <ErrorBoundary>
                                            <MiniChart
                                                symbol={sym.ticker}
                                                apiHost={apiHost}
                                                interval={chartInterval}
                                                height={100}
                                            />
                                        </ErrorBoundary>
                                    </div>

                                    {symbolSignals.length > 0 && (
                                        <div style={{ marginBottom: 12 }}>
                                            {symbolSignals.map((sig) => (
                                                <SignalMiniCard key={sig.id} signal={sig} />
                                            ))}
                                        </div>
                                    )}

                                    <div style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
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
                                        <span style={{ marginLeft: "auto", fontSize: "11px", color: "var(--text-muted)" }}>
                                            {chartInterval}
                                        </span>
                                    </div>

                                    <StrategyMatcher
                                        symbol={sym.id}
                                        trend={sym.trend}
                                        price={sym.price}
                                        changePercent={sym.changePercent}
                                        signals={signals}
                                        backend={backendSettings}
                                        timeframe={chartInterval}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
