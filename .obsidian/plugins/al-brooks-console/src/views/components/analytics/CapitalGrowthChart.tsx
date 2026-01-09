import * as React from "react";
import type { AccountType } from "../../../core/contracts";
import { getPoints } from "../../../utils/chart-utils";

interface CapitalGrowthChartProps {
    strategyLab: any; // StrategyLabAnalysis
    allTradesDateRange: { min: string; max: string };
    getRColorByAccountType: (type: AccountType) => string;
    cardTightStyle: React.CSSProperties;
    SPACE: any; // Assuming SPACE object structure
}

export const CapitalGrowthChart: React.FC<CapitalGrowthChartProps> = ({
    strategyLab,
    allTradesDateRange,
    getRColorByAccountType,
    cardTightStyle,
    SPACE,
}) => {
    return (
        <div
            style={{
                ...cardTightStyle,
            }}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: "12px",
                    marginBottom: "12px",
                    flexWrap: "wrap",
                }}
            >
                <div style={{ fontWeight: 700, fontSize: "1.05em" }}>
                    🧬 资金增长曲线{" "}
                    <span
                        style={{
                            fontWeight: 600,
                            opacity: 0.6,
                            fontSize: "0.85em",
                        }}
                    >
                        (Capital Growth)
                    </span>
                </div>

                <div
                    style={{
                        fontSize: "0.85em",
                        color: "var(--text-muted)",
                        display: "flex",
                        gap: "12px",
                        flexWrap: "wrap",
                    }}
                >
                    <span style={{ color: getRColorByAccountType("Live") }}>
                        ● 实盘 {strategyLab.cum.Live >= 0 ? "+" : ""}
                        {strategyLab.cum.Live.toFixed(1)}R
                    </span>
                    <span style={{ color: getRColorByAccountType("Demo") }}>
                        ● 模拟 {strategyLab.cum.Demo >= 0 ? "+" : ""}
                        {strategyLab.cum.Demo.toFixed(1)}R
                    </span>
                    <span style={{ color: getRColorByAccountType("Backtest") }}>
                        ● 回测 {strategyLab.cum.Backtest >= 0 ? "+" : ""}
                        {strategyLab.cum.Backtest.toFixed(1)}R
                    </span>
                    <span style={{ color: "var(--text-faint)" }}>
                        {allTradesDateRange.min && allTradesDateRange.max
                            ? `范围：${allTradesDateRange.min} → ${allTradesDateRange.max}`
                            : "范围：—"}
                    </span>
                </div>
            </div>

            {(() => {
                const w = 520;
                const h = 150;
                const pad = 14;
                const allValues = [
                    ...strategyLab.curves.Live,
                    ...strategyLab.curves.Demo,
                    ...strategyLab.curves.Backtest,
                ];
                const maxVal = Math.max(...allValues, 5);
                const minVal = Math.min(...allValues, -5);
                const range = Math.max(1e-6, maxVal - minVal);
                const zeroY =
                    pad + (1 - (0 - minVal) / range) * (h - pad * 2);

                const ptsLive = getPoints(strategyLab.curves.Live, w, h, pad);
                const ptsDemo = getPoints(strategyLab.curves.Demo, w, h, pad);
                const ptsBack = getPoints(strategyLab.curves.Backtest, w, h, pad);

                return (
                    <svg
                        viewBox={`0 0 ${w} ${h}`}
                        width="100%"
                        height="150"
                        style={{
                            border: "1px solid var(--background-modifier-border)",
                            borderRadius: "8px",
                            background: `rgba(var(--mono-rgb-100), 0.03)`,
                        }}
                    >
                        <line
                            x1={0}
                            y1={zeroY}
                            x2={w}
                            y2={zeroY}
                            stroke="rgba(var(--mono-rgb-100), 0.18)"
                            strokeDasharray="4"
                        />

                        {ptsBack && (
                            <polyline
                                points={ptsBack}
                                fill="none"
                                stroke={getRColorByAccountType("Backtest")}
                                strokeWidth="1.6"
                                opacity={0.65}
                                strokeDasharray="2"
                                strokeLinejoin="round"
                                strokeLinecap="round"
                            />
                        )}
                        {ptsDemo && (
                            <polyline
                                points={ptsDemo}
                                fill="none"
                                stroke={getRColorByAccountType("Demo")}
                                strokeWidth="1.8"
                                opacity={0.8}
                                strokeLinejoin="round"
                                strokeLinecap="round"
                            />
                        )}
                        {ptsLive && (
                            <polyline
                                points={ptsLive}
                                fill="none"
                                stroke={getRColorByAccountType("Live")}
                                strokeWidth="2.6"
                                strokeLinejoin="round"
                                strokeLinecap="round"
                            />
                        )}
                    </svg>
                );
            })()}
        </div>
    );
};
