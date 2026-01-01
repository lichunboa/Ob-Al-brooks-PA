import * as React from "react";
import { ItemView, WorkspaceLeaf } from "obsidian";
import * as ReactDOM from "react-dom";
import { TradeIndex } from "../core/indexer";

export const VIEW_TYPE_CONSOLE = "al-brooks-console-view";

interface Props {
    index: TradeIndex;
}

const ConsoleComponent: React.FC<Props> = ({ index }) => {
    const [stats, setStats] = React.useState(index.stats);
    const [trades, setTrades] = React.useState(index.getAllTrades());

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
        <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
            <h1 style={{ color: "#3b82f6" }}>🦁 Trader Console (Bespoke)</h1>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "20px" }}>
                <div style={{ padding: "15px", background: "rgba(59, 130, 246, 0.1)", borderRadius: "8px" }}>
                    <strong>Total Trades</strong>
                    <div style={{ fontSize: "2rem", fontWeight: "bold" }}>{stats.totalTrades}</div>
                </div>
                <div style={{ padding: "15px", background: "rgba(16, 185, 129, 0.1)", borderRadius: "8px" }}>
                    <strong>Last Scan</strong>
                    <div>{new Date(stats.lastScan).toLocaleTimeString()}</div>
                </div>
            </div>

            <h3>Recent Trades</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {trades.slice(0, 5).map(t => (
                    <div key={t.path} style={{
                        padding: "10px",
                        border: "1px solid #333",
                        borderRadius: "6px",
                        display: "flex",
                        justifyContent: "space-between"
                    }}>
                        <span>{t.date}</span>
                        <strong>{t.ticker}</strong>
                        <span style={{
                            color: t.pnl > 0 ? "#10b981" : (t.pnl < 0 ? "#ef4444" : "#888")
                        }}>
                            {t.pnl > 0 ? "+" : ""}{t.pnl}R
                        </span>
                    </div>
                ))}
                {trades.length === 0 && <div>Scanning vault... (0 trades found)</div>}
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
