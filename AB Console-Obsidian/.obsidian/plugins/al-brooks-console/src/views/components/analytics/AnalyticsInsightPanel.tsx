import * as React from "react";
import { V5_COLORS } from "../../../ui/tokens";
import { EmptyState } from "../../../ui/components/EmptyState";
import { Card } from "../../../ui/components/Card";

export interface AnalyticsInsightPanelProps {
    analyticsMind: {
        status: string;
        color: string;
        fomo: number;
        tilt: number;
        hesitation: number;
    };
    analyticsTopStrats: any[];
    SPACE: any;
}

export const AnalyticsInsightPanel: React.FC<AnalyticsInsightPanelProps> = ({
    analyticsMind,
    analyticsTopStrats,
    SPACE,
}) => {
    return (
        <Card variant="tight">
            <div style={{ fontWeight: 700, opacity: 0.85, marginBottom: "12px" }}>
                🧠 交易洞察 (Insights)
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: SPACE.md }}>
                {/* Mindset Section */}
                <Card variant="subtle-tight">
                    <div style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>
                        实盘心态 (Mindset)
                    </div>
                    <div
                        style={{
                            fontSize: "1.25em",
                            fontWeight: 900,
                            color: analyticsMind.color,
                            marginTop: SPACE.xs,
                        }}
                    >
                        {analyticsMind.status}
                    </div>
                    <div
                        style={{
                            color: "var(--text-faint)",
                            fontSize: "0.85em",
                            marginTop: SPACE.xs,
                            display: "flex",
                            gap: "8px"
                        }}
                    >
                        <span>FOMO: {analyticsMind.fomo}</span>
                        <span>Tilt: {analyticsMind.tilt}</span>
                        <span>犹豫: {analyticsMind.hesitation}</span>
                    </div>
                </Card>

                {/* Top Strategies Section */}
                <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    <div style={{ color: "var(--text-muted)", fontSize: "0.9em", paddingLeft: "4px" }}>
                        Top Strategies
                    </div>
                    {analyticsTopStrats.length === 0 ? (
                        <EmptyState message="暂无数据" />
                    ) : (
                        analyticsTopStrats.slice(0, 3).map((s) => { // Limit to top 3 for space
                            const color =
                                s.wr >= 50
                                    ? V5_COLORS.win
                                    : s.wr >= 40
                                        ? V5_COLORS.back
                                        : V5_COLORS.loss;
                            let displayName = s.name;
                            if (displayName.length > 12 && displayName.includes("(")) {
                                displayName = displayName.split("(")[0].trim();
                            }
                            return (
                                <div
                                    key={`topstrat-${s.name}`}
                                    style={{
                                        background: "rgba(var(--mono-rgb-100), 0.03)",
                                        border: "1px solid var(--background-modifier-border)",
                                        borderRadius: "6px",
                                        padding: "6px 10px",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        gap: "12px",
                                        fontSize: "0.85em"
                                    }}
                                >
                                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                        {displayName}
                                    </div>
                                    <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                        <div style={{ fontWeight: 700, color, minWidth: "32px", textAlign: "right" }}>{s.wr}%</div>
                                        <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>{s.total}</div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </Card>
    );
};
