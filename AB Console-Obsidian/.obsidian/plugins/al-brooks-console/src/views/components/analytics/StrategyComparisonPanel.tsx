import * as React from "react";
import type { TradeRecord } from "../../../core/contracts";
import { aggregateTrades } from "../../../core/analytics";
import { V5_COLORS } from "../../../ui/tokens";
import { Card } from "../../../ui/components/Card";
import { formatCurrency } from "../../../utils/format-utils";

/**
 * StrategyComparisonPanel - 多策略对比面板
 * 选择2+策略时显示并排对比，支持切换对比维度
 */

export interface StrategyComparisonPanelProps {
    trades: TradeRecord[];
    selectedStrategies: string[];
    currencyMode: 'USD' | 'CNY';
    displayUnit: 'money' | 'r';
    SPACE: any;
}

type CompareMetric = 'pnl' | 'winRate' | 'avgR' | 'count';
type CompareDimension = 'direction' | 'timeframe' | 'marketCycle' | 'executionQuality';

interface StrategyStats {
    name: string;
    totalPnl: number;
    totalR: number;
    count: number;
    wins: number;
    winRate: number;
    avgR: number;
}

export const StrategyComparisonPanel: React.FC<StrategyComparisonPanelProps> = ({
    trades,
    selectedStrategies,
    currencyMode,
    displayUnit,
    SPACE,
}) => {
    const [compareMetric, setCompareMetric] = React.useState<CompareMetric>('pnl');
    const [compareDimension, setCompareDimension] = React.useState<CompareDimension | null>(null);

    // 计算各策略统计 - hooks 必须在条件判断之前
    const strategyStats = React.useMemo<StrategyStats[]>(() => {
        const statsMap = new Map<string, { pnl: number; r: number; count: number; wins: number }>();
        for (const name of selectedStrategies) {
            statsMap.set(name, { pnl: 0, r: 0, count: 0, wins: 0 });
        }
        for (const t of trades) {
            const name = t.strategyName || 'Unknown';
            const existing = statsMap.get(name);
            if (existing) {
                existing.pnl += t.pnl ?? 0;
                existing.r += t.r ?? 0;
                existing.count += 1;
                if ((t.pnl ?? 0) > 0) existing.wins += 1;
            }
        }
        return selectedStrategies.map(name => {
            const stats = statsMap.get(name)!;
            return {
                name,
                totalPnl: stats.pnl,
                totalR: stats.r,
                count: stats.count,
                wins: stats.wins,
                winRate: stats.count > 0 ? Math.round((stats.wins / stats.count) * 100) : 0,
                avgR: stats.count > 0 ? stats.r / stats.count : 0,
            };
        });
    }, [trades, selectedStrategies]);

    // 维度分析数据（按策略分组）
    const dimensionData = React.useMemo(() => {
        if (!compareDimension) return null;
        const result: Record<string, Array<{ label: string; netMoney: number; count: number }>> = {};
        for (const name of selectedStrategies) {
            const strategyTrades = trades.filter(t => t.strategyName === name);
            result[name] = aggregateTrades(strategyTrades, compareDimension as any);
        }
        return result;
    }, [trades, selectedStrategies, compareDimension]);

    // 找出最佳策略
    const bestByPnl = strategyStats.reduce((a, b) => a.totalPnl > b.totalPnl ? a : b);
    const bestByWinRate = strategyStats.reduce((a, b) => a.winRate > b.winRate ? a : b);

    // 获取当前比较值
    const getCompareValue = (s: StrategyStats) => {
        switch (compareMetric) {
            case 'pnl': return s.totalPnl;
            case 'winRate': return s.winRate;
            case 'avgR': return s.avgR;
            case 'count': return s.count;
        }
    };

    const formatCompareValue = (s: StrategyStats) => {
        switch (compareMetric) {
            case 'pnl': return formatCurrency(s.totalPnl, currencyMode);
            case 'winRate': return `${s.winRate}%`;
            case 'avgR': return `${s.avgR >= 0 ? '+' : ''}${s.avgR.toFixed(2)}R`;
            case 'count': return `${s.count}笔`;
        }
    };

    const metricButtons = [
        { key: 'pnl' as CompareMetric, label: '💰 盈亏' },
        { key: 'winRate' as CompareMetric, label: '🎯 胜率' },
        { key: 'avgR' as CompareMetric, label: '📊 平均R' },
        { key: 'count' as CompareMetric, label: '📈 交易数' },
    ];

    const dimensionButtons = [
        { key: 'direction' as CompareDimension, label: '↕️ 方向' },
        { key: 'timeframe' as CompareDimension, label: '⏱️ 周期' },
        { key: 'marketCycle' as CompareDimension, label: '🌐 环境' },
        { key: 'executionQuality' as CompareDimension, label: '📋 执行' },
    ];

    // 只有选择2+策略时才显示（放在所有 hooks 之后）
    if (selectedStrategies.length < 2) return null;

    return (
        <Card variant="tight">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACE.sm }}>
                <span style={{ fontWeight: 700, opacity: 0.85 }}>
                    🔄 策略对比 ({selectedStrategies.length} 个)
                </span>
            </div>

            {/* 对比卡片网格 */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${Math.min(selectedStrategies.length, 4)}, 1fr)`,
                gap: SPACE.sm,
                marginBottom: SPACE.md,
            }}>
                {strategyStats.map(s => {
                    const isBestPnl = s.name === bestByPnl.name;
                    const isBestWinRate = s.name === bestByWinRate.name;
                    const pnlColor = s.totalPnl >= 0 ? V5_COLORS.win : V5_COLORS.loss;
                    return (
                        <div key={s.name} style={{
                            background: 'rgba(128, 128, 128, 0.05)',
                            borderRadius: '8px',
                            padding: '10px',
                            border: isBestPnl ? `2px solid ${V5_COLORS.win}` : '2px solid transparent',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                                <span style={{ fontWeight: 600, fontSize: '0.85em' }}>{s.name}</span>
                                {isBestPnl && <span style={{ fontSize: '0.6em', background: V5_COLORS.win, color: 'white', padding: '1px 4px', borderRadius: '3px' }}>💰</span>}
                                {isBestWinRate && !isBestPnl && <span style={{ fontSize: '0.6em', background: V5_COLORS.back, color: 'white', padding: '1px 4px', borderRadius: '3px' }}>🎯</span>}
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px' }}>
                                <CompactMetric label="盈亏" value={formatCurrency(s.totalPnl, currencyMode)} color={pnlColor} />
                                <CompactMetric label="胜率" value={`${s.winRate}%`} color={s.winRate >= 50 ? V5_COLORS.win : V5_COLORS.loss} />
                                <CompactMetric label="平均R" value={`${s.avgR >= 0 ? '+' : ''}${s.avgR.toFixed(2)}R`} color={s.avgR >= 0 ? V5_COLORS.win : V5_COLORS.loss} />
                                <CompactMetric label="交易数" value={`${s.count}笔`} color="var(--text-muted)" />
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* 指标对比切换按钮 */}
            <div style={{ display: 'flex', gap: '6px', marginBottom: SPACE.sm, flexWrap: 'wrap' }}>
                {metricButtons.map(b => (
                    <button key={b.key} onClick={() => { setCompareMetric(b.key); setCompareDimension(null); }}
                        style={{
                            padding: '4px 10px', fontSize: '0.75em', border: 'none', borderRadius: '4px', cursor: 'pointer',
                            background: compareMetric === b.key && !compareDimension ? V5_COLORS.win : 'rgba(128,128,128,0.1)',
                            color: compareMetric === b.key && !compareDimension ? 'rgba(255,255,255,0.9)' : 'var(--text-muted)',
                        }}
                    >{b.label}</button>
                ))}
                <span style={{ color: 'var(--text-faint)', margin: '0 4px' }}>|</span>
                {dimensionButtons.map(b => (
                    <button key={b.key} onClick={() => setCompareDimension(compareDimension === b.key ? null : b.key)}
                        style={{
                            padding: '4px 10px', fontSize: '0.75em', border: 'none', borderRadius: '4px', cursor: 'pointer',
                            background: compareDimension === b.key ? V5_COLORS.back : 'rgba(128,128,128,0.1)',
                            color: compareDimension === b.key ? 'rgba(255,255,255,0.9)' : 'var(--text-muted)',
                        }}
                    >{b.label}</button>
                ))}
            </div>

            {/* 对比柱状图 */}
            {!compareDimension && (
                <CompareBarChart strategyStats={strategyStats} metric={compareMetric} formatValue={formatCompareValue} getValue={getCompareValue} currencyMode={currencyMode} />
            )}

            {/* 维度对比 */}
            {compareDimension && dimensionData && (
                <DimensionCompare data={dimensionData} selectedStrategies={selectedStrategies} currencyMode={currencyMode} />
            )}
        </Card>
    );
};

const CompactMetric: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
    <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '0.6em', color: 'var(--text-muted)' }}>{label}</div>
        <div style={{ fontSize: '0.85em', fontWeight: 700, color }}>{value}</div>
    </div>
);

const CompareBarChart: React.FC<{
    strategyStats: StrategyStats[];
    metric: CompareMetric;
    formatValue: (s: StrategyStats) => string;
    getValue: (s: StrategyStats) => number;
    currencyMode: 'USD' | 'CNY';
}> = ({ strategyStats, formatValue, getValue }) => {
    const maxVal = Math.max(...strategyStats.map(s => Math.abs(getValue(s))));
    return (
        <div style={{ background: 'rgba(128, 128, 128, 0.03)', borderRadius: '6px', padding: '10px' }}>
            {strategyStats.map(s => {
                const val = getValue(s);
                const pct = maxVal > 0 ? (Math.abs(val) / maxVal) * 100 : 0;
                const color = val >= 0 ? V5_COLORS.win : V5_COLORS.loss;
                return (
                    <div key={s.name} style={{ display: 'grid', gridTemplateColumns: '100px 1fr 70px', alignItems: 'center', gap: '8px', padding: '3px 0' }}>
                        <span style={{ fontSize: '0.75em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                        <div style={{ height: '8px', background: 'rgba(128, 128, 128, 0.2)', borderRadius: '4px', overflow: 'hidden' }}>
                            <div style={{ width: `${Math.max(pct, 3)}%`, height: '100%', background: color, borderRadius: '4px' }} />
                        </div>
                        <span style={{ fontSize: '0.75em', fontWeight: 600, color, textAlign: 'right' }}>{formatValue(s)}</span>
                    </div>
                );
            })}
        </div>
    );
};

const DimensionCompare: React.FC<{
    data: Record<string, Array<{ label: string; netMoney: number; count: number }>>;
    selectedStrategies: string[];
    currencyMode: 'USD' | 'CNY';
}> = ({ data, selectedStrategies, currencyMode }) => (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(selectedStrategies.length, 3)}, 1fr)`, gap: '8px' }}>
        {selectedStrategies.map(name => (
            <div key={name} style={{ background: 'rgba(128, 128, 128, 0.03)', borderRadius: '6px', padding: '8px' }}>
                <div style={{ fontSize: '0.75em', fontWeight: 600, marginBottom: '4px' }}>{name}</div>
                {(data[name] || []).slice(0, 4).map(item => {
                    const color = item.netMoney >= 0 ? V5_COLORS.win : V5_COLORS.loss;
                    return (
                        <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7em', padding: '2px 0' }}>
                            <span style={{ color: 'var(--text-muted)' }}>{item.label} ({item.count})</span>
                            <span style={{ color, fontWeight: 600 }}>{formatCurrency(item.netMoney, currencyMode)}</span>
                        </div>
                    );
                })}
            </div>
        ))}
    </div>
);
