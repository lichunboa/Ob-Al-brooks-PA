import * as React from "react";
import { V5_COLORS } from "../../../ui/tokens";
import { glassCardStyle } from "../../../ui/styles/dashboardPrimitives";
import { GlassPanel } from "../../../ui/components/GlassPanel";
import { formatCurrency } from "../../../utils/format-utils";

/**
 * 时间范围类型
 */
export type TimeRange = "today" | "week" | "month" | "all";

/**
 * 时间范围标签映射
 */
export const TIME_RANGE_LABELS: Record<TimeRange, string> = {
    today: "今日",
    week: "本周",
    month: "本月",
    all: "全部",
};

/**
 * KPI数据接口
 */
export interface TodayKpiData {
    total: number;
    wins: number;
    losses: number;
    winRatePct: number;
    netMoney: number;
    netR: number;
}

/**
 * TodayKpiCard组件Props
 */
export interface TodayKpiCardProps {
    todayKpi: TodayKpiData;
    currencyMode?: 'USD' | 'CNY';
    timeRange?: TimeRange;
    onTimeRangeChange?: (range: TimeRange) => void;
}

/**
 * KPI卡片组件
 * 显示交易统计:总交易、获胜、亏损、胜率、净利润
 * 支持时间范围切换
 */
export const TodayKpiCard: React.FC<TodayKpiCardProps> = ({
    todayKpi,
    currencyMode = 'USD',
    timeRange = 'today',
    onTimeRangeChange,
}) => {
    const ranges: TimeRange[] = ["today", "week", "month", "all"];

    return (
        <GlassPanel style={{ marginBottom: "16px" }}>
            {/* 标题 + 时间范围选择器 */}
            <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "8px"
            }}>
                <div style={{ fontWeight: 600 }}>{TIME_RANGE_LABELS[timeRange]}</div>

                {onTimeRangeChange && (
                    <div style={{
                        display: "flex",
                        gap: "4px",
                        background: "var(--background-secondary)",
                        borderRadius: "6px",
                        padding: "2px",
                    }}>
                        {ranges.map((r) => (
                            <button
                                key={r}
                                onClick={() => onTimeRangeChange(r)}
                                style={{
                                    padding: "4px 8px",
                                    fontSize: "0.75em",
                                    fontWeight: timeRange === r ? 600 : 400,
                                    background: timeRange === r
                                        ? "var(--interactive-accent)"
                                        : "transparent",
                                    color: timeRange === r
                                        ? "white"
                                        : "var(--text-muted)",
                                    border: "none",
                                    borderRadius: "4px",
                                    cursor: "pointer",
                                    transition: "all 0.15s ease",
                                }}
                            >
                                {TIME_RANGE_LABELS[r]}
                            </button>
                        ))}
                    </div>
                )}
            </div>

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
                                color: todayKpi.netMoney >= 0 ? V5_COLORS.win : V5_COLORS.loss,
                                fontVariantNumeric: "tabular-nums",
                            }}
                        >
                            {todayKpi.netMoney >= 0 ? "+" : ""}
                            {formatCurrency(todayKpi.netMoney, currencyMode).replace('$', '').replace('¥', '')}
                            <span style={{ fontSize: '0.5em', marginLeft: '2px', verticalAlign: 'middle', opacity: 0.8 }}>
                                {currencyMode === 'USD' ? '$' : '¥'}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        </GlassPanel>
    );
};
