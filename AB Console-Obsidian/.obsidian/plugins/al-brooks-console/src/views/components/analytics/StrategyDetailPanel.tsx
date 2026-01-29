import * as React from "react";
import type { TradeRecord } from "../../../core/contracts";
import { aggregateTrades } from "../../../core/analytics";
import { V5_COLORS } from "../../../ui/tokens";
import { Card } from "../../../ui/components/Card";
import { formatCurrency } from "../../../utils/format-utils";

/**
 * StrategyDetailPanel - 策略深度分析面板
 * 显示选中策略的核心指标、维度分解、执行分析
 */

export interface StrategyDetailPanelProps {
    trades: TradeRecord[];              // 筛选后的交易（已按策略筛选）
    selectedStrategies: string[];       // 选中的策略名称
    currencyMode: 'USD' | 'CNY';
    displayUnit: 'money' | 'r';
    SPACE: any;
}

export const StrategyDetailPanel: React.FC<StrategyDetailPanelProps> = ({
    trades,
    selectedStrategies,
    currencyMode,
    displayUnit,
    SPACE,
}) => {
    // 如果没有选中策略或没有交易数据，不显示
    if (selectedStrategies.length === 0 || trades.length === 0) return null;

    // 计算汇总指标
    const summary = React.useMemo(() => {
        let totalPnl = 0, totalR = 0, wins = 0, maxDrawdown = 0;
        let cumPnl = 0;

        for (const t of trades) {
            totalPnl += t.pnl ?? 0;
            totalR += t.r ?? 0;
            if ((t.pnl ?? 0) > 0) wins += 1;
            // 计算最大回撤
            cumPnl += t.pnl ?? 0;
            if (cumPnl < maxDrawdown) maxDrawdown = cumPnl;
        }

        return {
            totalPnl, totalR,
            count: trades.length,
            winRate: trades.length > 0 ? Math.round((wins / trades.length) * 100) : 0,
            avgPnl: trades.length > 0 ? totalPnl / trades.length : 0,
            avgR: trades.length > 0 ? totalR / trades.length : 0,
            maxDrawdown,
        };
    }, [trades]);

    // 维度分析
    const directionData = React.useMemo(() =>
        aggregateTrades(trades, "direction").slice(0, 3), [trades]);

    const timeframeData = React.useMemo(() =>
        aggregateTrades(trades, "timeframe" as any).slice(0, 3), [trades]);

    const marketCycleData = React.useMemo(() =>
        aggregateTrades(trades, "marketCycle" as any).slice(0, 4), [trades]);

    // 执行质量分析
    const executionData = React.useMemo(() => {
        const map = new Map<string, { count: number; pnl: number; r: number }>();
        for (const t of trades) {
            const quality = t.executionQuality || 'Unknown';
            const existing = map.get(quality) || { count: 0, pnl: 0, r: 0 };
            existing.count += 1;
            existing.pnl += t.pnl ?? 0;
            existing.r += t.r ?? 0;
            map.set(quality, existing);
        }
        return Array.from(map.entries())
            .map(([label, stats]) => ({
                label,
                netMoney: stats.pnl,
                netR: stats.r,
                count: stats.count,
            }))
            .sort((a, b) => b.netMoney - a.netMoney);
    }, [trades]);

    // 最大单笔亏损
    const worstTrade = React.useMemo(() => {
        let worst: TradeRecord | null = null;
        for (const t of trades) {
            if (!worst || (t.pnl ?? 0) < (worst.pnl ?? 0)) worst = t;
        }
        return worst;
    }, [trades]);

    // 标题
    const title = selectedStrategies.length === 1
        ? `📊 ${selectedStrategies[0]} 深度分析`
        : `📊 ${selectedStrategies.length} 个策略深度分析`;

    return (
        <Card variant="tight">
            <div style={{ fontWeight: 700, opacity: 0.85, marginBottom: SPACE.md }}>
                {title}
            </div>

            {/* 【核心指标】 */}
            <SectionTitle>核心指标</SectionTitle>
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                gap: SPACE.sm,
                marginBottom: SPACE.md,
            }}>
                <MetricCard
                    label="总盈亏"
                    value={displayUnit === 'r'
                        ? `${summary.totalR >= 0 ? '+' : ''}${summary.totalR.toFixed(1)}R`
                        : formatCurrency(summary.totalPnl, currencyMode)
                    }
                    color={summary.totalPnl >= 0 ? V5_COLORS.win : V5_COLORS.loss}
                />
                <MetricCard
                    label="胜率"
                    value={`${summary.winRate}%`}
                    color={summary.winRate >= 50 ? V5_COLORS.win : summary.winRate >= 40 ? V5_COLORS.back : V5_COLORS.loss}
                />
                <MetricCard
                    label="平均R"
                    value={`${summary.avgR >= 0 ? '+' : ''}${summary.avgR.toFixed(2)}R`}
                    color={summary.avgR >= 0 ? V5_COLORS.win : V5_COLORS.loss}
                />
                <MetricCard
                    label="交易次数"
                    value={`${summary.count}笔`}
                    color="var(--text-muted)"
                />
                <MetricCard
                    label="最大回撤"
                    value={formatCurrency(summary.maxDrawdown, currencyMode)}
                    color={V5_COLORS.loss}
                />
            </div>

            {/* 【维度分解】 */}
            <SectionTitle>维度分解</SectionTitle>
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: SPACE.sm,
                marginBottom: SPACE.md,
            }}>
                <DimensionSection
                    title="🌐 市场环境"
                    data={marketCycleData}
                    displayUnit={displayUnit}
                    currencyMode={currencyMode}
                />
                <DimensionSection
                    title="↕️ 方向"
                    data={directionData}
                    displayUnit={displayUnit}
                    currencyMode={currencyMode}
                />
                <DimensionSection
                    title="⏱️ 周期"
                    data={timeframeData}
                    displayUnit={displayUnit}
                    currencyMode={currencyMode}
                />
            </div>

            {/* 【执行分析】 */}
            <SectionTitle>执行分析</SectionTitle>
            <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: SPACE.sm,
            }}>
                <DimensionSection
                    title="📋 执行质量"
                    data={executionData}
                    displayUnit={displayUnit}
                    currencyMode={currencyMode}
                />
                <div style={{
                    background: 'rgba(128, 128, 128, 0.03)',
                    borderRadius: '6px',
                    padding: '10px',
                }}>
                    <div style={{ fontSize: '0.8em', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>
                        📉 最大单笔亏损
                    </div>
                    {worstTrade && (worstTrade.pnl ?? 0) < 0 ? (
                        <div style={{ fontSize: '0.85em' }}>
                            <span style={{ color: V5_COLORS.loss, fontWeight: 700 }}>
                                {formatCurrency(worstTrade.pnl ?? 0, currencyMode)}
                            </span>
                            <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>
                                {worstTrade.dateIso ?? '-'} · {worstTrade.ticker ?? '-'}
                            </span>
                        </div>
                    ) : (
                        <div style={{ fontSize: '0.85em', color: V5_COLORS.win }}>无亏损交易 🎉</div>
                    )}
                </div>
            </div>

            {/* 【胜率趋势】 */}
            <WinRateTrend trades={trades} SPACE={SPACE} />
        </Card>
    );
};

/** 区块标题 */
const SectionTitle: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div style={{
        fontSize: '0.75em',
        fontWeight: 600,
        color: 'var(--text-faint)',
        marginBottom: '6px',
        textTransform: 'uppercase',
        letterSpacing: '0.5px',
    }}>
        {children}
    </div>
);

/** 指标卡片 */
const MetricCard: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
    <div style={{
        background: 'rgba(128, 128, 128, 0.05)',
        borderRadius: '6px',
        padding: '10px',
        textAlign: 'center',
    }}>
        <div style={{ fontSize: '0.7em', color: 'var(--text-muted)', marginBottom: '3px' }}>{label}</div>
        <div style={{ fontSize: '1em', fontWeight: 700, color }}>{value}</div>
    </div>
);

/** 维度分析区块 */
const DimensionSection: React.FC<{
    title: string;
    data: Array<{ label: string; netMoney: number; netR: number; count: number }>;
    displayUnit: 'money' | 'r';
    currencyMode: 'USD' | 'CNY';
}> = ({ title, data, displayUnit, currencyMode }) => {
    if (data.length === 0) {
        return (
            <div style={{ background: 'rgba(128, 128, 128, 0.03)', borderRadius: '6px', padding: '10px' }}>
                <div style={{ fontSize: '0.8em', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>{title}</div>
                <div style={{ fontSize: '0.8em', color: 'var(--text-faint)' }}>无数据</div>
            </div>
        );
    }

    const pnlKey = displayUnit === 'r' ? 'netR' : 'netMoney';

    return (
        <div style={{ background: 'rgba(128, 128, 128, 0.03)', borderRadius: '6px', padding: '10px' }}>
            <div style={{ fontSize: '0.8em', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '6px' }}>{title}</div>
            {data.map(item => {
                const val = item[pnlKey] as number;
                const color = val >= 0 ? V5_COLORS.win : V5_COLORS.loss;
                return (
                    <div key={item.label} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '3px 0', fontSize: '0.8em',
                    }}>
                        <span style={{ color: 'var(--text-muted)' }}>
                            {item.label} <span style={{ opacity: 0.5 }}>({item.count})</span>
                        </span>
                        <span style={{ fontWeight: 600, color }}>
                            {displayUnit === 'r' ? `${val >= 0 ? '+' : ''}${val.toFixed(1)}R` : formatCurrency(val, currencyMode)}
                        </span>
                    </div>
                );
            })}
        </div>
    );
};

/** 胜率趋势 - 按周分组显示 */
const WinRateTrend: React.FC<{ trades: TradeRecord[]; SPACE: any }> = ({ trades, SPACE }) => {
    const trendData = React.useMemo(() => {
        // 按周分组
        const weekMap = new Map<string, { wins: number; total: number }>();

        for (const t of trades) {
            if (!t.dateIso) continue;
            // 获取 ISO 周
            const date = new Date(t.dateIso);
            const week = getISOWeek(date);
            const weekKey = `${date.getFullYear()}-W${week.toString().padStart(2, '0')}`;

            const existing = weekMap.get(weekKey) || { wins: 0, total: 0 };
            existing.total += 1;
            if ((t.pnl ?? 0) > 0) existing.wins += 1;
            weekMap.set(weekKey, existing);
        }

        return Array.from(weekMap.entries())
            .map(([week, stats]) => ({
                week,
                winRate: stats.total > 0 ? Math.round((stats.wins / stats.total) * 100) : 0,
                total: stats.total,
            }))
            .sort((a, b) => a.week.localeCompare(b.week))
            .slice(-8); // 最近8周
    }, [trades]);

    if (trendData.length < 2) return null;

    const maxRate = 100;

    return (
        <>
            <SectionTitle>胜率趋势</SectionTitle>
            <div style={{
                background: 'rgba(128, 128, 128, 0.03)',
                borderRadius: '6px',
                padding: '10px',
            }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    height: '60px',
                    gap: '4px',
                }}>
                    {trendData.map((d, i) => {
                        const height = (d.winRate / maxRate) * 100;
                        const color = d.winRate >= 50 ? V5_COLORS.win : V5_COLORS.loss;
                        const isLast = i === trendData.length - 1;

                        return (
                            <div
                                key={d.week}
                                style={{
                                    flex: 1,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '2px',
                                }}
                                title={`${d.week}: ${d.winRate}% (${d.total}笔)`}
                            >
                                <div style={{
                                    width: '100%',
                                    height: `${Math.max(height, 5)}%`,
                                    minHeight: '3px',
                                    background: color,
                                    borderRadius: '2px',
                                    opacity: isLast ? 1 : 0.6,
                                }} />
                                <span style={{
                                    fontSize: '0.6em',
                                    color: isLast ? 'var(--text-normal)' : 'var(--text-faint)',
                                    fontWeight: isLast ? 600 : 400,
                                }}>
                                    {d.winRate}%
                                </span>
                            </div>
                        );
                    })}
                </div>
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginTop: '4px',
                    fontSize: '0.55em',
                    color: 'var(--text-faint)',
                }}>
                    <span>{trendData[0]?.week.slice(-3)}</span>
                    <span>→</span>
                    <span>{trendData[trendData.length - 1]?.week.slice(-3)} (最新)</span>
                </div>
            </div>
        </>
    );
};

/** 获取 ISO 周数 */
function getISOWeek(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}
