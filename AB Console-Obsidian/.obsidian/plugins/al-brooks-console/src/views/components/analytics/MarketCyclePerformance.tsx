import * as React from "react";
import { V5_COLORS } from "../../../ui/tokens";
import { EmptyState } from "../../../ui/components/EmptyState";
import { Card } from "../../../ui/components/Card";
import { formatCurrency } from "../../../utils/format-utils";

/**
 * MarketCyclePerformance Props接口
 */
export interface MarketCyclePerformanceProps {
    // 数据Props
    liveCyclePerf: any[];

    // 常量Props
    SPACE: any;
    CYCLE_MAP: Record<string, string>;
    currencyMode?: 'USD' | 'CNY';
}

/**
 * 市场环境表现组件
 * 显示不同市场环境下的Live PnL表现
 */
export const MarketCyclePerformance: React.FC<MarketCyclePerformanceProps> = ({
    liveCyclePerf,
    SPACE,
    CYCLE_MAP,
    currencyMode = 'USD',
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
                🌪️ 不同市场环境表现{" "}
                <span
                    style={{
                        fontWeight: 600,
                        opacity: 0.6,
                        fontSize: "0.85em",
                    }}
                >
                    (Live PnL)
                </span>
            </div>
            {liveCyclePerf.length === 0 ? (
                <EmptyState message="暂无数据" />
            ) : (
                <div
                    style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}
                >
                    {liveCyclePerf.map((cy) => {
                        const color =
                            cy.pnl > 0
                                ? V5_COLORS.win
                                : cy.pnl < 0
                                    ? V5_COLORS.loss
                                    : "var(--text-muted)";
                        return (
                            <div
                                key={cy.name}
                                style={{
                                    border:
                                        "1px solid var(--background-modifier-border)",
                                    borderRadius: "8px",
                                    padding: "8px 12px",
                                    minWidth: "120px",
                                    flex: "1 1 180px",
                                    background: "rgba(var(--mono-rgb-100), 0.03)",
                                    textAlign: "center",
                                }}
                            >
                                <div
                                    style={{
                                        fontSize: "0.85em",
                                        color: "var(--text-muted)",
                                    }}
                                >
                                    {CYCLE_MAP[cy.name] || cy.name}
                                </div>
                                <div
                                    style={{
                                        fontWeight: 800,
                                        color,
                                        fontVariantNumeric: "tabular-nums",
                                        marginTop: "2px",
                                    }}
                                >
                                    {cy.pnl > 0 ? "+" : ""}
                                    {formatCurrency(cy.pnl, currencyMode).replace('$', '').replace('¥', '')}
                                    <span style={{ fontSize: '0.6em', marginLeft: '2px', opacity: 0.7 }}>
                                        {currencyMode === 'USD' ? '$' : '¥'}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </Card>
    );
};
