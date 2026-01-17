import * as React from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid } from "recharts";
import type { TradeRecord } from "../../../core/contracts";
import { aggregateTrades, type AnalyticsBucket, type BreakdownDimension } from "../../../core/analytics";
import { Card } from "../../../ui/components/Card";
import { formatCurrency } from "../../../utils/format-utils";

interface AnalysisInsightPanelProps {
    trades: TradeRecord[];
    currencyMode: 'USD' | 'CNY';
    displayUnit?: 'money' | 'r';
}

const COLORS = {
    win: 'var(--color-green)',
    loss: 'var(--color-red)',
    neutral: 'var(--text-muted)'
};

const DimensionChart: React.FC<{
    title: string;
    data: AnalyticsBucket[];
    dataKey: "netMoney" | "netR" | "winRate";
    currencyMode: 'USD' | 'CNY';
    displayUnit: 'money' | 'r';
}> = ({ title, data, dataKey, currencyMode, displayUnit }) => {
    return (
        <Card style={{ flex: 1, minWidth: "300px" }}>
            <h4 style={{ margin: "0 0 12px 0", fontSize: "1em", opacity: 0.9 }}>{title}</h4>
            <div style={{ width: "100%", height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} layout="vertical" margin={{ top: 5, right: 30, left: 40, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="var(--background-modifier-border)" />
                        <XAxis type="number" hide />
                        <YAxis
                            dataKey="label"
                            type="category"
                            width={80}
                            tick={{ fontSize: 11, fill: "var(--text-normal)" }}
                        />
                        <Tooltip
                            cursor={{ fill: 'var(--background-modifier-hover)' }}
                            contentStyle={{
                                backgroundColor: "var(--background-primary)",
                                border: "1px solid var(--background-modifier-border)",
                                borderRadius: "6px"
                            }}
                            formatter={(val: number) => {
                                if (dataKey === "winRate") return `${val.toFixed(1)}%`;
                                if (displayUnit === 'r') return `${val > 0 ? '+' : ''}${val.toFixed(1)}R`;
                                return formatCurrency(val, currencyMode);
                            }}
                        />
                        <Bar dataKey={dataKey} barSize={20} radius={[0, 4, 4, 0]}>
                            {data.map((entry, index) => (
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
        </Card>
    );
};

export const WinLossAnalysisPanel: React.FC<AnalysisInsightPanelProps> = ({ trades, currencyMode, displayUnit = 'money' }) => {
    // 1. Setup Analysis
    const setupData = React.useMemo(() =>
        aggregateTrades(trades, "setup").slice(0, 8), // Top 8 setups
        [trades]);

    // 2. Direction Analysis
    const directionData = React.useMemo(() =>
        aggregateTrades(trades, "direction"),
        [trades]);

    // 3. Day Analysis (Win Rate focus)
    const dayData = React.useMemo(() =>
        aggregateTrades(trades, "day"),
        [trades]);

    // 4. Timeframe Analysis
    const timeframeData = React.useMemo(() =>
        aggregateTrades(trades, "timeframe" as any), // Cast as "timeframe" isn't in BreakdownDimension type yet, need to update analytics.ts or just cast
        [trades]);

    const pnlKey = displayUnit === 'r' ? 'netR' : 'netMoney';

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                <DimensionChart
                    title={displayUnit === 'r' ? "架构表现 (Net R)" : "架构表现 (净盈亏)"}
                    data={setupData}
                    dataKey={pnlKey}
                    currencyMode={currencyMode}
                    displayUnit={displayUnit}
                />
                <DimensionChart
                    title="每日胜率 (Win Rate)"
                    data={dayData}
                    dataKey="winRate"
                    currencyMode={currencyMode}
                    displayUnit={displayUnit}
                />
            </div>
            <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
                <DimensionChart
                    title={displayUnit === 'r' ? "方向分布 (Net R)" : "方向分布 (净盈亏)"}
                    data={directionData}
                    dataKey={pnlKey}
                    currencyMode={currencyMode}
                    displayUnit={displayUnit}
                />
                <DimensionChart
                    title={displayUnit === 'r' ? "周期分析 (Net R)" : "周期分析 (净盈亏)"}
                    data={timeframeData}
                    dataKey={pnlKey}
                    currencyMode={currencyMode}
                    displayUnit={displayUnit}
                />
            </div>
        </div>
    );
};
