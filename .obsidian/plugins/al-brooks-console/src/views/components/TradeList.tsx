import * as React from "react";
import { TradeData } from "../../types";

interface TradeListProps {
    trades: TradeData[];
}

export const TradeList: React.FC<TradeListProps> = ({ trades }) => {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {trades.map(t => {
                const isWin = t.pnl > 0;
                const isLoss = t.pnl < 0;
                const pnlColor = isWin ? "#10b981" : (isLoss ? "#ef4444" : "var(--text-muted)");

                return (
                    <div key={t.path} style={{
                        padding: "12px",
                        background: "var(--background-primary)",
                        border: "1px solid var(--background-modifier-border)",
                        borderRadius: "8px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        cursor: "pointer",
                        transition: "all 0.2s ease"
                    }}
                        onClick={() => {
                            // Open file
                            (window as any).app.workspace.openLinkText(t.path, "", true);
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--interactive-accent)"}
                        onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--background-modifier-border)"}
                    >
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <div style={{ fontWeight: "600", fontSize: "1rem" }}>{t.ticker}</div>
                            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                                {t.date} • {t.setup || "No Setup"}
                            </div>
                        </div>

                        <div style={{ textAlign: "right" }}>
                            <div style={{
                                fontWeight: "700",
                                color: pnlColor,
                                fontSize: "1.1rem"
                            }}>
                                {t.pnl > 0 ? "+" : ""}{t.pnl}R
                            </div>
                            <div style={{ fontSize: "0.8rem", color: "var(--text-faint)" }}>
                                {t.direction}
                            </div>
                        </div>
                    </div>
                );
            })}
            {trades.length === 0 && (
                <div style={{ padding: "20px", textAlign: "center", color: "var(--text-faint)" }}>
                    No trades found. Start trading!
                </div>
            )}
        </div>
    );
};
