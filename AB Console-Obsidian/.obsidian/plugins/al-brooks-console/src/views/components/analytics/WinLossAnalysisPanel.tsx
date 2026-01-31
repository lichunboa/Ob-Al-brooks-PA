import * as React from "react";
import type { TradeRecord } from "../../../core/contracts";
import { aggregateTrades, type AnalyticsBucket } from "../../../core/analytics";
import { formatCurrency } from "../../../utils/format-utils";
import { Card } from "../../../ui/components/Card";
import { V5_COLORS } from "../../../ui/tokens";

interface AnalysisInsightPanelProps {
    trades: TradeRecord[];
    currencyMode: 'USD' | 'CNY';
    displayUnit?: 'money' | 'r';
    SPACE: any;
}

/**
 * 紧凑水平指标条 - 单行显示
 */
const CompactMetric: React.FC<{
    label: string;
    value: number;
    isWinRate?: boolean;
    currencyMode: 'USD' | 'CNY';
    displayUnit: 'money' | 'r';
}> = ({ label, value, isWinRate, currencyMode, displayUnit }) => {
    const isPositive = isWinRate ? value >= 50 : value >= 0;
    const color = isPositive ? V5_COLORS.win : V5_COLORS.loss;

    const formatValue = () => {
        if (isWinRate) return `${value.toFixed(0)}%`;
        if (displayUnit === 'r') return `${value > 0 ? '+' : ''}${value.toFixed(1)}R`;
        return formatCurrency(value, currencyMode);
    };

    return (
        <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '4px 8px',
            background: 'rgba(var(--mono-rgb-100), 0.03)',
            borderRadius: '4px',
            fontSize: '0.8em',
        }}>
            <span style={{ color: 'var(--text-muted)' }}>{label}</span>
            <span style={{ fontWeight: 600, color }}>{formatValue()}</span>
        </div>
    );
};

/**
 * 紧凑维度卡片
 */
const CompactDimensionCard: React.FC<{
    title: string;
    icon: string;
    data: AnalyticsBucket[];
    dataKey: "netMoney" | "netR" | "winRate";
    currencyMode: 'USD' | 'CNY';
    displayUnit: 'money' | 'r';
}> = ({ title, icon, data, dataKey, currencyMode, displayUnit }) => {
    // 只显示前3条
    const displayData = data.slice(0, 3);

    if (displayData.length === 0) return null;

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
        }}>
            <div style={{
                fontSize: '0.75em',
                fontWeight: 600,
                color: 'var(--text-muted)',
                marginBottom: '2px',
            }}>
                {icon} {title}
            </div>
            {displayData.map((item, idx) => (
                <CompactMetric
                    key={idx}
                    label={item.label}
                    value={item[dataKey] as number}
                    isWinRate={dataKey === 'winRate'}
                    currencyMode={currencyMode}
                    displayUnit={displayUnit}
                />
            ))}
        </div>
    );
};

export const WinLossAnalysisPanel: React.FC<AnalysisInsightPanelProps> = ({
    trades,
    currencyMode,
    displayUnit = 'money',
    SPACE,
}) => {
    // 数据聚合 - 只保留方向分布和周期分析（每日胜率由日历热图和账户概览展示）
    const directionData = React.useMemo(() =>
        aggregateTrades(trades, "direction"),
        [trades]);

    const timeframeData = React.useMemo(() =>
        aggregateTrades(trades, "timeframe" as any).slice(0, 3),
        [trades]);

    const pnlKey = displayUnit === 'r' ? 'netR' : 'netMoney';

    // 如果没有数据则不显示
    if (trades.length === 0) return null;

    return (
        <Card variant="tight">
            <div style={{
                fontWeight: 700,
                opacity: 0.75,
                marginBottom: SPACE.sm,
                fontSize: '0.9em',
            }}>
                📊 交易维度分析
            </div>

            {/* 2列紧凑网格 */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: SPACE.md,
            }}>
                <CompactDimensionCard
                    title="方向分布"
                    icon="↕️"
                    data={directionData}
                    dataKey={pnlKey}
                    currencyMode={currencyMode}
                    displayUnit={displayUnit}
                />
                <CompactDimensionCard
                    title="周期分析"
                    icon="⏱️"
                    data={timeframeData}
                    dataKey={pnlKey}
                    currencyMode={currencyMode}
                    displayUnit={displayUnit}
                />
            </div>
        </Card>
    );
};
