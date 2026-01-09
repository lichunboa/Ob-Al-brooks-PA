import * as React from "react";
import type { AnalyticsScope } from "../../../core/analytics";
import { V5_COLORS, withHexAlpha } from "../../../ui/tokens";
import { InteractiveButton } from "../../../ui/components/InteractiveButton";

/**
 * DataAnalysisPanel Props接口
 */
export interface DataAnalysisPanelProps {
    // 数据Props
    calendarCells: any[];
    calendarDays: number;
    calendarMaxAbs: number;
    strategyAttribution: any[];
    analyticsScope: AnalyticsScope;

    // 函数Props
    setAnalyticsScope: (scope: AnalyticsScope) => void;
    openFile: (path: string) => void;
    getDayOfMonth: (dateIso: string) => string;

    // 样式Props
    cardTightStyle: React.CSSProperties;
    textButtonStyle: React.CSSProperties;
    selectStyle: React.CSSProperties;

    // 常量Props
    SPACE: any;
}

/**
 * 数据分析面板组件
 * 包含日历热力图和策略归因
 */
export const DataAnalysisPanel: React.FC<DataAnalysisPanelProps> = ({
    calendarCells,
    calendarDays,
    calendarMaxAbs,
    strategyAttribution,
    analyticsScope,
    setAnalyticsScope,
    openFile,
    getDayOfMonth,
    cardTightStyle,
    textButtonStyle,
    selectStyle,
    SPACE,
}) => {
    return (
        <div
            style={{
                ...cardTightStyle,
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "10px",
                    marginBottom: "8px",
                }}
            >
                <div style={{ fontWeight: 600 }}>数据分析</div>
                <label
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        color: "var(--text-muted)",
                        fontSize: "0.9em",
                    }}
                >
                    范围
                    <select
                        value={analyticsScope}
                        onChange={(e) =>
                            setAnalyticsScope(e.target.value as AnalyticsScope)
                        }
                        style={selectStyle}
                    >
                        <option value="Live">实盘</option>
                        <option value="Demo">模拟</option>
                        <option value="Backtest">回测</option>
                        <option value="All">全部</option>
                    </select>
                </label>
            </div>

            <div
                style={{ display: "flex", flexWrap: "wrap", gap: SPACE.md }}
            >
                <div style={{ flex: "1 1 320px", minWidth: "320px" }}>
                    <div style={{ fontWeight: 600, marginBottom: "8px" }}>
                        日历（最近 {calendarDays} 天）
                    </div>
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
                            gap: "6px",
                        }}
                    >
                        {calendarCells.map((c) => {
                            const absRatio =
                                calendarMaxAbs > 0
                                    ? Math.min(1, Math.abs(c.netR) / calendarMaxAbs)
                                    : 0;
                            const alpha =
                                c.count > 0 ? 0.12 + 0.55 * absRatio : 0.04;
                            const bg =
                                c.netR > 0
                                    ? withHexAlpha(V5_COLORS.win, "1A")
                                    : c.netR < 0
                                        ? withHexAlpha(V5_COLORS.loss, "1A")
                                        : `rgba(var(--mono-rgb-100), 0.05)`;
                            return (
                                <div
                                    key={`cal-${c.dateIso}`}
                                    title={`${c.dateIso} • ${c.count} 笔 • ${c.netR >= 0 ? "+" : ""
                                        }${c.netR.toFixed(1)}R`}
                                    style={{
                                        border:
                                            "1px solid var(--background-modifier-border)",
                                        borderRadius: "6px",
                                        padding: "6px",
                                        background: bg,
                                        minHeight: "40px",
                                        display: "flex",
                                        flexDirection: "column",
                                        justifyContent: "space-between",
                                    }}
                                >
                                    <div
                                        style={{
                                            fontSize: "0.85em",
                                            color: "var(--text-muted)",
                                        }}
                                    >
                                        {getDayOfMonth(c.dateIso)}
                                    </div>
                                    <div
                                        style={{
                                            fontSize: "0.85em",
                                            fontWeight: 600,
                                            color:
                                                c.netR > 0
                                                    ? V5_COLORS.win
                                                    : c.netR < 0
                                                        ? V5_COLORS.loss
                                                        : "var(--text-faint)",
                                            textAlign: "right",
                                        }}
                                    >
                                        {c.count > 0
                                            ? `${c.netR >= 0 ? "+" : ""}${c.netR.toFixed(
                                                1
                                            )}R`
                                            : "—"}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div style={{ flex: "1 1 360px", minWidth: "360px" }}>
                    <div style={{ fontWeight: 600, marginBottom: "8px" }}>
                        策略归因（Top）
                    </div>
                    {strategyAttribution.length > 0 ? (
                        <ul style={{ margin: 0, paddingLeft: "18px" }}>
                            {strategyAttribution.map((r) => (
                                <li
                                    key={`attr-${r.strategyName}`}
                                    style={{ marginBottom: "6px" }}
                                >
                                    {r.strategyPath ? (
                                        <InteractiveButton
                                            interaction="text"
                                            variant="text"
                                            onClick={() => openFile(r.strategyPath!)}
                                            style={textButtonStyle}
                                        >
                                            {r.strategyName}
                                        </InteractiveButton>
                                    ) : (
                                        <span>{r.strategyName}</span>
                                    )}
                                    <span
                                        style={{
                                            color: "var(--text-muted)",
                                            marginLeft: "8px",
                                            fontSize: "0.9em",
                                        }}
                                    >
                                        {r.count} 笔 •{" "}
                                        <span
                                            style={{
                                                color:
                                                    r.netR >= 0
                                                        ? V5_COLORS.win
                                                        : V5_COLORS.loss,
                                                fontWeight: 600,
                                            }}
                                        >
                                            {r.netR >= 0 ? "+" : ""}
                                            {r.netR.toFixed(1)}R
                                        </span>
                                    </span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <div
                            style={{
                                color: "var(--text-faint)",
                                fontSize: "0.9em",
                            }}
                        >
                            未找到策略归因数据。
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
