import * as React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import type { TradeRecord } from "../../../core/contracts";
import { aggregateTrades, type AnalyticsBucket } from "../../../core/analytics";
import { formatCurrency } from "../../../utils/format-utils";

interface AnalysisInsightPanelProps {
    trades: TradeRecord[];
    currencyMode: 'USD' | 'CNY';
    displayUnit?: 'money' | 'r';
}

const COLORS = {
    win: '#10b981',   // 绿色
    loss: '#ef4444',  // 红色
    neutral: 'var(--text-muted)'
};

/**
 * 迷你图表组件 - 更紧凑
 */
const MiniChart: React.FC<{
    title: string;
    data: AnalyticsBucket[];
    dataKey: "netMoney" | "netR" | "winRate";
    currencyMode: 'USD' | 'CNY';
    displayUnit: 'money' | 'r';
}> = ({ title, data, dataKey, currencyMode, displayUnit }) => {
    // 只显示前4条数据
    const displayData = data.slice(0, 4);

    return (
        <div style={{
            flex: "1 1 45%",
            minWidth: "200px",
            background: "rgba(var(--mono-rgb-100), 0.02)",
            borderRadius: "6px",
            padding: "10px",
            border: "1px solid var(--background-modifier-border)",
        }}>
            <div style={{
                fontSize: "0.8em",
                fontWeight: 600,
                marginBottom: "8px",
                color: "var(--text-muted)"
            }}>
                {title}
            </div>
            <div style={{ width: "100%", height: 80 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={displayData} layout="vertical" margin={{ top: 0, right: 10, left: 0, bottom: 0 }}>
                        <XAxis type="number" hide />
                        <YAxis
                            dataKey="label"
                            type="category"
                            width={70}
                            tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                            axisLine={false}
                            tickLine={false}
                        />
                        <Tooltip
                            cursor={{ fill: 'var(--background-modifier-hover)' }}
                            contentStyle={{
                                backgroundColor: "var(--background-primary)",
                                border: "1px solid var(--background-modifier-border)",
                                borderRadius: "4px",
                                fontSize: "0.85em",
                                padding: "4px 8px"
                            }}
                            formatter={(val: number) => {
                                if (dataKey === "winRate") return `${val.toFixed(0)}%`;
                                if (displayUnit === 'r') return `${val > 0 ? '+' : ''}${val.toFixed(1)}R`;
                                return formatCurrency(val, currencyMode);
                            }}
                        />
                        <Bar dataKey={dataKey} barSize={12} radius={[0, 3, 3, 0]}>
                            {displayData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={
                                    dataKey === 'winRate'
                                        ? (entry.winRate >= 50 ? COLORS.win : COLORS.loss)
                                        : ((entry[dataKey] as number) >= 0 ? COLORS.win : COLORS.loss)
                                } />
                            ))}
                        </Bar>
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export const WinLossAnalysisPanel: React.FC<AnalysisInsightPanelProps> = ({ trades, currencyMode, displayUnit = 'money' }) => {
    // 数据聚合
    const setupData = React.useMemo(() =>
        aggregateTrades(trades, "setup").slice(0, 4),
        [trades]);

    const directionData = React.useMemo(() =>
        aggregateTrades(trades, "direction"),
        [trades]);

    const dayData = React.useMemo(() =>
        aggregateTrades(trades, "day"),
        [trades]);

    const timeframeData = React.useMemo(() =>
        aggregateTrades(trades, "timeframe" as any),
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
                fontSize: "0.9em",
                listStyle: "none",
                display: "flex",
                alignItems: "center",
                gap: "6px",
                color: "var(--text-muted)"
            }}>
                <span>📊</span>
                <span>交易洞察 (Insights)</span>
            </summary>

            {/* 2x2 紧凑网格 */}
            <div style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "8px",
                marginTop: "10px"
            }}>
                <MiniChart
                    title="架构表现"
                    data={setupData}
                    dataKey={pnlKey}
                    currencyMode={currencyMode}
                    displayUnit={displayUnit}
                />
                <MiniChart
                    title="每日胜率"
                    data={dayData}
                    dataKey="winRate"
                    currencyMode={currencyMode}
                    displayUnit={displayUnit}
                />
                <MiniChart
                    title="方向分布"
                    data={directionData}
                    dataKey={pnlKey}
                    currencyMode={currencyMode}
                    displayUnit={displayUnit}
                />
                <MiniChart
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
