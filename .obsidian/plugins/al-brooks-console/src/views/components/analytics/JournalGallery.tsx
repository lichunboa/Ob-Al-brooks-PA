import * as React from "react";
import type { AnalyticsScope } from "../../../core/analytics";
import type { TradeRecord } from "../../../core/contracts";
import { V5_COLORS, withHexAlpha } from "../../../ui/tokens";
import { InteractiveButton } from "../../../ui/components/InteractiveButton";
import { Card } from "../../../ui/components/Card";
import { normalizeMarketCycleForAnalytics } from "../../../core/analytics";
import { formatCurrency } from "../../../utils/format-utils";
import { DayDetailPanel } from "./DayDetailPanel";

/**
 * JournalGallery Props接口
 */
export interface JournalGalleryProps {
    // 数据Props
    trades: TradeRecord[];
    selectedDate: string | null;
    onSelectDate: (dateIso: string | null) => void;

    // Deprecated props (legacy support)
    calendarCells?: any[];
    calendarDays?: number;
    calendarMaxAbs?: number;

    strategyAttribution: any[];
    analyticsScope: AnalyticsScope;

    // 函数Props
    setAnalyticsScope: (scope: AnalyticsScope) => void;
    openFile: (path: string) => void;
    getDayOfMonth: (dateIso: string) => string;

    // 样式Props
    textButtonStyle: React.CSSProperties;
    selectStyle: React.CSSProperties;

    // 常量Props
    SPACE: any;
    currencyMode?: 'USD' | 'CNY';
}

/**
 * 交易日志画廊组件 (Full Month Calendar Edition)
 * - 左侧：标准月历 (支持月份切换)
 * - 右侧：选中日的详细交易记录 (Drilldown) 或 策略归因 (Fallback)
 */
export const JournalGallery: React.FC<JournalGalleryProps> = ({
    trades,
    selectedDate,
    onSelectDate,
    strategyAttribution,
    analyticsScope,
    setAnalyticsScope,
    openFile,
    getDayOfMonth,
    textButtonStyle,
    selectStyle,
    SPACE,
    currencyMode = 'USD',
}) => {
    // 1. Month Navigation State
    // Default to current month (or selected date's month if exists)
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
        onSelectDate(null); // Clear selection on month change
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
    }

    // 2. Calendar Logic (Standard Grid)
    const year = currentMonthDate.getFullYear();
    const month = currentMonthDate.getMonth(); // 0-11

    // YYYY-MM string for display and filtering
    const currentMonthStr = `${year}-${String(month + 1).padStart(2, '0')}`;

    // Get number of days in this month
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // Get day of week for the 1st of the month (0=Sunday, 6=Saturday)
    const startDayOfWeek = new Date(year, month, 1).getDay();

    // 3. Data Aggregation for Current Month
    const currentMonthStats = React.useMemo(() => {
        // Prepare map for O(1) lookup
        const map = new Map<string, { netMoney: number, netR: number, count: number }>();

        let maxAbsMoney = 0;

        trades.forEach(t => {
            // 数据已由顶部全局过滤器过滤，这里不再需要 Scope Filter
            if (!t.dateIso) return;

            // Only care about this month
            if (!t.dateIso.startsWith(currentMonthStr)) return;

            const prev = map.get(t.dateIso) ?? { netMoney: 0, netR: 0, count: 0 };
            const pnl = t.pnl ?? 0; // Money
            const r = t.r ?? (t.initialRisk ? pnl / t.initialRisk : 0); // R

            const nextVal = {
                netMoney: prev.netMoney + pnl,
                netR: prev.netR + r,
                count: prev.count + 1
            };
            map.set(t.dateIso, nextVal);

            // Track max abs for heatmap intensity (based on Money now)
            maxAbsMoney = Math.max(maxAbsMoney, Math.abs(nextVal.netMoney));
        });

        return { map, maxAbsMoney };
    }, [trades, currentMonthStr]);


    // 4. Drilldown Logic (Same as before)
    const selectedDayTrades = React.useMemo(() => {
        if (!selectedDate) return [];
        // 数据已由顶部全局过滤器过滤
        return trades.filter(t => t.dateIso === selectedDate);
    }, [trades, selectedDate]);

    const selectedDayStats = React.useMemo(() => {
        if (!selectedDayTrades.length) return null;
        const count = selectedDayTrades.length;
        const netMoney = selectedDayTrades.reduce((acc, t) => acc + (t.pnl ?? 0), 0);
        // "Win" if outcome is explicitly win OR net profit > 0 (handle scratched but slightly positive)
        const wins = selectedDayTrades.filter(t => (t.outcome === 'win' || (t.netProfit ?? 0) > 0)).length;
        const winRate = (wins / count) * 100;
        return { count, netMoney, winRate };
    }, [selectedDayTrades]);

    return (
        <Card variant="tight">
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "10px",
                    marginBottom: "8px",
                }}
            >
                <div style={{ fontWeight: 600 }}>交易日志画廊</div>
                {/* 账户类型过滤已移到顶部全局过滤器 */}
            </div>

            <div
                style={{ display: "flex", flexWrap: "wrap", gap: SPACE.md }}
            >
                {/* Left: Monthly Calendar */}
                <div style={{ flex: "1 1 320px", minWidth: "320px" }}>
                    {/* Header: Month Nav */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: '12px',
                        padding: '4px 0',
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <InteractiveButton onClick={handlePrevMonth} style={textButtonStyle}>◀</InteractiveButton>
                            <div style={{
                                fontSize: '1.2em',
                                fontWeight: 700,
                                fontVariantNumeric: 'tabular-nums',
                                minWidth: '90px',
                                textAlign: 'center'
                            }}>
                                {currentMonthStr}
                            </div>
                            <InteractiveButton onClick={handleNextMonth} style={textButtonStyle}>▶</InteractiveButton>

                            <InteractiveButton
                                onClick={handleResetMonth}
                                style={{ ...textButtonStyle, fontSize: '0.8em', opacity: 0.7, marginLeft: '4px' }}
                                title="回到本月"
                            >
                                •
                            </InteractiveButton>
                        </div>

                        {selectedDate && (
                            <InteractiveButton
                                interaction="text"
                                onClick={() => onSelectDate(null)}
                                style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}
                            >
                                清除选择 ✕
                            </InteractiveButton>
                        )}
                    </div>

                    {/* Grid */}
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(7, 1fr)",
                            gap: "6px",
                            marginBottom: "6px",
                        }}
                    >
                        {/* Weekday Headers */}
                        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map(d => (
                            <div key={d} style={{
                                textAlign: 'center',
                                fontSize: '0.75em',
                                color: 'var(--text-muted)',
                                fontWeight: 600,
                                paddingBottom: '4px'
                            }}>
                                {d}
                            </div>
                        ))}

                        {/* Empty Padding Cells */}
                        {Array.from({ length: startDayOfWeek }).map((_, i) => (
                            <div key={`pad-${i}`} />
                        ))}

                        {/* Day Cells */}
                        {Array.from({ length: daysInMonth }).map((_, i) => {
                            const day = i + 1;
                            const dateIso = `${currentMonthStr}-${String(day).padStart(2, '0')}`;
                            const stats = currentMonthStats.map.get(dateIso);
                            const count = stats?.count ?? 0;
                            const netMoney = stats?.netMoney ?? 0;

                            const absRatio = stats && currentMonthStats.maxAbsMoney > 0
                                ? Math.min(1, Math.abs(netMoney) / currentMonthStats.maxAbsMoney)
                                : 0;

                            // Visuals
                            const bg = count > 0
                                ? (netMoney > 0 ? withHexAlpha(V5_COLORS.win, "1A") : netMoney < 0 ? withHexAlpha(V5_COLORS.loss, "1A") : `rgba(var(--mono-rgb-100), 0.1)`)
                                : 'transparent';

                            const isSelected = dateIso === selectedDate;

                            const currencyStr = formatCurrency(netMoney, currencyMode).replace('$', '').replace('¥', '');

                            return (
                                <div
                                    key={dateIso}
                                    onClick={() => count > 0 && onSelectDate(dateIso)}
                                    style={{
                                        aspectRatio: '1',
                                        cursor: count > 0 ? "pointer" : "default",
                                        border: isSelected
                                            ? "2px solid var(--interactive-accent)"
                                            : "1px solid var(--background-modifier-border)",
                                        borderRadius: "6px",
                                        background: bg,
                                        display: "flex",
                                        flexDirection: "column",
                                        justifyContent: "space-between",
                                        padding: "4px",
                                        position: "relative",
                                        transition: "all 0.1s ease",
                                        opacity: (!isSelected && selectedDate) ? 0.6 : 1
                                    }}
                                    title={count > 0 ? `${dateIso}: ${count} 笔, ${netMoney >= 0 ? "+" : ""}${formatCurrency(netMoney, currencyMode)}` : dateIso}
                                >
                                    <div style={{ fontSize: '0.8em', color: count > 0 ? 'var(--text-normal)' : 'var(--text-faint)' }}>
                                        {day}
                                    </div>
                                    {count > 0 && (
                                        <div style={{
                                            fontSize: '0.75em',
                                            textAlign: 'right',
                                            fontWeight: 600,
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            color: netMoney > 0 ? V5_COLORS.win : netMoney < 0 ? V5_COLORS.loss : 'var(--text-muted)'
                                        }}>
                                            {netMoney > 0 && '+'}{currencyStr}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Right: Drilldown Details or Fallback */}
                <div style={{ flex: "1 1 360px", minWidth: "360px" }}>
                    {selectedDate ? (
                        /* Case A: Show Selected Date Details using DayDetailPanel */
                        <DayDetailPanel
                            date={selectedDate}
                            trades={selectedDayTrades}
                            onClose={() => onSelectDate(null)}
                            onOpenFile={openFile}
                            style={{ height: '100%', borderLeft: 'none', background: 'transparent' }}
                        />
                    ) : (
                        /* Case B: Default Strategy Attribution (Fallback) */
                        <>
                            <div style={{ fontWeight: 600, marginBottom: "8px" }}>
                                策略归因（Top）
                            </div>
                            {strategyAttribution.length > 0 ? (
                                <ul style={{ margin: 0, paddingLeft: "18px" }}>
                                    {strategyAttribution.map((r) => (
                                        <li
                                            key={`attr-${r.strategyName}`}
                                            style={{ marginBottom: "6px" }}
                                        >
                                            {r.strategyPath ? (
                                                <InteractiveButton
                                                    interaction="text"
                                                    onClick={() => openFile(r.strategyPath!)}
                                                    style={textButtonStyle}
                                                >
                                                    {r.strategyName}
                                                </InteractiveButton>
                                            ) : (
                                                <span>{r.strategyName}</span>
                                            )}
                                            <span
                                                style={{
                                                    color: "var(--text-muted)",
                                                    marginLeft: "8px",
                                                    fontSize: "0.9em",
                                                }}
                                            >
                                                {r.count} 笔 •{" "}
                                                <span
                                                    style={{
                                                        color:
                                                            r.netMoney >= 0
                                                                ? V5_COLORS.win
                                                                : V5_COLORS.loss,
                                                        fontWeight: 600,
                                                    }}
                                                >
                                                    {r.netMoney >= 0 ? "+" : ""}
                                                    {formatCurrency(r.netMoney ?? 0, currencyMode)}
                                                </span>
                                            </span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <div
                                    style={{
                                        color: "var(--text-faint)",
                                        fontSize: "0.9em",
                                    }}
                                >
                                    未找到策略归因数据。
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
        </Card>
    );
};
