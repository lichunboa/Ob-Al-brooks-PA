import * as React from "react";
import { Button } from "../../../ui/components/Button";
import { EmptyState } from "../../../ui/components/EmptyState";

/**
 * PlaybookPerformance Props接口
 */
export interface PlaybookPerformanceProps {
    // 数据Props
    playbookPerfRows: any[];

    // 函数Props
    openFile: (path: string) => void;

    // 样式Props
    textButtonStyle: React.CSSProperties;

    // 事件处理Props
    onTextBtnMouseEnter: (e: React.MouseEvent) => void;
    onTextBtnMouseLeave: (e: React.MouseEvent) => void;
    onTextBtnFocus: (e: React.FocusEvent) => void;
    onTextBtnBlur: (e: React.FocusEvent) => void;

    // 常量Props
    V5_COLORS: any;
}

/**
 * 作战手册表现组件
 * 显示Brooks Playbook的实战表现统计
 */
export const PlaybookPerformance: React.FC<PlaybookPerformanceProps> = ({
    playbookPerfRows,
    openFile,
    textButtonStyle,
    onTextBtnMouseEnter,
    onTextBtnMouseLeave,
    onTextBtnFocus,
    onTextBtnBlur,
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
                <EmptyState message="暂无可用的策略表现统计（需要交易记录与策略归因）。" />
            ) : (
                <div
                    style={{
                        border: "1px solid var(--background-modifier-border)",
                        borderRadius: "8px",
                        overflow: "hidden",
                    }}
                >
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 72px 88px 60px",
                            gap: "0px",
                            padding: "8px 10px",
                            borderBottom:
                                "1px solid var(--background-modifier-border)",
                            color: "var(--text-muted)",
                            fontSize: "0.85em",
                            fontWeight: 700,
                        }}
                    >
                        <div>策略</div>
                        <div>胜率</div>
                        <div>盈亏</div>
                        <div>次数</div>
                    </div>

                    {playbookPerfRows.map((r) => {
                        const pnlColor =
                            r.pnl > 0
                                ? V5_COLORS.win
                                : r.pnl < 0
                                    ? V5_COLORS.loss
                                    : "var(--text-muted)";

                        return (
                            <div
                                key={`pb-perf-${r.canonical}`}
                                style={{
                                    display: "grid",
                                    gridTemplateColumns: "1fr 72px 88px 60px",
                                    padding: "8px 10px",
                                    borderBottom:
                                        "1px solid var(--background-modifier-border)",
                                    fontSize: "0.9em",
                                    alignItems: "center",
                                }}
                            >
                                <div
                                    style={{
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                    }}
                                >
                                    {r.path ? (
                                        <Button
                                            variant="text"
                                            onClick={() => openFile(r.path!)}
                                            onMouseEnter={onTextBtnMouseEnter}
                                            onMouseLeave={onTextBtnMouseLeave}
                                            onFocus={onTextBtnFocus}
                                            onBlur={onTextBtnBlur}
                                        >
                                            {r.canonical}
                                        </Button>
                                    ) : (
                                        <span>{r.canonical}</span>
                                    )}
                                </div>
                                <div style={{ fontVariantNumeric: "tabular-nums" }}>
                                    {r.winRate}%
                                </div>
                                <div
                                    style={{
                                        color: pnlColor,
                                        fontWeight: 800,
                                        fontVariantNumeric: "tabular-nums",
                                    }}
                                >
                                    {r.pnl > 0 ? "+" : ""}
                                    {Math.round(r.pnl)}
                                </div>
                                <div style={{ fontVariantNumeric: "tabular-nums" }}>
                                    {r.total}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
