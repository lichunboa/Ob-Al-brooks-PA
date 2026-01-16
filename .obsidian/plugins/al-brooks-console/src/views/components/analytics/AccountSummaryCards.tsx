import * as React from "react";
import { V5_COLORS } from "../../../ui/tokens";
import { Card } from "../../../ui/components/Card";
import { formatCurrency } from "../../../utils/format-utils";

/**
 * AccountSummaryCards Props接口
 */
export interface AccountSummaryCardsProps {
    // 数据Props
    summary: {
        Live: any;
        Demo: any;
        Backtest: any;
    };

    // 常量Props
    SPACE: any;
    currencyMode?: 'USD' | 'CNY';
}

/**
 * 账户资金概览卡片组件
 * 显示Live/Demo/Backtest三个账户的资金概览
 */
export const AccountSummaryCards: React.FC<AccountSummaryCardsProps> = ({
    summary,
    SPACE,
    currencyMode = 'USD',
}) => {
    return (
        <div style={{ display: "flex", gap: SPACE.md, flexWrap: "wrap" }}>
            {(
                [
                    {
                        key: "Live",
                        label: "🟢 实盘账户",
                        badge: "Live",
                        accent: V5_COLORS.live,
                        stats: summary.Live,
                    },
                    {
                        key: "Demo",
                        label: "🔵 模拟盘",
                        badge: "Demo",
                        accent: V5_COLORS.demo,
                        stats: summary.Demo,
                    },
                    {
                        key: "Backtest",
                        label: "🟠 复盘回测",
                        badge: "Backtest",
                        accent: V5_COLORS.back,
                        stats: summary.Backtest,
                    },
                ] as const
            ).map((card) => {
                const netMoney = card.stats.netMoney ?? 0;
                return (
                    <Card
                        key={card.key}
                        variant="subtle-tight"
                        style={{
                            flex: "1 1 260px",
                            minWidth: "240px",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "baseline",
                                gap: "10px",
                            }}
                        >
                            <div
                                style={{
                                    fontWeight: 900,
                                    fontSize: "1.05em",
                                    color: card.accent,
                                }}
                            >
                                {card.label}
                            </div>
                            <div
                                style={{
                                    fontSize: "0.8em",
                                    color: "var(--text-muted)",
                                    border:
                                        "1px solid var(--background-modifier-border)",
                                    borderRadius: "999px",
                                    padding: "2px 8px",
                                    background: "var(--background-primary)",
                                }}
                            >
                                {card.badge}
                            </div>
                        </div>

                        <div
                            style={{
                                display: "flex",
                                alignItems: "baseline",
                                gap: "6px",
                                marginTop: "6px",
                            }}
                        >
                            <div
                                style={{
                                    fontSize: "2.0em",
                                    fontWeight: 900,
                                    lineHeight: 1,
                                    color:
                                        netMoney >= 0
                                            ? V5_COLORS.win
                                            : V5_COLORS.loss,
                                }}
                            >
                                {netMoney > 0 ? "+" : ""}
                                {formatCurrency(netMoney, currencyMode).replace('$', '').replace('¥', '')}
                            </div>
                            <div
                                style={{
                                    color: "var(--text-faint)",
                                    fontSize: "0.95em",
                                }}
                            >
                                {currencyMode === 'USD' ? '$' : '¥'}
                            </div>
                        </div>

                        <div
                            style={{
                                display: "flex",
                                gap: "14px",
                                marginTop: "10px",
                                color: "var(--text-muted)",
                                fontSize: "0.9em",
                                flexWrap: "wrap",
                            }}
                        >
                            <div>📦 {card.stats.countTotal} 笔交易</div>
                            <div>🎯 {card.stats.winRatePct}% 胜率</div>
                        </div>
                    </Card>
                )
            })}
        </div>
    );
};
