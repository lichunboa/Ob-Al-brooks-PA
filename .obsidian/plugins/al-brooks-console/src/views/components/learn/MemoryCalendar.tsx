import * as React from "react";

/**
 * 记忆日历 Props
 */
export interface MemoryCalendarProps {
    loadNext7?: Array<{ dateIso: string; count: number }>;
    style?: React.CSSProperties;
}

/**
 * 记忆日历组件 - 简约紧凑版
 */
export const MemoryCalendar: React.FC<MemoryCalendarProps> = ({
    loadNext7 = [],
    style,
}) => {
    const [offset, setOffset] = React.useState(0);

    const displayDate = React.useMemo(() => {
        const d = new Date();
        d.setMonth(d.getMonth() + offset);
        return d;
    }, [offset]);

    const dateCountMap = React.useMemo(() => {
        const map = new Map<string, number>();
        for (const item of loadNext7) {
            map.set(item.dateIso, item.count);
        }
        return map;
    }, [loadNext7]);

    // 本月统计
    const monthTotal = React.useMemo(() => {
        let total = 0;
        for (const [date, count] of dateCountMap) {
            if (date.startsWith(displayDate.toISOString().slice(0, 7))) {
                total += count;
            }
        }
        return total;
    }, [dateCountMap, displayDate]);

    // 日历日期
    const calendarDays = React.useMemo(() => {
        const year = displayDate.getFullYear();
        const month = displayDate.getMonth();
        const firstDay = new Date(year, month, 1).getDay();
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const daysInPrevMonth = new Date(year, month, 0).getDate();

        const days: Array<{
            day: number;
            dateIso: string;
            isCurrentMonth: boolean;
            isToday: boolean;
            count: number;
        }> = [];

        const today = new Date();
        const todayIso = today.toISOString().split("T")[0];

        // 上月
        for (let i = firstDay - 1; i >= 0; i--) {
            const d = daysInPrevMonth - i;
            const date = new Date(year, month - 1, d);
            const dateIso = date.toISOString().split("T")[0];
            days.push({ day: d, dateIso, isCurrentMonth: false, isToday: false, count: dateCountMap.get(dateIso) || 0 });
        }

        // 本月
        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(year, month, d);
            const dateIso = date.toISOString().split("T")[0];
            days.push({ day: d, dateIso, isCurrentMonth: true, isToday: dateIso === todayIso, count: dateCountMap.get(dateIso) || 0 });
        }

        // 下月补齐
        const remaining = Math.ceil(days.length / 7) * 7 - days.length;
        for (let d = 1; d <= remaining; d++) {
            const date = new Date(year, month + 1, d);
            const dateIso = date.toISOString().split("T")[0];
            days.push({ day: d, dateIso, isCurrentMonth: false, isToday: false, count: dateCountMap.get(dateIso) || 0 });
        }

        return days;
    }, [displayDate, dateCountMap]);

    const monthLabel = `${displayDate.getFullYear()}-${String(displayDate.getMonth() + 1).padStart(2, "0")}`;
    const weekDays = ["日", "一", "二", "三", "四", "五", "六"];

    return (
        <div style={{
            background: "var(--background-secondary)",
            borderRadius: "8px",
            padding: "12px",
            ...style,
        }}>
            {/* 头部 */}
            <div style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "10px",
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <button onClick={() => setOffset(o => o - 1)} style={arrowBtnStyle}>◀</button>
                    <span style={{
                        fontSize: "0.85em",
                        fontWeight: 600,
                        color: "var(--text-normal)",
                        padding: "2px 8px",
                        background: "rgba(var(--mono-rgb-100), 0.08)",
                        borderRadius: "4px",
                    }}>
                        📅 {monthLabel}
                    </span>
                    <button onClick={() => setOffset(o => o + 1)} style={arrowBtnStyle}>▶</button>
                </div>

                {monthTotal > 0 && (
                    <span style={{
                        fontSize: "0.7em",
                        color: "#f59e0b",
                        fontWeight: 600,
                    }}>
                        {monthTotal} 张待复习
                    </span>
                )}
            </div>

            {/* 星期 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px", marginBottom: "4px" }}>
                {weekDays.map((d, i) => (
                    <div key={i} style={{
                        textAlign: "center",
                        fontSize: "0.65em",
                        color: "var(--text-faint)",
                        padding: "2px 0",
                    }}>
                        {d}
                    </div>
                ))}
            </div>

            {/* 日期 */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "2px" }}>
                {calendarDays.map((day, idx) => (
                    <div
                        key={idx}
                        title={day.count > 0 ? `${day.count} 张卡片` : undefined}
                        style={{
                            position: "relative",
                            textAlign: "center",
                            padding: "4px 0",
                            fontSize: "0.75em",
                            borderRadius: "4px",
                            cursor: day.count > 0 ? "pointer" : "default",
                            background: day.isToday
                                ? "#22c55e"
                                : day.count > 0
                                    ? "rgba(249, 115, 22, 0.2)"
                                    : "transparent",
                            color: day.isToday
                                ? "white"
                                : day.isCurrentMonth
                                    ? "var(--text-normal)"
                                    : "var(--text-faint)",
                            fontWeight: day.isToday || day.count > 0 ? 600 : 400,
                            transition: "all 0.15s",
                        }}
                    >
                        {day.day}
                        {day.count > 0 && !day.isToday && (
                            <div style={{
                                position: "absolute",
                                top: "2px",
                                right: "2px",
                                width: "5px",
                                height: "5px",
                                borderRadius: "50%",
                                background: "#f59e0b",
                            }} />
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

const arrowBtnStyle: React.CSSProperties = {
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontSize: "0.7em",
    color: "var(--text-muted)",
    padding: "2px 6px",
};
