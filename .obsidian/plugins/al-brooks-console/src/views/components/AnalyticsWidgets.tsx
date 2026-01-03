import * as React from "react";
import type { ContextAnalysisRow, ErrorAnalysisRow } from "../../core/analytics";

interface ContextWidgetProps {
    data: ContextAnalysisRow[];
}

export const ContextWidget: React.FC<ContextWidgetProps> = ({ data }) => {
    return (
        <div style={{
            background: "var(--background-secondary)",
            borderRadius: "8px",
            padding: "12px",
            border: "1px solid var(--background-modifier-border)"
        }}>
            <h4 style={{ margin: "0 0 10px 0", fontSize: "0.9em", color: "var(--text-muted)" }}>
                环境周期分析 (Top 8)
            </h4>
            <div style={{ display: "grid", gap: "8px" }}>
                {data.map((row) => (
                    <div key={row.context} style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "0.85em",
                        alignItems: "center"
                    }}>
                        <span style={{ fontWeight: 600 }}>{row.context}</span>
                        <span style={{ color: "var(--text-faint)" }}>
                            {row.count}笔, WR: {row.winRate.toFixed(0)}%,
                            <span style={{
                                marginLeft: "6px",
                                color: row.netR > 0 ? "var(--text-success)" : "var(--text-error)"
                            }}>
                                {row.netR > 0 ? "+" : ""}{row.netR.toFixed(1)}R
                            </span>
                        </span>
                    </div>
                ))}
                {data.length === 0 && <div style={{ color: "var(--text-faint)", fontSize: "0.8em" }}>暂无数据</div>}
            </div>
        </div>
    );
};

interface ErrorWidgetProps {
    data: ErrorAnalysisRow[];
}

export const ErrorWidget: React.FC<ErrorWidgetProps> = ({ data }) => {
    return (
        <div style={{
            background: "var(--background-secondary)",
            borderRadius: "8px",
            padding: "12px",
            border: "1px solid var(--background-modifier-border)"
        }}>
            <h4 style={{ margin: "0 0 10px 0", fontSize: "0.9em", color: "var(--text-muted)" }}>
                错误分布 (Top 8)
            </h4>
            <div style={{ display: "grid", gap: "8px" }}>
                {data.map((row) => (
                    <div key={row.errorTag} style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "0.85em",
                        alignItems: "center"
                    }}>
                        <span style={{ color: "var(--text-error)" }}>{row.errorTag}</span>
                        <span style={{ color: "var(--text-faint)" }}>
                            {row.count}笔,
                            <span style={{
                                marginLeft: "6px",
                                color: "var(--text-error)"
                            }}>
                                {row.netR.toFixed(1)}R
                            </span>
                        </span>
                    </div>
                ))}
                {data.length === 0 && <div style={{ color: "var(--text-faint)", fontSize: "0.8em" }}>暂无错误记录</div>}
            </div>
        </div>
    );
};
