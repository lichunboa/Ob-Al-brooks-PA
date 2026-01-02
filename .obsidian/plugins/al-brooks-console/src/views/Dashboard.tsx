import * as React from "react";
import { ItemView, WorkspaceLeaf } from "obsidian";
import { createRoot, Root } from "react-dom/client";
import type { TradeIndex, TradeIndexStatus } from "../core/trade-index";
import { computeTradeStatsByAccountType } from "../core/stats";
import { StatsCard } from "./components/StatsCard";
import { TradeList } from "./components/TradeList";
import type { IntegrationCapability } from "../integrations/contracts";
import type { PluginIntegrationRegistry } from "../integrations/PluginIntegrationRegistry";

export const VIEW_TYPE_CONSOLE = "al-brooks-console-view";

interface Props {
    index: TradeIndex;
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

const ConsoleComponent: React.FC<Props> = ({ index, openFile, integrations, version }) => {
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
	private integrations?: PluginIntegrationRegistry;
	private version: string;
	private root: Root | null = null;
	private mountEl: HTMLElement | null = null;

    constructor(leaf: WorkspaceLeaf, index: TradeIndex, integrations: PluginIntegrationRegistry, version: string) {
        super(leaf);
        this.index = index;
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
