/**
 * 搜索和匹配工具函数
 * 用于搜索字符串规范化和匹配逻辑
 */

import { managerKeyTokens, MANAGER_GROUPS } from "../core/manager-groups";

/**
 * 规范化搜索字符串
 * 转换为小写并移除特殊字符
 */
export function canonicalizeSearch(s: string): string {
    const raw = (s ?? "").toString().trim();
    if (!raw) return "";

    // 转小写
    let lower = raw.toLowerCase();

    // 移除常见分隔符
    lower = lower.replace(/[_\-\s]+/g, "");

    // 移除括号内容 (e.g., "foo(bar)" -> "foo")
    lower = lower.replace(/\([^)]*\)/g, "");

    return lower;
}

/**
 * 检查键是否匹配搜索字符串
 */
export function matchesSearch(key: string, search: string): boolean {
    if (!search) return true;
    const keyCanon = canonicalizeSearch(key);
    const searchCanon = canonicalizeSearch(search);
    return keyCanon.includes(searchCanon);
}

/**
 * 将属性键匹配到对应的分组
 */
export function matchKeyToGroup(key: string): string | undefined {
    const tokens = managerKeyTokens(key);
    for (const g of MANAGER_GROUPS) {
        for (const kw of g.keywords) {
            const needle = String(kw ?? "").trim().toLowerCase();
            if (!needle) continue;
            if (tokens.some((t) => t === needle || t.includes(needle))) {
                return g.title;
            }
        }
    }
    return undefined;
}
