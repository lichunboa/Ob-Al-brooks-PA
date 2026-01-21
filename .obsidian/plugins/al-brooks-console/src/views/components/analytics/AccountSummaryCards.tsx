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
    displayUnit?: 'money' | 'r';
    // 可见账户类型（用于过滤显示）
    visibleAccounts?: ('Live' | 'Demo' | 'Backtest')[];
}


/**
 * 账户资金概览卡片组件
 * 显示Live/Demo/Backtest三个账户的资金概览
 * 支持 visibleAccounts 过滤以及零值/Unknown 隐藏
 */
export const AccountSummaryCards: React.FC<AccountSummaryCardsProps> = ({
    summary,
    SPACE,
    currencyMode = 'USD',
    displayUnit = 'money',
    visibleAccounts = ['Live', 'Demo', 'Backtest'], // 默认显示全部
}) => {
    // 构建账户卡片配置
    const allCards = [
        {
            key: "Live" as const,
            label: "🟢 实盘账户",
            badge: "Live",
            accent: V5_COLORS.live,
            stats: summary.Live,
        },
        {
            key: "Demo" as const,
            label: "🔵 模拟盘",
            badge: "Demo",
            accent: V5_COLORS.demo,
            stats: summary.Demo,
        },
        {
            key: "Backtest" as const,
            label: "🟠 复盘回测",
            badge: "Backtest",
            accent: V5_COLORS.back,
            stats: summary.Backtest,
        },
    ];

    // 过滤逻辑：
    // 1. 只显示 visibleAccounts 中的账户
    // 2. 隐藏零值账户（净利润为0且交易次数为0）
    const filteredCards = allCards.filter(card => {
        // 检查是否在可见列表中
        if (!visibleAccounts.includes(card.key)) return false;

        // 隐藏零值账户（无交易且无盈亏）
        const netMoney = card.stats.netMoney ?? 0;
        const countTotal = card.stats.countTotal ?? 0;
        if (netMoney === 0 && countTotal === 0) return false;

        return true;
    });

    // 如果所有账户都被过滤掉，显示空状态提示
    if (filteredCards.length === 0) {
        return (
            <div style={{
                color: "var(--text-muted)",
                fontSize: "0.9em",
                padding: SPACE.md,
                textAlign: "center"
            }}>
                📭 当前筛选条件下无账户数据
            </div>
        );
    }

    return (
        <div style={{ display: "flex", gap: SPACE.md, flexWrap: "wrap" }}>
            {filteredCards.map((card) => {
                const netMoney = card.stats.netMoney ?? 0;
                const netR = card.stats.netR ?? 0;
                const isR = displayUnit === 'r';

                const displayValue = isR ? netR : netMoney;
                const displayPrefix = isR
                    ? (displayValue > 0 ? "+" : "")
                    : (displayValue > 0 ? "+" : "");
                const displaySuffix = isR ? "R" : "";


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
                                        displayValue >= 0
                                            ? V5_COLORS.win
                                            : V5_COLORS.loss,
                                }}
                            >
                                {displayPrefix}
                                {isR
                                    ? displayValue.toFixed(1)
                                    : formatCurrency(displayValue, currencyMode).replace('$', '').replace('¥', '')
                                }
                                {displaySuffix}
                            </div>
                            <div
                                style={{
                                    color: "var(--text-faint)",
                                    fontSize: "0.95em",
                                }}
                            >
                                {isR ? 'Risk Multiples' : (currencyMode === 'USD' ? '$' : '¥')}
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
