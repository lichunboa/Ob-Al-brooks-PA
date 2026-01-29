import * as React from "react";
import { V5_COLORS } from "../../../ui/tokens";
import { Card } from "../../../ui/components/Card";

/**
 * TuitionCostPanel Props接口
 */
export interface TuitionCostPanelProps {
    // 数据Props
    tuition: {
        tuitionR: number;
        rows: any[];
    };

    // 常量Props
    SPACE: any;
}

/**
 * 学费统计面板组件
 * 显示因执行错误导致的亏损统计
 */
export const TuitionCostPanel: React.FC<TuitionCostPanelProps> = ({
    tuition,
    SPACE,
}) => {
    return (
        <Card variant="tight">
            <div
                style={{
                    fontWeight: 700,
                    opacity: 0.75,
                    marginBottom: SPACE.sm,
                }}
            >
                💸 错误的代价{" "}
                <span
                    style={{
                        fontWeight: 600,
                        opacity: 0.6,
                        fontSize: "0.85em",
                    }}
                >
                    (学费统计)
                </span>
            </div>
            {tuition.tuitionR <= 0 ? (
                <div style={{ color: V5_COLORS.win, fontWeight: 700 }}>
                    🎉 完美！近期实盘没有因纪律问题亏损。
                </div>
            ) : (
                <div>
                    <div
                        style={{
                            color: "var(--text-muted)",
                            fontSize: "0.9em",
                            marginBottom: "10px",
                        }}
                    >
                        因执行错误共计亏损：
                        <span
                            style={{
                                color: V5_COLORS.loss,
                                fontWeight: 900,
                                marginLeft: "6px",
                            }}
                        >
                            -{tuition.tuitionR.toFixed(1)}R
                        </span>
                    </div>
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px",
                        }}
                    >
                        {tuition.rows.slice(0, 5).map((row) => {
                            const pct = Math.round(
                                (row.costR / tuition.tuitionR) * 100
                            );
                            return (
                                <div
                                    key={row.tag}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "10px",
                                        fontSize: "0.9em",
                                    }}
                                >
                                    <div
                                        style={{
                                            width: "110px",
                                            color: "var(--text-muted)",
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                        }}
                                        title={row.tag}
                                    >
                                        {row.tag}
                                    </div>
                                    <div
                                        style={{
                                            flex: "1 1 auto",
                                            background: "rgba(var(--mono-rgb-100), 0.03)",
                                            height: "6px",
                                            borderRadius: "999px",
                                            overflow: "hidden",
                                            border:
                                                "1px solid var(--background-modifier-border)",
                                        }}
                                    >
                                        <div
                                            style={{
                                                width: `${pct}%`,
                                                height: "100%",
                                                background: "var(--text-error)",
                                            }}
                                        />
                                    </div>
                                    <div
                                        style={{
                                            width: "70px",
                                            textAlign: "right",
                                            color: "var(--text-error)",
                                            fontWeight: 800,
                                            fontVariantNumeric: "tabular-nums",
                                        }}
                                    >
                                        -{row.costR.toFixed(1)}R
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </Card>
    );
};
