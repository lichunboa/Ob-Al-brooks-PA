import * as React from "react";
import type {
    ContextAnalysisRow,
    TuitionAnalysis,
} from "../../core/analytics";

interface ContextWidgetProps {
    data: ContextAnalysisRow[];
}

export const ContextWidget: React.FC<ContextWidgetProps> = ({ data }) => {
    const cycleToCn = React.useCallback((raw: string) => {
        const s = raw.trim();
        if (!s) return s;
        const map: Record<string, string> = {
            "Strong Trend": "强趋势",
            "Weak Trend": "弱趋势",
            "Trading Range": "交易区间",
            "Breakout Mode": "突破模式",
            Breakout: "突破",
            Channel: "通道",
            "Broad Channel": "宽通道",
            "Tight Channel": "窄通道",
        };
        return map[s] ?? s;
    }, []);

    return (
        <div className="pa-card">
            <h4 className="pa-card-subtitle" style={{ margin: "0 0 10px 0" }}>
                环境周期分析 (Top 8)
            </h4>
            <div style={{ display: "grid", gap: "0" }}>
                {data.map((row) => (
                    <div key={row.context} className="pa-analytics-row">
                        <span style={{ fontWeight: 600 }}>{cycleToCn(row.context)}</span>
                        <span className="pa-text-faint">
                            {row.count}笔, WR: {row.winRate.toFixed(0)}%,
                            <span className={`pa-stat-value ${row.netR > 0 ? "pos" : "neg"}`} style={{ marginLeft: "6px" }}>
                                {row.netR > 0 ? "+" : ""}{row.netR.toFixed(1)}R
                            </span>
                        </span>
                    </div>
                ))}
                {data.length === 0 && <div className="pa-text-muted" style={{ fontSize: "0.8em" }}>暂无数据</div>}
            </div>
        </div>
    );
};

interface ErrorWidgetProps {
    analysis: TuitionAnalysis;
}

export const ErrorWidget: React.FC<ErrorWidgetProps> = ({ analysis }) => {
    const tuition = analysis.tuitionTotal;
    const top = (analysis.rows ?? []).slice(0, 5);
    return (
        <div className="pa-card">
            <h4 className="pa-card-subtitle" style={{ margin: "0 0 10px 0" }}>
                💸 错误归因
            </h4>

            {tuition <= 0 ? (
                <div className="pa-text-muted" style={{ fontSize: "0.9em" }}>
                    🎉 完美执行！近期无纪律性亏损。
                </div>
            ) : (
                <>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
                        <div style={{ fontSize: "0.8em", opacity: 0.7 }}>总学费 (Tuition)</div>
                        <div
                            style={{
                                fontFamily: "var(--font-monospace)",
                                fontVariantNumeric: "tabular-nums",
                                color: "var(--text-error)",
                                fontWeight: 800,
                            }}
                        >
                            -{tuition.toFixed(1)}R
                        </div>
                    </div>

                    <div style={{ display: "grid", gap: "8px" }}>
                        {top.map((row) => {
                            const pct = tuition > 0 ? Math.round((row.cost / tuition) * 100) : 0;
                            return (
                                <div key={row.errorTag} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                    <div
                                        title={row.errorTag}
                                        style={{
                                            width: "92px",
                                            fontSize: "0.85em",
                                            opacity: 0.9,
                                            whiteSpace: "nowrap",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            color: "var(--text-error)",
                                        }}
                                    >
                                        {row.errorTag}
                                    </div>
                                    <div
                                        style={{
                                            flex: 1,
                                            height: "6px",
                                            borderRadius: "4px",
                                            overflow: "hidden",
                                            background: "rgba(var(--mono-rgb-100), 0.06)",
                                            border: "1px solid var(--background-modifier-border)",
                                        }}
                                    >
                                        <div
                                            style={{
                                                width: `${Math.min(100, Math.max(0, pct))}%`,
                                                height: "100%",
                                                background: "var(--text-error)",
                                                opacity: 0.65,
                                            }}
                                        />
                                    </div>
                                    <div
                                        style={{
                                            width: "70px",
                                            textAlign: "right",
                                            fontFamily: "var(--font-monospace)",
                                            fontVariantNumeric: "tabular-nums",
                                            fontSize: "0.85em",
                                            color: "var(--text-error)",
                                            fontWeight: 800,
                                        }}
                                    >
                                        -{row.cost.toFixed(1)}R
                                    </div>
                                </div>
                            );
                        })}

                        {top.length === 0 ? (
                            <div className="pa-text-muted" style={{ fontSize: "0.8em" }}>
                                暂无错误记录
                            </div>
                        ) : null}
                    </div>
                </>
            )}
        </div>
    );
};
