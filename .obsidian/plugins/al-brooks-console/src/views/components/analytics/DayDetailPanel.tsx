import * as React from "react";

import type { TradeData } from "../../../types";
import { Button } from "../../../ui/components/Button";

interface DayDetailPanelProps {
    date: string;
    trades: TradeData[];
    onClose: () => void;
    onOpenFile: (path: string) => void;

    style?: React.CSSProperties;
}

export const DayDetailPanel: React.FC<DayDetailPanelProps> = ({
    date,
    trades,
    onClose,
    onOpenFile,

    style
}) => {
    // Calculate PnL for the day
    const dayPnl = trades.reduce((sum, t) => sum + (t.netProfit || 0), 0);
    const dayR = trades.reduce((sum, t) => sum + (typeof t.pnl === 'number' ? t.pnl : 0), 0);

    const winCount = trades.filter(t => (t.netProfit || 0) > 0).length;
    const totalCount = trades.length;
    const winRate = totalCount > 0 ? Math.round((winCount / totalCount) * 100) : 0;

    return (
        <div style={{
            display: "flex",
            flexDirection: "column",
            background: "var(--background-secondary)",
            borderLeft: "1px solid var(--background-modifier-border)",
            height: "100%",
            ...style
        }}>
            {/* Header */}
            <div style={{
                padding: "16px",
                borderBottom: "1px solid var(--background-modifier-border)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center"
            }}>
                <div>
                    <h3 style={{ margin: 0, fontSize: "1.1em" }}>{date}</h3>
                    <div style={{ fontSize: "0.9em", color: "var(--text-muted)", marginTop: "4px" }}>
                        {totalCount} Trades • {winRate}% Win Rate
                    </div>
                </div>
                <Button onClick={onClose} variant="text" style={{ padding: "4px 8px" }}>
                    ✕
                </Button>
            </div>

            {/* Scrolable Content */}
            <div style={{ flex: 1, overflowY: "auto", padding: "16px" }}>

                {/* PnL Summary */}
                <div style={{
                    marginBottom: "20px",
                    padding: "16px",
                    borderRadius: "8px",
                    background: dayPnl >= 0 ? "rgba(var(--color-green-rgb), 0.1)" : "rgba(var(--color-red-rgb), 0.1)",
                    border: `1px solid ${dayPnl >= 0 ? "var(--color-green)" : "var(--color-red)"}`,
                    textAlign: "center"
                }}>
                    <div style={{ fontSize: "0.9em", color: "var(--text-muted)", marginBottom: "4px" }}>Net Profit</div>
                    <div style={{
                        fontSize: "1.8em",
                        fontWeight: 700,
                        color: dayPnl >= 0 ? "var(--color-green)" : "var(--color-red)"
                    }}>
                        {dayPnl >= 0 ? "+" : ""}{dayPnl.toFixed(2)}
                    </div>
                </div>

                {/* Trade List */}
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {trades.map(trade => (
                        <div
                            key={trade.path}
                            onClick={() => onOpenFile(trade.path)}
                            style={{
                                padding: "12px",
                                background: "var(--background-primary)",
                                borderRadius: "8px",
                                border: "1px solid var(--background-modifier-border)",
                                cursor: "pointer",
                                transition: "all 0.2s"
                            }}
                            onMouseEnter={e => e.currentTarget.style.borderColor = "var(--interactive-accent)"}
                            onMouseLeave={e => e.currentTarget.style.borderColor = "var(--background-modifier-border)"}
                        >
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                                <span style={{ fontWeight: 600 }}>{trade.ticker}</span>
                                <span style={{
                                    color: (trade.netProfit || 0) >= 0 ? "var(--color-green)" : "var(--color-red)",
                                    fontWeight: 600
                                }}>
                                    {(trade.netProfit || 0) >= 0 ? "+" : ""}{(trade.netProfit || 0).toFixed(2)}
                                </span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85em", color: "var(--text-muted)" }}>
                                <span>{trade.strategyName || "No Strategy"}</span>
                                <span>{trade.direction}</span>
                            </div>
                        </div>
                    ))}

                    {trades.length === 0 && (
                        <div style={{ color: "var(--text-muted)", textAlign: "center", padding: "20px" }}>
                            No trades recorded for this day.
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
};
