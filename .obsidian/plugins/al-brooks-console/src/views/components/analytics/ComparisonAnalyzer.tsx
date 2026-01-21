import * as React from "react";
import type { TradeRecord } from "../../../core/contracts";
import { aggregateTrades, type AnalyticsBucket } from "../../../core/analytics";
import { V5_COLORS } from "../../../ui/tokens";
import { Card } from "../../../ui/components/Card";
import { formatCurrency } from "../../../utils/format-utils";

/**
 * ComparisonAnalyzer - 多维度对比分析器
 * 支持：维度选择、复选对比、柱状图可视化、对比摘要
 */

export interface ComparisonAnalyzerProps {
    trades: TradeRecord[];
    currencyMode: 'USD' | 'CNY';
    displayUnit: 'money' | 'r';
    SPACE: any;
}

/** 分析维度 */
type Dimension = 'strategy' | 'direction' | 'timeframe' | 'cycle';

/** 指标类型 */
type Metric = 'netMoney' | 'winRate' | 'count' | 'netR';

const DIMENSION_LABELS: Record<Dimension, string> = {
    strategy: '策略',
    direction: '方向',
    timeframe: '周期',
    cycle: '环境',
};

const METRIC_LABELS: Record<Metric, string> = {
    netMoney: '盈亏',
    winRate: '胜率',
    count: '次数',
    netR: 'R值',
};

export const ComparisonAnalyzer: React.FC<ComparisonAnalyzerProps> = ({
    trades,
    currencyMode,
    displayUnit,
    SPACE,
}) => {
    // 状态管理
    const [dimension, setDimension] = React.useState<Dimension>('strategy');
    const [metric, setMetric] = React.useState<Metric>('netMoney');
    const [selectedItems, setSelectedItems] = React.useState<Set<string>>(new Set());

    // 根据维度聚合数据
    const aggregatedData = React.useMemo(() => {
        let dimKey: 'setup' | 'direction' | 'day' | any;
        switch (dimension) {
            case 'strategy': dimKey = 'setup'; break;
            case 'direction': dimKey = 'direction'; break;
            case 'timeframe': dimKey = 'timeframe'; break;
            case 'cycle': dimKey = 'day'; break; // 暂用 day 代替 cycle
            default: dimKey = 'setup';
        }
        return aggregateTrades(trades, dimKey);
    }, [trades, dimension]);

    // 计算最大值用于柱状图
    const maxValue = React.useMemo(() => {
        const vals = aggregatedData.map(d => Math.abs(d[metric] as number));
        return Math.max(...vals, 1);
    }, [aggregatedData, metric]);

    // 切换选择
    const toggleSelection = (label: string) => {
        setSelectedItems(prev => {
            const next = new Set(prev);
            if (next.has(label)) {
                next.delete(label);
            } else {
                next.add(label);
            }
            return next;
        });
    };

    // 全选/取消全选
    const toggleAll = () => {
        if (selectedItems.size === aggregatedData.length) {
            setSelectedItems(new Set());
        } else {
            setSelectedItems(new Set(aggregatedData.map(d => d.label)));
        }
    };

    // 格式化值
    const formatValue = (item: AnalyticsBucket) => {
        const val = item[metric] as number;
        switch (metric) {
            case 'netMoney':
                return `${val >= 0 ? '+' : ''}${formatCurrency(val, currencyMode)}`;
            case 'winRate':
                return `${val.toFixed(0)}%`;
            case 'count':
                return `${val}笔`;
            case 'netR':
                return `${val >= 0 ? '+' : ''}${val.toFixed(1)}R`;
            default:
                return String(val);
        }
    };

    // 获取颜色
    const getColor = (val: number) => {
        if (metric === 'winRate') {
            return val >= 50 ? V5_COLORS.win : val >= 40 ? V5_COLORS.back : V5_COLORS.loss;
        }
        return val >= 0 ? V5_COLORS.win : V5_COLORS.loss;
    };

    // 对比摘要（选中2个及以上时显示）
    const comparisonSummary = React.useMemo(() => {
        const selected = aggregatedData.filter(d => selectedItems.has(d.label));
        if (selected.length < 2) return null;

        const values = selected.map(s => s[metric] as number);
        const max = Math.max(...values);
        const min = Math.min(...values);
        const diff = max - min;

        const best = selected.find(s => (s[metric] as number) === max);
        const worst = selected.find(s => (s[metric] as number) === min);

        return { diff, best, worst, count: selected.length };
    }, [aggregatedData, selectedItems, metric]);

    if (trades.length === 0) {
        return (
            <Card variant="tight">
                <div style={{ color: 'var(--text-faint)', fontSize: '0.9em', padding: SPACE.sm }}>
                    暂无交易数据可分析
                </div>
            </Card>
        );
    }

    return (
        <Card variant="tight">
            {/* 标题和控制栏 */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: SPACE.md,
                flexWrap: 'wrap',
                gap: SPACE.sm,
            }}>
                <div style={{ fontWeight: 700, opacity: 0.85 }}>
                    📊 对比分析
                </div>

                <div style={{ display: 'flex', gap: SPACE.sm, flexWrap: 'wrap' }}>
                    {/* 维度选择 */}
                    <div style={{ display: 'flex', gap: '4px' }}>
                        {(Object.keys(DIMENSION_LABELS) as Dimension[]).map(dim => (
                            <button
                                key={dim}
                                onClick={() => {
                                    setDimension(dim);
                                    setSelectedItems(new Set());
                                }}
                                style={{
                                    padding: '4px 10px',
                                    fontSize: '0.8em',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: 'pointer',
                                    background: dimension === dim
                                        ? 'var(--interactive-accent)'
                                        : 'var(--background-modifier-border)',
                                    color: dimension === dim
                                        ? 'var(--text-on-accent)'
                                        : 'var(--text-muted)',
                                }}
                            >
                                {DIMENSION_LABELS[dim]}
                            </button>
                        ))}
                    </div>

                    {/* 指标选择 */}
                    <select
                        value={metric}
                        onChange={e => setMetric(e.target.value as Metric)}
                        style={{
                            padding: '4px 8px',
                            fontSize: '0.8em',
                            border: '1px solid var(--background-modifier-border)',
                            borderRadius: '4px',
                            background: 'var(--background-primary)',
                            color: 'var(--text-normal)',
                        }}
                    >
                        {(Object.keys(METRIC_LABELS) as Metric[]).map(m => (
                            <option key={m} value={m}>{METRIC_LABELS[m]}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* 全选按钮 */}
            <div style={{ marginBottom: SPACE.sm }}>
                <button
                    onClick={toggleAll}
                    style={{
                        padding: '2px 8px',
                        fontSize: '0.75em',
                        border: '1px solid var(--background-modifier-border)',
                        borderRadius: '3px',
                        background: 'transparent',
                        color: 'var(--text-muted)',
                        cursor: 'pointer',
                    }}
                >
                    {selectedItems.size === aggregatedData.length ? '取消全选' : '全选对比'}
                </button>
                {selectedItems.size > 0 && (
                    <span style={{ marginLeft: '8px', fontSize: '0.75em', color: 'var(--text-muted)' }}>
                        已选 {selectedItems.size} 项
                    </span>
                )}
            </div>

            {/* 数据列表 + 柱状图 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {aggregatedData.slice(0, 10).map((item, idx) => {
                    const val = item[metric] as number;
                    const pct = (Math.abs(val) / maxValue) * 100;
                    const color = getColor(val);
                    const isSelected = selectedItems.has(item.label);

                    return (
                        <div
                            key={`${item.label}-${idx}`}
                            onClick={() => toggleSelection(item.label)}
                            style={{
                                display: 'grid',
                                gridTemplateColumns: '24px 1fr 2fr 80px',
                                alignItems: 'center',
                                gap: '10px',
                                padding: '8px 10px',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                background: isSelected
                                    ? 'rgba(100, 150, 255, 0.15)'
                                    : 'rgba(128, 128, 128, 0.05)',
                                border: isSelected
                                    ? '2px solid var(--interactive-accent)'
                                    : '2px solid transparent',
                                transition: 'all 0.2s ease',
                            }}
                            onMouseEnter={e => {
                                if (!isSelected) {
                                    (e.currentTarget as HTMLElement).style.background = 'rgba(128, 128, 128, 0.1)';
                                }
                            }}
                            onMouseLeave={e => {
                                if (!isSelected) {
                                    (e.currentTarget as HTMLElement).style.background = 'rgba(128, 128, 128, 0.05)';
                                }
                            }}
                        >
                            {/* 复选框 - 更明显 */}
                            <div style={{
                                width: '18px',
                                height: '18px',
                                borderRadius: '4px',
                                border: `2px solid ${isSelected ? V5_COLORS.win : 'var(--text-muted)'}`,
                                background: isSelected ? V5_COLORS.win : 'transparent',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '12px',
                                fontWeight: 700,
                                color: 'white',
                                flexShrink: 0,
                            }}>
                                {isSelected && '✓'}
                            </div>

                            {/* 标签 */}
                            <div style={{
                                fontSize: '0.9em',
                                fontWeight: isSelected ? 600 : 400,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}>
                                {item.label}
                            </div>

                            {/* 柱状图 - 更高更明显 */}
                            <div style={{
                                height: '12px',
                                background: 'rgba(128, 128, 128, 0.2)',
                                borderRadius: '6px',
                                overflow: 'hidden',
                            }}>
                                <div style={{
                                    width: `${Math.max(pct, 3)}%`,
                                    height: '100%',
                                    background: color,
                                    borderRadius: '6px',
                                    transition: 'width 0.3s ease',
                                }} />
                            </div>

                            {/* 数值 */}
                            <div style={{
                                fontSize: '0.9em',
                                fontWeight: 700,
                                textAlign: 'right',
                                color,
                            }}>
                                {formatValue(item)}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* 对比摘要 */}
            {comparisonSummary && (
                <div style={{
                    marginTop: SPACE.md,
                    padding: SPACE.sm,
                    background: 'rgba(var(--interactive-accent-rgb), 0.08)',
                    borderRadius: '6px',
                    border: '1px solid var(--interactive-accent)',
                }}>
                    <div style={{ fontSize: '0.8em', fontWeight: 600, marginBottom: '4px' }}>
                        📈 对比结果（{comparisonSummary.count}项）
                    </div>
                    <div style={{ fontSize: '0.8em', color: 'var(--text-muted)' }}>
                        <span style={{ color: V5_COLORS.win }}>最佳: {comparisonSummary.best?.label}</span>
                        {' vs '}
                        <span style={{ color: V5_COLORS.loss }}>最差: {comparisonSummary.worst?.label}</span>
                        <span style={{ marginLeft: '8px' }}>
                            差距: {metric === 'winRate'
                                ? `${comparisonSummary.diff.toFixed(0)}%`
                                : metric === 'count'
                                    ? `${comparisonSummary.diff}笔`
                                    : metric === 'netR'
                                        ? `${comparisonSummary.diff.toFixed(1)}R`
                                        : formatCurrency(comparisonSummary.diff, currencyMode)
                            }
                        </span>
                    </div>
                </div>
            )}
        </Card>
    );
};
