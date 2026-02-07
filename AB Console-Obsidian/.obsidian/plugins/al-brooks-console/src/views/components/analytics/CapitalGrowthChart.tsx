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
    // 可见账户类型（用于过滤显示）
    visibleAccounts?: ('Live' | 'Demo' | 'Backtest')[];
}

export const CapitalGrowthChart: React.FC<CapitalGrowthChartProps> = ({
    strategyLab,
    allTradesDateRange,
    getRColorByAccountType,
    SPACE,
    currencyMode = 'USD',
    displayUnit = 'money',
    visibleAccounts = ['Live', 'Demo', 'Backtest'], // 默认显示全部
}) => {
    // Transform data for Recharts - hooks 必须在条件判断之前
    const data = React.useMemo(() => {
        // 如果数据未准备好，返回空数组
        if (!strategyLab || !strategyLab.curves) {
            return [];
        }

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

    // 调试和空值保护
    console.log('[CapitalGrowthChart] strategyLab:', strategyLab ? 'exists' : 'NULL/undefined');

    // 如果数据未准备好，显示加载状态（放在所有 hooks 之后）
    if (!strategyLab || !strategyLab.curves) {
        console.warn('[CapitalGrowthChart] strategyLab or curves is missing!', strategyLab);
        return (
            <Card>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "12px", marginBottom: "12px" }}>
                    <div>
                        <span style={{ fontWeight: 700, fontSize: "1.05em" }}>🧬 资金增长曲线</span>{" "}
                        <span style={{ fontWeight: 600, opacity: 0.6, fontSize: "0.85em" }}>(Cumulative Money)</span>
                    </div>
                </div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.85em", padding: "40px 16px", textAlign: "center" }}>
                    数据加载中...
                </div>
            </Card>
        );
    }

    const isR = displayUnit === 'r';
    const liveTotal = isR ? (strategyLab.cumR?.Live ?? 0) : (strategyLab.cumMoney?.Live ?? 0);
    const demoTotal = isR ? (strategyLab.cumR?.Demo ?? 0) : (strategyLab.cumMoney?.Demo ?? 0);
    const backtestTotal = isR ? (strategyLab.cumR?.Backtest ?? 0) : (strategyLab.cumMoney?.Backtest ?? 0);

    const formatValue = (val: number) => {
        if (isR) return `${val > 0 ? '+' : ''}${val.toFixed(1)}R`;
        return formatCurrency(val, currencyMode).replace('$', '').replace('¥', '');
    }

    // 调试：输出图表数据
    console.log('[CapitalGrowthChart] data:', data.length, 'points, sample:', data[0], data[data.length - 1]);

    // 如果数据为空或只有初始点，显示空状态
    if (data.length <= 1) {
        return (
            <Card>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "12px", marginBottom: "12px" }}>
                    <div>
                        <span style={{ fontWeight: 700, fontSize: "1.05em" }}>🧬 资金增长曲线</span>{" "}
                        <span style={{ fontWeight: 600, opacity: 0.6, fontSize: "0.85em" }}>(Cumulative Money)</span>
                    </div>
                </div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.85em", padding: "40px 16px", textAlign: "center" }}>
                    暂无足够数据绘制曲线（需要至少2笔交易）
                </div>
            </Card>
        );
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
                    {/* 根据 visibleAccounts 过滤图例显示 */}
                    {visibleAccounts.includes('Live') && (
                        <span style={{ color: getRColorByAccountType("Live") }}>
                            ● 实盘 {liveTotal >= 0 ? "+" : ""}
                            {formatValue(liveTotal)}
                        </span>
                    )}
                    {visibleAccounts.includes('Demo') && (
                        <span style={{ color: getRColorByAccountType("Demo") }}>
                            ● 模拟 {demoTotal >= 0 ? "+" : ""}
                            {formatValue(demoTotal)}
                        </span>
                    )}
                    {visibleAccounts.includes('Backtest') && (
                        <span style={{ color: getRColorByAccountType("Backtest") }}>
                            ● 回测 {backtestTotal >= 0 ? "+" : ""}
                            {formatValue(backtestTotal)}
                        </span>
                    )}
                    <span style={{ color: "var(--text-faint)" }}>
                        {allTradesDateRange.min && allTradesDateRange.max
                            ? `范围：${allTradesDateRange.min} → ${allTradesDateRange.max}`
                            : "范围：—"}
                    </span>
                </div>
            </div>

            <div style={{ width: "100%", height: 250, overflow: "hidden" }}>
                <LineChart width={600} height={250} data={data} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
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
                    {/* 根据 visibleAccounts 条件渲染曲线 */}
                    {visibleAccounts.includes('Backtest') && (
                        <Line
                            type="monotone"
                            dataKey="Backtest"
                            stroke={getRColorByAccountType("Backtest")}
                            strokeWidth={1.5}
                            strokeDasharray="4 4"
                            dot={false}
                            connectNulls
                        />
                    )}
                    {visibleAccounts.includes('Demo') && (
                        <Line
                            type="monotone"
                            dataKey="Demo"
                            stroke={getRColorByAccountType("Demo")}
                            strokeWidth={1.5}
                            dot={false}
                            connectNulls
                        />
                    )}
                    {visibleAccounts.includes('Live') && (
                        <Line
                            type="monotone"
                            dataKey="Live"
                            stroke={getRColorByAccountType("Live")}
                            strokeWidth={2.5}
                            dot={{ r: 1 }}
                            activeDot={{ r: 4 }}
                            connectNulls
                        />
                    )}
                </LineChart>
            </div>
        </Card>
    );
};
