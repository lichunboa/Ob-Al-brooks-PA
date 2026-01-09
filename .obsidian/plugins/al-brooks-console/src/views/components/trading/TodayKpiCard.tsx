import * as React from "react";
import { V5_COLORS } from "../../../ui/tokens";
import { glassPanelStyle, glassCardStyle } from "../../../ui/styles/dashboardPrimitives";

/**
 * 今日KPI数据接口
 */
export interface TodayKpiData {
    total: number;
    wins: number;
    losses: number;
    winRatePct: number;
    netR: number;
}

/**
 * TodayKpiCard组件Props
 */
export interface TodayKpiCardProps {
    todayKpi: TodayKpiData;
}

/**
 * 今日KPI卡片组件
 * 显示今日交易统计:总交易、获胜、亏损、胜率、净利润
 */
export const TodayKpiCard: React.FC<TodayKpiCardProps> = ({ todayKpi }) => {
    return (
        <div
            style={{
                ...glassPanelStyle,
                marginBottom: "16px",
            }}
        >
            <div style={{ fontWeight: 600, marginBottom: "8px" }}>今日</div>

            <div style={{ marginBottom: "14px" }}>
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                        gap: "10px",
                        marginBottom: "10px",
                    }}
                >
                    {(
                        [
                            {
                                label: "总交易",
                                value: String(todayKpi.total),
                                color: "var(--text-normal)",
                            },
                            {
                                label: "获胜",
                                value: String(todayKpi.wins),
                                color: V5_COLORS.win,
                            },
                            {
                                label: "亏损",
                                value: String(todayKpi.losses),
                                color: V5_COLORS.loss,
                            },
                        ] as const
                    ).map((c) => (
                        <div key={c.label} style={glassCardStyle}>
                            <div
                                style={{ color: "var(--text-muted)", fontSize: "0.85em" }}
                            >
                                {c.label}
                            </div>
                            <div
                                style={{
                                    marginTop: "6px",
                                    fontWeight: 900,
                                    fontSize: "1.8em",
                                    lineHeight: 1,
                                    color: c.color,
                                    fontVariantNumeric: "tabular-nums",
                                }}
                            >
                                {c.value}
                            </div>
                        </div>
                    ))}
                </div>

                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                        gap: "10px",
                    }}
                >
                    <div style={glassCardStyle}>
                        <div style={{ color: "var(--text-muted)", fontSize: "0.85em" }}>
                            胜率
                        </div>
                        <div
                            style={{
                                marginTop: "6px",
                                fontWeight: 900,
                                fontSize: "1.6em",
                                lineHeight: 1,
                                color: V5_COLORS.back,
                                fontVariantNumeric: "tabular-nums",
                            }}
                        >
                            {todayKpi.winRatePct}%
                        </div>
                    </div>

                    <div style={glassCardStyle}>
                        <div style={{ color: "var(--text-muted)", fontSize: "0.85em" }}>
                            净利润
                        </div>
                        <div
                            style={{
                                marginTop: "6px",
                                fontWeight: 900,
                                fontSize: "1.6em",
                                lineHeight: 1,
                                color: todayKpi.netR >= 0 ? V5_COLORS.win : V5_COLORS.loss,
                                fontVariantNumeric: "tabular-nums",
                            }}
                        >
                            {todayKpi.netR >= 0 ? "+" : ""}
                            {todayKpi.netR.toFixed(1)}R
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
