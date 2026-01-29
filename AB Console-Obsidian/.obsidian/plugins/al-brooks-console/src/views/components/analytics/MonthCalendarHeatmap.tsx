import * as React from "react";
import type { TradeRecord } from "../../../core/contracts";
import { V5_COLORS, withHexAlpha } from "../../../ui/tokens";
import { InteractiveButton } from "../../../ui/components/InteractiveButton";
import { formatCurrency } from "../../../utils/format-utils";

/**
 * MonthCalendarHeatmap Props
 * 独立的月历热图组件，可放置在顶部过滤区域
 */
export interface MonthCalendarHeatmapProps {
    trades: TradeRecord[];
    selectedDate: string | null;
    onSelectDate: (dateIso: string | null) => void;
    currencyMode?: 'USD' | 'CNY';
    compact?: boolean; // 紧凑模式用于顶部过滤区域
}

/**
 * MonthCalendarHeatmap - 月历热图组件
 * 显示每日 PnL 的热图，支持日期选择
 */
export const MonthCalendarHeatmap: React.FC<MonthCalendarHeatmapProps> = ({
    trades,
    selectedDate,
    onSelectDate,
    currencyMode = 'USD',
    compact = false,
}) => {
    // 1. Month Navigation State
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

    const handleResetMonth = () => {
        setCurrentMonthDate(new Date());
        onSelectDate(null);
    };

    // 2. Calendar Logic
    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth();
    const currentMonthStr = `${year}-${String(month + 1).padStart(2, '0')}`;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startDayOfWeek = new Date(year, month, 1).getDay();

    // 3. Data Aggregation for Current Month
    const currentMonthStats = React.useMemo(() => {
        const map = new Map<string, { netMoney: number, count: number }>();
        let maxAbsMoney = 0;

        trades.forEach(t => {
            if (!t.dateIso) return;
            if (!t.dateIso.startsWith(currentMonthStr)) return;

            const prev = map.get(t.dateIso) ?? { netMoney: 0, count: 0 };
            const pnl = t.pnl ?? 0;

            const nextVal = {
                netMoney: prev.netMoney + pnl,
                count: prev.count + 1
            };
            map.set(t.dateIso, nextVal);
            maxAbsMoney = Math.max(maxAbsMoney, Math.abs(nextVal.netMoney));
        });

        return { map, maxAbsMoney };
    }, [trades, currentMonthStr]);

    // 4. Summary for the month
    const monthSummary = React.useMemo(() => {
        let totalPnl = 0;
        let tradeCount = 0;
        currentMonthStats.map.forEach(val => {
            totalPnl += val.netMoney;
            tradeCount += val.count;
        });
        return { totalPnl, tradeCount };
    }, [currentMonthStats]);

    // 样式配置
    const cellSize = compact ? 28 : 36;
    const fontSize = compact ? '0.7em' : '0.8em';
    const pnlFontSize = compact ? '0.6em' : '0.75em';
    const gap = compact ? 3 : 6;

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: compact ? '6px' : '10px',
        }}>
            {/* Header: Month Nav */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '8px',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <InteractiveButton
                        onClick={handlePrevMonth}
                        style={{
                            padding: '2px 6px',
                            fontSize: '0.9em',
                            background: 'var(--background-modifier-hover)',
                            borderRadius: '4px'
                        }}
                    >
                        ◀
                    </InteractiveButton>
                    <div style={{
                        fontSize: compact ? '1em' : '1.2em',
                        fontWeight: 700,
                        fontVariantNumeric: 'tabular-nums',
                        minWidth: '85px',
                        textAlign: 'center'
                    }}>
                        {currentMonthStr}
                    </div>
                    <InteractiveButton
                        onClick={handleNextMonth}
                        style={{
                            padding: '2px 6px',
                            fontSize: '0.9em',
                            background: 'var(--background-modifier-hover)',
                            borderRadius: '4px'
                        }}
                    >
                        ▶
                    </InteractiveButton>
                    <InteractiveButton
                        onClick={handleResetMonth}
                        style={{
                            padding: '2px 6px',
                            fontSize: '0.75em',
                            opacity: 0.7,
                            background: 'var(--background-modifier-hover)',
                            borderRadius: '4px'
                        }}
                        title="回到本月"
                    >
                        •
                    </InteractiveButton>
                </div>

                {/* Month Summary */}
                <div style={{
                    display: 'flex',
                    gap: '12px',
                    alignItems: 'center',
                    fontSize: '0.85em'
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
                            style={{
                                fontSize: '0.85em',
                                color: 'var(--text-accent)',
                                padding: '2px 6px'
                            }}
                        >
                            清除 ✕
                        </InteractiveButton>
                    )}
                </div>
            </div>

            {/* Grid */}
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(7, 1fr)",
                    gap: `${gap}px`,
                }}
            >
                {/* Weekday Headers */}
                {['日', '一', '二', '三', '四', '五', '六'].map((d, i) => (
                    <div key={`header-${i}`} style={{
                        textAlign: 'center',
                        fontSize: pnlFontSize,
                        color: 'var(--text-muted)',
                        fontWeight: 600,
                        paddingBottom: '2px'
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

                    // Visuals
                    const bg = count > 0
                        ? (netMoney > 0 ? withHexAlpha(V5_COLORS.win, "1A")
                            : netMoney < 0 ? withHexAlpha(V5_COLORS.loss, "1A")
                                : `rgba(var(--mono-rgb-100), 0.1)`)
                        : 'transparent';

                    const isSelected = dateIso === selectedDate;
                    const currencyStr = formatCurrency(netMoney, currencyMode).replace('$', '').replace('¥', '');

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
                                borderRadius: "4px",
                                background: bg,
                                display: "flex",
                                flexDirection: "column",
                                justifyContent: "space-between",
                                alignItems: compact ? "center" : "stretch",
                                padding: compact ? "2px" : "3px",
                                transition: "all 0.1s ease",
                                opacity: (!isSelected && selectedDate) ? 0.5 : 1
                            }}
                            title={count > 0 ? `${dateIso}: ${count} 笔, ${netMoney >= 0 ? "+" : ""}${formatCurrency(netMoney, currencyMode)}` : dateIso}
                        >
                            <div style={{
                                fontSize,
                                color: count > 0 ? 'var(--text-normal)' : 'var(--text-faint)',
                                textAlign: compact ? 'center' : 'left'
                            }}>
                                {day}
                            </div>
                            {count > 0 && !compact && (
                                <div style={{
                                    fontSize: pnlFontSize,
                                    textAlign: 'right',
                                    fontWeight: 600,
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    color: netMoney > 0 ? V5_COLORS.win
                                        : netMoney < 0 ? V5_COLORS.loss
                                            : 'var(--text-muted)'
                                }}>
                                    {netMoney > 0 && '+'}{currencyStr}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
