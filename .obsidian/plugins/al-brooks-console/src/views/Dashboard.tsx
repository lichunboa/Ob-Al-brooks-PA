import * as React from "react";
import { ItemView, WorkspaceLeaf, TFile, parseYaml } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import type { TradeIndex, TradeIndexStatus } from "../core/trade-index";
import { computeTradeStatsByAccountType } from "../core/stats";
import { buildReviewHints } from "../core/review-hints";
import type { AccountType, TradeRecord } from "../core/contracts";
import type { StrategyIndex } from "../core/strategy-index";
import { matchStrategies } from "../core/strategy-matcher";
import { StatsCard } from "./components/StatsCard";
import { TradeList } from "./components/TradeList";
import {
    computeDailyAgg,
    computeEquityCurve,
    computeStrategyAttribution,
    filterTradesByScope,
    type AnalyticsScope,
    type DailyAgg,
} from "../core/analytics";
import { parseCoverRef } from "../core/cover-parser";
import type { EnumPresets } from "../core/enum-presets";
import { createEnumPresetsFromFrontmatter } from "../core/enum-presets";
import { buildFixPlan, buildInspectorIssues } from "../core/inspector";
import type { IntegrationCapability } from "../integrations/contracts";
import type { PluginIntegrationRegistry } from "../integrations/PluginIntegrationRegistry";
import type { TodayContext } from "../core/today-context";

function toLocalDateIso(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

function getLastLocalDateIsos(days: number): string[] {
    const out: string[] = [];
    const now = new Date();
    for (let i = 0; i < Math.max(1, days); i++) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        out.push(toLocalDateIso(d));
    }
    return out;
}

function getDayOfMonth(dateIso: string): string {
    const parts = dateIso.split("-");
    const d = parts[2] ?? "";
    return d.startsWith("0") ? d.slice(1) : d;
}

function sumPnlR(trades: TradeRecord[]): number {
    let sum = 0;
    for (const t of trades) {
        if (typeof t.pnl === "number" && Number.isFinite(t.pnl)) sum += t.pnl;
    }
    return sum;
}

function getRColorByAccountType(accountType: AccountType): string {
    switch (accountType) {
        case "Live":
            return "var(--text-success)";
        case "Demo":
            return "var(--text-warning)";
        case "Backtest":
            return "var(--text-accent)";
    }
}

function computeWindowRByAccountType(trades: TradeRecord[], windowSize: number): Record<AccountType, number> {
    const by: Record<AccountType, TradeRecord[]> = { Live: [], Demo: [], Backtest: [] };
    for (const t of trades.slice(0, windowSize)) {
        const at = t.accountType;
        if (at === "Live" || at === "Demo" || at === "Backtest") by[at].push(t);
    }
    return {
        Live: sumPnlR(by.Live),
        Demo: sumPnlR(by.Demo),
        Backtest: sumPnlR(by.Backtest),
    };
}

export const VIEW_TYPE_CONSOLE = "al-brooks-console-view";

interface Props {
    index: TradeIndex;
    strategyIndex: StrategyIndex;
	todayContext?: TodayContext;
    resolveLink?: (linkText: string, fromPath: string) => string | undefined;
    getResourceUrl?: (path: string) => string | undefined;
    enumPresets?: EnumPresets;
	openFile: (path: string) => void;
    integrations?: PluginIntegrationRegistry;
	version: string;
}

class ConsoleErrorBoundary extends React.Component<
    { children: React.ReactNode },
    { hasError: boolean; message?: string }
> {
    constructor(props: { children: React.ReactNode }) {
        super(props);
        this.state = { hasError: false };
    }

    static getDerivedStateFromError(error: unknown) {
        return {
            hasError: true,
            message: error instanceof Error ? error.message : String(error),
        };
    }

    componentDidCatch(error: unknown) {
        console.warn("[al-brooks-console] Dashboard render error", error);
    }

    render() {
        if (this.state.hasError) {
            return (
                <div
                    style={{
                        padding: "16px",
                        fontFamily: "var(--font-interface)",
                        maxWidth: "1200px",
                        margin: "0 auto",
                    }}
                >
                    <h2
                        style={{
                            borderBottom: "1px solid var(--background-modifier-border)",
                            paddingBottom: "10px",
                            marginBottom: "12px",
                        }}
                    >
                        🦁 Trader Dashboard
                    </h2>
                    <div style={{ color: "var(--text-error)", marginBottom: "8px" }}>
                        Dashboard crashed: {this.state.message ?? "Unknown error"}
                    </div>
                    <div style={{ color: "var(--text-muted)" }}>
                        Try using “Rebuild Index” in the header after re-opening the view.
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

const ConsoleComponent: React.FC<Props> = ({ index, strategyIndex, todayContext, resolveLink, getResourceUrl, enumPresets, openFile, integrations, version }) => {
    const [trades, setTrades] = React.useState(index.getAll());
    const [status, setStatus] = React.useState<TradeIndexStatus>(() =>
        index.getStatus ? index.getStatus() : { phase: "ready" }
    );
	const [todayMarketCycle, setTodayMarketCycle] = React.useState<string | undefined>(() => todayContext?.getTodayMarketCycle());
	const [analyticsScope, setAnalyticsScope] = React.useState<AnalyticsScope>("Live");
    const [showFixPlan, setShowFixPlan] = React.useState(false);

    const summary = React.useMemo(() => computeTradeStatsByAccountType(trades), [trades]);
    const all = summary.All;

    React.useEffect(() => {
		const onUpdate = () => setTrades(index.getAll());
		const unsubscribe = index.onChanged(onUpdate);
		onUpdate();
		return unsubscribe;
    }, [index]);

    React.useEffect(() => {
        if (!todayContext?.onChanged) return;
        const onUpdate = () => setTodayMarketCycle(todayContext.getTodayMarketCycle());
        const unsubscribe = todayContext.onChanged(onUpdate);
        onUpdate();
        return unsubscribe;
    }, [todayContext]);

    React.useEffect(() => {
        if (!index.onStatusChanged) return;
        const onStatus = () => setStatus(index.getStatus ? index.getStatus() : { phase: "ready" });
        const unsubscribe = index.onStatusChanged(onStatus);
        onStatus();
        return unsubscribe;
    }, [index]);

    const onRebuild = React.useCallback(async () => {
        if (!index.rebuild) return;
        try {
            await index.rebuild();
        } catch (e) {
            console.warn("[al-brooks-console] Rebuild failed", e);
        }
    }, [index]);

    const statusText = React.useMemo(() => {
        switch (status.phase) {
            case "building": {
                const p = typeof status.processed === "number" ? status.processed : 0;
                const t = typeof status.total === "number" ? status.total : 0;
                return t > 0 ? `Index: building… ${p}/${t}` : "Index: building…";
            }
            case "ready": {
                return typeof status.lastBuildMs === "number"
                    ? `Index: ready (${status.lastBuildMs}ms)`
                    : "Index: ready";
            }
            case "error":
                return `Index: error${status.message ? ` — ${status.message}` : ""}`;
            default:
                return "Index: idle";
        }
    }, [status]);

    const buttonStyle: React.CSSProperties = {
        marginLeft: "8px",
        padding: "4px 8px",
        fontSize: "0.8em",
        border: "1px solid var(--background-modifier-border)",
        borderRadius: "6px",
        background: "var(--background-primary)",
        color: "var(--text-normal)",
        cursor: "pointer",
    };

    const disabledButtonStyle: React.CSSProperties = {
        ...buttonStyle,
        opacity: 0.5,
        cursor: "not-allowed",
    };

	const selectStyle: React.CSSProperties = {
		padding: "4px 8px",
		fontSize: "0.85em",
		border: "1px solid var(--background-modifier-border)",
		borderRadius: "6px",
		background: "var(--background-primary)",
		color: "var(--text-normal)",
	};

    const action = React.useCallback(
        async (capabilityId: IntegrationCapability) => {
            if (!integrations) return;
            try {
                await integrations.run(capabilityId);
            } catch (e) {
                console.warn("[al-brooks-console] Integration action failed", capabilityId, e);
            }
        },
        [integrations]
    );

    const can = React.useCallback(
        (capabilityId: IntegrationCapability) => Boolean(integrations?.isCapabilityAvailable(capabilityId)),
        [integrations]
    );

    const latestTrade = trades.length > 0 ? trades[0] : undefined;
    const todayIso = React.useMemo(() => toLocalDateIso(new Date()), []);
    const todayTrades = React.useMemo(() => trades.filter((t) => t.dateIso === todayIso), [trades, todayIso]);
    const todaySummary = React.useMemo(() => computeTradeStatsByAccountType(todayTrades), [todayTrades]);
    const todayLatestTrade = todayTrades.length > 0 ? todayTrades[0] : undefined;
    const rLast10 = React.useMemo(() => computeWindowRByAccountType(trades, 10), [trades]);
    const rLast30 = React.useMemo(() => computeWindowRByAccountType(trades, 30), [trades]);
    const r10MaxAbs = React.useMemo(
        () => Math.max(Math.abs(rLast10.Live), Math.abs(rLast10.Demo), Math.abs(rLast10.Backtest), 0),
        [rLast10]
    );
    const r30MaxAbs = React.useMemo(
        () => Math.max(Math.abs(rLast30.Live), Math.abs(rLast30.Demo), Math.abs(rLast30.Backtest), 0),
        [rLast30]
    );
    const reviewHints = React.useMemo(() => {
        if (!latestTrade) return [];
        return buildReviewHints(latestTrade);
    }, [latestTrade]);

    const analyticsTrades = React.useMemo(() => filterTradesByScope(trades, analyticsScope), [trades, analyticsScope]);
    const analyticsDaily = React.useMemo(() => computeDailyAgg(analyticsTrades, 90), [analyticsTrades]);
    const analyticsDailyByDate = React.useMemo(() => {
        const m = new Map<string, DailyAgg>();
        for (const d of analyticsDaily) m.set(d.dateIso, d);
        return m;
    }, [analyticsDaily]);

    const calendarDays = 35;
    const calendarDateIsos = React.useMemo(() => getLastLocalDateIsos(calendarDays), []);
    const calendarCells = React.useMemo(() => {
        return calendarDateIsos.map((dateIso) => analyticsDailyByDate.get(dateIso) ?? { dateIso, netR: 0, count: 0 });
    }, [calendarDateIsos, analyticsDailyByDate]);
    const calendarMaxAbs = React.useMemo(() => {
        let max = 0;
        for (const c of calendarCells) max = Math.max(max, Math.abs(c.netR));
        return max;
    }, [calendarCells]);

    const equitySeries = React.useMemo(() => {
        const dateIsosAsc = [...calendarDateIsos].reverse();
        const filled: DailyAgg[] = dateIsosAsc.map((dateIso) => analyticsDailyByDate.get(dateIso) ?? { dateIso, netR: 0, count: 0 });
        return computeEquityCurve(filled);
    }, [calendarDateIsos, analyticsDailyByDate]);

    const strategyAttribution = React.useMemo(() => {
        return computeStrategyAttribution(analyticsTrades, strategyIndex, 8);
    }, [analyticsTrades, strategyIndex]);

    type GalleryItem = {
        tradePath: string;
        coverPath: string;
        url?: string;
    };

    const galleryItems = React.useMemo((): GalleryItem[] => {
        if (!getResourceUrl) return [];
        const out: GalleryItem[] = [];
        const seen = new Set<string>();
        const isImage = (p: string) => /\.(png|jpe?g|gif|webp|svg)$/i.test(p);

        for (const t of trades) {
            const fm = (t.rawFrontmatter ?? {}) as Record<string, unknown>;
            const rawCover = (fm as any)["cover"] ?? (fm as any)["封面/cover"];
            const ref = parseCoverRef(rawCover);
            if (!ref) continue;

            let target = ref.target;
            // 解析 markdown link 的 target 可能带引号/空格
            target = String(target).trim();
            if (!target) continue;

            const resolved = resolveLink ? resolveLink(target, t.path) : target;
            if (!resolved || !isImage(resolved)) continue;
            if (seen.has(resolved)) continue;
            seen.add(resolved);

            const url = getResourceUrl(resolved);
            out.push({ tradePath: t.path, coverPath: resolved, url });
            if (out.length >= 48) break;
        }

        return out;
    }, [trades, resolveLink, getResourceUrl]);

    const inspectorIssues = React.useMemo(() => {
        return buildInspectorIssues(trades, enumPresets);
    }, [trades, enumPresets]);

    const fixPlanText = React.useMemo(() => {
        if (!showFixPlan || !enumPresets) return undefined;
        const plan = buildFixPlan(trades, enumPresets);
        return JSON.stringify(plan, null, 2);
    }, [showFixPlan, trades, enumPresets]);

    const openTrade = React.useMemo(() => {
        return trades.find((t) => {
            const pnlMissing = typeof t.pnl !== "number" || !Number.isFinite(t.pnl);
            if (!pnlMissing) return false;
            return t.outcome === "open" || t.outcome === undefined || t.outcome === "unknown";
        });
    }, [trades]);

    const todayStrategyPicks = React.useMemo(() => {
        if (!todayMarketCycle) return [];
        return matchStrategies(strategyIndex, {
            marketCycle: todayMarketCycle,
            limit: 6,
        });
    }, [strategyIndex, todayMarketCycle]);

    const openTradeStrategy = React.useMemo(() => {
        if (!openTrade) return undefined;
        const fm = (openTrade.rawFrontmatter ?? {}) as Record<string, any>;
        const patternsRaw = fm["patterns"] ?? fm["形态/patterns"] ?? fm["观察到的形态/patterns_observed"];
        const patterns = Array.isArray(patternsRaw)
            ? patternsRaw.filter((x: any) => typeof x === "string").map((s: string) => s.trim()).filter(Boolean)
            : typeof patternsRaw === "string"
                ? patternsRaw.split(/[,，;；/|]/g).map((s: string) => s.trim()).filter(Boolean)
                : [];
        const setupCategory = (fm["setup_category"] ?? fm["设置类别/setup_category"]) as any;
        const setupCategoryStr = typeof setupCategory === "string" ? setupCategory.trim() : undefined;
        const picks = matchStrategies(strategyIndex, {
            marketCycle: todayMarketCycle,
            setupCategory: setupCategoryStr,
            patterns,
            limit: 3,
        });
        return picks[0];
    }, [openTrade, strategyIndex, todayMarketCycle]);

    const strategyPicks = React.useMemo(() => {
        if (!latestTrade) return [];
        const fm = (latestTrade.rawFrontmatter ?? {}) as Record<string, any>;
        const patternsRaw = fm["patterns"] ?? fm["形态/patterns"] ?? fm["观察到的形态/patterns_observed"];
        const patterns = Array.isArray(patternsRaw)
            ? patternsRaw.filter((x: any) => typeof x === "string").map((s: string) => s.trim()).filter(Boolean)
            : typeof patternsRaw === "string"
                ? patternsRaw.split(/[,，;；/|]/g).map((s: string) => s.trim()).filter(Boolean)
                : [];
        const marketCycle = (fm["market_cycle"] ?? fm["市场周期/market_cycle"]) as any;
        const marketCycleStr = todayMarketCycle ?? (typeof marketCycle === "string" ? marketCycle.trim() : undefined);
        const setupCategory = (fm["setup_category"] ?? fm["设置类别/setup_category"]) as any;
        const setupCategoryStr = typeof setupCategory === "string" ? setupCategory.trim() : undefined;
        return matchStrategies(strategyIndex, {
            marketCycle: marketCycleStr,
            setupCategory: setupCategoryStr,
            patterns,
            limit: 6,
        });
    }, [latestTrade, strategyIndex, todayMarketCycle]);

    const TrendRow: React.FC<{ label: string; value: number; ratio: number; color: string }> = ({
        label,
        value,
        ratio,
        color,
    }) => {
        return (
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px" }}>
                <div style={{ width: "70px", color: "var(--text-muted)", fontSize: "0.85em" }}>{label}</div>
                <div
                    style={{
                        flex: "1 1 auto",
                        display: "flex",
                        height: "10px",
                        border: "1px solid var(--background-modifier-border)",
                        borderRadius: "999px",
                        overflow: "hidden",
                        background: "rgba(var(--mono-rgb-100), 0.03)",
                    }}
                >
                    <div style={{ flex: "1 1 0", position: "relative" }}>
                        {ratio < 0 && (
                            <div
                                style={{
                                    position: "absolute",
                                    right: 0,
                                    height: "100%",
                                    width: "100%",
                                    background: color,
                                    opacity: 0.55,
                                    transform: `scaleX(${Math.min(1, Math.abs(ratio))})`,
                                    transformOrigin: "right",
                                }}
                            />
                        )}
                    </div>
                    <div style={{ flex: "1 1 0", position: "relative" }}>
                        {ratio > 0 && (
                            <div
                                style={{
                                    height: "100%",
                                    width: "100%",
                                    background: color,
                                    opacity: 0.55,
                                    transform: `scaleX(${Math.min(1, Math.abs(ratio))})`,
                                    transformOrigin: "left",
                                }}
                            />
                        )}
                    </div>
                </div>
                <div style={{ width: "68px", textAlign: "right", fontSize: "0.9em" }}>
                    <span style={{ color: value >= 0 ? "var(--text-success)" : "var(--text-error)", fontWeight: 600 }}>
                        {value >= 0 ? "+" : ""}
                        {value.toFixed(1)}R
                    </span>
                </div>
            </div>
        );
    };

    return (
        <div style={{ padding: "16px", fontFamily: "var(--font-interface)", maxWidth: "1200px", margin: "0 auto" }}>
            <h2 style={{
                borderBottom: "1px solid var(--background-modifier-border)",
                paddingBottom: "10px",
                marginBottom: "20px"
            }}>
                🦁 Trader Dashboard <span style={{ fontSize: "0.8em", color: "var(--text-muted)" }}>v{version}</span>
                <span style={{ fontSize: "0.8em", color: "var(--text-muted)", marginLeft: "10px" }}>{statusText}</span>
                {integrations && (
                    <span style={{ marginLeft: "10px" }}>
                        <button
                            type="button"
                            disabled={!can("quickadd:new-live-trade")}
                            onClick={() => action("quickadd:new-live-trade")}
                            style={can("quickadd:new-live-trade") ? buttonStyle : disabledButtonStyle}
                        >
                            New Live Trade
                        </button>
                        <button
                            type="button"
                            disabled={!can("quickadd:new-demo-trade")}
                            onClick={() => action("quickadd:new-demo-trade")}
                            style={can("quickadd:new-demo-trade") ? buttonStyle : disabledButtonStyle}
                        >
                            New Demo Trade
                        </button>
                        <button
                            type="button"
                            disabled={!can("quickadd:new-backtest")}
                            onClick={() => action("quickadd:new-backtest")}
                            style={can("quickadd:new-backtest") ? buttonStyle : disabledButtonStyle}
                        >
                            New Backtest
                        </button>
                        <button
                            type="button"
                            disabled={!can("srs:review-flashcards")}
                            onClick={() => action("srs:review-flashcards")}
                            style={can("srs:review-flashcards") ? buttonStyle : disabledButtonStyle}
                        >
                            Review
                        </button>
                        <button
                            type="button"
                            disabled={!can("dataview:force-refresh")}
                            onClick={() => action("dataview:force-refresh")}
                            style={can("dataview:force-refresh") ? buttonStyle : disabledButtonStyle}
                        >
                            Refresh DV
                        </button>
                        <button
                            type="button"
                            disabled={!can("tasks:open")}
                            onClick={() => action("tasks:open")}
                            style={can("tasks:open") ? buttonStyle : disabledButtonStyle}
                        >
                            Tasks
                        </button>
                        <button
                            type="button"
                            disabled={!can("metadata-menu:open")}
                            onClick={() => action("metadata-menu:open")}
                            style={can("metadata-menu:open") ? buttonStyle : disabledButtonStyle}
                        >
                            Metadata
                        </button>
                    </span>
                )}
                {index.rebuild && (
                    <button
                        type="button"
                        onClick={onRebuild}
                        style={{ ...buttonStyle, marginLeft: "12px" }}
                    >
                        Rebuild Index
                    </button>
                )}
            </h2>

            {latestTrade && reviewHints.length > 0 && (
                <div
                    style={{
                        border: "1px solid var(--background-modifier-border)",
                        borderRadius: "10px",
                        padding: "12px",
                        marginBottom: "16px",
                        background: "var(--background-primary)",
                    }}
                >
                    <div style={{ fontWeight: 600, marginBottom: "8px" }}>
                        Review Hints
                        <span style={{ fontWeight: 400, marginLeft: "8px", color: "var(--text-muted)", fontSize: "0.85em" }}>
                            {latestTrade.name}
                        </span>
                    </div>
                    <ul style={{ margin: 0, paddingLeft: "18px" }}>
                        {reviewHints.slice(0, 4).map((h) => (
                            <li key={h.id} style={{ marginBottom: "6px" }}>
                                <div>{h.zh}</div>
                                <div style={{ color: "var(--text-muted)", fontSize: "0.85em" }}>{h.en}</div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {strategyPicks.length > 0 && (
                <div
                    style={{
                        border: "1px solid var(--background-modifier-border)",
                        borderRadius: "10px",
                        padding: "12px",
                        marginBottom: "16px",
                        background: "var(--background-primary)",
                    }}
                >
                    <div style={{ fontWeight: 600, marginBottom: "8px" }}>Today's Strategy Picks</div>
                    <ul style={{ margin: 0, paddingLeft: "18px" }}>
                        {strategyPicks.map((s) => (
                            <li key={s.path} style={{ marginBottom: "6px" }}>
                                <button
                                    type="button"
                                    onClick={() => openFile(s.path)}
                                    style={{
                                        padding: 0,
                                        border: "none",
                                        background: "transparent",
                                        color: "var(--text-accent)",
                                        cursor: "pointer",
                                        textAlign: "left",
                                    }}
                                >
                                    {s.canonicalName}
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <div
                style={{
                    border: "1px solid var(--background-modifier-border)",
                    borderRadius: "10px",
                    padding: "12px",
                    marginBottom: "16px",
                    background: "var(--background-primary)",
                }}
            >
                <div style={{ fontWeight: 600, marginBottom: "8px" }}>Trading Hub</div>

                <div
                    style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "12px",
                        marginBottom: "12px",
                    }}
                >
                    <StatsCard title="Today Trades" value={todaySummary.All.countTotal} icon="🗓️" />
                    <StatsCard
                        title="Today PnL"
                        value={`${todaySummary.All.netProfit > 0 ? "+" : ""}${todaySummary.All.netProfit.toFixed(1)}R`}
                        color={todaySummary.All.netProfit >= 0 ? "var(--text-success)" : "var(--text-error)"}
                        icon="📈"
                    />
                    <div
                        style={{
                            flex: "1 1 240px",
                            minWidth: "240px",
                            border: "1px solid var(--background-modifier-border)",
                            borderRadius: "12px",
                            padding: "16px",
                            background: `rgba(var(--mono-rgb-100), 0.05)`,
                        }}
                    >
                        <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", letterSpacing: "0.05em" }}>
                            Latest Trade
                            <span style={{ marginLeft: "6px", color: "var(--text-faint)" }}>{todayIso}</span>
                        </div>
                        <div style={{ marginTop: "8px", fontWeight: 700, fontSize: "1.1rem" }}>
                            {todayLatestTrade ? (
                                <button
                                    type="button"
                                    onClick={() => openFile(todayLatestTrade.path)}
                                    style={{
                                        padding: 0,
                                        border: "none",
                                        background: "transparent",
                                        color: "var(--text-accent)",
                                        cursor: "pointer",
                                        textAlign: "left",
                                    }}
                                >
                                    {todayLatestTrade.ticker ?? "Unknown"} • {todayLatestTrade.name}
                                </button>
                            ) : (
                                <span style={{ color: "var(--text-faint)" }}>—</span>
                            )}
                        </div>
                        <div style={{ marginTop: "6px", color: "var(--text-muted)", fontSize: "0.85em" }}>
                            {todayTrades.length > 0 ? `${todayTrades.length} trades today` : "No trades today"}
                        </div>
                    </div>
                </div>

                <div style={{ marginBottom: "12px" }}>
                    <div style={{ fontWeight: 600, marginBottom: "8px" }}>Quick Open</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        <button
                            type="button"
                            disabled={!can("quickadd:new-live-trade")}
                            onClick={() => action("quickadd:new-live-trade")}
                            style={can("quickadd:new-live-trade") ? buttonStyle : disabledButtonStyle}
                        >
                            New Live Trade
                        </button>
                        <button
                            type="button"
                            disabled={!can("quickadd:new-demo-trade")}
                            onClick={() => action("quickadd:new-demo-trade")}
                            style={can("quickadd:new-demo-trade") ? buttonStyle : disabledButtonStyle}
                        >
                            New Demo Trade
                        </button>
                        <button
                            type="button"
                            disabled={!can("quickadd:new-backtest")}
                            onClick={() => action("quickadd:new-backtest")}
                            style={can("quickadd:new-backtest") ? buttonStyle : disabledButtonStyle}
                        >
                            New Backtest
                        </button>
                        {!can("quickadd:new-live-trade") && !can("quickadd:new-demo-trade") && !can("quickadd:new-backtest") && (
                            <span style={{ color: "var(--text-muted)", fontSize: "0.85em", alignSelf: "center" }}>
                                QuickAdd unavailable
                            </span>
                        )}
                    </div>
                </div>

                <div>
                    <div style={{ fontWeight: 600, marginBottom: "8px" }}>Recent R Trend</div>
                    <div style={{ color: "var(--text-muted)", fontSize: "0.85em", marginBottom: "8px" }}>Last 10</div>
                    {(["Live", "Demo", "Backtest"] as const).map((at) => (
                        <TrendRow
                            key={`r10-${at}`}
                            label={at}
                            value={rLast10[at]}
                            ratio={r10MaxAbs > 0 ? rLast10[at] / r10MaxAbs : 0}
                            color={getRColorByAccountType(at)}
                        />
                    ))}
                    <div style={{ color: "var(--text-muted)", fontSize: "0.85em", margin: "10px 0 8px" }}>Last 30</div>
                    {(["Live", "Demo", "Backtest"] as const).map((at) => (
                        <TrendRow
                            key={`r30-${at}`}
                            label={at}
                            value={rLast30[at]}
                            ratio={r30MaxAbs > 0 ? rLast30[at] / r30MaxAbs : 0}
                            color={getRColorByAccountType(at)}
                        />
                    ))}
                </div>
            </div>

            {/* Stats Row */}
            <div style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "12px",
                marginBottom: "24px"
            }}>
                <StatsCard
                    title="Total Trades"
                    value={all.countTotal}
                    icon="📊"
                />
                <StatsCard
                    title="Net PnL"
                    value={`${all.netProfit > 0 ? "+" : ""}${all.netProfit.toFixed(1)}R`}
                    color={all.netProfit >= 0 ? "var(--text-success)" : "var(--text-error)"}
                    icon="💰"
                />
                <StatsCard
                    title="Win Rate"
                    value={`${all.winRatePct}%`}
                    color={all.winRatePct > 50 ? "var(--text-success)" : "var(--text-warning)"}
                    icon="🎯"
                />
            </div>

			<div
				style={{
					display: "flex",
					flexWrap: "wrap",
					gap: "12px",
					marginBottom: "24px",
				}}
			>
				<StatsCard
					title="Live"
					value={`${summary.Live.countTotal} trades`}
					subValue={`${summary.Live.winRatePct}% • ${summary.Live.netProfit.toFixed(1)}R`}
					icon="🟢"
				/>
				<StatsCard
					title="Demo"
					value={`${summary.Demo.countTotal} trades`}
					subValue={`${summary.Demo.winRatePct}% • ${summary.Demo.netProfit.toFixed(1)}R`}
					icon="🟡"
				/>
				<StatsCard
					title="Backtest"
					value={`${summary.Backtest.countTotal} trades`}
					subValue={`${summary.Backtest.winRatePct}% • ${summary.Backtest.netProfit.toFixed(1)}R`}
					icon="🔵"
				/>
			</div>

            <div
                style={{
                    border: "1px solid var(--background-modifier-border)",
                    borderRadius: "10px",
                    padding: "12px",
                    marginBottom: "16px",
                    background: "var(--background-primary)",
                }}
            >
                <div style={{ fontWeight: 600, marginBottom: "8px" }}>Today</div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.9em", marginBottom: "10px" }}>
                    Market Cycle: {todayMarketCycle ?? "—"}
                </div>

                {todayStrategyPicks.length > 0 && (
                    <div style={{ marginBottom: "12px" }}>
                        <div style={{ fontWeight: 600, marginBottom: "8px" }}>Cycle → Strategy Picks</div>
                        <ul style={{ margin: 0, paddingLeft: "18px" }}>
                            {todayStrategyPicks.map((s) => (
                                <li key={`today-pick-${s.path}`} style={{ marginBottom: "6px" }}>
                                    <button
                                        type="button"
                                        onClick={() => openFile(s.path)}
                                        style={{
                                            padding: 0,
                                            border: "none",
                                            background: "transparent",
                                            color: "var(--text-accent)",
                                            cursor: "pointer",
                                            textAlign: "left",
                                        }}
                                    >
                                        {s.canonicalName}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}

                {openTrade && (
                    <div>
                        <div style={{ fontWeight: 600, marginBottom: "8px" }}>In-Progress Trade Assistant</div>
                        <div style={{ color: "var(--text-muted)", fontSize: "0.9em", marginBottom: "8px" }}>
                            <button
                                type="button"
                                onClick={() => openFile(openTrade.path)}
                                style={{
                                    padding: 0,
                                    border: "none",
                                    background: "transparent",
                                    color: "var(--text-accent)",
                                    cursor: "pointer",
                                    textAlign: "left",
                                }}
                            >
                                {openTrade.ticker ?? "Unknown"} • {openTrade.name}
                            </button>
                        </div>

                        {openTradeStrategy ? (
                            <div>
                                <div style={{ marginBottom: "8px" }}>
                                    Strategy: {" "}
                                    <button
                                        type="button"
                                        onClick={() => openFile(openTradeStrategy.path)}
                                        style={{
                                            padding: 0,
                                            border: "none",
                                            background: "transparent",
                                            color: "var(--text-accent)",
                                            cursor: "pointer",
                                            textAlign: "left",
                                    }}
                                    >
                                        {openTradeStrategy.canonicalName}
                                    </button>
                                </div>

                                <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "8px" }}>
                                    {(openTradeStrategy.entryCriteria?.length ?? 0) > 0 && (
                                        <div>
                                            <div style={{ fontWeight: 600, marginBottom: "4px" }}>Entry</div>
                                            <ul style={{ margin: 0, paddingLeft: "18px" }}>
                                                {openTradeStrategy.entryCriteria!.slice(0, 3).map((x, i) => (
                                                    <li key={`entry-${i}`}>{x}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {(openTradeStrategy.stopLossRecommendation?.length ?? 0) > 0 && (
                                        <div>
                                            <div style={{ fontWeight: 600, marginBottom: "4px" }}>Stop</div>
                                            <ul style={{ margin: 0, paddingLeft: "18px" }}>
                                                {openTradeStrategy.stopLossRecommendation!.slice(0, 3).map((x, i) => (
                                                    <li key={`stop-${i}`}>{x}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {(openTradeStrategy.riskAlerts?.length ?? 0) > 0 && (
                                        <div>
                                            <div style={{ fontWeight: 600, marginBottom: "4px" }}>Risk</div>
                                            <ul style={{ margin: 0, paddingLeft: "18px" }}>
                                                {openTradeStrategy.riskAlerts!.slice(0, 3).map((x, i) => (
                                                    <li key={`risk-${i}`}>{x}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                    {(openTradeStrategy.takeProfitRecommendation?.length ?? 0) > 0 && (
                                        <div>
                                            <div style={{ fontWeight: 600, marginBottom: "4px" }}>Target</div>
                                            <ul style={{ margin: 0, paddingLeft: "18px" }}>
                                                {openTradeStrategy.takeProfitRecommendation!.slice(0, 3).map((x, i) => (
                                                    <li key={`tp-${i}`}>{x}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>No matched strategy found.</div>
                        )}
                    </div>
                )}
            </div>

            <div
                style={{
                    border: "1px solid var(--background-modifier-border)",
                    borderRadius: "10px",
                    padding: "12px",
                    marginBottom: "16px",
                    background: "var(--background-primary)",
                }}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "10px",
                        marginBottom: "8px",
                    }}
                >
                    <div style={{ fontWeight: 600 }}>Analytics</div>
                    <label
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            color: "var(--text-muted)",
                            fontSize: "0.9em",
                        }}
                    >
                        Scope
                        <select
                            value={analyticsScope}
                            onChange={(e) => setAnalyticsScope(e.target.value as AnalyticsScope)}
                            style={selectStyle}
                        >
                            <option value="Live">Live</option>
                            <option value="Demo">Demo</option>
                            <option value="Backtest">Backtest</option>
                            <option value="All">All</option>
                        </select>
                    </label>
                </div>

                <div style={{ display: "flex", flexWrap: "wrap", gap: "14px" }}>
                    <div style={{ flex: "1 1 320px", minWidth: "320px" }}>
                        <div style={{ fontWeight: 600, marginBottom: "8px" }}>Calendar (Last {calendarDays} days)</div>
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                                gap: "6px",
                            }}
                        >
                            {calendarCells.map((c) => {
                                const absRatio = calendarMaxAbs > 0 ? Math.min(1, Math.abs(c.netR) / calendarMaxAbs) : 0;
                                const alpha = c.count > 0 ? 0.12 + 0.55 * absRatio : 0.04;
                                const bg =
                                    c.netR > 0
                                        ? `rgba(var(--color-green-rgb), ${alpha})`
                                        : c.netR < 0
                                            ? `rgba(var(--color-red-rgb), ${alpha})`
                                            : `rgba(var(--mono-rgb-100), 0.05)`;
                                return (
                                    <div
                                        key={`cal-${c.dateIso}`}
                                        title={`${c.dateIso} • ${c.count} trades • ${c.netR >= 0 ? "+" : ""}${c.netR.toFixed(1)}R`}
                                        style={{
                                            border: "1px solid var(--background-modifier-border)",
                                            borderRadius: "6px",
                                            padding: "6px",
                                            background: bg,
                                            minHeight: "40px",
                                            display: "flex",
                                            flexDirection: "column",
                                            justifyContent: "space-between",
                                        }}
                                    >
                                        <div style={{ fontSize: "0.85em", color: "var(--text-muted)" }}>{getDayOfMonth(c.dateIso)}</div>
                                        <div
                                            style={{
                                                fontSize: "0.85em",
                                                fontWeight: 600,
                                                color:
                                                    c.netR > 0
                                                        ? "var(--text-success)"
                                                        : c.netR < 0
                                                            ? "var(--text-error)"
                                                            : "var(--text-faint)",
                                                textAlign: "right",
                                            }}
                                        >
                                            {c.count > 0 ? `${c.netR >= 0 ? "+" : ""}${c.netR.toFixed(1)}R` : "—"}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div style={{ flex: "1 1 360px", minWidth: "360px" }}>
                        <div style={{ fontWeight: 600, marginBottom: "8px" }}>Equity Curve</div>
                        {equitySeries.length > 1 ? (
                            (() => {
                                const w = 520;
                                const h = 160;
                                const pad = 14;
                                const ys = equitySeries.map((p) => p.equityR);
                                const minY = Math.min(...ys);
                                const maxY = Math.max(...ys);
                                const span = Math.max(1e-6, maxY - minY);
                                const xStep = (w - pad * 2) / Math.max(1, equitySeries.length - 1);
                                const points = equitySeries
                                    .map((p, i) => {
                                        const x = pad + i * xStep;
                                        const y = pad + (1 - (p.equityR - minY) / span) * (h - pad * 2);
                                        return `${x.toFixed(1)},${y.toFixed(1)}`;
                                    })
                                    .join(" ");

                                const last = equitySeries[equitySeries.length - 1];
                                return (
                                    <div>
                                        <svg
                                            viewBox={`0 0 ${w} ${h}`}
                                            width="100%"
                                            height="160"
                                            style={{
                                                border: "1px solid var(--background-modifier-border)",
                                                borderRadius: "8px",
                                                background: `rgba(var(--mono-rgb-100), 0.03)`,
                                            }}
                                        >
                                            <polyline
                                                points={points}
                                                fill="none"
                                                stroke="var(--text-accent)"
                                                strokeWidth="2"
                                                strokeLinejoin="round"
                                                strokeLinecap="round"
                                            />
                                        </svg>
                                        <div style={{ marginTop: "6px", color: "var(--text-muted)", fontSize: "0.9em" }}>
                                            Last:{" "}
                                            <span
                                                style={{
                                                    color: last.equityR >= 0 ? "var(--text-success)" : "var(--text-error)",
                                                    fontWeight: 600,
                                                }}
                                            >
                                                {last.equityR >= 0 ? "+" : ""}
                                                {last.equityR.toFixed(1)}R
                                            </span>
                                        </div>
                                    </div>
                                );
                            })()
                        ) : (
                            <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>Not enough data.</div>
                        )}

                        <div style={{ fontWeight: 600, margin: "14px 0 8px" }}>Strategy Attribution (Top)</div>
                        {strategyAttribution.length > 0 ? (
                            <ul style={{ margin: 0, paddingLeft: "18px" }}>
                                {strategyAttribution.map((r) => (
                                    <li key={`attr-${r.strategyName}`} style={{ marginBottom: "6px" }}>
                                        {r.strategyPath ? (
                                            <button
                                                type="button"
                                                onClick={() => openFile(r.strategyPath!)}
                                                style={{
                                                    padding: 0,
                                                    border: "none",
                                                    background: "transparent",
                                                    color: "var(--text-accent)",
                                                    cursor: "pointer",
                                                    textAlign: "left",
                                                }}
                                            >
                                                {r.strategyName}
                                            </button>
                                        ) : (
                                            <span>{r.strategyName}</span>
                                        )}
                                        <span style={{ color: "var(--text-muted)", marginLeft: "8px", fontSize: "0.9em" }}>
                                            {r.count} trades •{" "}
                                            <span
                                                style={{
                                                    color: r.netR >= 0 ? "var(--text-success)" : "var(--text-error)",
                                                    fontWeight: 600,
                                                }}
                                            >
                                                {r.netR >= 0 ? "+" : ""}
                                                {r.netR.toFixed(1)}R
                                            </span>
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>No strategy data found.</div>
                        )}
                    </div>
                </div>
            </div>

            <div
                style={{
                    border: "1px solid var(--background-modifier-border)",
                    borderRadius: "10px",
                    padding: "12px",
                    marginBottom: "16px",
                    background: "var(--background-primary)",
                }}
            >
                <div style={{ fontWeight: 600, marginBottom: "8px" }}>Gallery</div>
                {!getResourceUrl ? (
                    <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>Gallery unavailable.</div>
                ) : galleryItems.length > 0 ? (
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                            gap: "8px",
                        }}
                    >
                        {galleryItems.map((it) => (
                            <button
                                key={`gal-${it.coverPath}`}
                                type="button"
                                onClick={() => openFile(it.coverPath)}
                                title={it.coverPath}
                                style={{
                                    padding: 0,
                                    border: "1px solid var(--background-modifier-border)",
                                    borderRadius: "8px",
                                    overflow: "hidden",
                                    background: `rgba(var(--mono-rgb-100), 0.03)`,
                                    cursor: "pointer",
                                }}
                            >
                                {it.url ? (
                                    <img
                                        src={it.url}
                                        alt=""
                                        style={{
                                            width: "100%",
                                            height: "120px",
                                            objectFit: "cover",
                                            display: "block",
                                        }}
                                    />
                                ) : (
                                    <div style={{ height: "120px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-faint)", fontSize: "0.85em" }}>
                                        —
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>
                ) : (
                    <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>No cover images found.</div>
                )}
            </div>

            <div
                style={{
                    border: "1px solid var(--background-modifier-border)",
                    borderRadius: "10px",
                    padding: "12px",
                    marginBottom: "16px",
                    background: "var(--background-primary)",
                }}
            >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px", marginBottom: "8px" }}>
                    <div style={{ fontWeight: 600 }}>Inspector / Schema Monitor</div>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <button
                            type="button"
                            onClick={() => setShowFixPlan((v) => !v)}
                            disabled={!enumPresets}
                            style={{ padding: "6px 10px" }}
                            title={!enumPresets ? "Enum presets unavailable" : "Toggle FixPlan preview"}
                        >
                            {showFixPlan ? "Hide FixPlan" : "Show FixPlan"}
                        </button>
                    </div>
                </div>

                <div style={{ color: "var(--text-faint)", fontSize: "0.9em", marginBottom: "10px" }}>
                    Read-only: issues are reported and FixPlan is preview-only (no vault writes).
                    <span style={{ marginLeft: "8px" }}>
                        Enum presets: {enumPresets ? "loaded" : "unavailable"}
                    </span>
                </div>

                {(() => {
                    const errorCount = inspectorIssues.filter((i) => i.severity === "error").length;
                    const warnCount = inspectorIssues.filter((i) => i.severity === "warn").length;
                    return (
                        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "10px" }}>
                            <div style={{ color: "var(--text-error)" }}>Errors: {errorCount}</div>
                            <div style={{ color: "var(--text-warning)" }}>Warnings: {warnCount}</div>
                            <div style={{ color: "var(--text-muted)" }}>Total: {inspectorIssues.length}</div>
                        </div>
                    );
                })()}

                {inspectorIssues.length === 0 ? (
                    <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>No issues found.</div>
                ) : (
                    <div style={{ maxHeight: "240px", overflow: "auto", border: "1px solid var(--background-modifier-border)", borderRadius: "8px" }}>
                        {inspectorIssues.slice(0, 50).map((issue) => (
                            <button
                                key={issue.id}
                                type="button"
                                onClick={() => openFile(issue.path)}
                                title={issue.path}
                                style={{
                                    width: "100%",
                                    textAlign: "left",
                                    padding: "8px 10px",
                                    border: "none",
                                    borderBottom: "1px solid var(--background-modifier-border)",
                                    background: "transparent",
                                    cursor: "pointer",
                                }}
                            >
                                <div style={{ display: "flex", gap: "10px", alignItems: "baseline" }}>
                                    <div style={{ width: "60px", color: issue.severity === "error" ? "var(--text-error)" : "var(--text-warning)", fontWeight: 600 }}>
                                        {issue.severity.toUpperCase()}
                                    </div>
                                    <div style={{ flex: "1 1 auto" }}>
                                        <div style={{ fontWeight: 600 }}>{issue.title}</div>
                                        <div style={{ color: "var(--text-faint)", fontSize: "0.85em" }}>
                                            {issue.path}
                                            {issue.detail ? ` — ${issue.detail}` : ""}
                                        </div>
                                    </div>
                                </div>
                            </button>
                        ))}
                        {inspectorIssues.length > 50 ? (
                            <div style={{ padding: "8px 10px", color: "var(--text-faint)", fontSize: "0.85em" }}>
                                Showing first 50 issues.
                            </div>
                        ) : null}
                    </div>
                )}

                {showFixPlan ? (
                    enumPresets ? (
                        <div style={{ marginTop: "10px" }}>
                            <div style={{ fontWeight: 600, marginBottom: "6px" }}>FixPlan (preview)</div>
                            <pre
                                style={{
                                    margin: 0,
                                    padding: "10px",
                                    border: "1px solid var(--background-modifier-border)",
                                    borderRadius: "8px",
                                    background: "rgba(var(--mono-rgb-100), 0.03)",
                                    maxHeight: "220px",
                                    overflow: "auto",
                                    whiteSpace: "pre-wrap",
                                }}
                            >
                                {fixPlanText ?? ""}
                            </pre>
                        </div>
                    ) : (
                        <div style={{ marginTop: "10px", color: "var(--text-faint)", fontSize: "0.9em" }}>
                            Enum presets unavailable. FixPlan generation is disabled.
                        </div>
                    )
                ) : null}
            </div>

            {/* Main Content Area */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "20px" }}>
                {/* Trade Feed */}
                <div>
                    <h3 style={{ marginBottom: "12px" }}>Recent Activity</h3>
					<TradeList trades={trades.slice(0, 50)} onOpenFile={openFile} />
                </div>
            </div>
        </div>
    );
};

export class ConsoleView extends ItemView {
    private index: TradeIndex;
    private strategyIndex: StrategyIndex;
    private todayContext?: TodayContext;
	private integrations?: PluginIntegrationRegistry;
	private version: string;
	private root: Root | null = null;
	private mountEl: HTMLElement | null = null;

    constructor(
        leaf: WorkspaceLeaf,
        index: TradeIndex,
        strategyIndex: StrategyIndex,
		todayContext: TodayContext,
        integrations: PluginIntegrationRegistry,
        version: string
    ) {
        super(leaf);
        this.index = index;
        this.strategyIndex = strategyIndex;
		this.todayContext = todayContext;
		this.integrations = integrations;
		this.version = version;
    }

    getViewType() {
        return VIEW_TYPE_CONSOLE;
    }

    getDisplayText() {
        return "Trader Console";
    }

    getIcon() {
        return "bar-chart-2";
    }

    async onOpen() {
        const openFile = (path: string) => {
			this.app.workspace.openLinkText(path, "", true);
		};

        const resolveLink = (linkText: string, fromPath: string): string | undefined => {
            const cleaned = String(linkText ?? "").trim();
            if (!cleaned) return undefined;
            const dest = this.app.metadataCache.getFirstLinkpathDest(cleaned, fromPath);
            return dest?.path;
        };

        const getResourceUrl = (path: string): string | undefined => {
            const af = this.app.vault.getAbstractFileByPath(path);
            if (!(af instanceof TFile)) return undefined;
            return this.app.vault.getResourcePath(af);
        };

        let enumPresets: EnumPresets | undefined = undefined;
        try {
            const presetsPath = "Templates/属性值预设.md";
            const af = this.app.vault.getAbstractFileByPath(presetsPath);
            if (af instanceof TFile) {
                let fm = this.app.metadataCache.getFileCache(af)?.frontmatter as any;
                if (!fm) {
                    const text = await this.app.vault.read(af);
                    const m = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n/);
                    if (m && m[1]) fm = parseYaml(m[1]);
                }
                if (fm && typeof fm === "object") {
                    enumPresets = createEnumPresetsFromFrontmatter(fm as Record<string, unknown>);
                }
            }
        } catch (e) {
            // best-effort only; dashboard should still render without presets
        }

        this.contentEl.empty();
        this.mountEl = this.contentEl.createDiv();
        this.root = createRoot(this.mountEl);
        this.root.render(
            <ConsoleErrorBoundary>
                <ConsoleComponent
                    index={this.index}
                    strategyIndex={this.strategyIndex}
					todayContext={this.todayContext}
					resolveLink={resolveLink}
					getResourceUrl={getResourceUrl}
					enumPresets={enumPresets}
                    integrations={this.integrations}
                    openFile={openFile}
                    version={this.version}
                />
            </ConsoleErrorBoundary>
        );
    }

    async onClose() {
        this.root?.unmount();
        this.root = null;
        this.mountEl = null;
    }
}
