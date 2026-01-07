/**
 * 交易相关工具函数
 * 从 Dashboard.tsx 提取的纯函数
 */

/**
 * 判断策略状态是否为活跃
 * @param statusRaw 状态原始值
 * @returns 是否活跃
 */
export function isActive(statusRaw: unknown): boolean {
    const s = typeof statusRaw === "string" ? statusRaw.trim() : "";
    if (!s) return false;
    return s.includes("实战") || s.toLowerCase().includes("active");
}
