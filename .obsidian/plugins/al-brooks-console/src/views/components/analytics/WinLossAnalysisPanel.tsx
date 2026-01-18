import * as React from "react";
import type { TradeRecord } from "../../../core/contracts";
import { aggregateTrades, type AnalyticsBucket } from "../../../core/analytics";
import { formatCurrency } from "../../../utils/format-utils";

interface AnalysisInsightPanelProps {
    trades: TradeRecord[];
    currencyMode: 'USD' | 'CNY';
    displayUnit?: 'money' | 'r';
}

/**
 * 迷你进度条图表 - 纯CSS实现，更精致
 */
const MiniBarChart: React.FC<{
    title: string;
    data: AnalyticsBucket[];
    dataKey: "netMoney" | "netR" | "winRate";
    currencyMode: 'USD' | 'CNY';
    displayUnit: 'money' | 'r';
}> = ({ title, data, dataKey, currencyMode, displayUnit }) => {
    // 只显示前3条数据
    const displayData = data.slice(0, 3);
    const maxVal = Math.max(...displayData.map(d => Math.abs(d[dataKey] as number)), 1);

    const formatValue = (val: number) => {
        if (dataKey === "winRate") return `${val.toFixed(0)}%`;
        if (displayUnit === 'r') return `${val > 0 ? '+' : ''}${val.toFixed(1)}R`;
        return formatCurrency(val, currencyMode);
    };

    return (
        <div style={{ flex: "1 1 45%", minWidth: "140px" }}>
            <div style={{
                fontSize: "0.75em",
                fontWeight: 600,
                marginBottom: "6px",
                color: "var(--text-muted)"
            }}>
                {title}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                {displayData.map((item, idx) => {
                    const val = item[dataKey] as number;
                    const pct = Math.abs(val) / maxVal * 100;
                    const isPositive = dataKey === "winRate" ? val >= 50 : val >= 0;
                    const color = isPositive ? "#10b981" : "#ef4444";

                    return (
                        <div key={idx} style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                        }}>
                            <span style={{
                                fontSize: "0.7em",
                                color: "var(--text-muted)",
                                width: "50px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                flexShrink: 0,
                            }}>
                                {item.label}
                            </span>
                            <div style={{
                                flex: 1,
                                height: "6px",
                                background: "var(--background-modifier-border)",
                                borderRadius: "3px",
                                overflow: "hidden",
                            }}>
                                <div style={{
                                    width: `${pct}%`,
                                    height: "100%",
                                    background: color,
                                    borderRadius: "3px",
                                    transition: "width 0.3s ease",
                                }} />
                            </div>
                            <span style={{
                                fontSize: "0.7em",
                                fontWeight: 600,
                                color: color,
                                width: "40px",
                                textAlign: "right",
                                flexShrink: 0,
                            }}>
                                {formatValue(val)}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export const WinLossAnalysisPanel: React.FC<AnalysisInsightPanelProps> = ({ trades, currencyMode, displayUnit = 'money' }) => {
    // 数据聚合
    const setupData = React.useMemo(() =>
        aggregateTrades(trades, "setup").slice(0, 3),
        [trades]);

    const directionData = React.useMemo(() =>
        aggregateTrades(trades, "direction"),
        [trades]);

    const dayData = React.useMemo(() =>
        aggregateTrades(trades, "day").slice(0, 3),
        [trades]);

    const timeframeData = React.useMemo(() =>
        aggregateTrades(trades, "timeframe" as any).slice(0, 3),
        [trades]);

    const pnlKey = displayUnit === 'r' ? 'netR' : 'netMoney';

    return (
        <details
            open
            style={{
                border: "1px solid var(--background-modifier-border)",
                borderRadius: "8px",
                padding: "10px 12px",
                background: "rgba(var(--mono-rgb-100), 0.02)",
            }}
        >
            <summary style={{
                cursor: "pointer",
                fontWeight: 600,
                fontSize: "0.85em",
                listStyle: "none",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                color: "var(--text-muted)"
            }}>
                <span>📊</span>
                <span>交易洞察</span>
            </summary>

            {/* 2x2 紧凑网格 */}
            <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "12px",
                marginTop: "10px"
            }}>
                <MiniBarChart
                    title="架构表现"
                    data={setupData}
                    dataKey={pnlKey}
                    currencyMode={currencyMode}
                    displayUnit={displayUnit}
                />
                <MiniBarChart
                    title="每日胜率"
                    data={dayData}
                    dataKey="winRate"
                    currencyMode={currencyMode}
                    displayUnit={displayUnit}
                />
                <MiniBarChart
                    title="方向分布"
                    data={directionData}
                    dataKey={pnlKey}
                    currencyMode={currencyMode}
                    displayUnit={displayUnit}
                />
                <MiniBarChart
                    title="周期分析"
                    data={timeframeData}
                    dataKey={pnlKey}
                    currencyMode={currencyMode}
                    displayUnit={displayUnit}
                />
            </div>
        </details>
    );
};
