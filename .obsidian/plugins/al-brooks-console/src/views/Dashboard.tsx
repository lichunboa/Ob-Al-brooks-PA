import * as React from "react";
import { ItemView, WorkspaceLeaf } from "obsidian";
import * as ReactDOM from "react-dom";
import { TradeIndex } from "../core/indexer";
import { StatsCard } from "./components/StatsCard";
import { TradeList } from "./components/TradeList";

export const VIEW_TYPE_CONSOLE = "al-brooks-console-view";

interface Props {
    index: TradeIndex;
}

const ConsoleComponent: React.FC<Props> = ({ index }) => {
    const [stats, setStats] = React.useState(index.stats);
    const [trades, setTrades] = React.useState(index.getAllTrades());

    // Calculate dynamic stats
    const totalPnl = React.useMemo(() => trades.reduce((acc, t) => acc + t.pnl, 0), [trades]);
    const winRate = React.useMemo(() => {
        const closed = trades.filter(t => t.outcome === "Win" || t.outcome === "Loss");
        if (closed.length === 0) return 0;
        const wins = closed.filter(t => t.outcome === "Win").length;
        return Math.round((wins / closed.length) * 100);
    }, [trades]);

    React.useEffect(() => {
        const onUpdate = () => {
            setStats({ ...index.stats });
            setTrades(index.getAllTrades());
        };

        // Listen to events
        index.on("index-updated", onUpdate);

        // Initial Load
        onUpdate();

        return () => {
            index.off("index-updated", onUpdate);
        };
    }, [index]);

    return (
        <div style={{ padding: "16px", fontFamily: "var(--font-interface)", maxWidth: "1200px", margin: "0 auto" }}>
            <h2 style={{
                borderBottom: "1px solid var(--background-modifier-border)",
                paddingBottom: "10px",
                marginBottom: "20px"
            }}>
                🦁 Trader Dashboard
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
                    value={stats.totalTrades}
                    icon="📊"
                />
                <StatsCard
                    title="Net PnL"
                    value={`${totalPnl > 0 ? "+" : ""}${totalPnl.toFixed(1)}R`}
                    color={totalPnl >= 0 ? "#10b981" : "#ef4444"}
                    icon="💰"
                />
                <StatsCard
                    title="Win Rate"
                    value={`${winRate}%`}
                    color={winRate > 50 ? "#10b981" : "#eab308"}
                    icon="🎯"
                />
            </div>

            {/* Main Content Area */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "20px" }}>
                {/* Trade Feed */}
                <div>
                    <h3 style={{ marginBottom: "12px" }}>Recent Activity</h3>
                    <TradeList trades={trades.slice(0, 50)} />
                </div>
            </div>
        </div>
    );
};

export class ConsoleView extends ItemView {
    private index: TradeIndex;

    constructor(leaf: WorkspaceLeaf, index: TradeIndex) {
        super(leaf);
        this.index = index;
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
        ReactDOM.render(
            <ConsoleComponent index={this.index} />,
            this.containerEl.children[1]
        );
    }

    async onClose() {
        ReactDOM.unmountComponentAtNode(this.containerEl.children[1]);
    }
}
