import * as React from "react";
import type { TradeRecord } from "../../../core/contracts";
import { V5_COLORS } from "../../../ui/tokens";
import { Card } from "../../../ui/components/Card";
import { formatCurrency } from "../../../utils/format-utils";

/**
 * TradeHistoryList - 交易明细列表
 * 显示选中策略的所有交易记录，支持点击展开详情
 */

export interface TradeHistoryListProps {
    /** 筛选后的交易 */
    trades: TradeRecord[];
    /** 打开交易笔记回调 */
    openFile: (path: string) => void;
    /** 货币模式 */
    currencyMode: 'USD' | 'CNY';
    /** 显示单位 */
    displayUnit: 'money' | 'r';
    /** 间距 */
    SPACE: any;
}

export const TradeHistoryList: React.FC<TradeHistoryListProps> = ({
    trades,
    openFile,
    currencyMode,
    displayUnit,
    SPACE,
}) => {
    const [expandedIndex, setExpandedIndex] = React.useState<number | null>(null);

    // 按日期排序（最新在前）- hooks 必须在条件判断之前
    const sortedTrades = React.useMemo(() =>
        [...trades].sort((a, b) => (b.dateIso ?? '').localeCompare(a.dateIso ?? '')),
        [trades]);

    // 如果没有交易数据，不显示（放在所有 hooks 之后）
    if (trades.length === 0) return null;

    return (
        <Card variant="tight">
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: SPACE.sm,
            }}>
                <span style={{ fontWeight: 700, opacity: 0.85 }}>
                    📋 交易记录 ({trades.length}笔)
                </span>
                <span style={{ fontSize: '0.75em', color: 'var(--text-muted)' }}>
                    点击展开详情
                </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {sortedTrades.slice(0, 20).map((trade, idx) => {
                    const isExpanded = expandedIndex === idx;
                    const pnl = trade.pnl ?? 0;
                    const color = pnl >= 0 ? V5_COLORS.win : V5_COLORS.loss;
                    const outcome = pnl > 0 ? 'Win' : pnl < 0 ? 'Loss' : 'BE';

                    return (
                        <div key={trade.path ?? `trade-${idx}`}>
                            {/* 交易行 */}
                            <div
                                onClick={() => setExpandedIndex(isExpanded ? null : idx)}
                                style={{
                                    display: 'grid',
                                    gridTemplateColumns: '80px 60px 80px 1fr 60px 60px',
                                    gap: '8px',
                                    alignItems: 'center',
                                    padding: '8px 10px',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    background: isExpanded
                                        ? 'rgba(100, 150, 255, 0.1)'
                                        : 'rgba(128, 128, 128, 0.03)',
                                    transition: 'all 0.15s ease',
                                }}
                            >
                                {/* 日期 */}
                                <span style={{ fontSize: '0.8em', color: 'var(--text-muted)' }}>
                                    {trade.dateIso ?? '-'}
                                </span>

                                {/* 标的 */}
                                <span style={{ fontSize: '0.85em', fontWeight: 600 }}>
                                    {trade.ticker ?? '-'}
                                </span>

                                {/* 方向 */}
                                <span style={{
                                    fontSize: '0.8em',
                                    color: (trade.direction === 'Long' || trade.direction === '做多')
                                        ? V5_COLORS.win
                                        : V5_COLORS.loss
                                }}>
                                    {trade.direction ?? '-'}
                                </span>

                                {/* 策略 */}
                                <span style={{
                                    fontSize: '0.8em',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}>
                                    {trade.strategyName ?? 'Unknown'}
                                </span>

                                {/* 盈亏 */}
                                <span style={{ fontSize: '0.85em', fontWeight: 700, color, textAlign: 'right' }}>
                                    {displayUnit === 'r'
                                        ? `${(trade.r ?? 0) >= 0 ? '+' : ''}${(trade.r ?? 0).toFixed(1)}R`
                                        : formatCurrency(pnl, currencyMode)
                                    }
                                </span>

                                {/* 结果 */}
                                <span style={{
                                    fontSize: '0.75em',
                                    fontWeight: 600,
                                    color,
                                    textAlign: 'right',
                                }}>
                                    {outcome}
                                </span>
                            </div>

                            {/* 展开详情 */}
                            {isExpanded && (
                                <div style={{
                                    padding: '10px 12px',
                                    marginTop: '2px',
                                    background: 'rgba(100, 150, 255, 0.05)',
                                    borderRadius: '6px',
                                    fontSize: '0.8em',
                                }}>
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: '1fr 1fr 1fr',
                                        gap: '8px',
                                        marginBottom: '8px',
                                    }}>
                                        <div>
                                            <span style={{ color: 'var(--text-muted)' }}>周期: </span>
                                            <span>{trade.timeframe ?? '-'}</span>
                                        </div>
                                        <div>
                                            <span style={{ color: 'var(--text-muted)' }}>R值: </span>
                                            <span style={{ color }}>{trade.r?.toFixed(2) ?? '-'}R</span>
                                        </div>
                                        <div>
                                            <span style={{ color: 'var(--text-muted)' }}>执行: </span>
                                            <span>{trade.executionQuality ?? '-'}</span>
                                        </div>
                                    </div>

                                    {trade.path && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                openFile(trade.path!);
                                            }}
                                            style={{
                                                padding: '4px 10px',
                                                fontSize: '0.9em',
                                                border: 'none',
                                                borderRadius: '4px',
                                                background: 'var(--interactive-accent)',
                                                color: 'var(--text-on-accent)',
                                                cursor: 'pointer',
                                            }}
                                        >
                                            📄 查看交易笔记
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}

                {trades.length > 20 && (
                    <div style={{
                        textAlign: 'center',
                        padding: '8px',
                        fontSize: '0.8em',
                        color: 'var(--text-muted)',
                    }}>
                        仅显示最近 20 笔交易
                    </div>
                )}
            </div>
        </Card>
    );
};
