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

/**
 * 按日期升序排序交易(从旧到新)
 * @param trades 交易数组
 * @returns 排序后的新数组
 */
export function sortTradesByDateAsc<T extends { dateIso?: string | null }>(trades: T[]): T[] {
    return [...trades].sort((a, b) =>
        a.dateIso < b.dateIso ? -1 : a.dateIso > b.dateIso ? 1 : 0
    );
}

/**
 * 按日期倒序排序交易(从新到旧)
 * @param trades 交易数组
 * @returns 排序后的新数组
 */
export function sortTradesByDateDesc<T extends { dateIso?: string | null }>(trades: T[]): T[] {
    return [...trades].sort((a, b) => {
        const da = String(a.dateIso ?? "");
        const db = String(b.dateIso ?? "");
        if (da === db) return 0;
        return da < db ? 1 : -1;
    });
}

/**
 * 查找进行中的交易
 * @param trades 交易数组
 * @returns 进行中的交易,如果没有则返回undefined
 */
export function findOpenTrade<T extends { pnl?: number | null; outcome?: string | null }>(
    trades: T[]
): T | undefined {
    return trades.find((t) => {
        const pnlMissing = typeof t.pnl !== "number" || !Number.isFinite(t.pnl);
        if (!pnlMissing) return false;
        return (
            t.outcome === "open" ||
            t.outcome === undefined ||
            t.outcome === "unknown"
        );
    });
}
