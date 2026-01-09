import * as React from "react";
import type { AccountType, TradeRecord } from "../../../core/contracts";
import { V5_COLORS } from "../../../ui/tokens";
import { EmptyState } from "../../../ui/components/EmptyState";

/**
 * RMultiplesChart Props接口
 */
export interface RMultiplesChartProps {
    // 数据Props
    analyticsRecentLiveTradesAsc: TradeRecord[];
    analyticsRMultiples: {
        avg: number;
        maxAbs: number;
    };
    analyticsMind: {
        status: string;
        color: string;
        fomo: number;
        tilt: number;
        hesitation: number;
    };
    analyticsTopStrats: any[];

    // 函数Props
    getRColorByAccountType: (accountType: AccountType) => string;

    // 样式Props
    cardTightStyle: React.CSSProperties;
    cardSubtleTightStyle: React.CSSProperties;

    // 常量Props
    SPACE: any;
}

/**
 * R-Multiples图表组件
 * 包含R-Multiples趋势图、心态分析、热门策略
 */
export const RMultiplesChart: React.FC<RMultiplesChartProps> = ({
    analyticsRecentLiveTradesAsc,
    analyticsRMultiples,
    analyticsMind,
    analyticsTopStrats,
    getRColorByAccountType,
    cardTightStyle,
    cardSubtleTightStyle,
    SPACE,
}) => {
    return (
        <div style={{ ...cardTightStyle }}>
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: "12px",
                    marginBottom: "10px",
                    flexWrap: "wrap",
                }}
            >
                <div style={{ fontWeight: 700, opacity: 0.85 }}>
                    📈 综合趋势 (R-Multiples)
                    <span
                        style={{
                            fontWeight: 600,
                            opacity: 0.6,
                            fontSize: "0.85em",
                            marginLeft: "6px",
                        }}
                    >
                        仅实盘 · 最近 {analyticsRecentLiveTradesAsc.length} 笔
                    </span>
                </div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.85em" }}>
                    Avg R: {analyticsRMultiples.avg.toFixed(2)}
                </div>
            </div>

            <div>
                <div style={{ marginBottom: SPACE.md }}>
                    {(() => {
                        const rHeight = 90;
                        const rZeroY = rHeight / 2;
                        const barWidth = 8;
                        const barGap = 4;
                        const step = barWidth + barGap;
                        const maxAbs = analyticsRMultiples.maxAbs;
                        const rScale = (rHeight / 2 - 6) / Math.max(1e-6, maxAbs);
                        const innerWidth = Math.max(
                            analyticsRecentLiveTradesAsc.length * step,
                            200
                        );

                        return (
                            <div
                                style={{
                                    position: "relative",
                                    height: `${rHeight}px`,
                                    width: "100%",
                                    overflowX: "auto",
                                    border: "1px solid var(--background-modifier-border)",
                                    borderRadius: "8px",
                                    background: "rgba(var(--mono-rgb-100), 0.03)",
                                }}
                            >
                                <div
                                    style={{
                                        position: "relative",
                                        height: `${rHeight}px`,
                                        width: `${innerWidth}px`,
                                    }}
                                >
                                    <div
                                        style={{
                                            position: "absolute",
                                            left: 0,
                                            right: 0,
                                            top: `${rZeroY}px`,
                                            height: "1px",
                                            background: "rgba(var(--mono-rgb-100), 0.18)",
                                            borderTop: "1px dashed rgba(var(--mono-rgb-100), 0.25)",
                                        }}
                                    />
                                    <div
                                        style={{
                                            position: "absolute",
                                            left: 6,
                                            top: rZeroY - 10,
                                            fontSize: "0.75em",
                                            color: "var(--text-faint)",
                                        }}
                                    >
                                        0R
                                    </div>
                                    {analyticsRecentLiveTradesAsc.length === 0 ? (
                                        <EmptyState message="暂无数据" style={{ padding: "18px" }} />
                                    ) : (
                                        analyticsRecentLiveTradesAsc.map((t, i) => {
                                            const r =
                                                typeof t.pnl === "number" && Number.isFinite(t.pnl)
                                                    ? t.pnl
                                                    : 0;
                                            let h = Math.abs(r) * rScale;
                                            if (h < 3) h = 3;
                                            const color =
                                                r > 0
                                                    ? V5_COLORS.win
                                                    : r < 0
                                                        ? V5_COLORS.loss
                                                        : "var(--text-muted)";
                                            const top = r >= 0 ? rZeroY - h : rZeroY;
                                            return (
                                                <div
                                                    key={`rbar-${t.path}-${t.dateIso}-${i}`}
                                                    title={`${t.dateIso} | ${t.name} | R: ${r.toFixed(2)}`}
                                                    style={{
                                                        position: "absolute",
                                                        left: `${i * step}px`,
                                                        top: `${top}px`,
                                                        width: `${barWidth}px`,
                                                        height: `${h}px`,
                                                        background: color,
                                                        borderRadius: "2px",
                                                        opacity: 0.9,
                                                    }}
                                                />
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        );
                    })()}
                </div>

                <div style={cardSubtleTightStyle}>
                    <div style={{ color: "var(--text-muted)", fontSize: "0.9em" }}>
                        🧠 实盘心态
                    </div>
                    <div
                        style={{
                            fontSize: "1.15em",
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
                        }}
                    >
                        FOMO: {analyticsMind.fomo} | Tilt: {analyticsMind.tilt} | 犹豫:{" "}
                        {analyticsMind.hesitation}
                    </div>
                </div>
            </div>

            <div style={{ marginTop: "12px" }}>
                <div style={{ fontWeight: 600, marginBottom: "8px" }}>📊 热门策略</div>
                {analyticsTopStrats.length === 0 ? (
                    <EmptyState message="暂无数据" />
                ) : (
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
                        }}
                    >
                        {analyticsTopStrats.map((s) => {
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
                                        borderRadius: "8px",
                                        padding: "8px 10px",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "space-between",
                                        gap: "12px",
                                    }}
                                >
                                    <div style={{ flex: "1 1 auto", minWidth: 0 }}>
                                        <div
                                            title={s.name}
                                            style={{
                                                fontSize: "0.9em",
                                                whiteSpace: "nowrap",
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                marginBottom: "6px",
                                            }}
                                        >
                                            {displayName}
                                        </div>
                                        <div
                                            style={{
                                                width: "100%",
                                                height: "6px",
                                                borderRadius: "999px",
                                                background: "rgba(var(--mono-rgb-100), 0.05)",
                                                border: "1px solid var(--background-modifier-border)",
                                                overflow: "hidden",
                                            }}
                                        >
                                            <div
                                                style={{
                                                    width: `${s.wr}%`,
                                                    height: "100%",
                                                    background: color,
                                                }}
                                            />
                                        </div>
                                    </div>
                                    <div style={{ flex: "0 0 auto", textAlign: "right" }}>
                                        <div
                                            style={{
                                                fontWeight: 900,
                                                color,
                                                fontVariantNumeric: "tabular-nums",
                                            }}
                                        >
                                            {s.wr}%
                                        </div>
                                        <div
                                            style={{
                                                fontSize: "0.8em",
                                                color: "var(--text-faint)",
                                            }}
                                        >
                                            {s.total} 笔
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};
