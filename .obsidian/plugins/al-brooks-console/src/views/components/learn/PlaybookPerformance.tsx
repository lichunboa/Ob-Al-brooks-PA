import * as React from "react";

/**
 * PlaybookPerformance Props接口
 */
export interface PlaybookPerformanceProps {
    // 数据Props
    playbookPerfRows: any[];

    // 常量Props
    V5_COLORS: any;
}

/**
 * 作战手册表现组件
 * 显示Brooks Playbook的实战表现统计
 */
export const PlaybookPerformance: React.FC<PlaybookPerformanceProps> = ({
    playbookPerfRows,
    V5_COLORS,
}) => {
    return (
        <div
            style={{
                marginTop: "20px",
                paddingTop: "15px",
                borderTop: "1px solid var(--background-modifier-border)",
            }}
        >
            <div
                style={{ fontWeight: 700, opacity: 0.7, marginBottom: "10px" }}
            >
                🏆 实战表现 (Performance)
            </div>

            {playbookPerfRows.length === 0 ? (
                <div style={{ color: "var(--text-faint)", fontSize: "0.9em" }}>
                    暂无可用的策略表现统计（需要交易记录与策略归因）。
                </div>
            ) : (
                <div
                    style={{
                        border: "1px solid var(--background-modifier-border)",
                        borderRadius: "8px",
                        overflow: "hidden",
                    }}
                >
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr
                                style={{
                                    background: "rgba(var(--mono-rgb-100), 0.05)",
                                    fontSize: "0.85em",
                                    color: "var(--text-muted)",
                                }}
                            >
                                <th
                                    style={{
                                        textAlign: "left",
                                        padding: "8px 10px",
                                        fontWeight: 700,
                                    }}
                                >
                                    策略
                                </th>
                                <th
                                    style={{
                                        textAlign: "center",
                                        padding: "8px 10px",
                                        fontWeight: 700,
                                    }}
                                >
                                    笔数
                                </th>
                                <th
                                    style={{
                                        textAlign: "center",
                                        padding: "8px 10px",
                                        fontWeight: 700,
                                    }}
                                >
                                    胜率
                                </th>
                                <th
                                    style={{
                                        textAlign: "right",
                                        padding: "8px 10px",
                                        fontWeight: 700,
                                    }}
                                >
                                    净盈亏
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {playbookPerfRows.map((row, idx) => {
                                const color =
                                    row.netR >= 0 ? V5_COLORS.win : V5_COLORS.loss;
                                return (
                                    <tr
                                        key={`pb-perf-${row.name}-${idx}`}
                                        style={{
                                            borderTop:
                                                idx > 0
                                                    ? "1px solid var(--background-modifier-border)"
                                                    : "none",
                                        }}
                                    >
                                        <td
                                            style={{
                                                padding: "8px 10px",
                                                fontSize: "0.9em",
                                            }}
                                        >
                                            {row.name}
                                        </td>
                                        <td
                                            style={{
                                                padding: "8px 10px",
                                                textAlign: "center",
                                                fontSize: "0.9em",
                                                color: "var(--text-muted)",
                                            }}
                                        >
                                            {row.count}
                                        </td>
                                        <td
                                            style={{
                                                padding: "8px 10px",
                                                textAlign: "center",
                                                fontSize: "0.9em",
                                                color: "var(--text-muted)",
                                            }}
                                        >
                                            {row.wr}%
                                        </td>
                                        <td
                                            style={{
                                                padding: "8px 10px",
                                                textAlign: "right",
                                                fontSize: "0.9em",
                                                fontWeight: 800,
                                                color,
                                                fontVariantNumeric: "tabular-nums",
                                            }}
                                        >
                                            {row.netR >= 0 ? "+" : ""}
                                            {row.netR.toFixed(1)}R
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};
