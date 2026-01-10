import * as React from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { AccountType } from "../../../core/contracts";
import { Card } from "../../../ui/components/Card";

interface DrawdownChartProps {
    data: Array<{ date: string; drawdown: number }>;
    style?: React.CSSProperties;
    accountType?: AccountType;
}

export const DrawdownChart: React.FC<DrawdownChartProps> = ({
    data,
    style,
    accountType = "Live",
}) => {
    return (
        <Card
            variant="subtle"
            style={{
                padding: "16px",
                display: "flex",
                flexDirection: "column",
                gap: "12px",
                ...style
            }}
        >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontWeight: 700, fontSize: "1.05em" }}>
                    📉 回撤分析 <span style={{ fontWeight: 600, opacity: 0.6, fontSize: "0.85em" }}>(Drawdown)</span>
                </div>
                <div style={{ fontSize: "0.85em", color: "var(--text-muted)" }}>
                    {data.length > 0 ? `Max: ${Math.min(...data.map(d => d.drawdown)).toFixed(2)}R` : "No Data"}
                </div>
            </div>

            <div style={{ width: "100%", height: 200 }}>
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                        data={data}
                        margin={{ top: 5, right: 0, left: -20, bottom: 0 }}
                    >
                        <defs>
                            <linearGradient id="colorDrawdown" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="rgba(239, 68, 68, 0.5)" stopOpacity={0.4} />
                                <stop offset="95%" stopColor="rgba(239, 68, 68, 0.1)" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.1} vertical={false} stroke="var(--text-muted)" />
                        <XAxis
                            dataKey="date"
                            hide={true}
                        />
                        <YAxis
                            domain={['auto', 0]}
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
                            labelStyle={{ color: "var(--text-muted)", marginBottom: "4px" }}
                            formatter={(value: number) => [`${value.toFixed(2)}R`, "Drawdown"]}
                        />
                        <Area
                            type="monotone"
                            dataKey="drawdown"
                            stroke="var(--text-error)"
                            fillOpacity={1}
                            fill="url(#colorDrawdown)"
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </Card>
    );
};
