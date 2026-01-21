import * as React from "react";
import type { TradeRecord } from "../../../core/contracts";
import type { StrategyIndex } from "../../../core/strategy-index";
import { aggregateTrades, type AnalyticsBucket } from "../../../core/analytics";
import { V5_COLORS } from "../../../ui/tokens";
import { Card } from "../../../ui/components/Card";
import { InteractiveButton } from "../../../ui/components/InteractiveButton";
import { formatCurrency } from "../../../utils/format-utils";

/**
 * StrategyDashboardTable Props
 * 统一策略汇总表格 - 整合盈亏、R值、胜率、使用次数、交易维度等多维度数据
 */
export interface StrategyDashboardTableProps {
    /** 筛选后的交易（用于计算维度分析） */
    trades: TradeRecord[];
    /** 策略归因数据（包含盈亏、交易次数） */
    strategyAttribution: {
        strategyName: string;
        strategyPath?: string;
        netMoney: number;
        netR?: number;
        count: number;
    }[];
    /** Top 策略数据（包含胜率） */
    topStrategies: {
        name: string;
        wr: number;      // 胜率百分比
        total: number;   // 总交易数
    }[];
    /** R值执行分析数据 */
    rAnalysis?: {
        strategyName: string;
        expectedR: number | null;
        actualAvgR: number;
        deviation: number | null;
    }[];
    openFile: (path: string) => void;
    currencyMode?: 'USD' | 'CNY';
    displayUnit?: 'money' | 'r';
    SPACE: any;
}

/** 排序字段类型 */
type SortField = 'name' | 'netMoney' | 'winRate' | 'count' | 'rDeviation';
type SortDirection = 'asc' | 'desc';

/**
 * StrategyDashboardTable - 策略仪表盘表格
 * 将策略的多维度数据汇总到单一可排序表格中
 */
export const StrategyDashboardTable: React.FC<StrategyDashboardTableProps> = ({
    trades,
    strategyAttribution,
    topStrategies,
    rAnalysis = [],
    openFile,
    currencyMode = 'USD',
    displayUnit = 'money',
    SPACE,
}) => {
    // 排序状态
    const [sortField, setSortField] = React.useState<SortField>('netMoney');
    const [sortDirection, setSortDirection] = React.useState<SortDirection>('desc');

    // 合并数据：将不同数据源的策略数据整合
    const mergedData = React.useMemo(() => {
        // 创建策略名称到数据的映射
        const dataMap = new Map<string, {
            name: string;
            path?: string;
            netMoney: number;
            netR: number;
            count: number;
            winRate: number | null;
            expectedR: number | null;
            actualAvgR: number | null;
            rDeviation: number | null;
        }>();

        // 从 strategyAttribution 填充基础数据
        for (const attr of strategyAttribution) {
            dataMap.set(attr.strategyName, {
                name: attr.strategyName,
                path: attr.strategyPath,
                netMoney: attr.netMoney ?? 0,
                netR: attr.netR ?? 0,
                count: attr.count,
                winRate: null,
                expectedR: null,
                actualAvgR: null,
                rDeviation: null,
            });
        }

        // 从 topStrategies 补充胜率数据
        for (const top of topStrategies) {
            const existing = dataMap.get(top.name);
            if (existing) {
                existing.winRate = top.wr;
            } else {
                dataMap.set(top.name, {
                    name: top.name,
                    path: undefined,
                    netMoney: 0,
                    netR: 0,
                    count: top.total,
                    winRate: top.wr,
                    expectedR: null,
                    actualAvgR: null,
                    rDeviation: null,
                });
            }
        }

        // 从 rAnalysis 补充R值执行数据
        for (const r of rAnalysis) {
            const existing = dataMap.get(r.strategyName);
            if (existing) {
                existing.expectedR = r.expectedR;
                existing.actualAvgR = r.actualAvgR;
                existing.rDeviation = r.deviation;
            }
        }

        return Array.from(dataMap.values());
    }, [strategyAttribution, topStrategies, rAnalysis]);

    // 排序后的数据
    const sortedData = React.useMemo(() => {
        const sorted = [...mergedData];
        sorted.sort((a, b) => {
            let aVal: number | string;
            let bVal: number | string;

            switch (sortField) {
                case 'name':
                    aVal = a.name;
                    bVal = b.name;
                    break;
                case 'netMoney':
                    aVal = a.netMoney;
                    bVal = b.netMoney;
                    break;
                case 'winRate':
                    aVal = a.winRate ?? -1;
                    bVal = b.winRate ?? -1;
                    break;
                case 'count':
                    aVal = a.count;
                    bVal = b.count;
                    break;
                case 'rDeviation':
                    aVal = a.rDeviation ?? -999;
                    bVal = b.rDeviation ?? -999;
                    break;
                default:
                    aVal = a.netMoney;
                    bVal = b.netMoney;
            }

            if (typeof aVal === 'string' && typeof bVal === 'string') {
                return sortDirection === 'asc'
                    ? aVal.localeCompare(bVal)
                    : bVal.localeCompare(aVal);
            }

            const numA = aVal as number;
            const numB = bVal as number;
            return sortDirection === 'asc' ? numA - numB : numB - numA;
        });
        return sorted;
    }, [mergedData, sortField, sortDirection]);

    // 处理排序点击
    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
    };

    // 渲染排序指示器
    const renderSortIndicator = (field: SortField) => {
        if (sortField !== field) return null;
        return <span style={{ marginLeft: '4px' }}>{sortDirection === 'asc' ? '↑' : '↓'}</span>;
    };

    // 表头样式
    const thStyle: React.CSSProperties = {
        padding: '8px 10px',
        textAlign: 'left',
        fontWeight: 600,
        fontSize: '0.8em',
        color: 'var(--text-muted)',
        borderBottom: '1px solid var(--background-modifier-border)',
        cursor: 'pointer',
        userSelect: 'none',
        whiteSpace: 'nowrap',
    };

    // 单元格样式
    const tdStyle: React.CSSProperties = {
        padding: '8px 10px',
        fontSize: '0.85em',
        borderBottom: '1px solid var(--background-modifier-border-hover)',
    };

    if (mergedData.length === 0) {
        return (
            <Card variant="tight">
                <div style={{ fontWeight: 700, opacity: 0.75, marginBottom: SPACE.sm }}>
                    📊 策略仪表盘
                </div>
                <div style={{ color: 'var(--text-faint)', fontSize: '0.9em', padding: SPACE.sm }}>
                    暂无策略数据
                </div>
            </Card>
        );
    }

    return (
        <Card variant="tight">
            <div style={{ fontWeight: 700, opacity: 0.75, marginBottom: SPACE.sm }}>
                📊 策略仪表盘 <span style={{ fontWeight: 400, fontSize: '0.85em', opacity: 0.7 }}>({mergedData.length} 个策略)</span>
            </div>

            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '500px' }}>
                    <thead>
                        <tr>
                            <th style={thStyle} onClick={() => handleSort('name')}>
                                策略名称 {renderSortIndicator('name')}
                            </th>
                            <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('netMoney')}>
                                盈亏 {renderSortIndicator('netMoney')}
                            </th>
                            <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('winRate')}>
                                胜率 {renderSortIndicator('winRate')}
                            </th>
                            <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('count')}>
                                交易次数 {renderSortIndicator('count')}
                            </th>
                            <th style={{ ...thStyle, textAlign: 'right' }} onClick={() => handleSort('rDeviation')}>
                                R值偏差 {renderSortIndicator('rDeviation')}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {sortedData.map((row, idx) => (
                            <tr
                                key={`strategy-${row.name}-${idx}`}
                                style={{
                                    background: idx % 2 === 0 ? 'transparent' : 'rgba(var(--mono-rgb-100), 0.02)',
                                }}
                            >
                                {/* 策略名称 */}
                                <td style={tdStyle}>
                                    {row.path ? (
                                        <InteractiveButton
                                            interaction="text"
                                            onClick={() => openFile(row.path!)}
                                            style={{
                                                color: 'var(--text-accent)',
                                                textDecoration: 'none',
                                                fontSize: 'inherit',
                                            }}
                                        >
                                            {row.name}
                                        </InteractiveButton>
                                    ) : (
                                        <span>{row.name}</span>
                                    )}
                                </td>

                                {/* 盈亏 */}
                                <td style={{
                                    ...tdStyle,
                                    textAlign: 'right',
                                    fontWeight: 600,
                                    color: row.netMoney >= 0 ? V5_COLORS.win : V5_COLORS.loss,
                                }}>
                                    {row.netMoney >= 0 ? '+' : ''}{formatCurrency(row.netMoney, currencyMode)}
                                </td>

                                {/* 胜率 */}
                                <td style={{
                                    ...tdStyle,
                                    textAlign: 'right',
                                    fontWeight: 600,
                                    color: row.winRate === null
                                        ? 'var(--text-faint)'
                                        : row.winRate >= 50
                                            ? V5_COLORS.win
                                            : row.winRate >= 40
                                                ? V5_COLORS.back
                                                : V5_COLORS.loss,
                                }}>
                                    {row.winRate !== null ? `${row.winRate}%` : '-'}
                                </td>

                                {/* 交易次数 */}
                                <td style={{ ...tdStyle, textAlign: 'right', color: 'var(--text-muted)' }}>
                                    {row.count}
                                </td>

                                {/* R值偏差 */}
                                <td style={{
                                    ...tdStyle,
                                    textAlign: 'right',
                                    color: row.rDeviation === null
                                        ? 'var(--text-faint)'
                                        : row.rDeviation >= 0
                                            ? V5_COLORS.win
                                            : V5_COLORS.loss,
                                }}>
                                    {row.rDeviation !== null
                                        ? `${row.rDeviation >= 0 ? '+' : ''}${row.rDeviation.toFixed(2)}R`
                                        : '-'
                                    }
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {/* 交易维度分析（整合在策略仪表盘中） */}
            <DimensionAnalysisSection
                trades={trades}
                currencyMode={currencyMode}
                displayUnit={displayUnit}
                SPACE={SPACE}
            />
        </Card>
    );
};

/**
 * DimensionAnalysisSection - 交易维度分析区块
 * 显示方向分布和周期分析
 */
const DimensionAnalysisSection: React.FC<{
    trades: TradeRecord[];
    currencyMode: 'USD' | 'CNY';
    displayUnit: 'money' | 'r';
    SPACE: any;
}> = ({ trades, currencyMode, displayUnit, SPACE }) => {
    // 数据聚合
    const directionData = React.useMemo(() =>
        aggregateTrades(trades, "direction"),
        [trades]);

    const timeframeData = React.useMemo(() =>
        aggregateTrades(trades, "timeframe" as any).slice(0, 3),
        [trades]);

    const pnlKey = displayUnit === 'r' ? 'netR' : 'netMoney';

    if (trades.length === 0) return null;

    const formatValue = (val: number) => {
        if (displayUnit === 'r') return `${val > 0 ? '+' : ''}${val.toFixed(1)}R`;
        return formatCurrency(val, currencyMode);
    };

    const renderDimensionItem = (item: AnalyticsBucket) => {
        const val = item[pnlKey] as number;
        const color = val >= 0 ? V5_COLORS.win : V5_COLORS.loss;
        return (
            <div key={item.label} style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '3px 0',
                fontSize: '0.8em',
            }}>
                <span style={{ color: 'var(--text-muted)' }}>{item.label}</span>
                <span style={{ fontWeight: 600, color }}>{formatValue(val)}</span>
            </div>
        );
    };

    return (
        <div style={{
            marginTop: SPACE.md,
            paddingTop: SPACE.md,
            borderTop: '1px solid var(--background-modifier-border)',
        }}>
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: SPACE.md,
            }}>
                {/* 方向分布 */}
                <div style={{
                    background: 'rgba(var(--mono-rgb-100), 0.03)',
                    borderRadius: '6px',
                    padding: '10px 12px',
                }}>
                    <div style={{
                        fontSize: '0.75em',
                        fontWeight: 700,
                        color: 'var(--text-muted)',
                        marginBottom: '6px',
                    }}>
                        ↕️ 方向分布
                    </div>
                    {directionData.slice(0, 3).map(renderDimensionItem)}
                    {directionData.length === 0 && (
                        <div style={{ fontSize: '0.8em', color: 'var(--text-faint)' }}>无数据</div>
                    )}
                </div>

                {/* 周期分析 */}
                <div style={{
                    background: 'rgba(var(--mono-rgb-100), 0.03)',
                    borderRadius: '6px',
                    padding: '10px 12px',
                }}>
                    <div style={{
                        fontSize: '0.75em',
                        fontWeight: 700,
                        color: 'var(--text-muted)',
                        marginBottom: '6px',
                    }}>
                        ⏱️ 周期分析
                    </div>
                    {timeframeData.map(renderDimensionItem)}
                    {timeframeData.length === 0 && (
                        <div style={{ fontSize: '0.8em', color: 'var(--text-faint)' }}>无数据</div>
                    )}
                </div>
            </div>
        </div>
    );
};
