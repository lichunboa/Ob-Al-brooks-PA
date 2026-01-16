import * as React from "react";
import type { AnalyticsScope } from "../../../core/analytics";
import type { TradeRecord } from "../../../core/contracts";
import { V5_COLORS, withHexAlpha } from "../../../ui/tokens";
import { InteractiveButton } from "../../../ui/components/InteractiveButton";
import { Card } from "../../../ui/components/Card";
import { normalizeMarketCycleForAnalytics } from "../../../core/analytics";

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
        const map = new Map<string, { netR: number, count: number }>();

        let maxAbsR = 0;

        trades.forEach(t => {
            // Apply Scope Filter
            if (analyticsScope !== 'All' && t.accountType !== analyticsScope) return;
            if (!t.dateIso) return;

            // Only care about this month
            if (!t.dateIso.startsWith(currentMonthStr)) return;

            const prev = map.get(t.dateIso) ?? { netR: 0, count: 0 };
            const r = t.netProfit ?? t.pnl ?? 0;

            const nextVal = {
                netR: prev.netR + r,
                count: prev.count + 1
            };
            map.set(t.dateIso, nextVal);

            // Track max abs for heatmap intensity
            maxAbsR = Math.max(maxAbsR, Math.abs(nextVal.netR));
        });

        return { map, maxAbsR };
    }, [trades, analyticsScope, currentMonthStr]);


    // 4. Drilldown Logic (Same as before)
    const selectedDayTrades = React.useMemo(() => {
        if (!selectedDate) return [];
        return trades.filter(t => {
            if (analyticsScope !== 'All' && t.accountType !== analyticsScope) return false;
            return t.dateIso === selectedDate;
        });
    }, [trades, selectedDate, analyticsScope]);

    const selectedDayStats = React.useMemo(() => {
        if (!selectedDayTrades.length) return null;
        const count = selectedDayTrades.length;
        const netR = selectedDayTrades.reduce((acc, t) => acc + (t.netProfit ?? t.pnl ?? 0), 0);
        // "Win" if outcome is explicitly win OR net profit > 0 (handle scratched but slightly positive)
        const wins = selectedDayTrades.filter(t => (t.outcome === 'win' || (t.netProfit ?? 0) > 0)).length;
        const winRate = (wins / count) * 100;
        return { count, netR, winRate };
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
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <label
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            color: "var(--text-muted)",
                            fontSize: "0.9em",
                        }}
                    >
                        范围
                        <select
                            value={analyticsScope}
                            onChange={(e) =>
                                setAnalyticsScope(e.target.value as AnalyticsScope)
                            }
                            style={selectStyle}
                        >
                            <option value="Live">实盘</option>
                            <option value="Demo">模拟</option>
                            <option value="Backtest">回测</option>
                            <option value="All">全部</option>
                        </select>
                    </label>
                </div>
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
                            const netR = stats?.netR ?? 0;

                            const absRatio = stats && currentMonthStats.maxAbsR > 0
                                ? Math.min(1, Math.abs(netR) / currentMonthStats.maxAbsR)
                                : 0;

                            // Visuals
                            const bg = count > 0
                                ? (netR > 0 ? withHexAlpha(V5_COLORS.win, "1A") : netR < 0 ? withHexAlpha(V5_COLORS.loss, "1A") : `rgba(var(--mono-rgb-100), 0.1)`)
                                : 'transparent';

                            const isSelected = dateIso === selectedDate;

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
                                    title={count > 0 ? `${dateIso}: ${count} 笔, ${netR.toFixed(1)}R` : dateIso}
                                >
                                    <div style={{ fontSize: '0.8em', color: count > 0 ? 'var(--text-normal)' : 'var(--text-faint)' }}>
                                        {day}
                                    </div>
                                    {count > 0 && (
                                        <div style={{
                                            fontSize: '0.75em',
                                            textAlign: 'right',
                                            fontWeight: 600,
                                            color: netR > 0 ? V5_COLORS.win : netR < 0 ? V5_COLORS.loss : 'var(--text-muted)'
                                        }}>
                                            {netR >= 0 && '+'}{netR.toFixed(1)}
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
                        /* Case A: Show Selected Date Details */
                        <>
                            <div style={{ fontWeight: 600, marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                                📅 {selectedDate} 详情
                                {selectedDayStats && (
                                    <span style={{ fontSize: "0.85em", color: "var(--text-muted)", fontWeight: 400 }}>
                                        ({selectedDayStats.count} 笔,
                                        <span style={{
                                            color: selectedDayStats.netR >= 0 ? V5_COLORS.win : V5_COLORS.loss,
                                            fontWeight: 600,
                                            marginLeft: "4px"
                                        }}>
                                            {selectedDayStats.netR > 0 ? "+" : ""}{selectedDayStats.netR.toFixed(1)}R
                                        </span>
                                        )
                                    </span>
                                )}
                            </div>

                            {selectedDayTrades.length > 0 ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '380px', overflowY: 'auto' }}>
                                    {selectedDayTrades.map(t => {
                                        const r = t.netProfit ?? t.pnl ?? 0;
                                        const context = t.marketCycle ? normalizeMarketCycleForAnalytics(t.marketCycle) : (t.rawFrontmatter as any)?.market_cycle;
                                        return (
                                            <div
                                                key={t.path}
                                                style={{
                                                    padding: '8px',
                                                    borderRadius: '6px',
                                                    background: 'var(--background-primary)',
                                                    border: '1px solid var(--background-modifier-border)',
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center'
                                                }}
                                            >
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <InteractiveButton
                                                            interaction="text"
                                                            onClick={() => openFile(t.path)}
                                                            style={{ fontWeight: 600, ...textButtonStyle }}
                                                        >
                                                            {t.ticker || 'Trade'} {t.direction === 'Long' ? '🟢' : t.direction === 'Short' ? '🔴' : ''}
                                                        </InteractiveButton>
                                                        <span style={{ fontSize: '0.8em', opacity: 0.7, border: '1px solid var(--background-modifier-border)', padding: '0 4px', borderRadius: '3px' }}>
                                                            {t.timeframe || '?'}
                                                        </span>
                                                    </div>
                                                    <div style={{ fontSize: '0.85em', color: 'var(--text-muted)' }}>
                                                        {t.strategyName || t.setupCategory || 'No Strategy'}
                                                        {context ? ` • ${context}` : ''}
                                                    </div>
                                                </div>

                                                <div style={{ textAlign: 'right' }}>
                                                    <div style={{
                                                        fontWeight: 700,
                                                        color: r > 0 ? V5_COLORS.win : r < 0 ? V5_COLORS.loss : 'var(--text-muted)'
                                                    }}>
                                                        {r > 0 ? '+' : ''}{r.toFixed(1)}R
                                                    </div>
                                                    <div style={{ fontSize: '0.8em', opacity: 0.6 }}>
                                                        {t.outcome}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div style={{ color: "var(--text-faint)", padding: "20px", textAlign: "center" }}>
                                    当日无符合筛选条件的交易。
                                </div>
                            )}
                        </>
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
                                                            r.netR >= 0
                                                                ? V5_COLORS.win
                                                                : V5_COLORS.loss,
                                                        fontWeight: 600,
                                                    }}
                                                >
                                                    {r.netR >= 0 ? "+" : ""}
                                                    {r.netR.toFixed(1)}R
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
