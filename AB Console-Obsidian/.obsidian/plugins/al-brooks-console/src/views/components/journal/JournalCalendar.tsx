import * as React from "react";
import { TradeRecord } from "../../../core/contracts";
import { DailyJournal } from "../../../types/journal";
import {
    calculateCalendarMaxAbs
} from "../../../utils/calendar-utils";
import { convertDailyAggToMap } from "../../../utils/aggregation-utils";
import { computeDailyAgg } from "../../../core/analytics";

interface JournalCalendarProps {
    selectedDate: string; // YYYY-MM-DD
    onSelectDate: (d: string) => void;
    trades: TradeRecord[];
    journalLogs: DailyJournal[];
}

export const JournalCalendar: React.FC<JournalCalendarProps> = ({
    selectedDate,
    onSelectDate,
    trades,
    journalLogs,
}) => {
    // Current viewed month (initially derived from selectedDate)
    const [yearMonth, setYearMonth] = React.useState(() => selectedDate.slice(0, 7)); // YYYY-MM

    const moveMonth = (delta: number) => {
        const [y, m] = yearMonth.split("-").map(Number);
        const nextDate = new Date(y, m - 1 + delta, 1);
        const ny = nextDate.getFullYear();
        const nm = String(nextDate.getMonth() + 1).padStart(2, "0");
        setYearMonth(`${ny}-${nm}`);
    };

    // Calculate daily PnL
    const dailyAggMap = React.useMemo(() => {
        // We reuse analytics logic, asking for up to 3650 days (approx 10 years) to cover all history
        const agg = computeDailyAgg(trades, 3650);
        return convertDailyAggToMap(agg);
    }, [trades]);

    // Calculate journal map
    const journalMap = React.useMemo(() => {
        const map = new Map<string, DailyJournal>();
        for (const log of journalLogs) {
            map.set(log.date, log);
        }
        return map;
    }, [journalLogs]);

    // Generate calendar days
    const calendarCells = React.useMemo(() => {
        const [y, m] = yearMonth.split("-").map(Number);
        const daysInMonth = new Date(y, m, 0).getDate();
        const firstDayDow = new Date(y, m - 1, 1).getDay(); // 0=Sun

        const cells = [];
        // Empty cells for padding
        for (let i = 0; i < firstDayDow; i++) {
            cells.push({ date: "", empty: true });
        }
        // Actual days
        for (let i = 1; i <= daysInMonth; i++) {
            const dStr = `${yearMonth}-${String(i).padStart(2, "0")}`;
            cells.push({ date: dStr, empty: false });
        }
        return cells;
    }, [yearMonth]);

    const maxAbsR = React.useMemo(() => {
        // simple max calc for current view? or global? 
        // global is better for consistency but local is okay for now
        return calculateCalendarMaxAbs(
            // need to convert map to array
            Array.from(dailyAggMap.values()).map(v => ({ netR: v.netR }))
        ) || 5; // default 5R
    }, [dailyAggMap]);

    const getCellColor = (netR: number) => {
        if (netR === 0) return "rgba(128, 128, 128, 0.1)";
        const intensity = Math.min(Math.abs(netR) / maxAbsR, 1);
        if (netR > 0) return `rgba(34, 197, 94, ${0.1 + intensity * 0.5})`; // Green
        return `rgba(239, 68, 68, ${0.1 + intensity * 0.5})`; // Red
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {/* Header: Prev | Month | Next */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <button onClick={() => moveMonth(-1)} className="pa-btn pa-btn--text">←</button>
                <div style={{ fontWeight: 600 }}>{yearMonth}</div>
                <button onClick={() => moveMonth(1)} className="pa-btn pa-btn--text">→</button>
            </div>

            {/* Grid */}
            <div style={{
                display: "grid",
                gridTemplateColumns: "repeat(7, 1fr)",
                gap: "4px",
                fontSize: "12px",
                textAlign: "center"
            }}>
                {/* Weekday headers */}
                {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                    <div key={i} style={{ color: "var(--text-muted)", fontSize: "10px", paddingBottom: "4px" }}>{d}</div>
                ))}

                {/* Days */}
                {calendarCells.map((cell, i) => {
                    if (cell.empty) return <div key={i} />;

                    const date = cell.date;
                    const stats = dailyAggMap.get(date);
                    const journal = journalMap.get(date);
                    const isSelected = date === selectedDate;

                    const netR = stats?.netR ?? 0;
                    const count = stats?.count ?? 0;
                    const hasJournal = !!journal;

                    return (
                        <div
                            key={date}
                            onClick={() => onSelectDate(date)}
                            style={{
                                cursor: "pointer",
                                aspectRatio: "1",
                                borderRadius: "6px",
                                background: getCellColor(netR),
                                border: isSelected ? "2px solid var(--interactive-accent)" : "1px solid transparent",
                                display: "flex",
                                flexDirection: "column",
                                alignItems: "center",
                                justifyContent: "center",
                                position: "relative"
                            }}
                        >
                            <span style={{ fontWeight: hasJournal ? 600 : 400 }}>
                                {date.split("-")[2].replace(/^0/, "")}
                            </span>
                            {count > 0 && (
                                <span style={{ fontSize: "9px", opacity: 0.8 }}>
                                    {netR > 0 ? "+" : ""}{netR.toFixed(1)}R
                                </span>
                            )}
                            {/* Dot indicator for journal entry */}
                            {hasJournal && (
                                <div style={{
                                    width: "4px", height: "4px", borderRadius: "50%",
                                    background: "var(--text-normal)",
                                    position: "absolute", bottom: "4px"
                                }} />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
