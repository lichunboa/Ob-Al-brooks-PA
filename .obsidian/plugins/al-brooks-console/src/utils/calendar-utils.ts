/**
 * 日历和分析相关工具函数
 * 用于处理日历数据和分析结果
 */

/**
 * 生成日历单元格数据
 */
export function generateCalendarCells(
    calendarDateIsos: string[],
    analyticsDailyByDate: Map<string, { dateIso: string; netR: number; count: number }>
): Array<{ dateIso: string; netR: number; count: number }> {
    return calendarDateIsos.map(
        (dateIso) =>
            analyticsDailyByDate.get(dateIso) ?? { dateIso, netR: 0, count: 0 }
    );
}

/**
 * 计算日历最大绝对值
 */
export function calculateCalendarMaxAbs(
    calendarCells: Array<{ netR: number }>
): number {
    let max = 0;
    for (const c of calendarCells) {
        max = Math.max(max, Math.abs(c.netR));
    }
    return max;
}
