import * as React from "react";
import type { TradeData } from "../../types";

interface TradeListProps {
    trades: TradeData[];
	onOpenFile: (path: string) => void;
}

export const TradeList: React.FC<TradeListProps> = ({ trades, onOpenFile }) => {
    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {trades.map(t => {
				const pnl = typeof t.pnl === "number" ? t.pnl : 0;
				const isWin = pnl > 0;
				const isLoss = pnl < 0;
				const pnlColor = isWin ? "var(--text-success)" : (isLoss ? "var(--text-error)" : "var(--text-muted)");

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
							onOpenFile(t.path);
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.borderColor = "var(--interactive-accent)"}
                        onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--background-modifier-border)"}
                    >
                        <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <div style={{ fontWeight: "600", fontSize: "1rem" }}>{t.ticker ?? "Unknown"}</div>
                            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
							{t.dateIso} • {""}
                            </div>
                        </div>

                        <div style={{ textAlign: "right" }}>
                            <div style={{
                                fontWeight: "700",
                                color: pnlColor,
                                fontSize: "1.1rem"
                            }}>
							{pnl > 0 ? "+" : ""}{pnl}R
                            </div>
                            <div style={{ fontSize: "0.8rem", color: "var(--text-faint)" }}>
							{t.outcome ?? ""}
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
