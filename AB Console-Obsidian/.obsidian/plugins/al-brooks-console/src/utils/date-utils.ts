/**
 * 日期工具函数
 * 从 Dashboard.tsx 提取的纯函数
 */

/**
 * 将 Date 对象转换为本地日期 ISO 字符串 (YYYY-MM-DD)
 */
export function toLocalDateIso(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

/**
 * 获取最近 N 天的日期 ISO 字符串数组
 * @param days 天数
 * @returns 日期字符串数组,从今天开始倒序
 */
export function getLastLocalDateIsos(days: number): string[] {
    const out: string[] = [];
    const now = new Date();
    for (let i = 0; i < Math.max(1, days); i++) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        out.push(toLocalDateIso(d));
    }
    return out;
}

/**
 * 从日期 ISO 字符串中提取日期(去除前导零)
 * @param dateIso 日期字符串 (YYYY-MM-DD)
 * @returns 日期字符串 (例如: "1", "15")
 */
export function getDayOfMonth(dateIso: string): string {
    const parts = dateIso.split("-");
    const d = parts[2] ?? "";
    return d.startsWith("0") ? d.slice(1) : d;
}

/**
 * 从日期 ISO 字符串中提取年月
 * @param dateIso 日期字符串 (YYYY-MM-DD)
 * @returns 年月字符串 (YYYY-MM) 或 undefined
 */
export function getYearMonth(dateIso: string | undefined): string | undefined {
    if (!dateIso) return undefined;
    const m = dateIso.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return undefined;
    return `${m[1]}-${m[2]}`;
}
