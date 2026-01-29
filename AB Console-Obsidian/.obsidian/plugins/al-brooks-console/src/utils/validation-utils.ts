/**
 * 验证和数据处理工具函数
 * 从 Dashboard.tsx 提取的纯函数
 */

/**
 * 判断值是否为空
 * 支持多种空值判断: undefined, null, 空数组, 空字符串, "Empty", "null", "unknown"
 */
export function isEmpty(v: unknown): boolean {
    if (v === undefined || v === null) return true;
    if (Array.isArray(v)) return v.filter((x) => !isEmpty(x)).length === 0;
    const s = String(v).trim();
    if (!s) return true;
    if (s === "Empty") return true;
    if (s.toLowerCase() === "null") return true;
    if (s.toLowerCase().includes("unknown")) return true;
    return false;
}

/**
 * 从对象中按键列表顺序选择第一个存在的值
 * @param fm 对象
 * @param keys 键列表
 * @returns 第一个存在的值,或 undefined
 */
export function pickVal(fm: Record<string, any>, keys: string[]) {
    for (const k of keys) {
        if (Object.prototype.hasOwnProperty.call(fm, k)) return fm[k];
    }
    return undefined;
}
