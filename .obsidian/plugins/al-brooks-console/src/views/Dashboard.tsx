import * as React from "react";
import { ItemView, WorkspaceLeaf } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import type { TradeIndex, TradeIndexStatus } from "../core/trade-index";
import { computeTradeStatsByAccountType } from "../core/stats";
import { buildReviewHints } from "../core/review-hints";
import type { AccountType, TradeRecord } from "../core/contracts";
import type { StrategyIndex } from "../core/strategy-index";
import { matchStrategies } from "../core/strategy-matcher";
import { StatsCard } from "./components/StatsCard";
import { TradeList } from "./components/TradeList";
import type { IntegrationCapability } from "../integrations/contracts";
import type { PluginIntegrationRegistry } from "../integrations/PluginIntegrationRegistry";

function toLocalDateIso(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
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

const ConsoleComponent: React.FC<Props> = ({ index, strategyIndex, openFile, integrations, version }) => {
    const [trades, setTrades] = React.useState(index.getAll());
    const [status, setStatus] = React.useState<TradeIndexStatus>(() =>
        index.getStatus ? index.getStatus() : { phase: "ready" }
    );

    const summary = React.useMemo(() => computeTradeStatsByAccountType(trades), [trades]);
    const all = summary.All;

    React.useEffect(() => {
		const onUpdate = () => setTrades(index.getAll());
		const unsubscribe = index.onChanged(onUpdate);
		onUpdate();
		return unsubscribe;
    }, [index]);

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
        const marketCycleStr = typeof marketCycle === "string" ? marketCycle.trim() : undefined;
        const setupCategory = (fm["setup_category"] ?? fm["设置类别/setup_category"]) as any;
        const setupCategoryStr = typeof setupCategory === "string" ? setupCategory.trim() : undefined;
        return matchStrategies(strategyIndex, {
            marketCycle: marketCycleStr,
            setupCategory: setupCategoryStr,
            patterns,
            limit: 6,
        });
    }, [latestTrade, strategyIndex]);

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
	private integrations?: PluginIntegrationRegistry;
	private version: string;
	private root: Root | null = null;
	private mountEl: HTMLElement | null = null;

    constructor(
        leaf: WorkspaceLeaf,
        index: TradeIndex,
        strategyIndex: StrategyIndex,
        integrations: PluginIntegrationRegistry,
        version: string
    ) {
        super(leaf);
        this.index = index;
        this.strategyIndex = strategyIndex;
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

        this.contentEl.empty();
        this.mountEl = this.contentEl.createDiv();
        this.root = createRoot(this.mountEl);
        this.root.render(
            <ConsoleErrorBoundary>
                <ConsoleComponent
                    index={this.index}
                    strategyIndex={this.strategyIndex}
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
