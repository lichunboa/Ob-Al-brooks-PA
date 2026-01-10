import * as React from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { AccountType } from "../../../core/contracts";
import { Card } from "../../../ui/components/Card";

interface CapitalGrowthChartProps {
    strategyLab: any; // StrategyLabAnalysis
    allTradesDateRange: { min: string; max: string };
    getRColorByAccountType: (type: AccountType) => string;
    SPACE: any; // Assuming SPACE object structure
}

export const CapitalGrowthChart: React.FC<CapitalGrowthChartProps> = ({
    strategyLab,
    allTradesDateRange,
    getRColorByAccountType,
    SPACE,
}) => {
    // Transform data for Recharts
    const data = React.useMemo(() => {
        // Find longest curve length to base index on
        const len = Math.max(
            strategyLab.curves.Live.length,
            strategyLab.curves.Demo.length,
            strategyLab.curves.Backtest.length
        );

        const chartData = [];
        for (let i = 0; i < len; i++) {
            chartData.push({
                index: i,
                Live: strategyLab.curves.Live[i] ?? null,
                Demo: strategyLab.curves.Demo[i] ?? null,
                Backtest: strategyLab.curves.Backtest[i] ?? null,
            });
        }
        return chartData;
    }, [strategyLab]);

    return (
        <Card variant="tight">
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
                            tickFormatter={(val) => `${val}R`}
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
                            formatter={(value: number) => [`${value?.toFixed(2)}R`, null]}
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
