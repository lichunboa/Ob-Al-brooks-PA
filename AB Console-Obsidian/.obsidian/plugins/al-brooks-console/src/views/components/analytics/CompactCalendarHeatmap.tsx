import * as React from "react";
import type { TradeRecord } from "../../../core/contracts";
import { V5_COLORS, withHexAlpha } from "../../../ui/tokens";
import { InteractiveButton } from "../../../ui/components/InteractiveButton";
import { formatCurrency } from "../../../utils/format-utils";

/**
 * CompactCalendarHeatmap Props
 * 紧凑版日历热图，适合放在顶部过滤器区域
 */
export interface CompactCalendarHeatmapProps {
    trades: TradeRecord[];
    selectedDate: string | null;
    onSelectDate: (dateIso: string | null) => void;
    currencyMode?: 'USD' | 'CNY';
}

/**
 * CompactCalendarHeatmap - 紧凑版月历热图组件
 * 显示当月每日 PnL 热图，支持日期选择
 */
export const CompactCalendarHeatmap: React.FC<CompactCalendarHeatmapProps> = ({
    trades,
    selectedDate,
    onSelectDate,
    currencyMode = 'USD',
}) => {
    // Month Navigation State
    const [currentMonthDate, setCurrentMonthDate] = React.useState(() => {
        if (selectedDate) return new Date(selectedDate);
        return new Date();
    });

    const handlePrevMonth = () => {
        setCurrentMonthDate(prev => {
            const copy = new Date(prev);
            copy.setMonth(copy.getMonth() - 1);
            return copy;
        });
        onSelectDate(null);
    };

    const handleNextMonth = () => {
        setCurrentMonthDate(prev => {
            const copy = new Date(prev);
            copy.setMonth(copy.getMonth() + 1);
            return copy;
        });
        onSelectDate(null);
    };

    // Calendar Logic
    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth();
    const currentMonthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startDayOfWeek = new Date(year, month, 1).getDay();

    // Data Aggregation
    const currentMonthStats = React.useMemo(() => {
        const map = new Map<string, { netMoney: number, count: number }>();
        let maxAbsMoney = 0;

        trades.forEach(t => {
            if (!t.dateIso || !t.dateIso.startsWith(currentMonthStr)) return;
            const prev = map.get(t.dateIso) ?? { netMoney: 0, count: 0 };
            const pnl = t.pnl ?? 0;
            const nextVal = { netMoney: prev.netMoney + pnl, count: prev.count + 1 };
            map.set(t.dateIso, nextVal);
            maxAbsMoney = Math.max(maxAbsMoney, Math.abs(nextVal.netMoney));
        });

        return { map, maxAbsMoney };
    }, [trades, currentMonthStr]);

    // Month Summary
    const monthSummary = React.useMemo(() => {
        let totalPnl = 0, tradeCount = 0;
        currentMonthStats.map.forEach(val => {
            totalPnl += val.netMoney;
            tradeCount += val.count;
        });
        return { totalPnl, tradeCount };
    }, [currentMonthStats]);

    // 日历单元格尺寸（增大以提高视觉权重）
    const cellSize = 32;

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            padding: '8px 0',
        }}>
            {/* Header: Month Nav + Summary */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <InteractiveButton
                        onClick={handlePrevMonth}
                        style={{ padding: '2px 6px', fontSize: '0.85em' }}
                    >◀</InteractiveButton>
                    <div style={{
                        fontSize: '1.05em',
                        fontWeight: 800,
                        fontVariantNumeric: 'tabular-nums',
                        minWidth: '90px',
                        textAlign: 'center'
                    }}>
                        📅 {currentMonthStr}
                    </div>
                    <InteractiveButton
                        onClick={handleNextMonth}
                        style={{ padding: '2px 6px', fontSize: '0.85em' }}
                    >▶</InteractiveButton>
                </div>

                <div style={{
                    display: 'flex',
                    gap: '10px',
                    alignItems: 'center',
                    fontSize: '0.8em'
                }}>
                    <span style={{ color: 'var(--text-muted)' }}>
                        {monthSummary.tradeCount} 笔
                    </span>
                    <span style={{
                        fontWeight: 600,
                        color: monthSummary.totalPnl > 0 ? V5_COLORS.win
                            : monthSummary.totalPnl < 0 ? V5_COLORS.loss
                                : 'var(--text-muted)'
                    }}>
                        {monthSummary.totalPnl > 0 ? '+' : ''}{formatCurrency(monthSummary.totalPnl, currencyMode)}
                    </span>
                    {selectedDate && (
                        <InteractiveButton
                            interaction="text"
                            onClick={() => onSelectDate(null)}
                            style={{ fontSize: '0.85em', color: 'var(--text-accent)' }}
                        >
                            清除 ✕
                        </InteractiveButton>
                    )}
                </div>
            </div>

            {/* Calendar Grid */}
            <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: "3px",
            }}>
                {/* Weekday Headers */}
                {['日', '一', '二', '三', '四', '五', '六'].map((d, i) => (
                    <div key={`header-${i}`} style={{
                        textAlign: 'center',
                        fontSize: '0.75em',
                        color: 'var(--text-muted)',
                        fontWeight: 700,
                        paddingBottom: '4px',
                    }}>
                        {d}
                    </div>
                ))}

                {/* Empty Padding Cells */}
                {Array.from({ length: startDayOfWeek }).map((_, i) => (
                    <div key={`pad-${i}`} style={{ height: cellSize }} />
                ))}

                {/* Day Cells */}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const dateIso = `${currentMonthStr}-${String(day).padStart(2, '0')}`;
                    const stats = currentMonthStats.map.get(dateIso);
                    const count = stats?.count ?? 0;
                    const netMoney = stats?.netMoney ?? 0;

                    const bg = count > 0
                        ? (netMoney > 0 ? withHexAlpha(V5_COLORS.win, "2A")
                            : netMoney < 0 ? withHexAlpha(V5_COLORS.loss, "2A")
                                : 'rgba(128,128,128,0.15)')
                        : 'transparent';

                    const isSelected = dateIso === selectedDate;

                    return (
                        <div
                            key={dateIso}
                            onClick={() => count > 0 && onSelectDate(dateIso)}
                            style={{
                                height: cellSize,
                                cursor: count > 0 ? "pointer" : "default",
                                border: isSelected
                                    ? "2px solid var(--interactive-accent)"
                                    : "1px solid var(--background-modifier-border)",
                                borderRadius: "3px",
                                background: bg,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: '0.8em',
                                fontWeight: count > 0 ? 600 : 400,
                                color: count > 0 ? 'var(--text-normal)' : 'var(--text-faint)',
                                transition: "all 0.1s ease",
                                opacity: (!isSelected && selectedDate) ? 0.5 : 1
                            }}
                            title={count > 0 ? `${dateIso}: ${count} 笔, ${formatCurrency(netMoney, currencyMode)}` : dateIso}
                        >
                            {day}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
