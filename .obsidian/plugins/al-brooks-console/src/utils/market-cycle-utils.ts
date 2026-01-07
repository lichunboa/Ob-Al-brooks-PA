/**
 * 市场周期相关工具函数
 */

import { normalizeMarketCycleForAnalytics } from "../core/enum-presets";

/**
 * 规范化市场周期字符串
 * 处理 "/" 分隔符并调用核心规范化函数
 * 
 * @param raw 原始市场周期值
 * @returns 规范化后的市场周期字符串
 */
export function normalizeCycle(raw: unknown): string {
    let s = String(raw ?? "").trim();
    if (!s) return "Unknown";

    // 保留现有 dashboard 的 "/" 兼容行为（不影响 core 口径，只是先做一次拆分）
    if (s.includes("/")) {
        const parts = s.split("/");
        const cand = String(parts[1] ?? parts[0] ?? "").trim();
        if (cand) s = cand;
    }

    return normalizeMarketCycleForAnalytics(s) ?? "Unknown";
}
