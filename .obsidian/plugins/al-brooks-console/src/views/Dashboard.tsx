import * as React from "react";
import { ItemView, WorkspaceLeaf } from "obsidian";
import * as ReactDOM from "react-dom";
import type { TradeIndex } from "../core/trade-index";
import { computeTradeStats } from "../core/stats";
import { StatsCard } from "./components/StatsCard";
import { TradeList } from "./components/TradeList";

export const VIEW_TYPE_CONSOLE = "al-brooks-console-view";

interface Props {
    index: TradeIndex;
	openFile: (path: string) => void;
}

const ConsoleComponent: React.FC<Props> = ({ index, openFile }) => {
    const [trades, setTrades] = React.useState(index.getAll());

	const summary = React.useMemo(() => computeTradeStats(trades), [trades]);

    React.useEffect(() => {
		const onUpdate = () => setTrades(index.getAll());
		const unsubscribe = index.onChanged(onUpdate);
		onUpdate();
		return unsubscribe;
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
                    value={summary.countTotal}
                    icon="📊"
                />
                <StatsCard
                    title="Net PnL"
                    value={`${summary.netProfit > 0 ? "+" : ""}${summary.netProfit.toFixed(1)}R`}
                    color={summary.netProfit >= 0 ? "var(--text-success)" : "var(--text-error)"}
                    icon="💰"
                />
                <StatsCard
                    title="Win Rate"
                    value={`${summary.winRatePct}%`}
                    color={summary.winRatePct > 50 ? "var(--text-success)" : "var(--text-warning)"}
                    icon="🎯"
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
        const openFile = (path: string) => {
			this.app.workspace.openLinkText(path, "", true);
		};

        ReactDOM.render(
            <ConsoleComponent index={this.index} openFile={openFile} />,
            this.containerEl.children[1]
        );
    }

    async onClose() {
        ReactDOM.unmountComponentAtNode(this.containerEl.children[1]);
    }
}
