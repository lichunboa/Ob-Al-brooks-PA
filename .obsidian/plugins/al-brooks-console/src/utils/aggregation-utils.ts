/**
 * 数据聚合工具函数
 * 用于统计和聚合数据
 */

import type { TradeRecord } from "../core/contracts";

/**
 * 统计Top N数据
 * @param getter - 从TradeRecord提取值的函数
 * @param pretty - 可选的格式化函数
 * @param trades - 交易记录数组
 * @param n - 返回前N个结果,默认5
 * @returns Top N的[值, 数量]数组
 */
export function topN(
    getter: (t: TradeRecord) => string | undefined,
    pretty?: (v?: string) => string,
    trades: TradeRecord[] = [],
    n: number = 5
): Array<[string, number]> {
    const map = new Map<string, number>();
    for (const t of trades) {
        const raw = getter(t);
        const base = (raw ?? "").toString().trim();
        const v = (pretty ? pretty(base) : base) || "Unknown";
        if (!v) continue;
        map.set(v, (map.get(v) ?? 0) + 1);
    }
    return [...map.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, n);
}

/**
 * 计算文件数量(用于统计)
 */
export function countFiles(paths: string[]): number {
    return paths.length;
}

/**
 * 将日期聚合数组转换为Map
 * @param dailyAggs 日期聚合数组
 * @returns 以dateIso为key的Map
 */
export function convertDailyAggToMap<T extends { dateIso: string }>(
    dailyAggs: T[]
): Map<string, T> {
    const m = new Map<string, T>();
    for (const d of dailyAggs) m.set(d.dateIso, d);
    return m;
}

