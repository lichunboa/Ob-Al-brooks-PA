import * as React from "react";
import type { TradeRecord } from "../../../core/contracts";
import { V5_COLORS } from "../../../ui/tokens";
import { Card } from "../../../ui/components/Card";
import { formatCurrency } from "../../../utils/format-utils";

/**
 * StrategySelector - 策略选择器
 * 在日历下方显示，用于选择策略进行深入分析（支持多选）
 */

export interface StrategySelectorProps {
    /** 筛选后的交易 */
    trades: TradeRecord[];
    /** 当前选中的策略集合（空数组 = 全部） */
    selectedStrategies: string[];
    /** 选择/取消选择策略回调 */
    onToggleStrategy: (strategy: string) => void;
    /** 全选/清空回调 */
    onSelectAll: () => void;
    /** 货币模式 */
    currencyMode: 'USD' | 'CNY';
    /** 间距 */
    SPACE: any;
}

interface StrategyStats {
    name: string;
    count: number;
    netMoney: number;
    winRate: number;
}

export const StrategySelector: React.FC<StrategySelectorProps> = ({
    trades,
    selectedStrategies,
    onToggleStrategy,
    onSelectAll,
    currencyMode,
    SPACE,
}) => {
    // 计算每个策略的统计数据
    const strategyStats = React.useMemo<StrategyStats[]>(() => {
        const statsMap = new Map<string, { count: number; netMoney: number; wins: number }>();

        for (const trade of trades) {
            const strategyName = trade.strategyName || 'Unknown';
            const existing = statsMap.get(strategyName) || { count: 0, netMoney: 0, wins: 0 };
            existing.count += 1;
            existing.netMoney += trade.pnl ?? 0;
            if ((trade.pnl ?? 0) > 0) existing.wins += 1;
            statsMap.set(strategyName, existing);
        }

        return Array.from(statsMap.entries())
            .map(([name, stats]) => ({
                name,
                count: stats.count,
                netMoney: stats.netMoney,
                winRate: stats.count > 0 ? Math.round((stats.wins / stats.count) * 100) : 0,
            }))
            .sort((a, b) => b.netMoney - a.netMoney);
    }, [trades]);

    // 如果没有策略数据，不显示
    if (strategyStats.length === 0) return null;

    const isAllSelected = selectedStrategies.length === 0;

    return (
        <Card variant="tight">
            <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: SPACE.sm,
                marginBottom: SPACE.sm,
            }}>
                <span style={{ fontWeight: 700, opacity: 0.85 }}>🎯 策略筛选</span>
                {selectedStrategies.length > 0 && (
                    <span style={{
                        fontSize: '0.8em',
                        color: 'var(--text-muted)',
                    }}>
                        (已选 {selectedStrategies.length} 个)
                    </span>
                )}
            </div>

            <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '8px',
            }}>
                {/* 全部策略按钮 */}
                <button
                    onClick={onSelectAll}
                    style={{
                        padding: '6px 12px',
                        fontSize: '0.85em',
                        border: 'none',
                        borderRadius: '16px',
                        cursor: 'pointer',
                        background: isAllSelected
                            ? 'var(--interactive-accent)'
                            : 'var(--background-modifier-border)',
                        color: isAllSelected
                            ? 'var(--text-on-accent)'
                            : 'var(--text-muted)',
                        transition: 'all 0.2s ease',
                    }}
                >
                    全部策略
                </button>

                {/* 各策略按钮 */}
                {strategyStats.map(strategy => {
                    const isSelected = selectedStrategies.includes(strategy.name);
                    const color = strategy.netMoney >= 0 ? V5_COLORS.win : V5_COLORS.loss;

                    return (
                        <button
                            key={strategy.name}
                            onClick={() => onToggleStrategy(strategy.name)}
                            style={{
                                padding: '6px 12px',
                                fontSize: '0.85em',
                                border: isSelected ? `2px solid ${color}` : '2px solid transparent',
                                borderRadius: '16px',
                                cursor: 'pointer',
                                background: isSelected
                                    ? `${color}22`
                                    : 'var(--background-modifier-border)',
                                color: isSelected
                                    ? color
                                    : 'var(--text-normal)',
                                transition: 'all 0.2s ease',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                            }}
                        >
                            {/* 复选框指示器 */}
                            <span style={{
                                width: '14px',
                                height: '14px',
                                borderRadius: '3px',
                                border: `1.5px solid ${isSelected ? color : 'var(--text-muted)'}`,
                                background: isSelected ? color : 'transparent',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '9px',
                                color: 'white',
                            }}>
                                {isSelected && '✓'}
                            </span>
                            <span style={{ fontWeight: isSelected ? 600 : 400 }}>
                                {strategy.name}
                            </span>
                            <span style={{
                                fontSize: '0.8em',
                                opacity: 0.8,
                            }}>
                                {strategy.count}笔
                            </span>
                            <span style={{
                                fontSize: '0.8em',
                                fontWeight: 600,
                                color,
                            }}>
                                {strategy.netMoney >= 0 ? '+' : ''}{formatCurrency(strategy.netMoney, currencyMode)}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* 选中策略的简要信息 */}
            {selectedStrategies.length > 0 && (
                <div style={{
                    marginTop: SPACE.sm,
                    padding: '8px 12px',
                    background: 'rgba(100, 150, 255, 0.08)',
                    borderRadius: '6px',
                    fontSize: '0.85em',
                }}>
                    <span style={{ fontWeight: 600 }}>已选择: </span>
                    <span style={{ color: 'var(--text-accent)' }}>
                        {selectedStrategies.join(', ')}
                    </span>
                    <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>
                        - 下方图表将只显示所选策略的数据
                    </span>
                </div>
            )}
        </Card>
    );
};
