import * as React from "react";
import type { TradeRecord } from "../../../core/contracts";
import { V5_COLORS } from "../../../ui/tokens";

interface RawDataPanelProps {
    trades: TradeRecord[];
    openFile: (path: string) => void;
}

export const RawDataPanel: React.FC<RawDataPanelProps> = ({ trades, openFile }) => {
    const recentTrades = React.useMemo(() => {
        return trades.slice(0, 5);
    }, [trades]);

    const getOutcomeColor = (o?: string) => {
        if (!o || o === "unknown") return "var(--text-muted)";
        if (o === "win") return V5_COLORS.live;
        if (o === "loss") return V5_COLORS.loss;
        return "var(--text-normal)";
    };

    const getExecColor = (e?: string) => {
        const s = (e || "").toLowerCase();
        if (s.includes("完美") || s.includes("perfect") || s.includes("good")) return V5_COLORS.live;
        if (s.includes("fomo") || s.includes("chang")) return V5_COLORS.loss;
        if (s.includes("mistake") || s.includes("error")) return V5_COLORS.loss;
        return "var(--text-muted)";
    };

    return (
        <div
            style={{
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "8px",
                padding: "12px",
                background: "rgba(var(--mono-rgb-100), 0.03)",
                marginBottom: "20px",
            }}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "10px",
                }}
            >
                <div style={{ fontWeight: 700, fontSize: "1.05em" }}>
                    📄 原始数据明细 (Raw Data)
                </div>
                <div style={{ fontSize: "0.85em", color: "var(--text-muted)" }}>
                    最近 {recentTrades.length} 笔
                </div>
            </div>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "1.2fr 1.2fr 0.8fr 1.5fr 1fr 1.5fr",
                    gap: "8px",
                    fontSize: "0.9em",
                    alignItems: "center",
                    borderBottom: "1px solid var(--background-modifier-border)",
                    paddingBottom: "8px",
                    fontWeight: 600,
                    color: "var(--text-muted)",
                }}
            >
                <div>日期</div>
                <div>品种</div>
                <div>周期</div>
                <div>策略</div>
                <div>结果</div>
                <div>执行</div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
                {recentTrades.map((t) => {
                    const exec = (t as any).executionType ?? t.executionQuality ?? "未知/Unknown";

                    return (
                        <div
                            key={t.path}
                            onClick={() => openFile(t.path)}
                            className="nav-file-title"
                            style={{
                                display: "grid",
                                gridTemplateColumns: "1.2fr 1.2fr 0.8fr 1.5fr 1fr 1.5fr",
                                gap: "8px",
                                alignItems: "center",
                                fontSize: "0.9em",
                                padding: "6px 8px",
                                borderRadius: "6px",
                                background: "var(--background-primary)",
                                border: "1px solid var(--background-modifier-border)",
                                cursor: "pointer",
                            }}
                        >
                            <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {t.dateIso || "—"}
                            </div>
                            <div style={{ fontWeight: 600 }}>{t.ticker || "—"}</div>
                            <div>{t.timeframe || "—"}</div>
                            <div style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>
                                {t.strategyName || t.setupKey || "unknown"}
                            </div>
                            <div>
                                <span
                                    style={{
                                        color: "var(--text-on-accent)",
                                        background: getOutcomeColor(t.outcome),
                                        padding: "2px 6px",
                                        borderRadius: "4px",
                                        fontSize: "0.85em",
                                        fontWeight: 600,
                                    }}
                                >
                                    {t.outcome || "unknown"}
                                </span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                <div
                                    style={{
                                        width: "8px",
                                        height: "8px",
                                        borderRadius: "50%",
                                        background: getExecColor(exec),
                                    }}
                                />
                                <span style={{ color: "var(--text-muted)" }}>{exec}</span>
                            </div>
                        </div>
                    );
                })}

                {recentTrades.length === 0 && (
                    <div style={{ textAlign: "center", padding: "20px", color: "var(--text-faint)" }}>
                        暂无数据
                    </div>
                )}
            </div>
        </div>
    );
};
