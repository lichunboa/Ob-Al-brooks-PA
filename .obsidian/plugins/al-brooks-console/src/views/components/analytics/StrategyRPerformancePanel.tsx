import * as React from "react";
import type { TradeRecord } from "../../../core/contracts";
import type { StrategyIndex } from "../../../core/strategy-index";
import { V5_COLORS } from "../../../ui/tokens";
import { Card } from "../../../ui/components/Card";

/**
 * StrategyRPerformancePanel Props
 * 策略R值执行分析面板
 */
export interface StrategyRPerformancePanelProps {
    trades: TradeRecord[];
    strategyIndex: StrategyIndex;
    currencyMode?: 'USD' | 'CNY';
    SPACE: any;
}

/**
 * 从单个盈亏比字符串解析数字
 * 支持格式: "2:1", "2.5:1", "3R", "2.5", 等
 */
function parseSingleRiskReward(rr: string): number | null {
    const cleaned = rr.trim();

    // 格式1: "2:1" 或 "2.5:1"
    const colonMatch = cleaned.match(/^(\d+\.?\d*)\s*:\s*1$/);
    if (colonMatch) {
        return parseFloat(colonMatch[1]);
    }

    // 格式2: "2R" 或 "2.5R"
    const rMatch = cleaned.match(/^(\d+\.?\d*)\s*[Rr]$/);
    if (rMatch) {
        return parseFloat(rMatch[1]);
    }

    // 格式3: 纯数字 "2" 或 "2.5"
    const numMatch = cleaned.match(/^(\d+\.?\d*)$/);
    if (numMatch) {
        return parseFloat(numMatch[1]);
    }

    return null;
}

/**
 * 解析盈亏比字符串为数字
 * 支持格式: "2:1", "2.5:1", "3R", "2.5", "2:1 - 3:1" (范围格式)
 * 对于范围格式，返回最小值（保守估计）
 */
function parseRiskReward(rr: string | undefined): number | null {
    if (!rr) return null;

    const cleaned = rr.trim();

    // 检查是否是范围格式（如 "2:1 - 3:1" 或 "1.5:1 - 2:1"）
    if (cleaned.includes('-')) {
        const parts = cleaned.split('-').map(p => p.trim());
        const values: number[] = [];
        for (const part of parts) {
            const val = parseSingleRiskReward(part);
            if (val !== null) values.push(val);
        }
        // 返回最小值作为保守估计
        return values.length > 0 ? Math.min(...values) : null;
    }

    // 单个值
    return parseSingleRiskReward(cleaned);
}

/**
 * 计算策略 R 值执行分析数据
 */
interface StrategyRAnalysisRow {
    strategyName: string;
    strategyPath: string;
    expectedR: number | null;  // 策略推荐的 R 值
    actualAvgR: number;        // 实际平均 R 值
    tradeCount: number;        // 交易笔数
    deviation: number | null;  // 偏离度 (actualAvgR - expectedR)
    deviationPercent: number | null; // 偏离百分比
}

/**
 * 计算交易的 R 值
 * 优先使用 t.r，否则从 pnl / initialRisk 计算
 */
function computeTradeR(t: TradeRecord): number | null {
    // 优先使用显式的 r 字段
    if (t.r !== undefined) return t.r;

    // 否则从 pnl 和 initialRisk 计算
    const pnl = t.pnl ?? t.netProfit ?? 0;
    if (pnl !== 0 && t.initialRisk && t.initialRisk > 0) {
        return pnl / t.initialRisk;
    }

    return null;
}

function computeStrategyRAnalysis(
    trades: TradeRecord[],
    strategyIndex: StrategyIndex
): StrategyRAnalysisRow[] {
    // 按策略名分组
    const groupMap = new Map<string, {
        rValues: number[];
        path: string;
    }>();

    trades.forEach(t => {
        const sName = t.strategyName;
        if (!sName) return;

        // 计算 R 值
        const rValue = computeTradeR(t);
        if (rValue === null) return;

        const existing = groupMap.get(sName);
        if (existing) {
            existing.rValues.push(rValue);
        } else {
            // 查找策略路径
            const card = strategyIndex.lookup(sName);
            groupMap.set(sName, {
                rValues: [rValue],
                path: card?.path ?? ''
            });
        }
    });

    // 计算每个策略的 R 值分析
    const results: StrategyRAnalysisRow[] = [];

    groupMap.forEach((data, strategyName) => {
        const card = strategyIndex.lookup(strategyName);
        const expectedR = parseRiskReward(card?.riskReward);

        // 计算实际平均 R
        if (data.rValues.length === 0) return;

        const actualAvgR = data.rValues.reduce((sum, r) => sum + r, 0) / data.rValues.length;

        // 计算偏离度
        let deviation: number | null = null;
        let deviationPercent: number | null = null;

        if (expectedR !== null && expectedR > 0) {
            deviation = actualAvgR - expectedR;
            deviationPercent = (deviation / expectedR) * 100;
        }

        results.push({
            strategyName,
            strategyPath: data.path,
            expectedR,
            actualAvgR,
            tradeCount: data.rValues.length,
            deviation,
            deviationPercent
        });
    });

    // 按交易笔数降序排序
    results.sort((a, b) => b.tradeCount - a.tradeCount);

    return results;
}

/**
 * StrategyRPerformancePanel - 策略R值执行分析面板
 * 对比策略推荐R值与实际交易R值
 */
export const StrategyRPerformancePanel: React.FC<StrategyRPerformancePanelProps> = ({
    trades,
    strategyIndex,
    currencyMode = 'USD',
    SPACE,
}) => {
    const analysis = React.useMemo(
        () => computeStrategyRAnalysis(trades, strategyIndex),
        [trades, strategyIndex]
    );

    // 计算总体统计
    const summary = React.useMemo(() => {
        const withExpected = analysis.filter(r => r.expectedR !== null);
        if (withExpected.length === 0) return null;

        const totalDeviation = withExpected.reduce((sum, r) => sum + (r.deviation ?? 0), 0);
        const avgDeviation = totalDeviation / withExpected.length;

        // 计算执行率（实际/推荐）
        const totalActual = withExpected.reduce((sum, r) => sum + r.actualAvgR * r.tradeCount, 0);
        const totalExpected = withExpected.reduce((sum, r) => sum + (r.expectedR ?? 0) * r.tradeCount, 0);
        const totalCount = withExpected.reduce((sum, r) => sum + r.tradeCount, 0);

        const executionRate = totalExpected > 0 ? (totalActual / totalExpected) * 100 : null;

        return {
            strategiesWithExpected: withExpected.length,
            avgDeviation,
            executionRate,
            totalTrades: totalCount
        };
    }, [analysis]);

    if (analysis.length === 0) {
        return (
            <Card variant="tight">
                <div style={{ fontWeight: 700, opacity: 0.75, marginBottom: SPACE.sm }}>
                    📊 策略R值执行分析
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9em' }}>
                    暂无带R值的交易数据。
                </div>
            </Card>
        );
    }

    return (
        <Card variant="tight">
            <div style={{ fontWeight: 700, opacity: 0.75, marginBottom: SPACE.sm }}>
                📊 策略R值执行分析
            </div>

            {/* 总体统计摘要 */}
            {summary && (
                <div style={{
                    display: 'flex',
                    gap: '16px',
                    marginBottom: SPACE.md,
                    padding: '8px 12px',
                    background: 'var(--background-modifier-hover)',
                    borderRadius: '6px',
                    fontSize: '0.85em'
                }}>
                    <div>
                        <span style={{ color: 'var(--text-muted)' }}>策略 </span>
                        <strong>{summary.strategiesWithExpected}</strong>
                    </div>
                    <div>
                        <span style={{ color: 'var(--text-muted)' }}>交易 </span>
                        <strong>{summary.totalTrades}</strong>
                    </div>
                    {summary.executionRate !== null && (
                        <div>
                            <span style={{ color: 'var(--text-muted)' }}>执行率 </span>
                            <strong style={{
                                color: summary.executionRate >= 100 ? V5_COLORS.win
                                    : summary.executionRate >= 80 ? 'var(--text-normal)'
                                        : V5_COLORS.loss
                            }}>
                                {summary.executionRate.toFixed(0)}%
                            </strong>
                        </div>
                    )}
                </div>
            )}

            {/* 详细表格 */}
            <div style={{ overflowX: 'auto' }}>
                <table style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '0.85em'
                }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid var(--background-modifier-border)' }}>
                            <th style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text-muted)' }}>策略</th>
                            <th style={{ textAlign: 'center', padding: '6px 8px', color: 'var(--text-muted)' }}>笔数</th>
                            <th style={{ textAlign: 'center', padding: '6px 8px', color: 'var(--text-muted)' }}>推荐R</th>
                            <th style={{ textAlign: 'center', padding: '6px 8px', color: 'var(--text-muted)' }}>实际R</th>
                            <th style={{ textAlign: 'center', padding: '6px 8px', color: 'var(--text-muted)' }}>执行</th>
                        </tr>
                    </thead>
                    <tbody>
                        {analysis.slice(0, 10).map((row, i) => {
                            const executionStatus = row.expectedR !== null && row.expectedR > 0
                                ? (row.actualAvgR / row.expectedR) * 100
                                : null;

                            return (
                                <tr
                                    key={`r-${row.strategyName}-${i}`}
                                    style={{
                                        borderBottom: '1px solid var(--background-modifier-border)',
                                        opacity: i < 5 ? 1 : 0.7
                                    }}
                                >
                                    <td style={{
                                        padding: '8px',
                                        maxWidth: '150px',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        {row.strategyName}
                                    </td>
                                    <td style={{ textAlign: 'center', padding: '8px', color: 'var(--text-muted)' }}>
                                        {row.tradeCount}
                                    </td>
                                    <td style={{ textAlign: 'center', padding: '8px' }}>
                                        {row.expectedR !== null ? (
                                            <span style={{ fontWeight: 500 }}>{row.expectedR.toFixed(1)}R</span>
                                        ) : (
                                            <span style={{ color: 'var(--text-faint)' }}>—</span>
                                        )}
                                    </td>
                                    <td style={{
                                        textAlign: 'center',
                                        padding: '8px',
                                        fontWeight: 600,
                                        color: row.actualAvgR > 0 ? V5_COLORS.win
                                            : row.actualAvgR < 0 ? V5_COLORS.loss
                                                : 'var(--text-normal)'
                                    }}>
                                        {row.actualAvgR > 0 ? '+' : ''}{row.actualAvgR.toFixed(2)}R
                                    </td>
                                    <td style={{ textAlign: 'center', padding: '8px' }}>
                                        {executionStatus !== null ? (
                                            <span style={{
                                                padding: '2px 6px',
                                                borderRadius: '4px',
                                                fontSize: '0.85em',
                                                fontWeight: 600,
                                                background: executionStatus >= 100
                                                    ? 'rgba(16, 185, 129, 0.15)'
                                                    : executionStatus >= 80
                                                        ? 'rgba(128, 128, 128, 0.15)'
                                                        : 'rgba(239, 68, 68, 0.15)',
                                                color: executionStatus >= 100
                                                    ? V5_COLORS.win
                                                    : executionStatus >= 80
                                                        ? 'var(--text-normal)'
                                                        : V5_COLORS.loss
                                            }}>
                                                {executionStatus.toFixed(0)}%
                                            </span>
                                        ) : (
                                            <span style={{ color: 'var(--text-faint)' }}>—</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {analysis.length > 10 && (
                <div style={{
                    textAlign: 'center',
                    marginTop: SPACE.sm,
                    color: 'var(--text-muted)',
                    fontSize: '0.8em'
                }}>
                    仅显示前 10 个策略，共 {analysis.length} 个
                </div>
            )}
        </Card>
    );
};
