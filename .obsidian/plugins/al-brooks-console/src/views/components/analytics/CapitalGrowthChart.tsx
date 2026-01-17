import * as React from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { AccountType } from "../../../core/contracts";
import { Card } from "../../../ui/components/Card";
import { formatCurrency } from "../../../utils/format-utils";

interface CapitalGrowthChartProps {
    strategyLab: any; // StrategyLabAnalysis
    allTradesDateRange: { min: string; max: string };
    getRColorByAccountType: (type: AccountType) => string;
    SPACE: any; // Assuming SPACE object structure
    currencyMode?: 'USD' | 'CNY';
    displayUnit?: 'money' | 'r';
}

export const CapitalGrowthChart: React.FC<CapitalGrowthChartProps> = ({
    strategyLab,
    allTradesDateRange,
    getRColorByAccountType,
    SPACE,
    currencyMode = 'USD',
    displayUnit = 'money',
}) => {
    // Transform data for Recharts
    const data = React.useMemo(() => {
        const isR = displayUnit === 'r';
        const sourceCurves = isR && strategyLab.curvesR ? strategyLab.curvesR : strategyLab.curves;

        // Find longest curve length to base index on
        const len = Math.max(
            sourceCurves.Live.length,
            sourceCurves.Demo.length,
            sourceCurves.Backtest.length
        );

        const rate = (currencyMode === 'CNY' && !isR) ? 7.25 : 1;

        const chartData = [];
        for (let i = 0; i < len; i++) {
            const liveVal = sourceCurves.Live[i];
            const demoVal = sourceCurves.Demo[i];
            const backtestVal = sourceCurves.Backtest[i];

            chartData.push({
                index: i,
                Live: typeof liveVal === 'number' ? liveVal * rate : null,
                Demo: typeof demoVal === 'number' ? demoVal * rate : null,
                Backtest: typeof backtestVal === 'number' ? backtestVal * rate : null,
            });
        }
        return chartData;
    }, [strategyLab, currencyMode, displayUnit]);

    const isR = displayUnit === 'r';
    const liveTotal = isR ? (strategyLab.cumR?.Live ?? 0) : (strategyLab.cumMoney?.Live ?? 0);
    const demoTotal = isR ? (strategyLab.cumR?.Demo ?? 0) : (strategyLab.cumMoney?.Demo ?? 0);
    const backtestTotal = isR ? (strategyLab.cumR?.Backtest ?? 0) : (strategyLab.cumMoney?.Backtest ?? 0);

    const formatValue = (val: number) => {
        if (isR) return `${val > 0 ? '+' : ''}${val.toFixed(1)}R`;
        return formatCurrency(val, currencyMode).replace('$', '').replace('¥', '');
    }

    return (
        <Card>
            {/* Header: Cumulative Stats */}
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
                <div>
                    <span style={{ fontWeight: 700, fontSize: "1.05em" }}>🧬 资金增长曲线</span>{" "}
                    <span
                        style={{
                            fontWeight: 600,
                            opacity: 0.6,
                            fontSize: "0.85em",
                        }}
                    >
                        {isR ? '(Cumulative R)' : '(Cumulative Money)'}
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
                        ● 实盘 {liveTotal >= 0 ? "+" : ""}
                        {formatValue(liveTotal)}
                    </span>
                    <span style={{ color: getRColorByAccountType("Demo") }}>
                        ● 模拟 {demoTotal >= 0 ? "+" : ""}
                        {formatValue(demoTotal)}
                    </span>
                    <span style={{ color: getRColorByAccountType("Backtest") }}>
                        ● 回测 {backtestTotal >= 0 ? "+" : ""}
                        {formatValue(backtestTotal)}
                    </span>
                    <span style={{ color: "var(--text-faint)" }}>
                        {allTradesDateRange.min && allTradesDateRange.max
                            ? `范围：${allTradesDateRange.min} → ${allTradesDateRange.max}`
                            : "范围：—"}
                    </span>
                </div>
            </div>

            <div style={{ width: "100%", height: 250 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.1} vertical={false} stroke="var(--text-muted)" />
                        <XAxis dataKey="index" type="category" hide={true} />
                        <YAxis
                            domain={['auto', 'auto']}
                            tick={{ fontSize: 10, fill: "var(--text-muted)" }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(val) => `${val}`}
                        />
                        <Tooltip
                            contentStyle={{
                                backgroundColor: "var(--background-primary)",
                                border: "1px solid var(--background-modifier-border)",
                                borderRadius: "6px",
                                fontSize: "12px",
                                padding: "8px",
                                boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
                            }}
                            itemStyle={{ padding: 0 }}
                            labelStyle={{ display: "none" }}
                            formatter={(value: number) => {
                                const symbol = isR ? '' : (currencyMode === 'CNY' ? '¥' : '$');
                                const suffix = isR ? 'R' : '';
                                return [`${symbol}${typeof value === 'number' ? value.toFixed(2) : value}${suffix}`, null];
                            }}
                        />
                        <Line
                            type="monotone"
                            dataKey="Backtest"
                            stroke={getRColorByAccountType("Backtest")}
                            strokeWidth={1.5}
                            strokeDasharray="4 4"
                            dot={false}
                            connectNulls
                        />
                        <Line
                            type="monotone"
                            dataKey="Demo"
                            stroke={getRColorByAccountType("Demo")}
                            strokeWidth={1.5}
                            dot={false}
                            connectNulls
                        />
                        <Line
                            type="monotone"
                            dataKey="Live"
                            stroke={getRColorByAccountType("Live")}
                            strokeWidth={2.5}
                            dot={{ r: 1 }}
                            activeDot={{ r: 4 }}
                            connectNulls
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </Card>
    );
};
